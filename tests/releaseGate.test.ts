import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReleaseGatePlan,
  normalizeReleaseBaseUrl,
  parseReleaseGateArgs,
  redactEvidenceText,
  resolveNpmInvocation,
} from '../scripts/release-gate.mjs';

test('release gate parser supports portable flags and values', () => {
  const args = parseReleaseGateArgs([
    '--base-url=https://gym.example/',
    '--include-db-smoke',
    '--output',
    'evidence/release.json',
  ]);
  assert.equal(args['base-url'], 'https://gym.example/');
  assert.equal(args['include-db-smoke'], true);
  assert.equal(args.output, 'evidence/release.json');
});

test('release gate requires an external smoke target unless explicitly skipped', () => {
  assert.throws(
    () => buildReleaseGatePlan({}, {}),
    /DEPLOY_BASE_URL or --base-url is required/,
  );
  const plan = buildReleaseGatePlan({ 'skip-smoke': true }, {});
  assert.equal(plan.steps.some((step) => step.id === 'external-smoke'), false);
});

test('release gate orders critical checks before external smoke', () => {
  const plan = buildReleaseGatePlan(
    { 'base-url': 'https://gym.example/', 'include-db-smoke': true },
    {},
  );
  assert.deepEqual(plan.steps.map((step) => step.id), [
    'verify-ci',
    'database-backup',
    'database-migrations',
    'database-access',
    'database-integrity',
    'external-smoke',
  ]);
  const smoke = plan.steps.at(-1);
  assert.ok(smoke?.args.includes('--include-readiness'));
  assert.ok(smoke?.args.includes('--include-db'));
});

test('Windows npm execution uses node and npm-cli instead of spawning npm.cmd', () => {
  const invocation = resolveNpmInvocation(
    { npm_execpath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js' },
    'win32',
    'C:\\Program Files\\nodejs\\node.exe',
  );
  assert.equal(invocation.command, 'C:\\Program Files\\nodejs\\node.exe');
  assert.deepEqual(invocation.prefixArgs, [
    'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
  ]);
  assert.notEqual(invocation.command, 'npm.cmd');
});

test('release smoke URL is normalized and rejects embedded credentials', () => {
  assert.equal(normalizeReleaseBaseUrl('https://gym.example///'), 'https://gym.example');
  assert.throws(() => normalizeReleaseBaseUrl('ftp://gym.example'), /http/);
  assert.throws(() => normalizeReleaseBaseUrl('https://admin:secret@gym.example'), /credentials/);
});

test('release evidence redacts common secrets and URL credentials', () => {
  const redacted = redactEvidenceText(
    'Authorization: Bearer abc123 password=unsafe mysql://admin:unsafe@db.example token=secret',
  );
  assert.doesNotMatch(redacted, /abc123|unsafe|token=secret/);
  assert.match(redacted, /Authorization: Bearer \*\*\*/);
  assert.match(redacted, /mysql:\/\/admin:\*\*\*@db\.example/);
});
