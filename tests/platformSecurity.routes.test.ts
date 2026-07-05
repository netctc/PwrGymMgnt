import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerPlatformSecurityRoutes } from '../server/platformSecurity';

async function withPlatformServer(role: string | undefined, pool: any, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use((req, _res, next) => {
    if (role) (req as any).user = { uid: 'test-user', email: `${role}@example.com`, role };
    next();
  });
  registerPlatformSecurityRoutes(app, () => pool);
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

test('security overview route requires platform observer permission', async () => {
  await withPlatformServer('trainer', {}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/security/overview`);
    assert.equal(response.status, 403);
    const body = await response.json() as { error: string };
    assert.equal(body.error, 'Platform security observer permission required');
  });
});

test('security overview route returns 503 when authorized but database is unavailable', async () => {
  await withPlatformServer('admin', null, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/security/overview`);
    assert.equal(response.status, 503);
    const body = await response.json() as { error: string };
    assert.equal(body.error, 'Database not connected');
  });
});

test('password reset delivery history never exposes token hashes', async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes('CREATE TABLE')) return [[], []];
      if (sql.includes('FROM password_reset_tokens')) {
        return [[{
          id: 'prt_1',
          userId: 1,
          email: 'owner@example.com',
          deliveryRequestId: 'req_1',
          deliveryChannel: 'email',
          deliveryStatus: 'sent',
          deliveryProvider: 'webhook',
          deliveryLastError: null,
          deliveredAt: '2026-06-01 10:00:00',
          expiresAt: '2026-06-01 10:30:00',
          usedAt: null,
          revokedAt: null,
          createdAt: '2026-06-01 10:00:00',
          token_hash: 'must-not-leak',
        }], []];
      }
      return [[], []];
    },
  };

  await withPlatformServer('manager', pool, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/platform/security/password-reset-deliveries?from=2026-06-01&to=2026-06-02`);
    assert.equal(response.status, 200);
    const body = await response.json() as { deliveries: Array<Record<string, unknown>> };
    assert.equal(body.deliveries[0].email, 'o***r@example.com');
    assert.equal('token_hash' in body.deliveries[0], false);
    assert.equal('tokenHash' in body.deliveries[0], false);
  });

  assert.equal(queries.some((sql) => sql.includes('token_hash')), false);
});
