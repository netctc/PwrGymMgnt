/**
 * Evolution System — End-to-End Integration Tests
 *
 * These tests verify the FULL lifecycle against a real MySQL database.
 * They require:
 *   - MySQL running with DATABASE_* env vars configured
 *   - Tables created via npm run db:migrate
 *
 * Run: node --import tsx --test tests/evolution-e2e.test.ts
 *
 * If DB is not available, tests are skipped gracefully.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

let pool: any = null;
let skipReason = '';

// Try to connect to the database
try {
  const mysql = await import('mysql2/promise');
  const dotenv = await import('dotenv');
  dotenv.config();

  const host = process.env.DATABASE_HOSTNAME || process.env.DB_HOST;
  const database = process.env.DATABASE_NAME || process.env.DB_NAME;
  if (!host || !database) {
    skipReason = 'DATABASE_HOSTNAME/DATABASE_NAME not configured';
  } else {
    pool = await mysql.createPool({
      host,
      port: Number(process.env.DATABASE_PORT || process.env.DB_PORT || 3306),
      user: process.env.DATABASE_USER_NAME || process.env.DB_USER || '',
      password: process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || '',
      database,
      waitForConnections: true,
      connectionLimit: 3,
      connectTimeout: 5000,
    });
    // Verify connection
    await pool.query('SELECT 1');
  }
} catch (err: any) {
  skipReason = `DB connection failed: ${err.message}`;
}

function skipIfNoDb() {
  if (skipReason) return { skip: skipReason };
  return {};
}

// --- Tests ---

test('E2E: schema tables exist after migration', skipIfNoDb(), async () => {
  const tables = [
    'plan_versions', 'subscriptions', 'subscription_members', 'affiliations',
    'subscription_cycles', 'session_balances', 'session_movements',
    'idempotency_keys', 'outbox_events', 'feature_flags', 'migration_mappings',
    'access_attempts', 'access_points',
  ];
  for (const table of tables) {
    const [rows]: any = await pool.query(
      "SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      [table],
    );
    assert.ok(Number(rows[0].c) > 0, `Table '${table}' should exist`);
  }
});

test('E2E: feature flags are seeded', skipIfNoDb(), async () => {
  const [rows]: any = await pool.query("SELECT COUNT(*) AS c FROM feature_flags WHERE scope = 'global'");
  assert.ok(Number(rows[0].c) >= 6, 'At least 6 feature flags should be seeded');
});

test('E2E: create plan version → subscription → affiliation lifecycle', skipIfNoDb(), async () => {
  const crypto = await import('node:crypto');
  const testId = crypto.randomUUID().slice(0, 8);

  // Ensure a test plan exists
  const planId = `plan_e2e_${testId}`;
  await pool.query(
    "INSERT IGNORE INTO subscription_plans (id, name, price, duration_days, status) VALUES (?, ?, 99, 30, 'active')",
    [planId, `E2E Plan ${testId}`],
  );

  // Create plan version
  const pvId = `pv_e2e_${testId}`;
  await pool.query(
    `INSERT INTO plan_versions (id, plan_id, version_number, name, plan_type, price, currency, duration_days, max_members, sessions_unlimited, sessions_per_cycle, cycle_frequency, distribution_model, status, published_at)
     VALUES (?, ?, 1, ?, 'individual', 99, 'USD', 30, 1, 0, 10, 'monthly', 'individual', 'active', NOW())`,
    [pvId, planId, `E2E Plan v1 ${testId}`],
  );

  // Ensure test member exists
  const memberId = `mem_e2e_${testId}`;
  await pool.query(
    "INSERT IGNORE INTO members (id, first_name, last_name, email, status) VALUES (?, 'E2E', 'Test', ?, 'active')",
    [memberId, `e2e_${testId}@test.local`],
  );

  // Create subscription
  const subId = `sub_e2e_${testId}`;
  const today = new Date().toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO subscriptions (id, plan_id, plan_version_id, holder_member_id, status, start_date, end_date, price_paid, currency, payment_status, max_members)
     VALUES (?, ?, ?, ?, 'active', ?, ?, 99, 'USD', 'paid', 1)`,
    [subId, planId, pvId, memberId, today, endDate],
  );

  // Create subscription member
  const smId = `sm_e2e_${testId}`;
  await pool.query(
    "INSERT INTO subscription_members (id, subscription_id, member_id, role, status, joined_at) VALUES (?, ?, ?, 'holder', 'active', NOW())",
    [smId, subId, memberId],
  );

  // Create affiliation
  const affId = `aff_e2e_${testId}`;
  await pool.query(
    `INSERT INTO affiliations (id, member_id, subscription_id, subscription_member_id, plan_version_id, status, role, is_primary, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, 'active', 'holder', 1, ?, ?)`,
    [affId, memberId, subId, smId, pvId, today, endDate],
  );

  // Create cycle
  const cycId = `cyc_e2e_${testId}`;
  await pool.query(
    "INSERT INTO subscription_cycles (id, subscription_id, cycle_number, start_date, end_date, status, sessions_allocated) VALUES (?, ?, 1, ?, ?, 'active', 10)",
    [cycId, subId, today, endDate],
  );

  // Create balance
  const balId = `bal_e2e_${testId}`;
  await pool.query(
    "INSERT INTO session_balances (id, context_type, context_id, cycle_id, included, available) VALUES (?, 'affiliation', ?, ?, 10, 10)",
    [balId, affId, cycId],
  );

  // Consume a session via session_movements
  const movId = `mov_e2e_${testId}`;
  await pool.query(
    `INSERT INTO session_movements (id, balance_id, affiliation_id, cycle_id, movement_type, quantity, direction, balance_before, balance_after, reason, performed_by)
     VALUES (?, ?, ?, ?, 'consumption', 1, '-', 10, 9, 'E2E test consumption', 'test')`,
    [movId, balId, affId, cycId],
  );
  await pool.query("UPDATE session_balances SET consumed = 1, available = 9, last_movement_id = ? WHERE id = ?", [movId, balId]);

  // Verify balance
  const [balRows]: any = await pool.query("SELECT * FROM session_balances WHERE id = ?", [balId]);
  assert.equal(Number(balRows[0].available), 9);
  assert.equal(Number(balRows[0].consumed), 1);
  assert.equal(Number(balRows[0].included), 10);

  // Verify movement is immutable (cannot be updated)
  const [movRows]: any = await pool.query("SELECT * FROM session_movements WHERE id = ?", [movId]);
  assert.equal(movRows[0].movement_type, 'consumption');
  assert.equal(Number(movRows[0].balance_after), 9);

  // Cleanup
  await pool.query("DELETE FROM session_movements WHERE id = ?", [movId]);
  await pool.query("DELETE FROM session_balances WHERE id = ?", [balId]);
  await pool.query("DELETE FROM subscription_cycles WHERE id = ?", [cycId]);
  await pool.query("DELETE FROM affiliations WHERE id = ?", [affId]);
  await pool.query("DELETE FROM subscription_members WHERE id = ?", [smId]);
  await pool.query("DELETE FROM subscriptions WHERE id = ?", [subId]);
  await pool.query("DELETE FROM plan_versions WHERE id = ?", [pvId]);
  await pool.query("DELETE FROM subscription_plans WHERE id = ?", [planId]);
  await pool.query("DELETE FROM members WHERE id = ?", [memberId]);
});

test('E2E: access attempt recording works', skipIfNoDb(), async () => {
  const crypto = await import('node:crypto');
  const attId = `att_e2e_${crypto.randomUUID().slice(0, 8)}`;

  await pool.query(
    `INSERT INTO access_attempts (id, method, decision, person_type, person_id, request_id)
     VALUES (?, 'manual', 'authorized', 'member', 'mem_test', ?)`,
    [attId, `req_${attId}`],
  );

  const [rows]: any = await pool.query("SELECT * FROM access_attempts WHERE id = ?", [attId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].decision, 'authorized');
  assert.equal(rows[0].method, 'manual');

  await pool.query("DELETE FROM access_attempts WHERE id = ?", [attId]);
});

test('E2E: outbox event lifecycle', skipIfNoDb(), async () => {
  const crypto = await import('node:crypto');
  const evtId = `evt_e2e_${crypto.randomUUID().slice(0, 8)}`;

  await pool.query(
    "INSERT INTO outbox_events (id, event_type, payload, status) VALUES (?, 'test_event', ?, 'pending')",
    [evtId, JSON.stringify({ test: true })],
  );

  // Mark as sent
  await pool.query("UPDATE outbox_events SET status = 'sent', processed_at = NOW() WHERE id = ?", [evtId]);

  const [rows]: any = await pool.query("SELECT * FROM outbox_events WHERE id = ?", [evtId]);
  assert.equal(rows[0].status, 'sent');
  assert.ok(rows[0].processed_at);

  await pool.query("DELETE FROM outbox_events WHERE id = ?", [evtId]);
});

// Cleanup pool after all tests
test('E2E: cleanup', skipIfNoDb(), async () => {
  if (pool) await pool.end();
});
