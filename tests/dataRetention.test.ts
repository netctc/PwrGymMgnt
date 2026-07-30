import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRetentionPolicy,
  parseRetentionArgs,
  summarizeRetentionResults,
} from '../scripts/data-retention.mjs';

test('retention policy protects immutable financial and session ledgers', () => {
  const policy = buildRetentionPolicy({});
  assert.ok(policy.protectedTables.includes('finance_transactions'));
  assert.ok(policy.protectedTables.includes('trainer_commission_payments'));
  assert.ok(policy.protectedTables.includes('session_movements'));
  assert.equal(
    policy.operations.some((operation) => policy.protectedTables.includes(operation.table)),
    false,
  );
});

test('retention policy keeps conservative minimum periods', () => {
  assert.throws(
    () => buildRetentionPolicy({ AUDIT_LOG_RETENTION_DAYS: '30' }),
    /between 365 and 3650/,
  );
  assert.throws(
    () => buildRetentionPolicy({ NOTIFICATION_RETENTION_DAYS: '7' }),
    /between 30 and 3650/,
  );
  const policy = buildRetentionPolicy({
    AUDIT_LOG_RETENTION_DAYS: '1095',
    NOTIFICATION_RETENTION_DAYS: '180',
  });
  assert.equal(policy.auditDays, 1095);
  assert.equal(policy.notificationDays, 180);
});

test('retention application requires explicit confirmation', () => {
  assert.equal(parseRetentionArgs([]).apply, false);
  assert.throws(
    () => parseRetentionArgs(['--apply']),
    /--confirm=APPLY_RETENTION/,
  );
  assert.equal(
    parseRetentionArgs(['--apply', '--confirm=APPLY_RETENTION']).apply,
    true,
  );
});

test('retention summary distinguishes preview, pass and block', () => {
  const results = [{ status: 'passed', candidateRows: 4, deletedRows: 0 }];
  assert.equal(summarizeRetentionResults(results, false).posture, 'preview');
  assert.equal(summarizeRetentionResults(results, true).posture, 'pass');
  assert.equal(
    summarizeRetentionResults([{ status: 'failed' }], true).posture,
    'block',
  );
});
