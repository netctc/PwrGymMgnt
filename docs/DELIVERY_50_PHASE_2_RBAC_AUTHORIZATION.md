# Delivery 50 - Phase 2 RBAC and Authorization Completeness

## Objective

Continue the implementation roadmap by tightening backend authorization and aligning frontend navigation with permission names instead of scattered hardcoded role lists.

## Implemented changes

### Backend RBAC foundation

- Added `APP_ROLES`, `isAppRole`, and `normalizeAppRole` in `server/rbac.ts`.
- Hardened JWT authentication in `server.ts` so signed sessions with unknown or malformed roles are rejected before route handlers execute.
- Added `dashboard.read`, `support.self`, and `reports.read` permissions to support frontend route visibility and report access planning.
- Added `getAllowedRoles` for tests and permission tooling.

### Backend route guard tightening

- Membership routes now have a `membership.read` baseline guard, with existing write/e-card/access guards retained.
- Scheduling routes now have a `scheduling.read` baseline guard, with existing write guards retained.
- HR routes retain `hr.read` and now explicitly require `hr.write` for employee, attendance and payroll-run writes.
- Finance routes retain `finance.read` and now explicitly require `finance.write` for transaction, loan, rental, budget and recurring-processing writes.
- Finance payroll posting now requires `payroll.approve`.

### Route permission inventory

- Added `server/routePermissions.ts` as a machine-readable route-permission matrix.
- Added `docs/ROUTE_PERMISSION_MATRIX.md` for reviewer/developer visibility.

### Frontend permission alignment

- Added `src/lib/permissions.ts` with frontend permission names mapped to roles.
- Updated `src/components/Layout.tsx` to render navigation by permission.
- Updated `src/App.tsx` protected routes to support `requiredPermission` and use permission checks for sensitive pages.

### Tests and verification

- Added `tests/phase2Authorization.test.ts`.
- Updated `package.json` test scripts to include the Phase 2 authorization tests.
- Added static verification evidence in `docs/verification/phase2_static_authorization_check.log`.

## Files changed

- `server/rbac.ts`
- `server.ts`
- `server/finance.ts`
- `server/hrPayroll.ts`
- `server/scheduling.ts`
- `server/membership.ts`
- `server/routePermissions.ts`
- `src/lib/permissions.ts`
- `src/components/Layout.tsx`
- `src/App.tsx`
- `tests/phase2Authorization.test.ts`
- `package.json`
- `docs/ROUTE_PERMISSION_MATRIX.md`

## Verification results

- Static authorization check: passed.
- `npm run test:ci`: blocked in this sandbox because dependencies are not installed and `tsx` is unavailable.
- `tsc --noEmit`: blocked by missing `node_modules` dependencies. The first failures are missing package/type declarations, not Phase 2-specific TypeScript errors.

## Deployment notes

1. Run `npm ci` in the normal development/CI environment.
2. Run `npm run test:ci`.
3. Run `npm run verify:ci`.
4. Test login with representative roles: `super_admin`, `admin`, `manager`, `accounting`, `hr`, `reception`, `trainer`, `warehouse_manager`, `cashier`, `client`.
5. Confirm sensitive endpoints return `403` for unauthorized roles before database-side work.

## Rollback notes

To rollback this phase, revert the files listed above. The changes are code-only and do not introduce database migrations.

## Known follow-ups

- Introduce owner/self-scope permissions for client-facing membership and scheduling use cases.
- Expand route matrix validation into CI after dependencies are available.
- Convert report-specific role checks to named permissions during the report-module refactor phase.
