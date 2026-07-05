# Delivery 54B - Phase 6 Cache and Warehouse Performance Hotfix

## Objective

Address runtime feedback from Phase 6A validation where structured logging confirmed improved repeated-request latency for several modules, but still showed `cacheHit:false` for every request and very slow first-load Warehouse/POS endpoints.

## Findings from runtime logs

The application started successfully and structured JSON logging worked. The logs exposed:

- Repeated `cacheHit:false` on all cached GET candidates.
- Slow first-load Warehouse/POS endpoints, especially:
  - `/api/warehouse/products?limit=500`
  - `/api/warehouse/pos/sales?limit=250`
  - `/api/warehouse/purchase-orders?limit=250`
  - `/api/warehouse/suppliers?limit=500`
  - `/api/warehouse/categories`
- A transient `PROTOCOL_CONNECTION_LOST` error during asynchronous advanced audit logging after very long requests.

## Root cause

The API cache middleware is mounted at `/api`. Inside mounted Express middleware, `req.path` is stripped to values such as `/warehouse/categories`, while cacheable prefixes were registered as `/api/warehouse/categories`. This prevented cache hits.

The fix uses `req.originalUrl` normalization so mounted and non-mounted paths resolve consistently to `/api/...` before cache-prefix checks.

## Implemented changes

### 1. Safe mounted-path cache normalization

Updated `server/performance.ts`:

- Added `normalizeApiPath()`.
- Added `normalizeApiCacheUrl()`.
- Updated `isCacheableApiPath()` to normalize mounted middleware paths and query-string URLs.

Updated `server/platformSecurity.ts`:

- Cache checks now use normalized original API paths.
- Cache keys include role and actor identity to avoid cross-user response leakage.

### 2. Expanded observed slow endpoint cache coverage

Added cache coverage for:

- `/api/warehouse/products`
- `/api/warehouse/suppliers`
- `/api/warehouse/purchase-orders`
- `/api/warehouse/pos/sales`
- `/api/warehouse/summary`
- `/api/scheduling/private-classes`

Existing cache coverage for finance, HR, membership, scheduling, dashboard, warehouse categories and notifications remains in place.

### 3. Warehouse/POS read indexes

Added migration:

- `sql/020_phase6b_warehouse_runtime_performance_indexes.sql`

New idempotent, column-aware indexes:

- `idx_wh_products_status_updated_name`
- `idx_wh_products_status_category_updated`
- `idx_wh_suppliers_status_name`
- `idx_wh_po_status_created`
- `idx_wh_po_supplier_created`
- `idx_wh_sales_status_date`
- `idx_wh_sales_payment_date`

Updated `scripts/performance-index-audit.mjs` so the performance audit tracks the new warehouse indexes.

### 4. Resilient advanced audit logging

Updated `createApiAuditMiddleware()` to retry once after transient MySQL connection-loss errors and reset the cached schema readiness promise when the connection is lost.

### 5. Tests

Updated `tests/phase6aRuntimePerformance.test.ts` with Phase 6B coverage for:

- mounted `/api` path normalization,
- observed slow Warehouse/POS cache prefixes,
- new warehouse performance indexes,
- transient audit logging retry logic.

## Validation steps

Run locally after applying this package:

```bash
npm run db:migrate
npm run db:perf-audit
npm run test:ci
npm run lint
npm run build
npm run dev
```

Then revisit the Warehouse, POS, Finance and Scheduling screens. Expected behavior:

- second repeated GET requests should return `cacheHit:true` in structured logs while cache entries are fresh,
- first-load Warehouse/POS screens should improve after migration `020` creates indexes,
- transient audit connection loss should retry once instead of leaving schema readiness in a failed state.

## Notes

The cache TTL remains controlled by `API_CACHE_TTL_MS` and mutating API requests clear the in-memory cache. This is still an in-process cache and should be replaced by Redis or another shared cache if the app is horizontally scaled.
