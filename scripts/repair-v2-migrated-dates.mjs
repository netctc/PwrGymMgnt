#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';
import { DATE_MISMATCH_SQL, parseArgs } from './v2-date-repair-core.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbConfig = getDatabaseEnv();
  const missing = getMissingDatabaseEnv(dbConfig);
  if (missing.length) throw new Error(`Missing DB env: ${missing.join(', ')}`);
  const connection = await mysql.createConnection({ ...dbConfig, dateStrings: ['DATE'] });
  try {
    const [rows] = await connection.query(DATE_MISMATCH_SQL);
    if (args.apply) {
      await connection.beginTransaction();
      try {
        for (const row of rows) {
          await connection.query('UPDATE subscriptions SET start_date = ?, end_date = ? WHERE id = ?', [row.expected_start_date, row.expected_end_date, row.subscription_id]);
          await connection.query('UPDATE affiliations SET start_date = ?, end_date = ? WHERE id = ?', [row.expected_start_date, row.expected_end_date, row.affiliation_id]);
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    const result = {
      generatedAt: new Date().toISOString(), database: dbConfig.database,
      mode: args.apply ? 'apply' : 'dry-run', affectedMappings: rows.length,
      subscriptionsUpdated: args.apply ? rows.length : 0,
      affiliationsUpdated: args.apply ? rows.length : 0,
      committed: args.apply,
    };
    if (args.output) {
      const outputPath = path.resolve(PROJECT_ROOT, args.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
      console.log(`Evidence: ${outputPath}`);
    }
    console.log(`V2 migrated-date repair: ${args.apply ? 'APPLIED' : 'DRY RUN'}`);
    console.log(`Mapped subscriptions requiring correction: ${rows.length}`);
  } finally { await connection.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`V2 date repair failed: ${error.message}`); process.exitCode = 1; });
}
