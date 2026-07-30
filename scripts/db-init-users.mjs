#!/usr/bin/env node
/**
 * Database initialization script — Seeds admin_users with default accounts.
 * Usage: node scripts/db-init-users.mjs
 *
 * This script is idempotent: existing users (by email) are skipped.
 * Passwords are hashed using the same scrypt algorithm as the application.
 */

import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

const SEED_USERS = [
  { email: 'super_admin@powergym.local', name: 'Super Admin', username: 'super_admin', role: 'super_admin' },
  { email: 'admin@powergym.local', name: 'Admin', username: 'admin', role: 'admin' },
];

async function main() {
  const initialPassword = String(process.env.POWERGYM_INITIAL_ADMIN_PASSWORD || '').trim();
  if (!initialPassword || /^replace_/i.test(initialPassword) || initialPassword.length < 10) {
    throw new Error('Set POWERGYM_INITIAL_ADMIN_PASSWORD to a unique password of at least 10 characters.');
  }
  const dbConfig = getDatabaseEnv();
  const missing = getMissingDatabaseEnv(dbConfig);

  if (missing.length > 0) {
    console.error(`Missing database environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    connectTimeout: dbConfig.connectTimeout,
  });

  console.log(`Connected to ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`);
  const [adminUserTables] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'admin_users' LIMIT 1`,
    [dbConfig.database],
  );
  if (adminUserTables.length === 0) {
    await connection.end();
    throw new Error('admin_users table is missing. Run npm run db:migrate before npm run db:init-users.');
  }

  let created = 0;
  let skipped = 0;

  for (const user of SEED_USERS) {
    const [existing] = await connection.query(
      'SELECT id FROM admin_users WHERE email = ? LIMIT 1',
      [user.email]
    );

    if (existing.length > 0) {
      console.log(`  SKIP  ${user.email} (already exists)`);
      skipped++;
      continue;
    }

    const passwordHash = hashPassword(initialPassword);
    await connection.query(
      `INSERT INTO admin_users (name, email, username, password_hash, role, status, password_changed_at)
       VALUES (?, ?, ?, ?, ?, 'active', NOW())`,
      [user.name, user.email, user.username, passwordHash, user.role]
    );
    console.log(`  OK    ${user.email} (role: ${user.role})`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped.`);
  await connection.end();
}

main().catch((error) => {
  console.error('Failed to initialize users:', error.message);
  process.exit(1);
});
