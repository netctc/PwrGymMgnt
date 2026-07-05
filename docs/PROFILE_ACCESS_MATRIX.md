# Profile Access Matrix - RBAC Review

This document records the operational profile access applied in this review. Backend enforcement is centralized in `server/rbac.ts`; frontend navigation, protected routes, and tab visibility are mirrored in `src/lib/permissions.ts` and page-level checks.

## Profile matrix

| Profile | Application access |
|---|---|
| `admin` | Full operational access across dashboard, members, plans, classes, private PT, QR access, HR, accounting, warehouse inventory, warehouse POS, suppliers, reports, settings, audit/security, and support. Backup restore remains restricted to `super_admin`. |
| `manager` | Operational management access: dashboard, members/plans read-write, classes/private PT read-write, QR access, HR/payroll read-write, payroll approval/payment, accounting read-write, warehouse inventory management, POS, suppliers/POs, warehouse reports, global reports, and support. No platform settings/audit/security access. |
| `warehouse_manager` / `warehouse-manager` | Warehouse operations: dashboard, warehouse dashboard/inventory, product/category management, stock adjustments, suppliers/POs, POS, warehouse reports, global reports, and self-service support. The hyphenated `warehouse-manager` alias is normalized to `warehouse_manager`. |
| `accounting` | Finance and controls: dashboard, member read visibility, HR/payroll read, payroll approval/payment, accounting read-write, warehouse read, suppliers/POs, warehouse reports, global reports, and self-service support. No member writes, scheduling writes, inventory writes, POS, or platform settings. |
| `trainer` | Training operations: dashboard, member read visibility, QR/access validation, classes/private PT read-write, global reports, and self-service support. No finance, HR, warehouse, POS, or platform settings. |
| `reception` | Front desk access: dashboard, members/plans read-write, e-card generation, QR/access validation, classes/private PT read-write, warehouse read/catalog, POS, global reports, support visibility, and self-service support. No HR, finance, supplier/PO, inventory write, warehouse reports, or platform settings. |
| `cashier` | Same rights as `reception`: dashboard, members/plans read-write, e-card generation, QR/access validation, classes/private PT read-write, warehouse read/catalog, POS, global reports, support visibility, and self-service support. |

## Implementation notes

- `reception` and `cashier` are intentionally kept at equal hierarchy and equivalent grants in both backend and frontend permission maps.
- Role normalization now accepts case/spacing-safe role strings and converts hyphenated aliases such as `warehouse-manager` into the canonical `warehouse_manager` value.
- The dashboard, class scheduling pages, warehouse tabs/actions, layout navigation, reports, login redirects, and legacy staff screen were aligned to permission helpers instead of scattered role checks.
- Warehouse UI now hides restricted actions: product/category writes and stock adjustments require `warehouse.write`; suppliers and POs require `warehouse.purchase`; POS sales require `warehouse.pos`; warehouse analytics require `warehouse.reports`.

## Verification status

- Added/updated RBAC tests for alias normalization and reception/cashier parity.
- Attempted `npx tsc --noEmit --pretty false`; the sandbox does not include `node_modules`, so validation is blocked by missing dependency/type declarations such as `react`, `express`, `firebase`, and Node typings. No parse-specific errors were surfaced before those dependency failures.

## User maintenance update

Delivery 62 added a Settings > User Maintenance sub-section for credential users stored in `admin_users`.

| Capability | Allowed roles |
|---|---|
| View user maintenance | `super_admin`, `admin` |
| Add/edit/suspend/deactivate credential users | `super_admin`, `admin` |
| Delete suspended/inactive users | `super_admin`, `admin` with extra protections: active users cannot be deleted, super-admin users cannot be deleted from the UI, and admins cannot modify super-admin accounts. |
| Customize role permission overrides | `super_admin` for writes; `admin` and `super_admin` can read the matrix. |

Credential users can be assigned only to the predefined operational profiles requested for this phase: `admin`, `manager`, `warehouse_manager`, `accounting`, `cashier`, `reception`, and `trainer`.

Passwords are stored as salted scrypt hashes in `admin_users.password_hash`; raw passwords are never returned by API responses or shown in the UI. User maintenance changes and role permission override changes are written to `audit_logs`.


## User-Employee relationship update

Delivery 63 added an optional 1:1 relationship between credential users and HR employee records.

| Capability | Allowed roles |
|---|---|
| Link a user profile to an employee from Settings > User Maintenance | `super_admin`, `admin` |
| View employee link options for user profiles | `super_admin`, `admin` |
| Create an employee and linked user account from HR > Add Employee | Any role with `hr.write`; by default `super_admin`, `admin`, and `manager` |

Implementation notes:

- `admin_users.employee_id` is nullable but unique, so one employee can only be linked to one user account.
- Settings user maintenance hides employees that are already linked to another user.
- Add Employee can create the employee and linked user together when the `Create User Account for this Employee` checkbox is selected.
- Employee-created users use the same secure password hashing and role/status validation as Settings-created users.
- Employee-created user accounts and user profile link changes are audited.
