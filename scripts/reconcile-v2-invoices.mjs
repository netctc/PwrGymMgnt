#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';
import { buildInvoiceResult, parseArgs } from './v2-invoice-reconciliation-core.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const INVOICE_RECONCILIATION_SQL = `
SELECT 'source_invoices' check_id, COUNT(*) issue_count FROM invoices WHERE subscription_id IS NOT NULL
UNION ALL SELECT 'mapped_source_invoices', COUNT(*) FROM invoices i JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.source_id = i.subscription_id AND mm.target_table = 'subscriptions' WHERE i.subscription_id IS NOT NULL
UNION ALL SELECT 'correct_v2_links', COUNT(*) FROM invoices i JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.source_id = i.subscription_id AND mm.target_table = 'subscriptions' WHERE i.subscription_v2_id = mm.target_id
UNION ALL SELECT 'missing_subscription_mappings', COUNT(*) FROM invoices i LEFT JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.source_id = i.subscription_id AND mm.target_table = 'subscriptions' WHERE i.subscription_id IS NOT NULL AND mm.target_id IS NULL
UNION ALL SELECT 'missing_v2_links', COUNT(*) FROM invoices i JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.source_id = i.subscription_id AND mm.target_table = 'subscriptions' WHERE i.subscription_v2_id IS NULL
UNION ALL SELECT 'incorrect_v2_links', COUNT(*) FROM invoices i JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.source_id = i.subscription_id AND mm.target_table = 'subscriptions' WHERE i.subscription_v2_id IS NOT NULL AND i.subscription_v2_id <> mm.target_id
UNION ALL SELECT 'orphan_v2_links', COUNT(*) FROM invoices i LEFT JOIN subscriptions s ON s.id = i.subscription_v2_id WHERE i.subscription_v2_id IS NOT NULL AND s.id IS NULL
UNION ALL SELECT 'member_mismatches', COUNT(*) FROM invoices i JOIN member_subscriptions ms ON ms.id = i.subscription_id JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.source_id = ms.id AND mm.target_table = 'subscriptions' JOIN subscriptions s ON s.id = mm.target_id WHERE i.member_id <> ms.member_id OR i.member_id <> s.holder_member_id
UNION ALL SELECT 'financial_field_issues', COUNT(*) FROM invoices i WHERE i.subscription_id IS NOT NULL AND (i.subtotal < 0 OR i.tax_amount < 0 OR i.total < 0 OR ABS(i.total - (i.subtotal + i.tax_amount)) > 0.01 OR TRIM(COALESCE(i.currency, '')) = '' OR LOWER(TRIM(i.status)) NOT IN ('draft','issued','pending','partial','paid','overdue','unpaid','void','waived','cancelled'))
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbConfig = getDatabaseEnv();
  const missing = getMissingDatabaseEnv(dbConfig);
  if (missing.length) throw new Error(`Missing DB env: ${missing.join(', ')}`);
  const connection = await mysql.createConnection({ ...dbConfig, dateStrings: ['DATE'] });
  try {
    const [rows] = await connection.query(INVOICE_RECONCILIATION_SQL);
    const result = buildInvoiceResult(rows, dbConfig.database);
    if (args.output) {
      const outputPath = path.resolve(PROJECT_ROOT, args.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
      result.evidence = outputPath;
    }
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`V2 invoice reconciliation: ${result.result}`);
      console.log(`Source legacy-linked invoices: ${result.source.legacyLinkedInvoices}`);
      console.log(`Correct V2 links: ${result.reconciled.correctlyLinkedInvoices}`);
      console.log(`Issues: ${result.issueCount}`);
      if (result.evidence) console.log(`Evidence: ${result.evidence}`);
    }
    if (result.result !== 'PASS') process.exitCode = 2;
  } finally { await connection.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`V2 invoice reconciliation failed: ${error.message}`); process.exitCode = 1; });
}
