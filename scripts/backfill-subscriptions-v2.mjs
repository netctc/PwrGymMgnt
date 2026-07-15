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
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getDatabaseEnv, getMissingDatabaseEnv } from './db-env.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_ID = `backfill_${new Date().toISOString().slice(0, 10)}_${crypto.randomUUID().slice(0, 8)}`;

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
  });

  console.log(`Connected to ${dbConfig.database}. Batch: ${BATCH_ID}. Dry run: ${DRY_RUN}`);

  // Step 1: Ensure plan_versions exist for each subscription_plan
  const [plans] = await connection.query('SELECT * FROM subscription_plans');
  let planVersionsCreated = 0;

  for (const plan of plans) {
    // Check if already migrated
    const [existing] = await connection.query(
      "SELECT target_id FROM migration_mappings WHERE source_table = 'subscription_plans' AND source_id = ? AND target_table = 'plan_versions' LIMIT 1",
      [plan.id]
    );
    if (existing.length > 0) continue;

    const pvId = createId('pv');
    if (!DRY_RUN) {
      await connection.query(
        `INSERT INTO plan_versions (id, plan_id, version_number, name, description, plan_type, price, currency, duration_days, auto_renew, max_members, sessions_unlimited, sessions_per_cycle, cycle_frequency, distribution_model, status, published_at)
         VALUES (?, ?, 1, ?, ?, 'individual', ?, ?, ?, 0, 1, 1, NULL, 'monthly', 'individual', 'active', NOW())`,
        [pvId, plan.id, plan.name, plan.description || null, Number(plan.price || 0), plan.currency || 'USD', Number(plan.duration_days || 30)]
      );
      await connection.query(
        "INSERT INTO migration_mappings (id, source_table, source_id, target_table, target_id, migration_batch) VALUES (?, 'subscription_plans', ?, 'plan_versions', ?, ?)",
        [createId('mm'), plan.id, pvId, BATCH_ID]
      );
    }
    planVersionsCreated++;
    console.log(`  PLAN VERSION: ${plan.name} → ${pvId}`);
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
        // Need a plan_id — use the ms.plan_id or create a reference
        const fallbackPlanId = ms.plan_id || 'plan_legacy';
        await connection.query(
          `INSERT IGNORE INTO plan_versions (id, plan_id, version_number, name, plan_type, price, currency, duration_days, sessions_unlimited, status, published_at)
           VALUES (?, ?, 1, ?, 'individual', ?, ?, ?, 1, 'active', NOW())`,
          [planVersionId, fallbackPlanId, ms.plan_name || 'Legacy Plan', Number(ms.price || 0), ms.currency || 'USD', 30]
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
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Backfill complete${DRY_RUN ? ' (DRY RUN — no changes made)' : ''}`);
  console.log(`  Batch: ${BATCH_ID}`);
  console.log(`  Plan versions created: ${planVersionsCreated}`);
  console.log(`  Subscriptions created: ${subsCreated}`);
  console.log(`  Affiliations created: ${affiliationsCreated}`);
  console.log(`  Source plans: ${plans.length}`);
  console.log(`  Source member_subscriptions: ${memberSubs.length}`);
  console.log(`${'='.repeat(60)}`);

  await connection.end();
}

main().catch((error) => {
  console.error('Backfill failed:', error.message);
  process.exit(1);
});
