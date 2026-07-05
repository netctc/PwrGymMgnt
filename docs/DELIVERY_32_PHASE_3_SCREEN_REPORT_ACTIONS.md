# DELIVERY 32 - Phase 3 Screen Report Actions

## Scope
Phase 3 integrates the filtered PDF reporting engine from Phase 2 directly into operational application screens. Users no longer need to leave the current module to generate the main PDF outputs for that screen.

## Implemented frontend changes

### New reusable component
- Added `src/components/ScreenReportActions.tsx`.
- Loads the role-filtered report catalog from `GET /api/reports/screen-catalog`.
- Shows only reports allowed by the backend for the current user role.
- Downloads PDFs through `reportsApi.downloadScreenPdf`.
- Provides reusable `from` / `to` date filters.
- Accepts screen-specific parameters such as status, type, search text, trainer ID and other filters.
- Cleans empty and `all` values before sending the query string.
- Uses credentialed requests through the existing reports API client.

### Screens with embedded PDF actions
- Members
  - Members Directory
  - Subscription Validity
  - Invoices & Collection
  - Copies status and search filters from the member directory screen.

- Membership Plans
  - Subscription Validity
  - Invoices & Collection

- Accounting & Finance
  - Finance Transactions
  - Copies transaction type and initializes date filters from the ledger date range.

- HR & Payroll
  - Employee Profiles
  - Payroll Runs
  - Payroll Items
  - Copies employee status and search filters from HR.

- Group Classes
  - Group Class Sessions
  - Class Bookings
  - Copies selected trainer and initializes report date range from the visible week.

- Private PT
  - Private PT Sessions
  - Copies selected trainer and initializes report date range from the visible week.

- Staff Management
  - Staff Users

- Support & Contact
  - Support Tickets
  - Notifications

- System Settings
  - Security Audit Events
  - Copies audit search text where available.

## Behavior
1. The component loads the backend catalog once and reuses it.
2. The backend continues to enforce role-based access; hidden/unauthorized reports are not shown.
3. The user can adjust date range inside the current screen before downloading.
4. Current screen filters are merged into the PDF request.
5. The server-side report filters and row limits from Phase 2 remain the source of truth.

## Files changed
- `src/components/ScreenReportActions.tsx` added.
- `src/pages/Members.tsx` updated.
- `src/pages/Plans.tsx` updated.
- `src/pages/Accounting.tsx` updated.
- `src/pages/HumanResources.tsx` updated.
- `src/pages/Classes.tsx` updated.
- `src/pages/PrivateClasses.tsx` updated.
- `src/pages/Staff.tsx` updated.
- `src/pages/Support.tsx` updated.
- `src/pages/Settings.tsx` updated.

## Verification
Attempted `npm run lint` in the execution environment. It could not complete because the environment does not have `node_modules`; errors are dependency-resolution errors for React, Express, MySQL, jsPDF, Base UI and other declared packages. No dependency installation was completed in this environment.

Recommended verification in the target environment or CI:

```bash
npm ci
npm run lint
npm run build
npm audit
```

## Next recommended phase
Phase 4 should add automated tests and CI verification for the new security and reporting flows:
- backend report route validation tests,
- permission matrix tests,
- UI smoke tests for embedded report actions,
- PDF generation smoke tests with seeded MySQL data,
- CI pipeline gates for lint, build and audit.
