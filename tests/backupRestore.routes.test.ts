import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerBackupRestoreRoutes } from '../server/backupRestore';

async function withServer(role: string | undefined, backupDir: string, run: (baseUrl: string) => Promise<void>) {
  const previousBackupDir = process.env.DATABASE_BACKUP_DIR;
  const previousHost = process.env.DATABASE_HOSTNAME;
  const previousUser = process.env.DATABASE_USER_NAME;
  const previousPassword = process.env.DATABASE_PASSWORD;
  const previousName = process.env.DATABASE_NAME;
  const previousRestoreEnabled = process.env.DATABASE_RESTORE_API_ENABLED;
  const restoreEnv = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  process.env.DATABASE_BACKUP_DIR = backupDir;
  process.env.DATABASE_HOSTNAME = 'db';
  process.env.DATABASE_USER_NAME = 'user';
  process.env.DATABASE_PASSWORD = 'pw';
  process.env.DATABASE_NAME = 'powergym';
  process.env.DATABASE_RESTORE_API_ENABLED = 'false';

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (role) (req as any).user = { uid: 'u1', email: `${role}@example.com`, role };
    next();
  });
  registerBackupRestoreRoutes(app, () => null);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status || 500).json({ error: error.message || 'Internal error' });
  });

  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    restoreEnv('DATABASE_BACKUP_DIR', previousBackupDir);
    restoreEnv('DATABASE_HOSTNAME', previousHost);
    restoreEnv('DATABASE_USER_NAME', previousUser);
    restoreEnv('DATABASE_PASSWORD', previousPassword);
    restoreEnv('DATABASE_NAME', previousName);
    restoreEnv('DATABASE_RESTORE_API_ENABLED', previousRestoreEnabled);
  }
}

test('backup restore routes require super admin restore permission', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-restore-routes-'));
  await withServer('admin', temp, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/backups/restore/backups`);
    assert.equal(response.status, 403);
  });
});

test('backup restore route lists and inspects safe backup metadata', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-restore-routes-'));
  fs.writeFileSync(path.join(temp, 'powergym_predeploy.sql'), 'CREATE TABLE members (id INT);\nINSERT INTO members VALUES (1);\n');
  fs.writeFileSync(path.join(temp, 'notes.txt'), 'ignore');

  await withServer('super_admin', temp, async (baseUrl) => {
    const list = await fetch(`${baseUrl}/api/platform/backups/restore/backups`);
    assert.equal(list.status, 200);
    const listBody = await list.json() as { backups: any[] };
    assert.deepEqual(listBody.backups.map((backup) => backup.name), ['powergym_predeploy.sql']);
    assert.equal('path' in listBody.backups[0], false);

    const inspect = await fetch(`${baseUrl}/api/platform/backups/restore/backups/powergym_predeploy.sql/inspect`);
    assert.equal(inspect.status, 200);
    const inspectBody = await inspect.json() as { inspection: any; plan: any };
    assert.equal(inspectBody.inspection.ok, true);
    assert.equal(inspectBody.inspection.metrics.insertCount, 1);
    assert.equal('preview' in inspectBody.inspection, false);
  });
});

test('backup restore dry-run does not require API apply flag and apply is blocked by default', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-restore-routes-'));
  fs.writeFileSync(path.join(temp, 'powergym_predeploy.sql'), 'CREATE TABLE members (id INT);\n');

  await withServer('super_admin', temp, async (baseUrl) => {
    const dryRun = await fetch(`${baseUrl}/api/platform/backups/restore/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'powergym_predeploy.sql', apply: false }),
    });
    assert.equal(dryRun.status, 200);
    const dryRunBody = await dryRun.json() as { restored: boolean; plan: any };
    assert.equal(dryRunBody.restored, false);

    const apply = await fetch(`${baseUrl}/api/platform/backups/restore/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'powergym_predeploy.sql', apply: true, confirm: 'RESTORE' }),
    });
    assert.equal(apply.status, 409);
    const applyBody = await apply.json() as { plan: { blockers: string[] } };
    assert.equal(applyBody.plan.blockers.some((message) => message.includes('disabled')), true);
  });
});
