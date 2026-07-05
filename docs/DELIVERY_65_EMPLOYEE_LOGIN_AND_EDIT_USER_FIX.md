# Delivery 65 - Employee Login and Edit User Account Fix

## Scope

This delivery fixes the role-login permission-denied regression reported for trainer, cashier, reception, and warehouse manager profiles, and extends the employee user-account workflow to the edit employee screen.

## Changes

- Reworked `src/contexts/AuthContext.tsx` so authenticated application users build their client profile directly from the `/api/auth/login` and `/api/auth/me` session payload.
  - This removes the legacy Firestore-shim lookup against `/api/records/users` during login.
  - Lower-privilege roles no longer hit the admin/staff user records endpoint during login, avoiding the misleading Permission denied flow.
- Added role normalization for dot-separated aliases such as `warehouse.manager`, in addition to the existing `warehouse-manager` alias.
- Changed unknown persisted credential roles to fall back to `staff` during login instead of `admin`.
- Made the Add/Edit Employee dialog scrollable with `max-h-[90vh] overflow-y-auto`.
- Extended the Edit Employee form to show `Create User Account for this Employee` when the selected employee is not already linked to a user.
- Added backend support for creating a linked user account from `PUT /api/hr/employees/:id`.
- Kept the one-user-per-employee uniqueness rule by reusing the central linked-user creation helper.

## Files changed

- `src/contexts/AuthContext.tsx`
- `src/pages/HumanResources.tsx`
- `src/lib/hrPayrollApi.ts`
- `src/lib/permissions.ts`
- `server.ts`
- `server/hrPayroll.ts`
- `server/rbac.ts`
- `tests/rbac.test.ts`
- `tests/phase2Authorization.test.ts`

## Validation

Static TypeScript transpilation checks passed for the changed TypeScript/TSX files. Full CI still needs to be run in the normal development environment with dependencies installed.
