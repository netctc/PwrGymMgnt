import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONCURRENCY_PROBES,
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
  assert.equal(parseConcurrencyArgs(['--lock-timeout=3', '--json']).timeoutSeconds, 3);
  assert.throws(() => parseConcurrencyArgs(['--lock-timeout=0']), /between 1 and 10/);
  assert.throws(() => parseConcurrencyArgs(['--lock-timeout=30']), /between 1 and 10/);
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
