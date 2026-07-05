# Delivery 31 - Phase 2 Filtered Screen PDF Reports

## Scope

Phase 2 adds backend-generated PDF reports that can be reused inside operational screens and controlled by role-aware catalog visibility. This delivery builds on Phase 1 hardening and keeps report generation server-side so filters, row limits, audit middleware and permissions remain enforceable in one place.

## Added backend capabilities

### New endpoints

- `GET /api/reports/screen-catalog`
  - Returns only screen report definitions available to the authenticated role.
  - Each item includes: `id`, `sectionId`, `label`, `description`, `screen`, and `filters`.

- `GET /api/reports/screen/:reportId.pdf`
  - Generates a filtered PDF from MySQL for the requested screen report.
  - Applies role checks before querying data.
  - Supports common filters such as `from`, `to`, `status`, `memberId`, `employeeId`, `trainerId`, `room`, `role`, `priority`, `type`, `category`, `source`, `severity`, `statusCode`, and `q` depending on the report.
  - Limits date range to 366 days.
  - Limits PDF rows to a safe server-defined maximum and shows omitted count in the PDF summary.

### Existing endpoint improvement

- `GET /api/reports/scheduled-classes.pdf`
- `GET /api/reports/scheduled-private-pt.pdf`

Both now accept an optional `status` query filter. Default remains `scheduled` for backward compatibility.

## Screen report catalog

Implemented screen-specific PDFs:

1. Members Directory - Members screen
2. Subscription Validity - Plans / Members screens
3. Invoices & Collection - Plans / Accounting screens
4. Staff Users - Staff screen
5. Employee Profiles - Human Resources screen
6. Payroll Runs - HR / Payroll screen
7. Payroll Items - HR / Payroll screen
8. Finance Transactions - Accounting screen
9. Group Class Sessions - Classes screen
10. Class Bookings - Classes screen
11. Private PT Sessions - Private Classes screen
12. Support Tickets - Support screen
13. Notifications - Support / Settings screens
14. Security Audit Events - Settings / Security screen

## Frontend changes

- `src/lib/reportsApi.ts`
  - Adds screen report catalog and screen PDF download helpers.
  - Generalizes query parameter handling.
  - Reuses a shared PDF download helper.

- `src/pages/Reports.tsx`
  - Adds a section for screen-specific filtered PDFs.
  - Renders dynamic filter controls from backend catalog metadata.
  - Provides per-report reset and download actions.
  - Keeps existing consolidated section reports intact.

## Filters and controls

Every screen report can define its own filters. The backend ignores empty or `all` values and uses parameterized SQL for all user-supplied values. Date filters default to current month start through today in the UI.

## Verification notes

`npm run lint` was attempted in this environment and recorded in:

- `docs/verification/phase2_lint.log`
- `docs/verification/phase2_lint_after.log`

The run is blocked by missing installed dependencies/types in this sandbox (`react`, `express`, `mysql2`, `jspdf`, etc.). After the local key-prop issue in `Reports.tsx` was corrected, remaining errors are dependency-resolution errors caused by the absence of `node_modules`.

Recommended verification in the target environment:

```bash
npm ci
npm run lint
npm run build
npm audit
```

Manual smoke checks after deployment:

1. Login as `super_admin` and open Reports.
2. Confirm section PDFs still generate.
3. Open `Screen-specific filtered PDFs`.
4. Generate each report with current month defaults.
5. Test filters: date range, status, search, member ID, trainer ID, employee ID.
6. Login with lower-privilege roles and confirm restricted reports are hidden or return 403.
7. Confirm large date ranges over 366 days return HTTP 400.
