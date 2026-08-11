#!/usr/bin/env node
/**
 * Backfill Script — Migrates existing member_subscriptions to the new V2 model.
 *
 * Creates:
 * - plan_versions (one per existing subscription_plan)
 * - subscriptions (one per member_subscription)
 * - subscription_members (holder for each)
 * - affiliations (one per subscription)
 * - migration_mappings (tracking old→new)
 *
 * Idempotent: skips records that already have a migration_mapping entry.
 * Safe: does NOT modify or delete existing tables.
 *
 * Usage: node scripts/backfill-subscriptions-v2.mjs [--dry-run]
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const DRY_RUN = args.dryRun;
const BATCH_ID = `backfill_${new Date().toISOString().slice(0, 10)}_${crypto.randomUUID().slice(0, 8)}`;

export function parseArgs(argv) {
  const parsed = { dryRun: false, output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (token === '--output' || token.startsWith('--output=')) {
      const value = token.includes('=') ? token.slice(token.indexOf('=') + 1) : argv[++index];
      if (!value) throw new Error('--output requires a file path.');
      parsed.output = value;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return parsed;
}

function writeEvidence(summary) {
  if (!args.output) return null;
  const outputPath = path.resolve(PROJECT_ROOT, args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
  return outputPath;
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

async function main() {
  const dbConfig = getDatabaseEnv();
  const missing = getMissingDatabaseEnv(dbConfig);
  if (missing.length > 0) {
    console.error(`Missing DB env: ${missing.join(', ')}`);
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    connectTimeout: dbConfig.connectTimeout,
    // Keep MySQL DATE values as YYYY-MM-DD strings. Converting a local-midnight
    // Date with toISOString() can shift it to the previous UTC day.
    dateStrings: ['DATE'],
  });

  console.log(`Connected to ${dbConfig.database}. Batch: ${BATCH_ID}. Dry run: ${DRY_RUN}`);

  // Verify schema: ensure required tables exist with expected columns
  const requiredTables = ['plan_versions', 'subscriptions', 'subscription_members', 'affiliations', 'migration_mappings'];
  for (const table of requiredTables) {
    const [rows] = await connection.query(
      "SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      [table]
    );
    if (Number(rows[0]?.c || 0) === 0) {
      throw new Error(`Table '${table}' does not exist. Run 'npm run db:migrate' first.`);
    }
  }
  // Verify subscriptions has plan_version_id column
  const [cols] = await connection.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptions' AND COLUMN_NAME = 'plan_version_id'"
  );
  if (cols.length === 0) {
    throw new Error("Table 'subscriptions' is not the V2 schema (missing plan_version_id). Run 'npm run db:migrate' before backfill; this command never renames or creates schema objects.");
  }
  console.log('Schema verification passed.');

  if (!DRY_RUN) await connection.beginTransaction();

  try {

  // Step 1: Ensure plan_versions exist for each subscription_plan
  const [plans] = await connection.query('SELECT * FROM subscription_plans');
  let planVersionsCreated = 0;
  let planVersionsReused = 0;

  for (const plan of plans) {
    // Check if already migrated
    const [existing] = await connection.query(
      "SELECT target_id FROM migration_mappings WHERE source_table = 'subscription_plans' AND source_id = ? AND target_table = 'plan_versions' LIMIT 1",
      [plan.id]
    );
    if (existing.length > 0) continue;

    const [existingVersions] = await connection.query(
      `SELECT id, version_number
         FROM plan_versions
        WHERE plan_id = ?
        ORDER BY version_number DESC, created_at DESC, id DESC
        LIMIT 1`,
      [plan.id]
    );
    const reusedVersion = existingVersions[0] || null;
    const pvId = reusedVersion?.id || createId('pv');
    if (!DRY_RUN) {
      if (!reusedVersion) {
        await connection.query(
          `INSERT INTO plan_versions (id, plan_id, version_number, name, description, plan_type, price, currency, duration_days, auto_renew, max_members, sessions_unlimited, sessions_per_cycle, cycle_frequency, distribution_model, status, published_at)
           VALUES (?, ?, 1, ?, ?, 'individual', ?, ?, ?, 0, 1, 1, NULL, 'monthly', 'individual', 'active', NOW())`,
          [pvId, plan.id, plan.name, plan.description || null, Number(plan.price || 0), plan.currency || 'USD', Number(plan.duration_days || 30)]
        );
      }
      await connection.query(
        "INSERT INTO migration_mappings (id, source_table, source_id, target_table, target_id, migration_batch) VALUES (?, 'subscription_plans', ?, 'plan_versions', ?, ?)",
        [createId('mm'), plan.id, pvId, BATCH_ID]
      );
    }
    if (reusedVersion) {
      planVersionsReused++;
      console.log(`  PLAN VERSION REUSED: ${plan.name} → ${pvId} (version ${reusedVersion.version_number})`);
    } else {
      planVersionsCreated++;
      console.log(`  PLAN VERSION CREATED: ${plan.name} → ${pvId}`);
    }
  }

  // Step 2: Migrate member_subscriptions → subscriptions + affiliations
  const [memberSubs] = await connection.query('SELECT * FROM member_subscriptions ORDER BY created_at ASC');
  let subsCreated = 0;
  let affiliationsCreated = 0;

  for (const ms of memberSubs) {
    // Check if already migrated
    const [existing] = await connection.query(
      "SELECT target_id FROM migration_mappings WHERE source_table = 'member_subscriptions' AND source_id = ? AND target_table = 'subscriptions' LIMIT 1",
      [ms.id]
    );
    if (existing.length > 0) continue;

    // Find the plan_version for this plan
    const [pvRows] = await connection.query(
      "SELECT target_id FROM migration_mappings WHERE source_table = 'subscription_plans' AND source_id = ? AND target_table = 'plan_versions' LIMIT 1",
      [ms.plan_id || '']
    );

    let planVersionId;
    if (pvRows.length > 0) {
      planVersionId = pvRows[0].target_id;
    } else {
      // Create a fallback plan_version
      planVersionId = createId('pv');
      if (!DRY_RUN) {
        // Need a plan_id — ensure it exists in subscription_plans first
        const fallbackPlanId = ms.plan_id || 'plan_legacy';
        await connection.query(
          `INSERT IGNORE INTO subscription_plans (id, name, price, duration_days, status)
           VALUES (?, ?, ?, 30, 'active')`,
          [fallbackPlanId, ms.plan_name || 'Legacy Plan', Number(ms.price || 0)]
        );
        await connection.query(
          `INSERT IGNORE INTO plan_versions (id, plan_id, version_number, name, plan_type, price, currency, duration_days, sessions_unlimited, status, published_at)
           VALUES (?, ?, 1, ?, 'individual', ?, ?, ?, 1, 'active', NOW())`,
          [planVersionId, fallbackPlanId, ms.plan_name || 'Legacy Plan', Number(ms.price || 0), ms.currency || 'USD', 30]
        );
        await connection.query(
          "INSERT IGNORE INTO migration_mappings (id, source_table, source_id, target_table, target_id, migration_batch) VALUES (?, 'subscription_plans', ?, 'plan_versions', ?, ?)",
          [createId('mm'), fallbackPlanId, planVersionId, BATCH_ID]
        );
      }
    }

    const subId = createId('sub');
    const smId = createId('sm');
    const affId = createId('aff');
    const startDate = ms.start_date ? String(ms.start_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const endDate = ms.end_date ? String(ms.end_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const status = String(ms.status || 'active').toLowerCase().trim();

    if (!DRY_RUN) {
      // Create subscription
      await connection.query(
        `INSERT INTO subscriptions (id, plan_id, plan_version_id, holder_member_id, status, start_date, end_date, auto_renew, price_paid, currency, payment_status, max_members, legacy_subscription_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'paid', 1, ?)`,
        [subId, ms.plan_id || 'plan_legacy', planVersionId, ms.member_id, status, startDate, endDate, Number(ms.price || 0), ms.currency || 'USD', ms.id]
      );

      // Create subscription_member (holder)
      await connection.query(
        "INSERT INTO subscription_members (id, subscription_id, member_id, role, status, joined_at) VALUES (?, ?, ?, 'holder', ?, ?)",
        [smId, subId, ms.member_id, status === 'active' ? 'active' : 'inactive', startDate]
      );

      // Create affiliation
      await connection.query(
        `INSERT INTO affiliations (id, member_id, subscription_id, subscription_member_id, plan_version_id, status, role, is_primary, start_date, end_date, consumption_priority)
         VALUES (?, ?, ?, ?, ?, ?, 'holder', 1, ?, ?, 0)`,
        [affId, ms.member_id, subId, smId, planVersionId, status, startDate, endDate]
      );

      // Record mappings
      await connection.query(
        "INSERT INTO migration_mappings (id, source_table, source_id, target_table, target_id, migration_batch) VALUES (?, 'member_subscriptions', ?, 'subscriptions', ?, ?)",
        [createId('mm'), ms.id, subId, BATCH_ID]
      );
      await connection.query(
        "INSERT INTO migration_mappings (id, source_table, source_id, target_table, target_id, migration_batch) VALUES (?, 'member_subscriptions', ?, 'affiliations', ?, ?)",
        [createId('mm'), ms.id, affId, BATCH_ID]
      );
    }

    subsCreated++;
    affiliationsCreated++;
    console.log(`  SUB: ${ms.member_id} (${ms.plan_name || 'unknown'}) → sub:${subId} aff:${affId}`);
  }

  // Summary
  const summary = {
    generatedAt: new Date().toISOString(),
    database: dbConfig.database,
    batchId: BATCH_ID,
    mode: DRY_RUN ? 'dry-run' : 'apply',
    source: { plans: plans.length, memberSubscriptions: memberSubs.length },
    proposed: {
      planVersionsCreated,
      planVersionsReused,
      subscriptions: subsCreated,
      affiliations: affiliationsCreated,
    },
    committed: !DRY_RUN,
  };
  if (!DRY_RUN) await connection.commit();
  const evidencePath = writeEvidence(summary);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Backfill complete${DRY_RUN ? ' (DRY RUN — no changes made)' : ''}`);
  console.log(`  Batch: ${BATCH_ID}`);
  console.log(`  Plan versions created: ${planVersionsCreated}`);
  console.log(`  Plan versions reused: ${planVersionsReused}`);
  console.log(`  Subscriptions created: ${subsCreated}`);
  console.log(`  Affiliations created: ${affiliationsCreated}`);
  console.log(`  Source plans: ${plans.length}`);
  console.log(`  Source member_subscriptions: ${memberSubs.length}`);
  console.log(`${'='.repeat(60)}`);
  if (evidencePath) console.log(`  Evidence: ${evidencePath}`);

  } catch (error) {
    if (!DRY_RUN) await connection.rollback();
    throw error;
  }

  await connection.end();
}

main().catch((error) => {
  console.error('Backfill failed:', error.message);
  process.exit(1);
});
