import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  hashPasswordResetToken,
  normalizeResetEmail,
  registerPasswordResetRoutes,
  validateResetPasswordComplexity,
} from '../server/passwordReset';

type ResetTokenRecord = {
  id: string;
  user_id: number;
  email: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
};

function createFakePool() {
  const state = {
    adminUsers: [{ id: 7, email: 'admin@example.com', role: 'admin', password_hash: 'old-hash', reset_phone: '+15551234567', reset_delivery_channel: 'email' }],
    tokens: [] as ResetTokenRecord[],
    auditLogs: [] as Array<{ action: string; details: string; performed_by: string }>,
  };

  return {
    state,
    async query(sql: string, params: any[] = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();

      if (normalizedSql.startsWith('CREATE TABLE IF NOT EXISTS') || normalizedSql.startsWith('ALTER TABLE')) {
        return [[], []];
      }

      if (normalizedSql.startsWith('SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS')) {
        return [[{ count: 1 }], []];
      }

      if (normalizedSql.includes('SELECT id, email, role, reset_phone, reset_delivery_channel FROM admin_users WHERE LOWER(email) = ?')) {
        const email = params[0];
        return [state.adminUsers.filter((user) => user.email.toLowerCase() === email).slice(0, 1), []];
      }

      if (normalizedSql.startsWith('UPDATE password_reset_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL')) {
        const userId = params[0];
        for (const token of state.tokens) {
          if (token.user_id === userId && !token.used_at && !token.revoked_at) token.revoked_at = new Date();
        }
        return [{ affectedRows: 1 }, []];
      }

      if (normalizedSql.startsWith('INSERT INTO password_reset_tokens')) {
        const [id, userId, email, tokenHash, expiresAt] = params;
        state.tokens.push({
          id,
          user_id: userId,
          email,
          token_hash: tokenHash,
          expires_at: new Date(String(expiresAt).replace(' ', 'T') + 'Z'),
          used_at: null,
          revoked_at: null,
        });
        return [{ affectedRows: 1 }, []];
      }

      if (normalizedSql.startsWith('INSERT INTO audit_logs')) {
        const [action, details, performedBy] = params;
        state.auditLogs.push({ action, details, performed_by: performedBy });
        return [{ affectedRows: 1 }, []];
      }

      if (normalizedSql.startsWith('UPDATE password_reset_tokens SET delivery_channel = ?')) {
        const [channel, status, provider, message, deliveredStatus, id] = params;
        const token = state.tokens.find((candidate) => candidate.id === id);
        if (token) {
          (token as any).delivery_channel = channel;
          (token as any).delivery_status = status;
          (token as any).delivery_provider = provider;
          (token as any).delivery_last_error = message;
          if (deliveredStatus === 'sent') (token as any).delivered_at = new Date();
        }
        return [{ affectedRows: token ? 1 : 0 }, []];
      }

      if (normalizedSql.includes('FROM password_reset_tokens') && normalizedSql.includes('WHERE token_hash = ?')) {
        const tokenHash = params[0];
        return [state.tokens.filter((token) => token.token_hash === tokenHash).slice(0, 1), []];
      }

      if (normalizedSql.includes('SELECT id, email FROM admin_users WHERE id = ?')) {
        const id = params[0];
        return [state.adminUsers.filter((user) => user.id === id).map(({ id, email }) => ({ id, email })).slice(0, 1), []];
      }

      if (normalizedSql.startsWith('UPDATE admin_users SET password_hash = ? WHERE id = ?')) {
        const [passwordHash, id] = params;
        const user = state.adminUsers.find((candidate) => candidate.id === id);
        if (user) user.password_hash = passwordHash;
        return [{ affectedRows: user ? 1 : 0 }, []];
      }

      if (normalizedSql.startsWith('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?')) {
        const id = params[0];
        const token = state.tokens.find((candidate) => candidate.id === id);
        if (token) token.used_at = new Date();
        return [{ affectedRows: token ? 1 : 0 }, []];
      }

      if (normalizedSql.startsWith('UPDATE password_reset_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND id <> ?')) {
        const [userId, excludedId] = params;
        for (const token of state.tokens) {
          if (token.user_id === userId && token.id !== excludedId && !token.used_at && !token.revoked_at) token.revoked_at = new Date();
        }
        return [{ affectedRows: 1 }, []];
      }

      throw new Error(`Unexpected SQL in test: ${normalizedSql}`);
    },
  };
}

function configurePasswordResetTestEnv({ exposeDevToken = false }: { exposeDevToken?: boolean } = {}) {
  process.env.NODE_ENV = 'test';
  process.env.PASSWORD_RESET_TOKEN_PEPPER = 'unit-test-pepper';
  process.env.PASSWORD_RESET_EXPOSE_DEV_TOKEN = exposeDevToken ? 'true' : 'false';
  process.env.PASSWORD_RESET_DELIVERY_CHANNELS = 'email';
  process.env.PASSWORD_RESET_EMAIL_PROVIDER = 'disabled';
  process.env.PASSWORD_RESET_SMS_PROVIDER = 'disabled';
}

async function withPasswordResetServer(pool: ReturnType<typeof createFakePool>, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  registerPasswordResetRoutes(app, { getPool: () => pool });
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

test('password reset helpers normalize input and enforce complexity', () => {
  configurePasswordResetTestEnv();
  assert.equal(normalizeResetEmail(' Admin@Example.COM '), 'admin@example.com');
  assert.equal(validateResetPasswordComplexity('weakpass'), false);
  assert.equal(validateResetPasswordComplexity('StrongPass1!'), true);
  assert.equal(hashPasswordResetToken('raw-token'), hashPasswordResetToken('raw-token'));
  assert.notEqual(hashPasswordResetToken('raw-token'), 'raw-token');
});

test('request route uses anti-enumeration response for unknown accounts', async () => {
  configurePasswordResetTestEnv();
  const pool = createFakePool();

  await withPasswordResetServer(pool, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'missing@example.com' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { message: string; deliveryPreview?: unknown };
    assert.match(body.message, /If an account exists/);
    assert.equal(body.deliveryPreview, undefined);
    assert.equal(pool.state.tokens.length, 0);
  });
});

test('request route creates a hashed single-use reset token without persisting the raw token', async () => {
  configurePasswordResetTestEnv({ exposeDevToken: true });
  const pool = createFakePool();

  await withPasswordResetServer(pool, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ADMIN@example.com' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { deliveryPreview: { token: string }; expiresInMinutes: number };
    assert.equal(typeof body.deliveryPreview.token, 'string');
    assert.equal(pool.state.tokens.length, 1);
    assert.equal(pool.state.tokens[0].email, 'admin@example.com');
    assert.notEqual(pool.state.tokens[0].token_hash, body.deliveryPreview.token);
    assert.equal(pool.state.tokens[0].token_hash, hashPasswordResetToken(body.deliveryPreview.token));
    assert.equal(body.expiresInMinutes, 30);
  });
});

test('confirm route updates password and rejects token reuse', async () => {
  configurePasswordResetTestEnv({ exposeDevToken: true });
  const pool = createFakePool();

  await withPasswordResetServer(pool, async (baseUrl) => {
    const requestResponse = await fetch(`${baseUrl}/api/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com' }),
    });
    const requestBody = await requestResponse.json() as { deliveryPreview: { token: string } };

    const confirmResponse = await fetch(`${baseUrl}/api/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: requestBody.deliveryPreview.token, newPassword: 'NewPassword1!' }),
    });
    assert.equal(confirmResponse.status, 200);
    assert.equal(pool.state.adminUsers[0].password_hash.startsWith('scrypt$'), true);
    assert.ok(pool.state.tokens[0].used_at);

    const reuseResponse = await fetch(`${baseUrl}/api/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: requestBody.deliveryPreview.token, newPassword: 'AnotherPassword1!' }),
    });
    assert.equal(reuseResponse.status, 400);
  });
});

test('legacy direct reset endpoint is gone', async () => {
  const pool = createFakePool();

  await withPasswordResetServer(pool, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', newPassword: 'NewPassword1!' }),
    });
    assert.equal(response.status, 410);
  });
});
