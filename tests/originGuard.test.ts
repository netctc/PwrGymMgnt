import test from 'node:test';
import assert from 'node:assert/strict';
import { createMutationOriginGuard } from '../server/originGuard';

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
};

function res(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function runGuard(input: { method: string; origin?: string; referer?: string; host?: string; nodeEnv?: string; appOrigin?: string }) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAppOrigin = process.env.APP_ORIGIN;
  process.env.NODE_ENV = input.nodeEnv || 'test';
  if (input.appOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = input.appOrigin;

  const response = res();
  let nextCalled = false;
  createMutationOriginGuard()(
    {
      method: input.method,
      headers: {
        ...(input.origin ? { origin: input.origin } : {}),
        ...(input.referer ? { referer: input.referer } : {}),
        ...(input.host ? { host: input.host } : {}),
      },
    } as any,
    response as any,
    () => {
      nextCalled = true;
    },
  );

  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previousAppOrigin;

  return { response, nextCalled };
}

test('origin guard always allows safe methods', () => {
  const result = runGuard({ method: 'GET', origin: 'https://evil.example', nodeEnv: 'production' });
  assert.equal(result.nextCalled, true);
  assert.equal(result.response.statusCode, 200);
});

test('origin guard blocks production mutations without Origin/Referer', () => {
  const result = runGuard({ method: 'POST', nodeEnv: 'production' });
  assert.equal(result.nextCalled, false);
  assert.equal(result.response.statusCode, 403);
});

test('origin guard allows configured application origin', () => {
  const result = runGuard({ method: 'PUT', origin: 'https://app.powergym.example/settings', appOrigin: 'https://app.powergym.example' });
  assert.equal(result.nextCalled, true);
});

test('origin guard allows same host origin and rejects foreign origin', () => {
  const allowed = runGuard({ method: 'DELETE', origin: 'https://gym.example', host: 'gym.example', nodeEnv: 'production' });
  assert.equal(allowed.nextCalled, true);

  const blocked = runGuard({ method: 'DELETE', origin: 'https://attacker.example', host: 'gym.example', nodeEnv: 'production' });
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.response.statusCode, 403);
});
