import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  RESTORE_CONFIRMATION,
  buildMysqlRestoreArgs,
  createRestorePlan,
  inspectSqlBackup,
  listManagedBackups,
  resolveManagedBackupPath,
  validateBackupFileName,
} from '../scripts/db-restore-utils.mjs';

test('backup restore filename validation accepts managed sql names only', () => {
  assert.equal(validateBackupFileName('backup-manual-2026-06-08.sql'), 'backup-manual-2026-06-08.sql');
  assert.equal(validateBackupFileName('powergym_predeploy_2026-06-08T13-00-00-000Z.sql'), 'powergym_predeploy_2026-06-08T13-00-00-000Z.sql');
  assert.equal(validateBackupFileName('../secret.sql'), '');
  assert.equal(validateBackupFileName('.env.sql'), '');
  assert.equal(validateBackupFileName('backup.sql.gz'), '');
  assert.equal(validateBackupFileName('bad name.sql'), '');
});

test('managed backup path cannot escape backup directory', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-restore-'));
  const backupDir = 'backups';
  fs.mkdirSync(path.join(temp, backupDir));
  fs.writeFileSync(path.join(temp, backupDir, 'powergym_predeploy.sql'), 'CREATE TABLE members (id INT);');

  const ok = resolveManagedBackupPath({ cwd: temp, backupDir, name: 'powergym_predeploy.sql' });
  assert.ok(ok?.filePath.endsWith(path.join('backups', 'powergym_predeploy.sql')));

  const bad = resolveManagedBackupPath({ cwd: temp, backupDir, name: '../powergym_predeploy.sql' });
  assert.equal(bad, null);
});

test('backup inspection detects safe and destructive SQL content', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-restore-'));
  const safe = path.join(temp, 'safe.sql');
  fs.writeFileSync(safe, 'CREATE TABLE members (id INT);\nINSERT INTO members VALUES (1);\n');
  const safeInspection = inspectSqlBackup({ filePath: safe });
  assert.equal(safeInspection.ok, true);
  assert.equal(safeInspection.metrics.createTableCount, 1);
  assert.equal(safeInspection.metrics.insertCount, 1);

  const destructive = path.join(temp, 'destructive.sql');
  fs.writeFileSync(destructive, 'DROP TABLE IF EXISTS members;\nCREATE TABLE members (id INT);\n');
  const destructiveInspection = inspectSqlBackup({ filePath: destructive });
  assert.equal(destructiveInspection.ok, true);
  assert.equal(destructiveInspection.metrics.destructiveStatementCount, 1);
  assert.equal(destructiveInspection.warnings.length > 0, true);

  const blocked = path.join(temp, 'blocked.sql');
  fs.writeFileSync(blocked, 'DROP DATABASE powergym;\n');
  const blockedInspection = inspectSqlBackup({ filePath: blocked });
  assert.equal(blockedInspection.ok, false);
  assert.equal(blockedInspection.errors.some((message: string) => message.includes('DROP DATABASE')), true);
});

test('restore plan blocks unsafe apply modes', () => {
  const inspection = {
    ok: true,
    errors: [],
    warnings: ['Contains destructive SQL'],
    metrics: { destructiveStatementCount: 1 },
    preview: '',
  };
  const db = { host: 'db', port: 3306, user: 'user', password: 'pw', database: 'powergym', connectTimeout: 10000 };

  const dryRun = createRestorePlan({ inspection, apply: false, nodeEnv: 'test', db });
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.canApply, true);

  const blocked = createRestorePlan({ inspection, apply: true, confirmation: RESTORE_CONFIRMATION, nodeEnv: 'test', db });
  assert.equal(blocked.canApply, false);
  assert.equal(blocked.blockers.some((message: string) => message.includes('destructive')), true);

  const allowed = createRestorePlan({ inspection, apply: true, confirmation: RESTORE_CONFIRMATION, allowDestructive: true, nodeEnv: 'test', db });
  assert.equal(allowed.canApply, true);
});

test('production restore requires explicit production override', () => {
  const inspection = { ok: true, errors: [], warnings: [], metrics: { destructiveStatementCount: 0 }, preview: '' };
  const db = { host: 'db', port: 3306, user: 'user', password: 'pw', database: 'powergym', connectTimeout: 10000 };
  const plan = createRestorePlan({ inspection, apply: true, confirmation: RESTORE_CONFIRMATION, nodeEnv: 'production', db });
  assert.equal(plan.canApply, false);
  assert.equal(plan.blockers.some((message: string) => message.includes('Production restore')), true);
});

test('backup list and mysql restore args are safe', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-restore-'));
  const dir = path.join(temp, 'backups');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'powergym_predeploy.sql'), 'CREATE TABLE t (id INT);');
  fs.writeFileSync(path.join(dir, 'ignore.txt'), 'no');
  const backups = listManagedBackups({ cwd: temp, backupDir: 'backups' });
  assert.deepEqual(backups.map((backup: any) => backup.name), ['powergym_predeploy.sql']);

  const args = buildMysqlRestoreArgs({ host: 'localhost', port: 3306, user: 'pg', database: 'powergym' } as any);
  assert.equal(args.includes('--binary-mode'), true);
  assert.equal(args.includes('powergym'), true);
});
