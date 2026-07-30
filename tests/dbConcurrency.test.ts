import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONCURRENCY_PROBES,
  getConcurrencyDatabaseEnv,
  isExpectedLockContention,
  parseConcurrencyArgs,
  summarizeConcurrencyResults,
} from '../scripts/db-concurrency-verify.mjs';

test('concurrency probes cover every critical financial and session domain', () => {
  assert.deepEqual(CONCURRENCY_PROBES.map((probe) => probe.id), [
    'subscription-renewal',
    'subscription-payment',
    'trainer-commission',
    'session-ledger',
  ]);
  assert.equal(new Set(CONCURRENCY_PROBES.map((probe) => probe.table)).size, 4);
});

test('concurrency arguments enforce a short bounded lock timeout', () => {
  const args = parseConcurrencyArgs(['--lock-timeout=3', '--json', '--rehearsal']);
  assert.equal(args.timeoutSeconds, 3);
  assert.equal(args.rehearsal, true);
  assert.throws(() => parseConcurrencyArgs(['--lock-timeout=0']), /between 1 and 10/);
  assert.throws(() => parseConcurrencyArgs(['--lock-timeout=30']), /between 1 and 10/);
});

test('rehearsal mode uses only dedicated database credentials', () => {
  const config = getConcurrencyDatabaseEnv(
    { rehearsal: true },
    {
      DATABASE_NAME: 'production',
      REHEARSAL_DATABASE_HOSTNAME: 'localhost',
      REHEARSAL_DATABASE_PORT: '3306',
      REHEARSAL_DATABASE_USER_NAME: 'rehearsal',
      REHEARSAL_DATABASE_PASSWORD: 'private',
      REHEARSAL_DATABASE_NAME: 'powergym_restore_test',
    },
  );
  assert.equal(config.database, 'powergym_restore_test');
  assert.equal(config.user, 'rehearsal');
});

test('only the MySQL row lock timeout is accepted as expected contention', () => {
  assert.equal(isExpectedLockContention({ code: 'ER_LOCK_WAIT_TIMEOUT' }), true);
  assert.equal(isExpectedLockContention({ errno: 1205 }), true);
  assert.equal(isExpectedLockContention({ code: 'ER_NO_SUCH_TABLE' }), false);
});

test('concurrency evidence blocks missing fixtures and unexpected failures', () => {
  assert.deepEqual(
    summarizeConcurrencyResults([
      { status: 'passed' },
      { status: 'passed' },
      { status: 'blocked' },
      { status: 'failed' },
    ]),
    { posture: 'block', total: 4, passed: 2, failed: 1, blocked: 1 },
  );
  assert.equal(
    summarizeConcurrencyResults(Array.from({ length: 4 }, () => ({ status: 'passed' }))).posture,
    'pass',
  );
});
