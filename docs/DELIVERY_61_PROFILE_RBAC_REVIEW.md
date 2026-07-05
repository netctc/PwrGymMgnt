# Delivery 61 - Profile RBAC Review

## Objective

Review the application access model and implement the correct rights for these operational profiles: admin, manager, warehouse-manager, accounting, trainer, reception, and cashier. Reception and cashier must have the same rights.

## Implemented changes

- Reworked `server/rbac.ts` into grouped permission roles for membership, scheduling, finance, HR, warehouse, platform, support, and reports.
- Added robust role normalization so `warehouse-manager` resolves to the canonical `warehouse_manager` role.
- Mirrored the backend permission map in `src/lib/permissions.ts`, including `hr.write` for legacy staff-screen alignment.
- Updated authentication role handling in `server.ts` and `src/contexts/AuthContext.tsx` so normalized roles are used consistently in sessions, profiles, and login redirects.
- Updated frontend protected routes/navigation to rely on permission names and patched remaining hardcoded checks in dashboard, classes, private classes, warehouse, and legacy staff screens.
- Restricted warehouse UI actions by permission: inventory writes, stock adjustments, suppliers/POs, POS, and warehouse reports are now independently controlled.
- Updated report section and screen-report role lists so cashier matches reception and admin-only security/platform sections remain restricted.
- Updated default configurable staff role lists to include cashier, warehouse manager, HR, and support.
- Added/updated tests for backend RBAC grants, frontend permission parity, role alias normalization, and report access.

## Verification

Attempted:

```bash
npx tsc --noEmit --pretty false
```

Result: blocked in this sandbox because dependencies are not installed. The compiler output starts with missing package/type declarations for `express`, `react`, `firebase`, Node typings, and related dependencies. Run `npm ci` then `npm run test:ci` and `npm run verify:ci` in the normal development environment.

## Files changed

- `server/rbac.ts`
- `server.ts`
- `server/compatRecordsRoutes.ts`
- `server/engagement.ts`
- `server/reports.ts`
- `server/warehouse.ts`
- `src/lib/permissions.ts`
- `src/App.tsx`
- `src/components/Layout.tsx`
- `src/contexts/AuthContext.tsx`
- `src/contexts/SettingsContext.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/Classes.tsx`
- `src/pages/PrivateClasses.tsx`
- `src/pages/Warehouse.tsx`
- `src/pages/Settings.tsx`
- `src/pages/Staff.tsx`
- `tests/rbac.test.ts`
- `tests/phase2Authorization.test.ts`
- `tests/reports.test.ts`
- `docs/PROFILE_ACCESS_MATRIX.md`
- `docs/ROUTE_PERMISSION_MATRIX.md`
