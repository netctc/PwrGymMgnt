#!/usr/bin/env node
/**
 * Evolution System Health Check — Verifies deployment state.
 * Usage: node scripts/evolution-health-check.mjs
 */

import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

const dbConfig = getDatabaseEnv();
const missing = getMissingDatabaseEnv(dbConfig);
if (missing.length > 0) { console.error(`Missing: ${missing.join(', ')}`); process.exit(1); }

const connection = await mysql.createConnection({
  host: dbConfig.host, port: dbConfig.port, user: dbConfig.user,
  password: dbConfig.password, database: dbConfig.database, connectTimeout: 5000,
});

let pass = 0, fail = 0;

async function check(name, query, validator) {
  try {
    const [rows] = await connection.query(query);
    const ok = validator(rows);
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    ok ? pass++ : fail++;
  } catch (err) {
    console.log(`  ✗ ${name} — ${err.message}`);
    fail++;
  }
}

console.log('\n=== Evolution System Health Check ===\n');

// Schema
await check('plan_versions table exists',
  "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plan_versions'",
  rows => rows.length > 0);
await check('subscriptions table has plan_version_id',
  "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptions' AND COLUMN_NAME = 'plan_version_id'",
  rows => rows.length > 0);
await check('session_movements table exists',
  "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'session_movements'",
  rows => rows.length > 0);
await check('access_attempts table exists',
  "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'access_attempts'",
  rows => rows.length > 0);
await check('feature_flags seeded (>=6)',
  "SELECT COUNT(*) AS c FROM feature_flags WHERE scope = 'global'",
  rows => Number(rows[0]?.c || 0) >= 6);

// Data integrity
await check('No negative session balances',
  "SELECT COUNT(*) AS c FROM session_balances WHERE available < 0",
  rows => Number(rows[0]?.c || 0) === 0);
await check('Outbox has no stuck failed events (>24h)',
  "SELECT COUNT(*) AS c FROM outbox_events WHERE status = 'failed' AND last_attempt_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)",
  rows => Number(rows[0]?.c || 0) === 0);
await check('No expired active cycles',
  "SELECT COUNT(*) AS c FROM subscription_cycles WHERE status = 'active' AND end_date < DATE_SUB(CURDATE(), INTERVAL 2 DAY)",
  rows => Number(rows[0]?.c || 0) === 0);

// Feature flags
await check('ENABLE_NEW_SUBSCRIPTION_MODEL flag exists',
  "SELECT enabled FROM feature_flags WHERE flag_key = 'ENABLE_NEW_SUBSCRIPTION_MODEL' AND scope = 'global'",
  rows => rows.length > 0);

console.log(`\n  Result: ${pass} passed, ${fail} failed\n`);
await connection.end();
process.exit(fail > 0 ? 1 : 0);
