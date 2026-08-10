#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';
import { buildSessionBalanceResult, parseArgs } from './v2-session-balance-reconciliation-core.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SESSION_BALANCE_RECONCILIATION_SQL = `
SELECT 'migrated_subscriptions' check_id, COUNT(*) issue_count FROM subscriptions s JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = s.id
UNION ALL SELECT 'limited_subscriptions', COUNT(*) FROM subscriptions s JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = s.id JOIN plan_versions pv ON pv.id = s.plan_version_id WHERE pv.sessions_unlimited = 0
UNION ALL SELECT 'unlimited_subscriptions', COUNT(*) FROM subscriptions s JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = s.id JOIN plan_versions pv ON pv.id = s.plan_version_id WHERE pv.sessions_unlimited = 1
UNION ALL SELECT 'active_cycles', COUNT(*) FROM subscription_cycles sc JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = sc.subscription_id WHERE LOWER(TRIM(sc.status)) = 'active'
UNION ALL SELECT 'session_balances', COUNT(*) FROM session_balances sb JOIN subscription_cycles sc ON sc.id = sb.cycle_id JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = sc.subscription_id
UNION ALL SELECT 'session_movements', COUNT(*) FROM session_movements sm JOIN subscription_cycles sc ON sc.id = sm.cycle_id JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = sc.subscription_id
UNION ALL SELECT 'missing_active_cycles', COUNT(*) FROM subscriptions s JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = s.id JOIN plan_versions pv ON pv.id = s.plan_version_id LEFT JOIN subscription_cycles sc ON sc.subscription_id = s.id AND LOWER(TRIM(sc.status)) = 'active' WHERE pv.sessions_unlimited = 0 AND LOWER(TRIM(s.status)) = 'active' AND sc.id IS NULL
UNION ALL SELECT 'duplicate_active_cycles', COUNT(*) FROM (SELECT sc.subscription_id FROM subscription_cycles sc JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = sc.subscription_id WHERE LOWER(TRIM(sc.status)) = 'active' GROUP BY sc.subscription_id HAVING COUNT(*) > 1) duplicates
UNION ALL SELECT 'missing_session_balances', COUNT(*) FROM (SELECT sc.id cycle_id, 'subscription' context_type, s.id context_id FROM subscription_cycles sc JOIN subscriptions s ON s.id = sc.subscription_id JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = s.id JOIN plan_versions pv ON pv.id = s.plan_version_id WHERE pv.sessions_unlimited = 0 AND pv.distribution_model = 'shared' AND LOWER(TRIM(sc.status)) = 'active' UNION ALL SELECT sc.id, 'affiliation', a.id FROM subscription_cycles sc JOIN subscriptions s ON s.id = sc.subscription_id JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = s.id JOIN plan_versions pv ON pv.id = s.plan_version_id JOIN affiliations a ON a.subscription_id = s.id AND LOWER(TRIM(a.status)) = 'active' WHERE pv.sessions_unlimited = 0 AND pv.distribution_model <> 'shared' AND LOWER(TRIM(sc.status)) = 'active') expected LEFT JOIN session_balances sb ON sb.cycle_id = expected.cycle_id AND sb.context_type = expected.context_type AND sb.context_id = expected.context_id WHERE sb.id IS NULL
UNION ALL SELECT 'unexpected_unlimited_balances', COUNT(*) FROM session_balances sb JOIN subscription_cycles sc ON sc.id = sb.cycle_id JOIN subscriptions s ON s.id = sc.subscription_id JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = s.id JOIN plan_versions pv ON pv.id = s.plan_version_id WHERE pv.sessions_unlimited = 1
UNION ALL SELECT 'invalid_balance_contexts', COUNT(*) FROM session_balances sb JOIN subscription_cycles sc ON sc.id = sb.cycle_id JOIN subscriptions s ON s.id = sc.subscription_id JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = s.id JOIN plan_versions pv ON pv.id = s.plan_version_id LEFT JOIN affiliations a ON a.id = sb.context_id WHERE (pv.distribution_model = 'shared' AND (sb.context_type <> 'subscription' OR sb.context_id <> s.id)) OR (pv.distribution_model <> 'shared' AND (sb.context_type <> 'affiliation' OR a.id IS NULL OR a.subscription_id <> s.id))
UNION ALL SELECT 'orphan_session_movements', COUNT(*) FROM session_movements sm LEFT JOIN session_balances sb ON sb.id = sm.balance_id LEFT JOIN subscription_cycles sc ON sc.id = sm.cycle_id WHERE sb.id IS NULL OR sc.id IS NULL OR sb.cycle_id <> sm.cycle_id
UNION ALL SELECT 'balance_formula_mismatches', COUNT(*) FROM session_balances sb JOIN subscription_cycles sc ON sc.id = sb.cycle_id JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = sc.subscription_id WHERE sb.available <> sb.included + sb.carried_over + sb.purchased + sb.adjustments_positive + sb.refunds - sb.reserved - sb.consumed - sb.expired - sb.adjustments_negative
UNION ALL SELECT 'movement_projection_mismatches', COUNT(*) FROM session_balances sb JOIN subscription_cycles sc ON sc.id = sb.cycle_id JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = sc.subscription_id LEFT JOIN (SELECT balance_id, COALESCE(SUM(CASE WHEN movement_type = 'allocation' THEN quantity ELSE 0 END), 0) included, COALESCE(SUM(CASE WHEN movement_type = 'carryover' THEN quantity ELSE 0 END), 0) carried_over, COALESCE(SUM(CASE WHEN movement_type = 'purchase' THEN quantity ELSE 0 END), 0) purchased, COALESCE(SUM(CASE WHEN movement_type IN ('adjustment_positive','compensation') THEN quantity ELSE 0 END), 0) adjustments_positive, COALESCE(SUM(CASE WHEN movement_type = 'refund' THEN quantity ELSE 0 END), 0) refunds, COALESCE(SUM(CASE WHEN movement_type = 'reservation' THEN quantity WHEN movement_type = 'release' THEN -quantity ELSE 0 END), 0) reserved, COALESCE(SUM(CASE WHEN movement_type = 'consumption' THEN quantity ELSE 0 END), 0) consumed, COALESCE(SUM(CASE WHEN movement_type = 'expiration' THEN quantity ELSE 0 END), 0) expired, COALESCE(SUM(CASE WHEN movement_type = 'adjustment_negative' THEN quantity ELSE 0 END), 0) adjustments_negative FROM session_movements GROUP BY balance_id) ledger ON ledger.balance_id = sb.id WHERE sb.included <> COALESCE(ledger.included, 0) OR sb.carried_over <> COALESCE(ledger.carried_over, 0) OR sb.purchased <> COALESCE(ledger.purchased, 0) OR sb.adjustments_positive <> COALESCE(ledger.adjustments_positive, 0) OR sb.refunds <> COALESCE(ledger.refunds, 0) OR sb.reserved <> COALESCE(ledger.reserved, 0) OR sb.consumed <> COALESCE(ledger.consumed, 0) OR sb.expired <> COALESCE(ledger.expired, 0) OR sb.adjustments_negative <> COALESCE(ledger.adjustments_negative, 0)
UNION ALL SELECT 'negative_session_values', COUNT(*) FROM session_balances sb JOIN subscription_cycles sc ON sc.id = sb.cycle_id JOIN migration_mappings mm ON mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions' AND mm.target_id = sc.subscription_id WHERE LEAST(sb.included, sb.carried_over, sb.purchased, sb.adjustments_positive, sb.refunds, sb.reserved, sb.consumed, sb.expired, sb.adjustments_negative, sb.available) < 0
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbConfig = getDatabaseEnv();
  const missing = getMissingDatabaseEnv(dbConfig);
  if (missing.length) throw new Error(`Missing DB env: ${missing.join(', ')}`);
  const connection = await mysql.createConnection({ ...dbConfig, dateStrings: ['DATE'] });
  try {
    const [rows] = await connection.query(SESSION_BALANCE_RECONCILIATION_SQL);
    const result = buildSessionBalanceResult(rows, dbConfig.database);
    if (args.output) {
      const outputPath = path.resolve(PROJECT_ROOT, args.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
      result.evidence = outputPath;
    }
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`V2 session-balance reconciliation: ${result.result}`);
      console.log(`Migrated subscriptions: ${result.source.migratedSubscriptions} (${result.source.limitedSubscriptions} limited, ${result.source.unlimitedSubscriptions} unlimited)`);
      console.log(`Active cycles: ${result.reconciled.activeCycles}; balances: ${result.reconciled.sessionBalances}; movements: ${result.reconciled.sessionMovements}`);
      console.log(`Issues: ${result.issueCount}`);
      if (result.evidence) console.log(`Evidence: ${result.evidence}`);
    }
    if (result.result !== 'PASS') process.exitCode = 2;
  } finally { await connection.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`V2 session-balance reconciliation failed: ${error.message}`); process.exitCode = 1; });
}
