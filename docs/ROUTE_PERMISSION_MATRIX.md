# Route Permission Matrix - Phase 2

This matrix documents the backend authorization policy introduced or tightened in Phase 2. Authentication is still enforced globally for `/api/*` routes except public health/auth/setup endpoints.

## Global rules

| Area | Rule |
|---|---|
| Session role validation | JWT roles are normalized with `normalizeAppRole`; unknown roles are rejected with `403 Session role is invalid`. |
| Permission source | Backend permissions are centralized in `server/rbac.ts`. |
| Route inventory | Machine-readable route matrix is available in `server/routePermissions.ts`. |
| Frontend visibility | Main navigation and protected routes use `src/lib/permissions.ts`, mirroring backend permission names where applicable. |

## Module-level baseline guards

| Module | Baseline permission | Notes |
|---|---|---|
| Membership | `membership.read` | Sensitive membership routes are protected before database access. Write routes continue to require `membership.write`, `membership.ecard.generate`, or `membership.access.validate`. |
| Scheduling | `scheduling.read` | All scheduling reads require read permission; mutations require `scheduling.write`. |
| HR & Payroll | `hr.read` | Employee, attendance and payroll creation/update now require `hr.write`; payroll approval/payment requires `payroll.approve`. |
| Finance | `finance.read` | Transaction, loan, rental, budget and recurring-processing writes now require `finance.write`; payroll posting requires `payroll.approve`. |
| Warehouse/POS | `warehouse.read` | Existing fine-grained guards remain for write, purchase, POS and warehouse reports. |
| Platform/Security | Platform permissions | Existing platform guards remain for audit, security, data integrity and restore flows. |
| Compatibility records | `records.*` permissions | Production opt-in and pagination from Phase 1 remain active. |

## Phase 2 changed routes

| Method | Route family | Permission applied |
|---|---|---|
| ALL | `/api/membership/*` | `membership.read` baseline |
| ALL | `/api/scheduling/*` | `scheduling.read` baseline |
| POST/PUT/DELETE | `/api/scheduling/classes*`, bookings, private classes | `scheduling.write` |
| ALL | `/api/hr/*` | `hr.read` baseline |
| POST/PUT | `/api/hr/employees*` | `hr.write` |
| POST | `/api/hr/attendance` | `hr.write` |
| POST | `/api/hr/payroll/runs` | `hr.write` |
| POST | `/api/hr/payroll/runs/:id/approve`, `/mark-paid` | `payroll.approve` |
| ALL | `/api/finance/*` | `finance.read` baseline |
| POST/PUT/DELETE | `/api/finance/transactions*` | `finance.write` |
| POST/PUT | `/api/finance/loans*`, `/rentals*`, `/budgets` | `finance.write` |
| POST | `/api/finance/payroll-runs/:id/post` | `payroll.approve` |
| POST | `/api/finance/recurring/process` | `finance.write` |

## Frontend route permissions

| Page | Permission |
|---|---|
| Dashboard | `dashboard.read` |
| Members / Plans | `membership.read` |
| Classes / Private PT | `scheduling.read` |
| QR Access | `membership.access.validate` |
| HR & Payroll | `hr.read` |
| Accounting | `finance.read` |
| Warehouse | `warehouse.read` |
| POS | `warehouse.pos` |
| Suppliers | `warehouse.purchase` |
| Warehouse Reports | `warehouse.reports` |
| Settings | `platform.audit.read` |
| Support | `support.self` |
| Reports | `reports.read` |

## Remaining Phase 2 follow-ups

- Add role-aware self-service policies for client/member portal use cases before exposing membership or scheduling data to clients.
- Convert report section access into explicit permission names once report module refactoring begins.
- Add integration tests with a configured database in CI to verify `403` happens before database queries on each guarded route.

## Profile access review update

This review added the explicit operational matrix in `docs/PROFILE_ACCESS_MATRIX.md` and aligned backend/client permissions for the requested profiles: `admin`, `manager`, `warehouse_manager`, `accounting`, `trainer`, `reception`, and `cashier`.

Key updates:

- `cashier` now has the same application rights as `reception`.
- `warehouse-manager` is accepted as an alias and normalized to `warehouse_manager`.
- Frontend route guards, navigation visibility, class scheduling controls, dashboard access, warehouse tabs/actions, reporting access, and legacy staff-screen checks now use the centralized permission helpers.
- Platform/security/settings remain admin-only, while backup restore remains super-admin-only.

## User maintenance and configurable RBAC update

| Method | Route family | Permission applied |
|---|---|---|
| GET | `/api/settings/roles` | `user_maintenance.read` |
| GET | `/api/settings/users` | `user_maintenance.read` |
| GET | `/api/settings/user-link-employees` | `user_maintenance.read` |
| POST | `/api/settings/users` | `user_maintenance.write` |
| PUT | `/api/settings/users/:id` | `user_maintenance.write` |
| DELETE | `/api/settings/users/:id` | `user_maintenance.write` |
| GET | `/api/settings/role-permissions` | `role_permissions.read` |
| PUT | `/api/settings/role-permissions/:role/:permission` | `role_permissions.write` |

`server/rbac.ts` now supports persisted runtime permission overrides through `role_permission_overrides`. Default permissions remain the source of truth until an override is added; resetting an override returns the role/permission pair to the default RBAC matrix.
