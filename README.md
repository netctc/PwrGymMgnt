# PowerGym Management

PowerGym Management is a gym operations application built with React, Vite, TypeScript, Express, and MySQL migration support.

## Current implementation status

`PwrGymCodex` now includes the operational modules for dashboard, memberships, versioned plans, multi-user subscriptions, scheduling, Private PT, HR/payroll, accounting, warehouse/POS, trainer commissions, reporting, security, backup/restore, deployment monitoring and multilingual UI.

The canonical database foundation is `sql/000_master_schema.sql`; later numbered files in `sql/` are incremental migrations. Historical migrations remain in `sql/archive/` for audit evidence only. See `docs/CODE_MAINTENANCE_AUDIT_2026-07-30.md` for the current technical status and prioritized release plan.

## Prerequisites

- Node.js 22+
- MySQL 8+ for database-backed API usage
- `mysqldump` if you want backup endpoints to work

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows Command Prompt, create the environment file with:

```cmd
copy .env.example .env
```

Update `.env` with real local or staging values before using database-backed APIs.

## Database setup

```bash
npm run db:migrate
```

This applies all SQL files in the `sql/` directory, including the Delivery 1 foundation schema and Delivery 2 membership/subscription schema. Then configure a unique `POWERGYM_INITIAL_ADMIN_PASSWORD` in `.env` and create or verify the required local administrator accounts:

```bash
npm run db:init-users
```

Rotate the initial password immediately after the first successful login.

## Delivery 2 membership API

After logging in as a super-admin/admin/manager, the backend exposes protected membership endpoints under:

```text
/api/membership
```

Main capabilities include plan management, member records, subscription renewal, invoice creation, invoice payment marking, QR/e-card token generation, and active access validation. The frontend helper is available in `src/lib/membershipApi.ts`.

## Verification

```bash
npm run lint
npm run build
npm run verify
npm audit
```

## Production notes

- Set `NODE_ENV=production`.
- Set a strong `JWT_SECRET`; production startup fails without it.
- Never commit real database credentials or super-admin passwords.
- Rotate any credentials that were previously committed in public or shared archives.

## Windows troubleshooting

If `tsc` or `vite` is not recognized, install dependencies first from the project root:

```cmd
npm install
npm run verify
```

`tsc` and `vite` are local binaries provided by `node_modules`; they are available to `npm run` commands after installation.

## Delivery 3 - Frontend Membership Integration

Delivery 3 connects the membership frontend to the protected Node.js/MySQL APIs:

- Plans screen now lists, creates, and edits backend subscription plans.
- Members screen now lists, searches, creates, edits, archives, renews subscriptions, creates invoices, marks invoices paid, and generates QR/e-card tokens through the backend.
- QR Access screen now validates secure backend e-card tokens instead of checking Firestore user records directly.
- Verification logs are available in `docs/verification/`.

To test the full workflow, configure MySQL in `.env`, run `npm run db:migrate`, sign in as an admin, create a plan, create a member, renew the subscription, generate a QR token, and validate it from QR Access.


## Delivery 4 - Scheduling & Class Booking

Delivery 4 adds a MySQL-backed scheduling module for group classes, class bookings, and private sessions.

### New migration

```bash
npm run db:migrate
```

This applies:

- `sql/003_scheduling_class_booking_schema.sql`

### New API namespace

```txt
/api/scheduling
```

Implemented endpoints include:

- `GET /api/scheduling/resources`
- `GET /api/scheduling/classes`
- `POST /api/scheduling/classes`
- `PUT /api/scheduling/classes/:id`
- `DELETE /api/scheduling/classes/:id`
- `POST /api/scheduling/classes/:id/bookings`
- `DELETE /api/scheduling/bookings/:id`
- `GET /api/scheduling/private-classes`
- `POST /api/scheduling/private-classes`
- `DELETE /api/scheduling/private-classes/:id`

### Frontend screens updated

- `Classes`
- `Private Classes`

The screens now use the scheduling API through `src/lib/schedulingApi.ts`.

### Verification

```bash
npm run verify
npm audit
```

Expected result:

```txt
found 0 vulnerabilities
```

## Delivery 5 - HR & Payroll

Delivery 5 adds the HR and payroll foundation:

- Protected `/api/hr` backend module.
- MySQL migration `sql/004_hr_payroll_schema.sql`.
- Employee profile and contract management.
- Salary, allowance, deduction, and vacation balance fields.
- Attendance capture with absent and unpaid leave support.
- Monthly payroll generation.
- Payroll approval and mark-paid workflow.
- Frontend integration in `src/pages/HumanResources.tsx`.

New APIs:

```txt
GET  /api/hr/employees
POST /api/hr/employees
PUT  /api/hr/employees/:id
GET  /api/hr/attendance
POST /api/hr/attendance
GET  /api/hr/payroll/runs
POST /api/hr/payroll/runs
GET  /api/hr/payroll/runs/:id
POST /api/hr/payroll/runs/:id/approve
POST /api/hr/payroll/runs/:id/mark-paid
GET  /api/hr/payroll/history
```

To apply the schema:

```cmd
npm run db:migrate
```

To verify the package:

```cmd
npm ci
npm run verify
npm audit
```

## Delivery 6 - Accounting & Finance Integration

Delivery 6 adds a normalized MySQL-backed accounting module and connects the Accounting screen to protected backend APIs.

### New migration

```cmd
npm run db:migrate
```

This applies:

- `sql/005_finance_accounting_schema.sql`

### New API namespace

```txt
/api/finance
```

Implemented endpoints include:

```txt
GET    /api/finance/summary
GET    /api/finance/transactions
POST   /api/finance/transactions
PUT    /api/finance/transactions/:id
POST   /api/finance/transactions/:id/approve
DELETE /api/finance/transactions/:id
GET    /api/finance/loans
POST   /api/finance/loans
PUT    /api/finance/loans/:id
GET    /api/finance/rentals
POST   /api/finance/rentals
PUT    /api/finance/rentals/:id
GET    /api/finance/budgets
POST   /api/finance/budgets
POST   /api/finance/payroll-runs/:id/post
GET    /api/finance/payroll-postings
POST   /api/finance/recurring/process
```

### Frontend integration

- `src/pages/Accounting.tsx` now uses the backend through `src/lib/financeApi.ts`.
- Financial dashboard cards show income, expenses, net profit, loans, and rentals.
- Transactions can be created, filtered, exported to CSV/XLSX/PDF, and deleted.
- Approved or paid HR payroll runs can be posted to accounting as expense transactions.
- Loans, rentals, and monthly budgets can be managed from the Accounting screen.
- Recurring entries can be processed through the finance API.

### Verification

```cmd
npm ci
npm run verify
npm audit
```

Expected audit result:

```txt
found 0 vulnerabilities
```

## Delivery 7 - Security, Performance, Audit Logs & Reporting Hardening

Delivery 7 adds operational hardening around the existing modules.

### New migration

```cmd
npm run db:migrate
```

This applies:

- `sql/006_security_audit_reporting_schema.sql`

### Security hardening

- Request IDs on all requests.
- Security headers for content type, frame protection, referrer policy, cross-origin opener policy, and production HSTS.
- API `Cache-Control: no-store`.
- Login-specific rate limiting.
- JSON request body size limit.
- `/api/db-health` now requires authentication.
- `/api/health` no longer exposes the database hostname.
- Production `/api/admin-setup` requires `ADMIN_SETUP_TOKEN`.

### New platform API namespace

```txt
/api/platform
```

Implemented endpoints include:

```txt
GET    /api/platform/audit-logs
GET    /api/platform/security-events
GET    /api/platform/performance/cache
DELETE /api/platform/performance/cache
GET    /api/platform/reports/operations-summary
GET    /api/platform/reports/operations-summary.csv
GET    /api/platform/system/health
```

### Frontend integration

The Settings screen now includes a **Security & Reports** tab with:

- System health.
- API cache stats and cache clearing.
- Access-denial KPI.
- Operations summary KPIs.
- Module-level audit table.
- Operations summary CSV export.

### Production setup token

For production admin bootstrap, set this before calling `/api/admin-setup`:

```env
ADMIN_SETUP_TOKEN=replace_with_one_time_setup_token
```

Then call setup with either a header:

```cmd
curl -H "x-admin-setup-token: replace_with_one_time_setup_token" http://localhost:3000/api/admin-setup
```

or a query parameter for local testing:

```cmd
curl "http://localhost:3000/api/admin-setup?setupToken=replace_with_one_time_setup_token"
```

After setup, rotate or remove the token.

### Verification

```cmd
npm ci
npm run verify
npm audit
```

Expected audit result:

```txt
found 0 vulnerabilities
```

## Delivery 8: Mobile Readiness, Notifications, Support and Deployment

Delivery 8 adds the final first-cycle roadmap capabilities for user experience, mobile readiness, support workflow, and deployment packaging.

### Database migration

Run:

```cmd
npm run db:migrate
```

This applies:

- `sql/007_mobile_notifications_support_schema.sql`

### New engagement API namespace

```txt
/api/engagement
```

Implemented endpoints include:

```txt
GET  /api/engagement/contact-channels
GET  /api/engagement/notifications
POST /api/engagement/notifications
POST /api/engagement/notifications/:id/read
POST /api/engagement/notifications/read-all
GET  /api/engagement/support/tickets
POST /api/engagement/support/tickets
GET  /api/engagement/support/tickets/:id
POST /api/engagement/support/tickets/:id/messages
PUT  /api/engagement/support/tickets/:id/status
GET  /api/engagement/deployment-readiness
```

### Frontend integration

- Responsive mobile-friendly navigation drawer.
- In-app notification bell with unread badge.
- Structured support ticket form.
- Recent support ticket tracking.
- Backend-configurable support email, phone, WhatsApp, and office hours.
- PWA manifest and service worker for installable mobile use.

### Deployment checks

Run this with production environment variables loaded:

```cmd
npm run deploy:check
```

### Docker

Build:

```cmd
docker build -t powergym-management:latest .
```

Run:

```cmd
docker run --env-file .env -p 3000:3000 powergym-management:latest
```

Detailed deployment steps are available in:

```txt
docs/DEPLOYMENT_RUNBOOK.md
```


## Delivery 9 MySQL access fix

If Members or Staff do not appear in MySQL, use this updated package and run:

```cmd
npm ci
npm run db:migrate
npm run db:verify
npm run dev
```

The application now accepts both MySQL environment variable styles:

```env
DATABASE_HOSTNAME=localhost
DATABASE_USER_NAME=root
DATABASE_PASSWORD=your_password
DATABASE_NAME=powergym
```

or:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=powergym
```

`npm run db:verify` performs direct MySQL create/read/update checks for the major application modules and rolls back the test data.

Members created from the UI are stored in `members`. Staff created from the Staff screen is stored in both `users` and `staff` for compatibility with older screens and the formal staff table.

Manual checks:

```sql
SELECT id, first_name, last_name, email, phone, status FROM members ORDER BY created_at DESC LIMIT 10;
SELECT id, email, role, data FROM users ORDER BY created_at DESC LIMIT 10;
SELECT id, first_name, last_name, email, role, status FROM staff ORDER BY created_at DESC LIMIT 10;
```

## MySQL connection diagnosis

If the server logs show `ENOTFOUND`, `ECONNRESET`, or `ETIMEDOUT`, the application cannot reach the configured MySQL host. Run:

```bash
npm run db:diagnose
```

For local development with MySQL installed on the same machine, use:

```env
DATABASE_HOSTNAME=localhost
DATABASE_PORT=3306
DATABASE_USER_NAME=root
DATABASE_PASSWORD=your_local_mysql_password
DATABASE_NAME=powergym
```

For a hosted MySQL database, use the exact MySQL hostname from the hosting database panel, not necessarily the web/cPanel hostname. Also verify that remote MySQL access is enabled and your IP address is allowed by the host/firewall.

## Delivery 11 setup note: migrations vs seed data

Use migrations and demo data as separate steps:

```bash
npm run db:diagnose
npm run db:migrate
npm run db:verify
npm run db:seed
```

`npm run db:migrate` applies schema migrations only and skips seed/demo SQL files. `npm run db:seed` loads `sql/009_test_seed_data.sql` intentionally.

If `db:diagnose` passes DNS and TCP but fails login/query, verify the database username, password, database name, and remote MySQL permissions in your hosting panel.

## Delivery 12 - PDF Reports

The application includes a **Reports** section in the sidebar. Reports are generated by the backend from MySQL and downloaded as PDF files.

Available PDF reports:

- All Sections Summary
- Members
- Staff / Employees
- Payroll
- Accounting & Finance
- Scheduled Group Classes
- Private PT Sessions
- Plans, Subscriptions & Invoices
- Support & Notifications
- Security & Audit

Backend endpoints:

```txt
GET /api/reports/sections
GET /api/reports/:section.pdf
```

Examples:

```txt
/api/reports/all.pdf
/api/reports/members.pdf
/api/reports/accounting.pdf?from=2026-05-01&to=2026-05-31
/api/reports/private-pt.pdf
```

The user must be logged in. The reports returned by `/api/reports/sections` are filtered according to the user's role.

## Render.com deployment fix

For Render, do not use the local development command as the build command.

Use these settings in Render Dashboard:

```bash
Build Command:
npm ci --include=dev --registry=https://registry.npmjs.org/ && npm run build

Pre-Deploy Command:
npm run db:diagnose && npm run db:migrate && npm run db:verify

Start Command:
npm start
```

Do not use this on Render:

```bash
npm ci; npm run db:diagnose; npm run db:migrate; npm run db:verify; npm run db:seed; npm run dev;
```

That command is wrong because `;` continues even if `npm ci` fails, `db:seed` reloads demo data on every deployment, and `npm run dev` depends on dev tooling intended for local use.

Required Render environment variables:

```env
NODE_VERSION=22.22.0
NODE_ENV=production
NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
DATABASE_HOSTNAME=your_mysql_host
DATABASE_PORT=3306
DATABASE_USER_NAME=your_mysql_user
DATABASE_PASSWORD=your_mysql_password
DATABASE_NAME=your_mysql_database
JWT_SECRET=your_long_random_secret
ADMIN_EMAIL=your_admin_email
ADMIN_PASSWORD=your_initial_admin_password
ADMIN_SETUP_TOKEN=your_setup_token
CORS_ORIGIN=https://your-render-service.onrender.com
```

If this is a demo deployment and you want test data, run this one time manually after the first successful deploy:

```bash
npm run db:seed
```


## Render Deployment Registry Fix

If Render tries to download npm packages from an internal URL such as `packages.applied-caas-gateway1.internal.api.openai.org`, the `package-lock.json` contains a non-public resolved tarball URL. This has been fixed by replacing the lockfile URL and adding:

```txt
replace-registry-host=always
```

Recommended Render commands:

```bash
Build Command: npm run render:build
Pre-Deploy Command: npm run db:diagnose && npm run db:migrate && npm run db:verify
Start Command: npm start
```

Do not use `npm run dev` in Render production.

## Render deployment command correction

For Render, do not use only `npm run build` as the build command unless this package's `prebuild` script is present.

Recommended Render commands:

```bash
Build Command: npm run render:build
Pre-Deploy Command: npm run render:predeploy
Start Command: npm run render:start
```

The `prebuild` script also protects against the common Render error `vite: not found` by installing dependencies when build tools are missing.

## Render command correction

For Render Web Service deployment, use exactly these commands:

```txt
Build Command: npm run render:build
Pre-Deploy Command: npm run render:predeploy
Start Command: npm run render:start
```

If Render shows `No open ports detected` while running `npm run render:build`, the Start Command is wrong. `render:build` is only for the build phase. The start phase must run `npm run render:start`, which executes `node dist/server.cjs` and binds to `process.env.PORT`.

## Render low-memory deployment note

If Render Free/low-memory builds fail during Vite with `JavaScript heap out of memory`, use the Render-specific build path introduced in Delivery 17:

```txt
Build Command:
npm run render:build && npm run render:predeploy
```

```txt
Start Command:
npm run render:start
```

`render:build` uses a lightweight esbuild client bundle instead of the full Vite/Tailwind production pipeline. Local development and normal local builds remain unchanged.

### Delivery 18 - Render esbuild alias fix

If Render fails with errors like `Cannot read file: src/lib/utils` or `Cannot read file: src/components/ui/button`, use Delivery 18 or later. The Render-only low-memory esbuild build now resolves Vite-style extensionless aliases such as `@/lib/utils` and `@/components/ui/button`.

Render settings remain:

```txt
Build Command: npm run render:build && npm run render:predeploy
Start Command: npm run render:start
```

## Delivery 19 - Render UI Parity Fix

If pages look correct locally but have design issues on Render, use the latest Render build path:

```bash
npm run render:build && npm run render:predeploy
```

The Render build now generates a Tailwind CDN configuration and fallback shadcn component CSS for cards, buttons, forms, tables, dialogs, tabs and avatars. This improves visual parity for Employees, HR & Payroll, Accounting, Classes, Private PT and Reports while keeping Render memory usage low.

After deployment, test these pages on Render:

- Dashboard
- Members
- Plans
- Employees
- HR & Payroll
- Accounting
- Classes
- Private PT
- Reports
- Settings
- Support


### Delivery 20 - Render tabs/layout parity fix

If pages look correct locally but tabs/panels appear side-by-side on Render, use the Delivery 20 build. The Render low-memory build now includes explicit tab orientation CSS and Base UI active/hidden state fallbacks. This fixes Accounting, HR & Payroll, Employees, Members, Classes, Private PT, Reports and Settings tab layouts on Render.

### Delivery 21 - Scheduled Session PDF printouts

Classes and Private PT now include a **Print Scheduled Session** action.

From each scheduling page, select:

- **All trainers**, or
- a specific trainer

Then click **Print Scheduled Session** to download a PDF for the visible calendar week.

Backend endpoints:

```txt
GET /api/reports/scheduled-classes.pdf?from=YYYY-MM-DD&to=YYYY-MM-DD&trainerId=all
GET /api/reports/scheduled-private-pt.pdf?from=YYYY-MM-DD&to=YYYY-MM-DD&trainerId=all
```

These reports read directly from MySQL and include scheduled sessions, trainers, rooms, booking/member details, and summary totals.


## Delivery 22 - Schedule Print Error Fix

Fixed the Classes/Private PT scheduled session PDF download flow so backend JSON error objects are displayed as readable messages instead of `[object Object]`. The scheduled class PDF endpoint also now applies legacy `class_bookings` compatibility checks before generating the file.

### Delivery 23 - Scheduled Classes PDF enrollment fix

The Classes **Print Scheduled Session** PDF now calculates enrollment from `class_bookings` instead of reading a non-existent `class_sessions.enrolled_count` column. This fixes deployed database errors like:

```txt
Unknown column 'cs.enrolled_count' in 'SELECT'
```


## Delivery 24: Report SQL Compatibility Fix

Fixes deployed MySQL/MariaDB PDF report errors for:

- Plans, Subscriptions & Invoices: ambiguous `status` column in invoice query.
- Support & Notifications: real schema uses `inquiry_type`, not `category`.
- Notifications: real schema uses `user_id`/`role` and `type`, not `recipient_user_id`/`priority`.

No database migration is required. Redeploy after pushing this delivery.

## Delivery 25 - Single Class Print PDF Report

The Classes page now supports printing a PDF for one specific class session. Each class card includes a **Print Class** button that downloads a report containing class details, trainer name, capacity, enrolled count, and all members registered/inscritos in that class.

New endpoint:

```txt
GET /api/reports/class-session/:classId.pdf
```

No database migration is required for this delivery.



### Delivery 26 - Single Class PDF Route Fix

Fixes the Classes page single-class PDF print action when the server returns the React/Vite HTML shell instead of a PDF. The frontend now calls `GET /api/reports/class-session.pdf?classId=...`, and the backend also provides compatible aliases for older URLs. Unknown `/api` paths now return JSON 404 responses before the SPA fallback. No database migration is required.

### Delivery 27 - Employee page unification

The standalone **Employees** entry now opens the same employee management form used inside **HR & Payroll**. This removes the previous mismatch between employee add/edit forms and ensures all employee create/edit actions use the HR/payroll MySQL-backed API.

Routes:

```txt
Employees     -> /hr?tab=employees
HR & Payroll  -> /hr?tab=payroll
Legacy /staff -> redirects to /hr?tab=employees
```

No database migration is required.

## Delivery 28 - Member Access, QR e-Card, and Renewal Enhancements

Member management now includes Last Access tracking, access-date filters, extended member statuses, locked QR e-card expiry derived from subscription expiry, Email/WhatsApp QR distribution helpers, automatic renewal date logic, and inactive-by-default new members.

Apply database changes with:

```bash
npm run db:migrate
```

New migration:

```txt
sql/010_member_access_qr_renewal_enhancements.sql
```


## Delivery 29 - QR e-Card PDF Delivery

The Members QR e-card dialog now supports PDF generation and PDF-based delivery.

Each QR e-card PDF includes the QR code, token text, member full name, plan name, and subscription expiry date.

Open **Settings > General Configuration > QR e-Card Template** to configure the e-card title, note, and background image. Use a compressed image under 750 KB.

Direct email delivery uses SendGrid:

```env
SENDGRID_API_KEY=your_key
ECARD_FROM_EMAIL=no-reply@yourdomain.com
```

Direct WhatsApp PDF delivery uses WhatsApp Cloud API:

```env
WHATSAPP_CLOUD_TOKEN=your_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
```

If providers are not configured, the UI downloads/shares the PDF for manual sending.
