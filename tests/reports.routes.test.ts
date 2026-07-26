import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerReportsRoutes } from '../server/reports';

async function withReportsServer(role: string | undefined, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use((req, _res, next) => {
    if (role) (req as any).user = { uid: 'test-user', email: `${role}@example.com`, role };
    next();
  });
  registerReportsRoutes(app, () => null as any);
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

test('screen catalog returns only reports visible to the current role', async () => {
  await withReportsServer('support', async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reports/screen-catalog`);
    assert.equal(response.status, 200);
    const body = await response.json() as { reports: Array<{ id: string }> };
    const ids = new Set(body.reports.map((report) => report.id));
    assert.equal(ids.has('support-tickets'), true);
    assert.equal(ids.has('security-audit'), false);
  });
});

test('screen catalog does not expose technical identifier filters', async () => {
  await withReportsServer('admin', async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reports/screen-catalog`);
    assert.equal(response.status, 200);
    const body = await response.json() as { reports: Array<{ filters: Array<{ label: string }> }> };
    const labels = body.reports.flatMap((report) => report.filters.map((filter) => filter.label));
    assert.equal(labels.some((label) => label === 'ID' || label.endsWith(' ID')), false);
  });
});

test('screen PDF route rejects roles without access before touching the database', async () => {
  await withReportsServer('client', async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reports/screen/security-audit.pdf?from=2026-01-01&to=2026-01-31`);
    assert.equal(response.status, 403);
    const body = await response.json() as { error: string };
    assert.equal(body.error, 'Report permission required');
  });
});

test('screen PDF route returns 404 for unknown report ids', async () => {
  await withReportsServer('admin', async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reports/screen/unknown-report.pdf`);
    assert.equal(response.status, 404);
  });
});

test('screen PDF route returns 503 when an authorized report cannot access MySQL', async () => {
  await withReportsServer('admin', async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reports/screen/members-directory.pdf?from=2026-01-01&to=2026-01-31`);
    assert.equal(response.status, 503);
    const body = await response.json() as { error: string };
    assert.equal(body.error, 'Database not connected');
  });
});
