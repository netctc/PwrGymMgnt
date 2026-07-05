# Delivery 63 - User-Employee Relationship & Access Control

## Objective

Enhance PowerGym by linking credential users directly to HR employee records and allowing HR employee creation to optionally create the corresponding user account.

## Implemented changes

### User profile employee relation

- Added `admin_users.employee_id` as an optional 1:1 user-to-employee link.
- Enforced uniqueness with `uq_admin_users_employee_id`, preventing one employee from being linked to multiple user accounts.
- Settings > User Maintenance now includes a `Linked Employee` field.
- The user account table now displays linked employee name/code/email for accountability.
- The employee link dropdown hides employees already linked to another user while preserving the current user's own link while editing.

### Employee creation workflow

- HR > Add Employee now includes `Create User Account for this Employee`.
- When selected, the dialog reveals the missing credential fields:
  - Username
  - Password
  - Assigned role
  - User status
- The employee email is reused as the credential email and is required when creating a linked user account.
- Employee-created user accounts are immediately linked to the new employee record.
- If linked user creation fails, the just-created employee row is rolled back with a targeted delete to avoid orphan employee records from a failed credential workflow.

### Security and RBAC

- Employee-created accounts use the same salted `scrypt$salt$hash` password storage as Settings-created users.
- Password complexity is enforced consistently: 8-128 characters with lowercase, uppercase, numeric, and special-character requirements.
- Assigned roles are restricted to the predefined operational profiles: `admin`, `manager`, `warehouse_manager`, `accounting`, `cashier`, `reception`, and `trainer`.
- Account statuses remain `active`, `suspended`, or `inactive`; non-active users are blocked at login and during session refresh.

### Auditability

- User creation from HR is audited with `EMPLOYEE_USER_ACCOUNT_CREATE`.
- The HR workflow also writes `HR_EMPLOYEE_LINKED_USER_CREATE` for employee-side traceability.
- Settings user update audit entries include the before/after linked employee state.
- Existing platform audit middleware continues logging protected API traffic.

## Files changed

- `server/userManagement.ts`
- `server/hrPayroll.ts`
- `server/routePermissions.ts`
- `server.ts`
- `src/pages/Settings.tsx`
- `src/pages/HumanResources.tsx`
- `src/lib/hrPayrollApi.ts`
- `sql/021_user_maintenance_access_control_schema.sql`
- `sql/022_user_employee_relationship_schema.sql`
- `docs/PROFILE_ACCESS_MATRIX.md`
- `docs/ROUTE_PERMISSION_MATRIX.md`

## Database migration

Run migrations in order. Delivery 63 adds:

```sql
admin_users.employee_id VARCHAR(64) NULL
UNIQUE INDEX uq_admin_users_employee_id (employee_id)
OPTIONAL FK fk_admin_users_employee -> employees(id) ON DELETE SET NULL
```

The FK is created only when the `employees` table exists, keeping the migration safe for older or partially initialized databases.

## Verification

Attempted:

```bash
npx --no-install tsc --noEmit
```

Result: blocked in this sandbox because `node_modules` are not installed. The compiler output starts with missing package/type declarations for `react`, `express`, `firebase`, `mysql2`, Node typings, and other dependencies. No delivery-specific parse errors were surfaced before those dependency failures.

Recommended validation in the normal development environment:

```bash
npm ci
npm run test:ci
npm run verify:ci
```
