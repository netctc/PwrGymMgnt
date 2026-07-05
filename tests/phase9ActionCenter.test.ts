import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { actionCenterResponseSchema, dashboardApiContracts } from "../shared/apiContracts";
import { PERFORMANCE_CACHEABLE_PREFIXES, isCacheableApiPath } from "../server/performance";

const validActionCenterPayload = {
  summary: { total: 2, critical: 1, warning: 1, info: 0 },
  items: [
    {
      id: "warehouse.low_stock",
      module: "warehouse",
      severity: "critical",
      title: "2 low-stock products",
      description: "Restock products that are at or below their configured minimum stock level.",
      actionLabel: "Open warehouse",
      actionUrl: "/warehouse?tab=products&filter=low-stock",
      source: "warehouse_products.stock_quantity",
      metric: 2,
    },
    {
      id: "membership.expiring_7d",
      module: "membership",
      severity: "warning",
      title: "3 memberships expiring within 7 days",
      description: "Trigger renewal reminders before subscriptions expire.",
      actionLabel: "Review renewals",
      actionUrl: "/members?filter=expiring",
      source: "members.expiry",
      metric: 3,
    },
  ],
  generatedAt: new Date().toISOString(),
};

test("Phase 9 action center contract validates operational recommendations", () => {
  const parsed = actionCenterResponseSchema.parse(validActionCenterPayload);
  assert.equal(parsed.summary.total, 2);
  assert.equal(parsed.items[0].severity, "critical");
  assert.throws(
    () => actionCenterResponseSchema.parse({ ...validActionCenterPayload, items: [{ ...validActionCenterPayload.items[0], severity: "urgent" }] }),
    /Invalid option/,
  );
});

test("Phase 9 dashboard action center endpoint is registered and permissioned", () => {
  const dashboardServer = fs.readFileSync(path.join(process.cwd(), "server/dashboard.ts"), "utf8");
  const routePermissions = fs.readFileSync(path.join(process.cwd(), "server/routePermissions.ts"), "utf8");

  assert.equal(dashboardApiContracts.actionCenter.path, "/api/dashboard/action-center");
  assert.match(dashboardServer, /app\.get\("\/api\/dashboard\/action-center", requirePermission\("dashboard\.read"\)/);
  assert.match(routePermissions, /\/api\/dashboard\/action-center/);
  assert.match(routePermissions, /dashboard\.read/);
});

test("Phase 9 action center is role-aware and module-aware", () => {
  const dashboardServer = fs.readFileSync(path.join(process.cwd(), "server/dashboard.ts"), "utf8");

  for (const permission of ["membership.read", "scheduling.read", "hr.read", "finance.read", "warehouse.read", "support.read"]) {
    assert.match(dashboardServer, new RegExp(`hasPermission\\(req, \"${permission.replace(".", "\\.")}\"\\)`));
  }
  for (const source of [
    "warehouse_products.stock_quantity",
    "warehouse_purchase_orders.expected_date",
    "support_tickets.priority",
    "finance_transactions.status",
    "members.expiry",
  ]) {
    assert.match(dashboardServer, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Phase 9 action center is exposed through typed frontend API and dashboard UI", () => {
  const dashboardApi = fs.readFileSync(path.join(process.cwd(), "src/lib/dashboardApi.ts"), "utf8");
  const dashboardPage = fs.readFileSync(path.join(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");

  assert.match(dashboardApi, /getActionCenter/);
  assert.match(dashboardApi, /actionCenterResponseSchema/);
  assert.match(dashboardPage, /Smart Action Center/);
  assert.match(dashboardPage, /dashboardApi\.getActionCenter\(\)/);
  assert.match(dashboardPage, /actionCenter\.items\.slice\(0, 6\)/);
});

test("Phase 9 action center participates in safe GET caching", () => {
  assert.ok(PERFORMANCE_CACHEABLE_PREFIXES.includes("/api/dashboard/action-center"));
  assert.equal(isCacheableApiPath("/api/dashboard/action-center"), true);
});
