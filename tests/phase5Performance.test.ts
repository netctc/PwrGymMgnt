import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PERFORMANCE_CACHEABLE_PREFIXES,
  compactSql,
  isCacheableApiPath,
  stableSqlHash,
} from "../server/performance";

test("Phase 5 performance cache prefixes include typed dashboard APIs", () => {
  assert.ok(PERFORMANCE_CACHEABLE_PREFIXES.includes("/api/dashboard/summary"));
  assert.ok(PERFORMANCE_CACHEABLE_PREFIXES.includes("/api/dashboard/trainer-utilization"));
  assert.equal(isCacheableApiPath("/api/dashboard/summary"), true);
  assert.equal(isCacheableApiPath("/api/dashboard/trainer-utilization?days=30"), true);
  assert.equal(isCacheableApiPath("/api/records/members"), false);
});

test("Phase 5 SQL fingerprints are stable and compact", () => {
  const sql = `SELECT *\nFROM members\nWHERE status = ?\nORDER BY created_at DESC`;
  assert.equal(compactSql(sql), "SELECT * FROM members WHERE status = ? ORDER BY created_at DESC");
  assert.equal(stableSqlHash(sql), stableSqlHash("SELECT * FROM members WHERE status = ? ORDER BY created_at DESC"));
});

test("Phase 5 performance migration contains expected dashboard indexes", () => {
  const migration = fs.readFileSync(path.join(process.cwd(), "sql", "019_phase5_performance_indexes.sql"), "utf8");
  for (const indexName of [
    "idx_users_role_created",
    "idx_members_status_created",
    "idx_member_subscriptions_status_end_member",
    "idx_class_sessions_time_status_trainer",
    "idx_private_sessions_time_status_trainer",
    "idx_shifts_time_user",
    "idx_finance_tx_date_status_type",
  ]) {
    assert.match(migration, new RegExp(indexName));
  }
  assert.match(migration, /INFORMATION_SCHEMA\.COLUMNS/);
  assert.match(migration, /COLUMN_NAME = 'start_time'/);
  assert.match(migration, /JSON-only legacy compatibility table/);
});

test("Phase 5 package scripts expose performance index audit", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  assert.equal(pkg.scripts["db:perf-audit"], "node scripts/performance-index-audit.mjs");
  assert.match(pkg.scripts.test, /tests\/phase5Performance\.test\.ts/);
  assert.match(pkg.scripts["test:ci"], /tests\/phase5Performance\.test\.ts/);
});

test("Phase 5 performance audit distinguishes skipped indexes from actionable missing indexes", () => {
  const auditScript = fs.readFileSync(path.join(process.cwd(), "scripts", "performance-index-audit.mjs"), "utf8");
  assert.match(auditScript, /skipped_missing_columns/);
  assert.match(auditScript, /missingColumns/);
  assert.match(auditScript, /status === 'missing'/);
  assert.match(auditScript, /columns: \['start_time', 'end_time', 'user_id'\]/);
});
