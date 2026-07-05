# Delivery 53A - Phase 5 Migration Hotfix

## Summary

This hotfix addresses a database migration failure detected during real environment validation of Phase 5.

The failure occurred because `sql/019_phase5_performance_indexes.sql` attempted to create `idx_shifts_time_user (start_time, end_time, user_id)` when the target deployment still had the legacy JSON-only `shifts` compatibility table. That table does not include the typed `start_time`, `end_time`, or `user_id` columns.

## Root cause

The Phase 5 migration originally checked whether each target table and index existed, but it did not verify whether every indexed column existed. That was safe for normalized tables, but not safe for compatibility tables whose physical schema can differ between deployments.

## Implemented fix

1. Updated `sql/019_phase5_performance_indexes.sql` so every index creation is guarded by:
   - target table existence,
   - required column existence,
   - target index absence.
2. Updated `scripts/performance-index-audit.mjs` so skipped indexes are reported separately from actionable missing indexes.
3. Updated Phase 5 tests to verify column-aware migration guards and skipped-index audit behavior.
4. Updated Phase 5 documentation with expected behavior for JSON-only legacy compatibility tables.

## Expected validation result

Run:

```bash
npm run db:migrate
npm run db:perf-audit
npm run test:ci
npm run lint
npm run build
```

Expected outcome:

- Migration completes successfully.
- Finance index should be created if `finance_transactions` has the required typed columns.
- Shift index may be reported as skipped if `shifts` is still JSON-only.
- Skipped indexes should not make `db:perf-audit` exit with failure.

## Follow-up

The typed Staff/Shifts migration should introduce structured shift columns or a dedicated typed shifts table. At that point, the `idx_shifts_time_user` index will become actionable and should be present after migration.
