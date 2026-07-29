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
  { email: 'super_admin@powergym.local', name: 'Super Admin', username: 'super_admin', role: 'super_admin', password: 'Ab.654321' },
  { email: 'admin@powergym.local', name: 'Admin', username: 'admin', role: 'admin', password: 'Ab.654321' },
];

async function main() {
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

  // Ensure admin_users table exists
  await connection.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NULL,
      email VARCHAR(255) NOT NULL,
      username VARCHAR(100) NULL,
      employee_id VARCHAR(64) NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'admin',
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      reset_phone VARCHAR(32) NULL,
      reset_delivery_channel VARCHAR(32) NULL,
      last_login_at DATETIME NULL,
      password_changed_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_admin_users_email (email),
      UNIQUE KEY uq_admin_users_username (username),
      UNIQUE KEY uq_admin_users_employee_id (employee_id),
      INDEX idx_admin_users_role (role),
      INDEX idx_admin_users_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

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

    const passwordHash = hashPassword(user.password);
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
