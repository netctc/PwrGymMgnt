import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildRetentionPolicy,
  inspectManagedBackups,
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

test('backup retention identifies empty and expired SQL files without scanning quarantine', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'powergym-retention-'));
  try {
    fs.writeFileSync(path.join(directory, 'invalid.sql'), '');
    fs.writeFileSync(path.join(directory, 'current.sql'), 'valid backup');
    fs.writeFileSync(path.join(directory, 'expired.sql'), 'old backup');
    fs.mkdirSync(path.join(directory, 'quarantine'));
    fs.writeFileSync(path.join(directory, 'quarantine', 'ignored.sql'), '');
    const oldDate = new Date('2026-01-01T00:00:00.000Z');
    fs.utimesSync(path.join(directory, 'expired.sql'), oldDate, oldDate);

    const result = inspectManagedBackups(
      directory,
      30,
      new Date('2026-07-31T00:00:00.000Z'),
    );
    assert.deepEqual(result.invalidFiles, ['invalid.sql']);
    assert.deepEqual(result.expiredFiles, ['expired.sql']);
    assert.equal(result.files.length, 3);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
