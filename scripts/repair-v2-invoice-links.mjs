#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';
import { INVOICE_LINK_DIAGNOSTIC_SQL, INVOICE_LINK_UPDATE_SQL, parseArgs, summarize } from './v2-invoice-link-repair-core.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function diagnose(connection) {
  const [rows] = await connection.query(INVOICE_LINK_DIAGNOSTIC_SQL);
  return summarize(rows);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbConfig = getDatabaseEnv();
  const missing = getMissingDatabaseEnv(dbConfig);
  if (missing.length) throw new Error(`Missing DB env: ${missing.join(', ')}`);
  const connection = await mysql.createConnection(dbConfig);
  let transactionOpen = false;
  try {
    const before = await diagnose(connection);
    if (before.blockers.length) {
      throw new Error(`Repair blocked by preflight: ${before.blockers.map((item) => `${item.id}=${item.count}`).join(', ')}`);
    }

    let updated = 0;
    if (args.apply && before.eligible > 0) {
      await connection.beginTransaction();
      transactionOpen = true;
      const [updateResult] = await connection.query(INVOICE_LINK_UPDATE_SQL);
      updated = Number(updateResult.affectedRows || 0);
      const after = await diagnose(connection);
      if (updated !== before.eligible || after.eligible !== 0 || after.blockers.length) {
        throw new Error(`Post-update verification failed: expected=${before.eligible}, updated=${updated}, remaining=${after.eligible}`);
      }
      await connection.commit();
      transactionOpen = false;
    }

    const result = {
      generatedAt: new Date().toISOString(), database: dbConfig.database,
      mode: args.apply ? 'apply' : 'dry-run', scope: 'invoiceLinks',
      eligibleMappings: before.eligible, invoicesUpdated: updated,
      committed: args.apply,
      idempotent: args.apply ? before.eligible === 0 : null,
    };
    if (args.output) {
      const outputPath = path.resolve(PROJECT_ROOT, args.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
      result.evidence = outputPath;
    }
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`V2 invoice-link repair: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
      console.log(`Eligible mappings: ${result.eligibleMappings}`);
      console.log(`Invoices updated: ${result.invoicesUpdated}`);
      console.log(`Committed: ${result.committed}`);
      if (result.evidence) console.log(`Evidence: ${result.evidence}`);
    }
  } catch (error) {
    if (transactionOpen) await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`V2 invoice-link repair failed: ${error.message}`); process.exitCode = 1; });
}
