import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildMysqldumpArgs,
  buildSmokeChecks,
  boolEnv,
  makeBackupFileName,
  maskSecret,
  normalizeBaseUrl,
  parseCliArgs,
  summarizeSmokeResults,
  validateProductionConfig,
} from '../scripts/deploy-utils.mjs';

test('deployment CLI parser supports flags, values and positional arguments', () => {
  const args = parseCliArgs(['--base-url', 'https://app.example', '--json', '--label=predeploy', 'extra']);
  assert.equal(args['base-url'], 'https://app.example');
  assert.equal(args.json, true);
  assert.equal(args.label, 'predeploy');
  assert.deepEqual(args._, ['extra']);
});

test('production preflight blocks unsafe critical configuration', () => {
  const result = validateProductionConfig({
    nodeEnv: 'production',
    port: '3000',
    jwtSecret: 'short',
    adminSetupToken: 'short',
    allowedOrigins: 'http://localhost:3000',
    passwordResetPublicBaseUrl: 'http://example.com',
    passwordResetExposeDevToken: 'true',
    passwordResetEmailProvider: 'disabled',
    passwordResetSmsProvider: 'disabled',
    passwordResetTokenPepper: 'short',
    backupDir: 'backups',
    backupRetentionDays: 30,
    db: { host: '', port: 3306, user: '', password: '', database: '', connectTimeout: 10000 },
    missingDb: ['DATABASE_HOSTNAME or DB_HOST'],
  } as any);

  assert.equal(result.summary.posture, 'block');
  assert.equal(result.summary.criticalFailed > 0, true);
  assert.equal(result.checks.some((check: any) => check.id === 'reset-preview-disabled' && !check.ok), true);
});

test('production preflight passes critical checks for safe configuration', () => {
  const result = validateProductionConfig({
    nodeEnv: 'production',
    port: '3000',
    jwtSecret: 'x'.repeat(40),
    adminSetupToken: 'y'.repeat(30),
    allowedOrigins: 'https://app.example',
    passwordResetPublicBaseUrl: 'https://app.example',
    passwordResetExposeDevToken: 'false',
    passwordResetEmailProvider: 'sendgrid',
    passwordResetSmsProvider: 'disabled',
    passwordResetTokenPepper: 'z'.repeat(40),
    backupDir: 'backups',
    backupRetentionDays: 30,
    db: { host: 'db', port: 3306, user: 'user', password: 'pw', database: 'powergym', connectTimeout: 10000 },
    missingDb: [],
  } as any);

  assert.equal(result.summary.criticalFailed, 0);
  assert.equal(result.summary.posture, 'pass');
});

test('backup utilities produce safe filenames and mysqldump arguments', () => {
  const name = makeBackupFileName({ database: 'power/gym', label: 'pre deploy', date: new Date('2026-06-08T13:00:00.000Z') });
  assert.equal(name, 'power_gym_pre_deploy_2026-06-08T13-00-00-000Z.sql');

  const args = buildMysqldumpArgs({ host: 'localhost', port: 3306, user: 'pg', database: 'powergym' } as any);
  assert.deepEqual(args.slice(0, 5), ['--single-transaction', '--quick', '--routines', '--triggers', '--events']);
  assert.equal(args.includes('powergym'), true);
  assert.equal(args.includes('pg'), true);
});

test('runtime backups stream mysqldump output without shell redirection', () => {
  const server = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
  assert.match(server, /spawn\(mysqldumpPath, dumpArgs/);
  assert.match(server, /pipeline\(child\.stdout, output\)/);
  assert.doesNotMatch(server, /mysqldump[^`\n]*>\s*\$\{shellQuote/);
});

test('smoke check helpers normalize base URL and summarize required failures', () => {
  assert.equal(normalizeBaseUrl('https://app.example///'), 'https://app.example');
  const checks = buildSmokeChecks({ baseUrl: 'https://app.example', includeDb: true, includeReadiness: true });
  assert.deepEqual(checks.map((check: any) => check.id), ['health', 'db-health', 'deployment-readiness', 'production-readiness']);

  const summary = summarizeSmokeResults([
    { id: 'health', ok: true, required: true },
    { id: 'readiness', ok: false, required: false },
    { id: 'db-health', ok: false, required: true },
  ] as any);
  assert.equal(summary.failed, 1);
  assert.equal(summary.optionalFailed, 1);
  assert.equal(summary.posture, 'fail');
});

test('boolean and secret helpers are safe for logs', () => {
  assert.equal(boolEnv('true'), true);
  assert.equal(boolEnv('0'), false);
  assert.equal(maskSecret('abcdefghijklmnopqrstuvwxyz'), 'ab***yz');
  assert.equal(maskSecret('tiny'), '***');
});
