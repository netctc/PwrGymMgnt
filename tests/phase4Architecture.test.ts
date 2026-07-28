import test from "node:test";
import assert from "node:assert/strict";
import {
  APPLICATION_ROUTE_MODULES,
  getApplicationModuleSummary,
} from "../server/modules";
import {
  RECORD_TABLE_PERMISSIONS,
  getRecordPermission,
  normalizeRecordTable,
} from "../server/compatRecordsRoutes";
import { PERMISSIONS } from "../server/rbac";

test("Phase 4 application route modules are uniquely registered", () => {
  const names = APPLICATION_ROUTE_MODULES.map((module) => module.name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(names, [
    "membership",
    "plan-management",
    "trainer-commissions",
    "scheduling",
    "hr-payroll",
    "finance",
    "platform-security",
    "production-readiness",
    "data-integrity",
    "backup-restore",
    "engagement",
    "warehouse-pos",
    "dashboard",
    "reports",
    "compatibility-records",
    "subscriptions-v2",
    "access-authorization",
    "biometric-profiles",
    "evolution-dashboard",
    "subscription-lifecycle",
    "member-portal",
  ]);
});

test("Phase 4 application module summary is documentation-safe", () => {
  const summary = getApplicationModuleSummary();
  assert.equal(summary.length, APPLICATION_ROUTE_MODULES.length);
  for (const module of summary) {
    assert.ok(module.name.length > 0);
    assert.ok(["domain", "platform", "compatibility", "reporting"].includes(module.area));
    assert.ok(module.description.length > 20);
    assert.equal("register" in module, false);
  }
});

test("Phase 4 compatibility records route permissions exist in RBAC", () => {
  for (const [table, actions] of Object.entries(RECORD_TABLE_PERMISSIONS)) {
    assert.ok(PERMISSIONS[actions.read], `${table} read permission should exist`);
    assert.ok(PERMISSIONS[actions.write], `${table} write permission should exist`);
    assert.equal(getRecordPermission(table, "read"), actions.read);
    assert.equal(getRecordPermission(table, "write"), actions.write);
  }
});

test("Phase 4 compatibility table normalization is explicit", () => {
  assert.equal(normalizeRecordTable("auditLogs"), "audit_logs");
  assert.equal(normalizeRecordTable("members"), "members");
  assert.throws(() => normalizeRecordTable("members; DROP TABLE users"), /Invalid table name/);
  assert.throws(() => getRecordPermission("not_allowed", "read"), /not allowed/);
});
