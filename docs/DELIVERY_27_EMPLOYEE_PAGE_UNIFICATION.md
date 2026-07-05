# Delivery 27 - Employee Page Unification

## Purpose

The application had two different employee add/edit experiences:

- **Employees** section, previously routed to `/staff`
- **HR & Payroll** section, routed to `/hr`

The correct employee management implementation is the **HR & Payroll** employee form because it writes directly through the HR/payroll API and includes payroll-related employee fields such as contract type, employment status, salary, allowances, deductions, and vacation balance.

## Changes

- The sidebar **Employees** item now opens `/hr?tab=employees`.
- The sidebar **HR & Payroll** item now opens `/hr?tab=payroll`.
- The `/staff` route now redirects to `/hr?tab=employees` for admin/HR users to avoid exposing the older inconsistent employee form.
- `HumanResources.tsx` now reads the `tab` query parameter and controls the active tab from the URL.
- Navigation active-state logic was updated to support query-string routes.

## Result

Both employee entry points now use the same employee add/edit page, form fields, validation flow, and MySQL-backed `/api/hr/employees` API.

## Database Impact

No database migration is required.
