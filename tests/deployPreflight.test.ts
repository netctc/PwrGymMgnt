import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areApprovedProductionOrigins,
  isApprovedProductionUrl,
  validateProductionConfig,
} from '../scripts/deploy-utils.mjs';

function productionConfig(overrides = {}) {
  return {
    nodeEnv: 'production',
    port: '3000',
    jwtSecret: 'j'.repeat(32),
    adminSetupToken: '',
    adminSetupEnabled: 'false',
    envBootstrapLogin: 'false',
    apiDocsInProduction: 'false',
    allowedOrigins: 'http://192.168.1.50:3000',
    passwordResetPublicBaseUrl: 'http://192.168.1.50:3000',
    passwordResetExposeDevToken: 'false',
    passwordResetEmailProvider: 'disabled',
    passwordResetSmsProvider: 'disabled',
    passwordResetTokenPepper: 'p'.repeat(32),
    backupDir: 'backups',
    backupRetentionDays: 30,
    db: {
      host: '127.0.0.1',
      port: 3306,
      user: 'powergym_test',
      password: 'test-password',
      database: 'powergym_test',
      connectTimeout: 10_000,
    },
    missingDb: [],
    ...overrides,
  };
}

test('production URLs accept HTTPS and explicit HTTP IP ports', () => {
  assert.equal(isApprovedProductionUrl('https://gym.example.com'), true);
  assert.equal(isApprovedProductionUrl('http://192.168.1.50:3000'), true);
  assert.equal(isApprovedProductionUrl('http://10.0.0.5:80'), true);
  assert.equal(isApprovedProductionUrl('http://[2001:db8::10]:3000'), true);
});

test('production URLs reject insecure domains and incomplete direct IP URLs', () => {
  assert.equal(isApprovedProductionUrl('http://gym.example.com:3000'), false);
  assert.equal(isApprovedProductionUrl('http://192.168.1.50'), false);
  assert.equal(isApprovedProductionUrl('http://user:pass@192.168.1.50:3000'), false);
  assert.equal(isApprovedProductionUrl('not-a-url'), false);
  assert.equal(areApprovedProductionOrigins('https://gym.example.com, http://10.0.0.5:3000'), true);
  assert.equal(areApprovedProductionOrigins('https://gym.example.com, http://gym.example.com:3000'), false);
});

test('direct IP HTTP deployment does not create critical preflight failures', () => {
  const result = validateProductionConfig(productionConfig());
  const allowedOrigins = result.checks.find((check) => check.id === 'allowed-origins');
  const resetBaseUrl = result.checks.find((check) => check.id === 'reset-base-url');

  assert.equal(allowedOrigins?.ok, true);
  assert.equal(resetBaseUrl?.ok, true);
  assert.equal(result.summary.criticalFailed, 0);
  assert.equal(result.summary.posture, 'warn');
});
