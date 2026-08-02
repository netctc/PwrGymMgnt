import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPasswordResetUrl,
  hasSuccessfulPasswordResetDelivery,
  maskEmail,
  maskPhone,
  sendPasswordResetDelivery,
} from '../server/passwordResetDelivery';

function resetEnv() {
  process.env = { NODE_ENV: 'test' };
}

test('password reset delivery helpers build safe URLs and masked destinations', () => {
  resetEnv();
  process.env.APP_PUBLIC_URL = 'https://gym.example.com/app/';
  process.env.PASSWORD_RESET_PATH = '/login';

  const url = buildPasswordResetUrl('abc+123');
  assert.equal(url, 'https://gym.example.com/login?resetToken=abc%2B123');
  assert.equal(maskEmail('admin@example.com'), 'a***n@example.com');
  assert.equal(maskPhone('+1 (555) 123-4567'), '*******4567');
});

test('email webhook provider posts reset template without adding dependencies', async () => {
  resetEnv();
  process.env.PASSWORD_RESET_DELIVERY_CHANNELS = 'email';
  process.env.PASSWORD_RESET_EMAIL_PROVIDER = 'webhook';
  process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL = 'https://delivery.example.test/email';
  process.env.PASSWORD_RESET_EMAIL_WEBHOOK_SECRET = 'secret-value';
  process.env.APP_PUBLIC_URL = 'https://gym.example.com';

  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init || {} });
    return new Response(JSON.stringify({ messageId: 'msg-123' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const results = await sendPasswordResetDelivery({
    email: 'admin@example.com',
    token: 'reset-token',
    expiresInMinutes: 30,
  }, { fetchImpl, logger: console });

  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'sent');
  assert.equal(results[0].provider, 'webhook');
  assert.equal(results[0].providerMessageId, 'msg-123');
  assert.equal(calls[0].url, 'https://delivery.example.test/email');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer secret-value');
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.to, 'admin@example.com');
  assert.match(body.resetUrl, /^https:\/\/gym\.example\.com\/login\?resetToken=/);
  assert.equal(hasSuccessfulPasswordResetDelivery(results), true);
});

test('sms webhook provider skips delivery when account has no reset phone', async () => {
  resetEnv();
  process.env.PASSWORD_RESET_DELIVERY_CHANNELS = 'sms';
  process.env.PASSWORD_RESET_SMS_PROVIDER = 'webhook';
  process.env.PASSWORD_RESET_SMS_WEBHOOK_URL = 'https://delivery.example.test/sms';

  const results = await sendPasswordResetDelivery({
    email: 'admin@example.com',
    token: 'reset-token',
    expiresInMinutes: 30,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].channel, 'sms');
  assert.equal(results[0].status, 'skipped');
  assert.equal(hasSuccessfulPasswordResetDelivery(results), false);
});

test('sendgrid provider reports failed configuration without exposing token', async () => {
  resetEnv();
  process.env.PASSWORD_RESET_DELIVERY_CHANNELS = 'email';
  process.env.PASSWORD_RESET_EMAIL_PROVIDER = 'sendgrid';

  const results = await sendPasswordResetDelivery({
    email: 'admin@example.com',
    token: 'very-sensitive-reset-token-value',
    expiresInMinutes: 30,
  });

  assert.equal(results[0].status, 'failed');
  assert.equal(results[0].provider, 'sendgrid');
  assert.doesNotMatch(results[0].message || '', /very-sensitive/);
});
