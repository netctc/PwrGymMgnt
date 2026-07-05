# Delivery 62 - User Management & Access Control

## Objective

Enhance PowerGym with a Settings sub-section for user maintenance, secure credential storage, audited account administration, and a configurable RBAC extension layer.

## Implemented changes

### Settings > User Maintenance

Added a new `User Maintenance` tab in `src/pages/Settings.tsx` with:

- Add user account form with mandatory name, email, username, password, assigned role, and status.
- Edit user details, role, status, and optional password reset.
- Delete user action for suspended/inactive accounts only; active accounts must be suspended/deactivated first.
- Role assignment dropdown using the requested predefined operational roles:
  - Admin
  - Manager
  - Warehouse Manager
  - Accounting
  - Cashier
  - Reception
  - Trainer
- Account table with search, status filter, last-login visibility, and protected super-admin rows.

### Backend user maintenance API

Added `server/userManagement.ts` and registered it in `server/modules.ts`.

New protected endpoints:

- `GET /api/settings/roles`
- `GET /api/settings/users`
- `POST /api/settings/users`
- `PUT /api/settings/users/:id`
- `DELETE /api/settings/users/:id`
- `GET /api/settings/role-permissions`
- `PUT /api/settings/role-permissions/:role/:permission`

### Credential security

- User credentials are stored in `admin_users.password_hash` only.
- Passwords are hashed with salted Node.js `crypto.scryptSync` hashes using the existing `scrypt$salt$hash` format.
- Legacy plaintext password compatibility remains only for login migration; successful legacy logins are upgraded to hashes.
- New/updated user maintenance passwords require 8-128 characters with lowercase, uppercase, number, and special character.
- Suspended/inactive users are denied login even with valid credentials.
- Protected API requests refresh credential-user role/status from `admin_users`, so role changes or suspensions are reflected before route authorization.
- Login now accepts either email or username.

### Auditability

- User maintenance create/update/delete events are written to `audit_logs` using `writeOperationalAudit`.
- Role permission override updates are also audited.
- Password reset/change actions are recorded as metadata without logging raw passwords or password hashes.
- Existing platform audit middleware continues to log protected API activity.

### Configurable RBAC

- `server/rbac.ts` now keeps the default permission matrix and supports runtime persisted permission overrides.
- Added `role_permission_overrides` table for per-role/per-permission overrides.
- `hasPermission()` resolves default permissions plus overrides, so backend authorization reflects customization.
- Added frontend permission rows in Settings so super-admins can toggle or reset role permissions.
- Added permissions:
  - `user_maintenance.read`
  - `user_maintenance.write`
  - `role_permissions.read`
  - `role_permissions.write`

## Files changed

- `server/userManagement.ts`
- `server/modules.ts`
- `server/rbac.ts`
- `server/routePermissions.ts`
- `server.ts`
- `src/lib/permissions.ts`
- `src/pages/Settings.tsx`
- `tests/rbac.test.ts`
- `sql/021_user_maintenance_access_control_schema.sql`
- `docs/PROFILE_ACCESS_MATRIX.md`
- `docs/ROUTE_PERMISSION_MATRIX.md`

## Verification

Attempted:

```bash
npx tsc --noEmit --pretty false --skipLibCheck
```

Result: blocked in this sandbox because `node_modules` are not installed. The compiler output starts with missing package/type declarations for `react`, `express`, `firebase`, `mysql2`, Node typings, and other dependencies. Run this in the normal development environment:

```bash
npm ci
npm run test:ci
npm run verify:ci
```
