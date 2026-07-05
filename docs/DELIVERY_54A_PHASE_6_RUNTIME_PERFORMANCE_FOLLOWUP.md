# Delivery 54A - Phase 6 Runtime Performance Follow-up

## Context

Phase 6 observability was validated with local runtime logs. The logs confirmed that structured request logging and slow-response detection are working, and they exposed repeated slow GET requests across Warehouse, Finance, HR, Membership, Dashboard, and Engagement screens.

The most visible bottleneck was `/api/warehouse/categories`, repeatedly taking roughly 5-7 seconds. Finance summary/list endpoints and HR payroll endpoints also crossed the configured slow-response threshold.

## Root cause addressed

Several domain route modules still performed `CREATE TABLE IF NOT EXISTS` schema readiness work inside every request. This is safe functionally, but expensive against a remote MySQL database and particularly costly for modules with many tables, such as Warehouse.

## Implemented changes

1. Added per-process schema readiness caching for:
   - Finance: `ensureFinanceTablesNow()` guarded by `financeSchemaReady`.
   - HR/Payroll: `ensureHrTablesNow()` guarded by `hrSchemaReady`.
   - Warehouse: `ensureWarehouseTablesNow()` guarded by `warehouseSchemaReady`.

2. Expanded short-lived GET cache coverage for observed slow read endpoints:
   - `/api/warehouse/categories`
   - `/api/finance/transactions`
   - `/api/finance/loans`
   - `/api/finance/rentals`
   - `/api/finance/budgets`
   - `/api/hr/employees`
   - `/api/hr/payroll/runs`
   - `/api/engagement/notifications`

3. Added tests:
   - `tests/phase6aRuntimePerformance.test.ts`

## Expected impact

The first request after server startup may still perform schema readiness work. Subsequent requests in the same process should skip repeated DDL checks and should be materially faster. Read-only endpoints may also benefit from the existing 30-second API cache, which is already invalidated globally on mutating requests.

## Validation commands

Run locally:

```bash
npm run test:ci
npm run lint
npm run build
npm run dev
```

Then revisit the same screens. The repeated `/api/warehouse/categories`, `/api/finance/*`, and `/api/hr/*` GET requests should drop significantly after the first warm-up request.
