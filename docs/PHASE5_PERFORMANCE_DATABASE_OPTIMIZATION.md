# Phase 5 - Performance and Database Access Optimization

## Objective

Phase 5 starts the performance improvement track from the technical review. The work focuses on low-risk platform improvements that improve observability and read-path efficiency before deeper query rewrites.

## Implemented changes

### 1. API response timing

`server/performance.ts` adds an API performance middleware that measures `/api` response time, sets `X-Response-Time-Ms`, and logs slow responses using `SLOW_RESPONSE_LOG_MS`.

### 2. Slow query instrumentation

The same module adds `timedQuery`, SQL compaction and stable SQL fingerprints. Dashboard table-existence and row-select queries now use this helper so slow query logs identify expensive dashboard reads without exposing full parameter data.

### 3. Dashboard metadata caching

Dashboard table-existence checks are cached using `TABLE_EXISTS_CACHE_TTL_MS`. This removes repeated `information_schema.TABLES` checks during high-frequency dashboard refreshes.

### 4. Expanded safe API cache coverage

The API cache prefix list now includes typed dashboard endpoints:

- `/api/dashboard/summary`
- `/api/dashboard/trainer-utilization`

The deprecated `/api/records/*` compatibility API remains excluded from caching.

### 5. Performance indexes

A new idempotent migration was added:

- `sql/019_phase5_performance_indexes.sql`

It adds indexes for high-volume filters used by dashboard, membership, scheduling, staffing, and finance reads.

### 6. Index audit command

A new command verifies whether the Phase 5 indexes are present:

```bash
npm run db:perf-audit
```

## Runtime configuration

The following environment values were added to `.env.example`:

```env
API_CACHE_TTL_MS=30000
DASHBOARD_API_MAX_ROWS=5000
TABLE_EXISTS_CACHE_TTL_MS=60000
SLOW_QUERY_LOG_MS=750
SLOW_RESPONSE_LOG_MS=1500
```

## Recommended production rollout

1. Deploy the code with conservative logging thresholds.
2. Run `npm run db:migrate` to apply the new indexes.
3. Run `npm run db:perf-audit` after migration.
4. Watch slow response and slow query logs for 24 to 72 hours.
5. Use the observed SQL hashes to prioritize deeper endpoint-level query rewrites.

## Follow-up work

Phase 6 should build on these signals by improving audit logging and monitoring dashboards. Further performance refactors should replace broad dashboard row loads with SQL aggregate queries once production row counts and slow query telemetry confirm the highest-value paths.

## Phase 5 migration hotfix note

A validation run on a real development database showed that some deployments have a legacy JSON-only `shifts` compatibility table with `id`, `data`, `created_at`, and `updated_at`, but without typed `start_time`, `end_time`, and `user_id` columns. The Phase 5 migration has therefore been hardened to verify both table existence and required column existence before attempting each `ALTER TABLE ... ADD INDEX` statement.

Expected behavior after the hotfix:

- `npm run db:migrate` should no longer fail on JSON-only legacy compatibility tables.
- `npm run db:perf-audit` reports indexes as `present`, `missing`, or skipped due to missing tables/columns.
- Skipped indexes do not fail the audit, because they are not actionable until the corresponding typed schema exists.
- The `shifts` performance index should become actionable during the typed Staff/Shifts migration, when structured shift columns are introduced.
