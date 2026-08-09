#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';
import { buildResult, parseArgs } from './v2-reconciliation-core.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const RECONCILIATION_SQL = `
SELECT 'source_plans' check_id, COUNT(*) issue_count FROM subscription_plans
UNION ALL SELECT 'source_subscriptions', COUNT(*) FROM member_subscriptions
UNION ALL SELECT 'mapped_plans', COUNT(DISTINCT source_id) FROM migration_mappings WHERE source_table = 'subscription_plans' AND target_table = 'plan_versions'
UNION ALL SELECT 'mapped_subscriptions', COUNT(DISTINCT source_id) FROM migration_mappings WHERE source_table = 'member_subscriptions' AND target_table = 'subscriptions'
UNION ALL SELECT 'mapped_affiliations', COUNT(DISTINCT source_id) FROM migration_mappings WHERE source_table = 'member_subscriptions' AND target_table = 'affiliations'
UNION ALL SELECT 'duplicate_plan_mappings', COUNT(*) FROM (SELECT source_id FROM migration_mappings WHERE source_table = 'subscription_plans' AND target_table = 'plan_versions' GROUP BY source_id HAVING COUNT(*) > 1) x
UNION ALL SELECT 'duplicate_subscription_mappings', COUNT(*) FROM (SELECT source_id FROM migration_mappings WHERE source_table = 'member_subscriptions' AND target_table = 'subscriptions' GROUP BY source_id HAVING COUNT(*) > 1) x
UNION ALL SELECT 'duplicate_affiliation_mappings', COUNT(*) FROM (SELECT source_id FROM migration_mappings WHERE source_table = 'member_subscriptions' AND target_table = 'affiliations' GROUP BY source_id HAVING COUNT(*) > 1) x
UNION ALL SELECT 'orphan_plan_targets', COUNT(*) FROM migration_mappings mm LEFT JOIN plan_versions pv ON pv.id = mm.target_id WHERE mm.source_table = 'subscription_plans' AND mm.target_table = 'plan_versions' AND pv.id IS NULL
UNION ALL SELECT 'orphan_subscription_targets', COUNT(*) FROM migration_mappings mm LEFT JOIN subscriptions s ON s.id = mm.target_id WHERE mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND s.id IS NULL
UNION ALL SELECT 'orphan_affiliation_targets', COUNT(*) FROM migration_mappings mm LEFT JOIN affiliations a ON a.id = mm.target_id WHERE mm.source_table = 'member_subscriptions' AND mm.target_table = 'affiliations' AND a.id IS NULL
UNION ALL SELECT 'contract_field_mismatches', COUNT(*) FROM member_subscriptions ms JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.source_id = ms.id AND mm.target_table = 'subscriptions' JOIN subscriptions s ON s.id = mm.target_id WHERE s.legacy_subscription_id <> ms.id OR s.holder_member_id <> ms.member_id OR NOT (s.plan_id <=> COALESCE(ms.plan_id, 'plan_legacy')) OR LOWER(TRIM(s.status)) <> LOWER(TRIM(ms.status)) OR s.start_date <> ms.start_date OR s.end_date <> ms.end_date OR ABS(s.price_paid - ms.price) > 0.001 OR UPPER(TRIM(s.currency)) <> UPPER(TRIM(ms.currency))
UNION ALL SELECT 'holder_mismatches', COUNT(*) FROM member_subscriptions ms JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.source_id = ms.id AND mm.target_table = 'subscriptions' LEFT JOIN subscription_members sm ON sm.subscription_id = mm.target_id AND sm.member_id = ms.member_id AND sm.role = 'holder' WHERE sm.id IS NULL
UNION ALL SELECT 'affiliation_mismatches', COUNT(*) FROM member_subscriptions ms JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.source_id = ms.id AND mm.target_table = 'affiliations' LEFT JOIN affiliations a ON a.id = mm.target_id WHERE a.id IS NULL OR a.member_id <> ms.member_id OR LOWER(TRIM(a.status)) <> LOWER(TRIM(ms.status)) OR a.start_date <> ms.start_date OR a.end_date <> ms.end_date OR a.role <> 'holder'
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbConfig = getDatabaseEnv();
  const missing = getMissingDatabaseEnv(dbConfig);
  if (missing.length) throw new Error(`Missing DB env: ${missing.join(', ')}`);

  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    connectTimeout: dbConfig.connectTimeout,
  });

  try {
    const [rows] = await connection.query(RECONCILIATION_SQL);
    const result = buildResult(rows, dbConfig.database);
    if (args.output) {
      const outputPath = path.resolve(PROJECT_ROOT, args.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
      result.evidence = outputPath;
    }
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`V2 structural reconciliation: ${result.result}`);
      console.log(`Source: ${result.source.plans} plans, ${result.source.memberSubscriptions} subscriptions`);
      console.log(`Mapped: ${result.mapped.plans} plans, ${result.mapped.subscriptions} subscriptions, ${result.mapped.affiliations} affiliations`);
      console.log(`Issues: ${result.issueCount}`);
      if (result.evidence) console.log(`Evidence: ${result.evidence}`);
    }
    if (result.result !== 'PASS') process.exitCode = 2;
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`V2 reconciliation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
