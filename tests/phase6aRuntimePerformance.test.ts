import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PERFORMANCE_CACHEABLE_PREFIXES, isCacheableApiPath, normalizeApiCacheUrl, normalizeApiPath } from "../server/performance";

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Phase 6A caches schema readiness checks for slow runtime modules", () => {
  const finance = readSource("server/finance.ts");
  const hr = readSource("server/hrPayroll.ts");
  const warehouse = readSource("server/warehouse.ts");

  assert.match(finance, /async function ensureFinanceTablesNow\(pool: Pool\)/);
  assert.match(finance, /let financeSchemaReady: Promise<void> \| null = null/);
  assert.match(finance, /financeSchemaReady = ensureFinanceTablesNow\(pool\)\.catch/);

  assert.match(hr, /async function ensureHrTablesNow\(pool: Pool\)/);
  assert.match(hr, /let hrSchemaReady: Promise<void> \| null = null/);
  assert.match(hr, /hrSchemaReady = ensureHrTablesNow\(pool\)\.catch/);

  assert.match(warehouse, /async function ensureWarehouseTablesNow\(db: Db\)/);
  assert.match(warehouse, /let warehouseSchemaReady: Promise<void> \| null = null/);
  assert.match(warehouse, /warehouseSchemaReady = ensureWarehouseTablesNow\(db\)\.catch/);
});

test("Phase 6A cache coverage includes observed slow GET endpoints", () => {
  for (const prefix of [
    "/api/warehouse/categories",
    "/api/finance/transactions",
    "/api/finance/loans",
    "/api/finance/rentals",
    "/api/finance/budgets",
    "/api/hr/employees",
    "/api/hr/payroll/runs",
    "/api/engagement/notifications",
    "/api/warehouse/products",
    "/api/warehouse/suppliers",
    "/api/warehouse/purchase-orders",
    "/api/warehouse/pos/sales",
    "/api/warehouse/summary",
    "/api/scheduling/private-classes",
  ]) {
    assert.ok(PERFORMANCE_CACHEABLE_PREFIXES.includes(prefix));
    assert.equal(isCacheableApiPath(`${prefix}?example=1`), true);
  }
});

test("Phase 6B cache path normalization works when middleware is mounted under /api", () => {
  assert.equal(normalizeApiPath("/warehouse/categories"), "/api/warehouse/categories");
  assert.equal(normalizeApiPath("/api/warehouse/categories?limit=500"), "/api/warehouse/categories");
  assert.equal(normalizeApiCacheUrl("/warehouse/products?limit=500"), "/api/warehouse/products?limit=500");
  assert.equal(isCacheableApiPath("/warehouse/products?limit=500"), true);
  assert.equal(isCacheableApiPath("/warehouse/pos/sales?limit=250"), true);
});

test("Phase 6B adds warehouse first-load database indexes to migration and audit", () => {
  const migration = readSource("sql/020_phase6b_warehouse_runtime_performance_indexes.sql");
  const auditScript = readSource("scripts/performance-index-audit.mjs");
  for (const indexName of [
    "idx_wh_products_status_updated_name",
    "idx_wh_products_status_category_updated",
    "idx_wh_suppliers_status_name",
    "idx_wh_po_status_created",
    "idx_wh_po_supplier_created",
    "idx_wh_sales_status_date",
    "idx_wh_sales_payment_date",
  ]) {
    assert.match(migration, new RegExp(indexName));
    assert.match(auditScript, new RegExp(indexName));
  }
  assert.match(migration, /INFORMATION_SCHEMA\.COLUMNS/);
  assert.match(migration, /warehouse_pos_sales/);
});

test("Phase 6B audit logging retries transient lost MySQL connections", () => {
  const platformSecurity = readSource("server/platformSecurity.ts");
  assert.match(platformSecurity, /PROTOCOL_CONNECTION_LOST/);
  assert.match(platformSecurity, /schemaReady = null/);
  assert.match(platformSecurity, /insertAuditEvent/);
});
