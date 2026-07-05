import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

const dbConfig = getDatabaseEnv();
const missing = getMissingDatabaseEnv(dbConfig);

if (missing.length > 0) {
  console.error(`Missing database environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const seedFile = process.argv[2] || '009_test_seed_data.sql';
const seedPath = path.join(process.cwd(), 'sql', seedFile);

const connection = await mysql.createConnection({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  connectTimeout: dbConfig.connectTimeout,
  multipleStatements: true,
});

try {
  const sql = await fs.readFile(seedPath, 'utf8');
  console.log(`Applying seed ${seedFile}...`);
  await connection.query(sql);
  console.log('Seed data applied successfully.');
} finally {
  await connection.end();
}
