import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractSessionCookie,
  prepareSmokeAuthentication,
  resolveSmokeAuthentication,
} from '../scripts/smoke-auth.mjs';

test('smoke authentication prefers bearer tokens without exposing them in config errors', () => {
  const auth = resolveSmokeAuthentication({
    token: 'private-token',
    email: 'admin@powergym.local',
    password: 'private-password',
    includeDb: true,
  });
  assert.equal(auth.mode, 'bearer');
  assert.equal(auth.token, 'private-token');
});

test('smoke authentication requires both session credential variables', () => {
  const auth = resolveSmokeAuthentication({
    email: 'admin@powergym.local',
    includeDb: true,
  });
  assert.equal(auth.mode, 'invalid');
  assert.match(auth.error || '', /Both DEPLOY_SMOKE_LOGIN_EMAIL/);
  assert.doesNotMatch(auth.error || '', /admin@powergym/);
});

test('session cookie extraction strips attributes', () => {
  const headers = new Headers({
    'set-cookie': 'powergym_session=abc123; Path=/; HttpOnly; SameSite=Strict',
  });
  assert.equal(extractSessionCookie(headers), 'powergym_session=abc123');
});

test('session smoke login keeps credentials out of the returned evidence', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const result = await prepareSmokeAuthentication({
    baseUrl: 'http://192.168.1.100:3000',
    includeDb: true,
    email: 'admin@powergym.local',
    password: 'private-password',
    fetchImpl: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ message: 'Login successful' }), {
        status: 200,
        headers: { 'set-cookie': 'powergym_session=signed-value; Path=/; HttpOnly' },
      });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'session');
  assert.equal(result.headers.Cookie, 'powergym_session=signed-value');
  assert.equal(JSON.stringify(result).includes('private-password'), false);
  assert.equal(requests[0].url, 'http://192.168.1.100:3000/api/auth/login');
});

test('failed smoke login returns status without credentials', async () => {
  const result = await prepareSmokeAuthentication({
    baseUrl: 'http://192.168.1.100:3000',
    includeDb: true,
    email: 'admin@powergym.local',
    password: 'private-password',
    fetchImpl: async () => new Response('{}', { status: 401 }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(JSON.stringify(result).includes('private-password'), false);
});
