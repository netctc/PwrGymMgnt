import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerDataIntegrityRoutes } from '../server/dataIntegrity';

async function withServer(role: string | undefined, pool: any, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (role) (req as any).user = { uid: 'u1', email: `${role}@example.com`, role };
    next();
  });
  registerDataIntegrityRoutes(app, () => pool);
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
  }
}

test('data integrity routes require permission', async () => {
  await withServer('trainer', {}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/data-integrity/overview`);
    assert.equal(response.status, 403);
    const body = await response.json() as { error: string };
    assert.equal(body.error, 'Data integrity permission required');
  });
});

test('data integrity overview returns 503 when database is unavailable', async () => {
  await withServer('admin', null, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/data-integrity/overview`);
    assert.equal(response.status, 503);
    const body = await response.json() as { error: string };
    assert.equal(body.error, 'Database not connected');
  });
});

test('data integrity overview executes checks and exposes only safe metadata', async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      queries.push(sql);
      return [[{ count: 0 }], []];
    },
  };

  await withServer('manager', pool, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/data-integrity/overview`);
    assert.equal(response.status, 200);
    const body = await response.json() as { summary: any; findings: any[]; repairs: any[] };
    assert.equal(body.summary.posture, 'healthy');
    assert.equal(body.findings.length > 5, true);
    assert.equal('sql' in body.findings[0], false);
    assert.equal('applySql' in body.repairs[0], false);
  });

  assert.equal(queries.length > 5, true);
});

test('data integrity samples enforce known check id and limit', async () => {
  const pool = {
    async query(_sql: string, params?: unknown[]) {
      assert.deepEqual(params, [3]);
      return [[{ id: 'sample_1' }], []];
    },
  };

  await withServer('admin', pool, async (baseUrl) => {
    const ok = await fetch(`${baseUrl}/api/platform/data-integrity/checks/active-access-tokens-expired/samples?limit=3`);
    assert.equal(ok.status, 200);
    const body = await ok.json() as { samples: any[] };
    assert.equal(body.samples[0].id, 'sample_1');

    const missing = await fetch(`${baseUrl}/api/platform/data-integrity/checks/not-real/samples`);
    assert.equal(missing.status, 404);
  });
});

test('data integrity repair endpoint defaults to dry-run', async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      queries.push(sql);
      return [[{ count: 2 }], []];
    },
  };

  await withServer('admin', pool, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/data-integrity/repairs/expire-access-tokens`, { method: 'POST' });
    assert.equal(response.status, 200);
    const body = await response.json() as { dryRun: boolean; repair: { affectedRows: number } };
    assert.equal(body.dryRun, true);
    assert.equal(body.repair.affectedRows, 2);
  });

  assert.equal(queries.some((sql) => sql.trim().startsWith('UPDATE')), false);
});
