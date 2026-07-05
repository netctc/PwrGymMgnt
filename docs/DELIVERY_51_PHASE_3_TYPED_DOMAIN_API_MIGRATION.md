# Delivery 51 - Phase 3 Typed Domain API Migration

## Objective

Start replacing generic Firestore-style compatibility reads with typed, permission-scoped domain APIs. This delivery targets the production Dashboard and Trainer Utilization chart first because they previously pulled broad `users`, `shifts`, `classes`, `private_classes` and `hr_profiles` collections through compatibility helpers.

## Implemented changes

### Shared API contracts

- Added `shared/apiContracts.ts`.
- Added Zod response contracts for:
  - `GET /api/dashboard/summary`
  - `GET /api/dashboard/trainer-utilization`
- Added exported TypeScript DTO types for dashboard and trainer utilization payloads.

### Typed client helper

- Added `src/lib/typedApi.ts`.
- Added runtime response validation for typed API clients.
- Added `src/lib/dashboardApi.ts` as the first contract-backed domain client.

### Backend typed dashboard API

- Added `server/dashboard.ts`.
- Registered the typed dashboard module in `server.ts`.
- Added permission guards using `dashboard.read`.
- Added bounded aggregate reads with `DASHBOARD_API_MAX_ROWS` fallback protection.
- Added compatibility-aware data loading to support both legacy tables and newer typed tables during migration.

### Frontend migration

- Updated `src/pages/Dashboard.tsx` to use `dashboardApi.getSummary()`.
- Updated `src/components/TrainerUtilizationChart.tsx` to use `dashboardApi.getTrainerUtilization()`.
- Removed direct Firestore compatibility collection reads from these production dashboard surfaces.

### Permission matrix and tests

- Updated `server/routePermissions.ts` and `docs/ROUTE_PERMISSION_MATRIX.md` with the new dashboard endpoints.
- Added `tests/phase3TypedDashboard.test.ts` for contract validation and route matrix coverage.
- Updated `package.json` test scripts to include the Phase 3 test.

## Acceptance criteria status

| Criterion | Status |
|---|---|
| Shared request/response contracts exist for first migrated domain | Done |
| Dashboard no longer uses Firestore compatibility reads | Done |
| Trainer utilization chart no longer uses Firestore compatibility reads | Done |
| Backend endpoints are permission scoped | Done |
| Route matrix documents new typed endpoints | Done |
| Runtime validation protects client from malformed API payloads | Done |

## Risk and rollback

Risk is moderate because KPI calculations were moved from client-side collection reads to backend aggregates. Rollback is straightforward: restore the previous `Dashboard.tsx` and `TrainerUtilizationChart.tsx` implementations or temporarily use the Phase 2 ZIP while the typed endpoint is corrected.

## Next Phase 3 follow-ups

- Migrate Staff Management helper code away from `users` and `shifts` compatibility access.
- Migrate Settings reads/writes from generic records to typed settings endpoints.
- Add explicit pagination/query contracts to remaining list endpoints.
- Extend OpenAPI generation in Phase 10 using the shared contract registry.
