#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';
import { buildAccessDecisionShadowResult, parseArgs } from './v2-access-decision-shadow-core.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// This is deliberately a snapshot query. It must not invoke the authorization
// endpoint because that path records attempts, claims cooldowns and may consume
// sessions. The legacy expression mirrors the current compatibility lookup.
export const ACCESS_DECISION_SHADOW_SQL = `
WITH payment_totals AS (
  SELECT invoice_id,
         COALESCE(SUM(CASE WHEN event_type = 'payment' THEN amount WHEN event_type IN ('refund','reversal') THEN -amount WHEN event_type = 'waive' THEN amount ELSE 0 END), 0) net_paid
    FROM invoice_payment_events_v2 GROUP BY invoice_id
), shadow AS (
  SELECT mm.source_id, mm.target_id,
         (LOWER(TRIM(ms.status)) = 'active' AND ms.end_date >= CURDATE() AND LOWER(TRIM(m.status)) = 'active') legacy_allowed,
         (LOWER(TRIM(m.status)) = 'active'
          AND LOWER(TRIM(s.status)) = 'active' AND s.start_date <= CURDATE() AND s.end_date >= CURDATE()
          AND LOWER(TRIM(a.status)) = 'active' AND a.start_date <= CURDATE() AND a.end_date >= CURDATE()
          AND NOT (LOWER(COALESCE(s.payment_status, 'pending')) = 'refunded')
          AND NOT (COALESCE(pt.net_paid, 0) < COALESCE(i.total, s.price_paid, 0) AND COALESCE(i.due_date, s.start_date) < CURDATE())) v2_allowed,
         (ms.id IS NULL OR s.id IS NULL OR a.id IS NULL OR m.id IS NULL) incomplete
    FROM migration_mappings mm
    LEFT JOIN member_subscriptions ms ON ms.id = mm.source_id
    LEFT JOIN subscriptions s ON s.id = mm.target_id
    LEFT JOIN migration_mappings am ON am.source_table = 'member_subscriptions'
      AND am.source_id = mm.source_id AND am.target_table = 'affiliations'
    LEFT JOIN affiliations a ON a.id = am.target_id AND a.subscription_id = s.id AND a.member_id = ms.member_id
    LEFT JOIN members m ON m.id = ms.member_id
    LEFT JOIN invoices i ON i.subscription_v2_id = s.id
      AND i.id = (SELECT latest.id FROM invoices latest WHERE latest.subscription_v2_id = s.id ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1)
    LEFT JOIN payment_totals pt ON pt.invoice_id = i.id
   WHERE mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions'
)
SELECT 'migrated_subscriptions' check_id, COUNT(*) issue_count FROM shadow
UNION ALL SELECT 'compared_mappings', COUNT(*) FROM shadow WHERE incomplete = 0
UNION ALL SELECT 'incomplete_shadow_inputs', COUNT(*) FROM shadow WHERE incomplete = 1
UNION ALL SELECT 'authorization_mismatches', COUNT(*) FROM shadow WHERE incomplete = 0 AND legacy_allowed <> v2_allowed
UNION ALL SELECT 'legacy_allowed', COUNT(*) FROM shadow WHERE incomplete = 0 AND legacy_allowed = 1
UNION ALL SELECT 'v2_allowed', COUNT(*) FROM shadow WHERE incomplete = 0 AND v2_allowed = 1
`;

// Identifiers and boolean rule outcomes only: no member names, contact data or
// other PII are written to reconciliation evidence.
export const ACCESS_DECISION_MISMATCH_SQL = `
WITH payment_totals AS (
  SELECT invoice_id,
         COALESCE(SUM(CASE WHEN event_type = 'payment' THEN amount WHEN event_type IN ('refund','reversal') THEN -amount WHEN event_type = 'waive' THEN amount ELSE 0 END), 0) net_paid
    FROM invoice_payment_events_v2 GROUP BY invoice_id
), shadow AS (
  SELECT mm.source_id legacy_subscription_id, mm.target_id v2_subscription_id, a.id affiliation_id,
         (LOWER(TRIM(ms.status)) = 'active' AND ms.end_date >= CURDATE() AND LOWER(TRIM(m.status)) = 'active') legacy_allowed,
         (LOWER(TRIM(m.status)) = 'active') member_active,
         (LOWER(TRIM(s.status)) = 'active') subscription_active,
         (s.start_date <= CURDATE()) subscription_started,
         (s.end_date >= CURDATE()) subscription_not_expired,
         (LOWER(TRIM(a.status)) = 'active') affiliation_active,
         (a.start_date <= CURDATE()) affiliation_started,
         (a.end_date >= CURDATE()) affiliation_not_expired,
         NOT (LOWER(COALESCE(s.payment_status, 'pending')) = 'refunded') payment_not_refunded,
         NOT (COALESCE(pt.net_paid, 0) < COALESCE(i.total, s.price_paid, 0) AND COALESCE(i.due_date, s.start_date) < CURDATE()) payment_not_overdue,
         (ms.id IS NULL OR s.id IS NULL OR a.id IS NULL OR m.id IS NULL) incomplete
    FROM migration_mappings mm
    LEFT JOIN member_subscriptions ms ON ms.id = mm.source_id
    LEFT JOIN subscriptions s ON s.id = mm.target_id
    LEFT JOIN migration_mappings am ON am.source_table = 'member_subscriptions'
      AND am.source_id = mm.source_id AND am.target_table = 'affiliations'
    LEFT JOIN affiliations a ON a.id = am.target_id AND a.subscription_id = s.id AND a.member_id = ms.member_id
    LEFT JOIN members m ON m.id = ms.member_id
    LEFT JOIN invoices i ON i.subscription_v2_id = s.id
      AND i.id = (SELECT latest.id FROM invoices latest WHERE latest.subscription_v2_id = s.id ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1)
    LEFT JOIN payment_totals pt ON pt.invoice_id = i.id
   WHERE mm.source_table = 'member_subscriptions' AND mm.target_table = 'subscriptions'
), evaluated AS (
  SELECT *, (member_active AND subscription_active AND subscription_started AND subscription_not_expired
    AND affiliation_active AND affiliation_started AND affiliation_not_expired
    AND payment_not_refunded AND payment_not_overdue) v2_allowed
    FROM shadow
)
SELECT legacy_subscription_id, v2_subscription_id, affiliation_id,
       legacy_allowed, v2_allowed, member_active, subscription_active,
       subscription_started, subscription_not_expired, affiliation_active,
       affiliation_started, affiliation_not_expired, payment_not_refunded, payment_not_overdue,
       CONCAT_WS(',',
         IF(NOT member_active, 'member_inactive', NULL),
         IF(NOT subscription_active, 'subscription_inactive', NULL),
         IF(NOT subscription_started, 'subscription_not_started', NULL),
         IF(NOT subscription_not_expired, 'subscription_expired', NULL),
         IF(NOT affiliation_active, 'affiliation_inactive', NULL),
         IF(NOT affiliation_started, 'affiliation_not_started', NULL),
         IF(NOT affiliation_not_expired, 'affiliation_expired', NULL),
         IF(NOT payment_not_refunded, 'payment_refunded', NULL),
         IF(NOT payment_not_overdue, 'payment_overdue', NULL)
       ) reasons
  FROM evaluated
 WHERE incomplete = 0 AND legacy_allowed <> v2_allowed
 ORDER BY legacy_subscription_id
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbConfig = getDatabaseEnv();
  const missing = getMissingDatabaseEnv(dbConfig);
  if (missing.length) throw new Error(`Missing DB env: ${missing.join(', ')}`);
  const connection = await mysql.createConnection({ ...dbConfig, dateStrings: ['DATE'] });
  try {
    const [rows] = await connection.query(ACCESS_DECISION_SHADOW_SQL);
    const [mismatchRows] = await connection.query(ACCESS_DECISION_MISMATCH_SQL);
    const result = buildAccessDecisionShadowResult(rows, dbConfig.database, mismatchRows);
    if (args.output) {
      const outputPath = path.resolve(PROJECT_ROOT, args.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
      result.evidence = outputPath;
    }
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`V2 access-decision shadow reconciliation: ${result.result}`);
      console.log(`Migrated: ${result.source.migratedSubscriptions}; compared: ${result.compared.mappings}`);
      console.log(`Matches: ${result.compared.matches}; mismatches: ${result.compared.mismatches}`);
      console.log(`Legacy allowed: ${result.compared.legacyAllowed}; V2 allowed: ${result.compared.v2Allowed}`);
      console.log(`Issues: ${result.issueCount}`);
      if (result.evidence) console.log(`Evidence: ${result.evidence}`);
    }
    if (result.result !== 'PASS') process.exitCode = 2;
  } finally { await connection.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`V2 access-decision shadow reconciliation failed: ${error.message}`); process.exitCode = 1; });
}
