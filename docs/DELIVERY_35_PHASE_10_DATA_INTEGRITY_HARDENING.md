# Delivery 35 - Phase 10 Data Integrity Hardening

## Scope

Phase 10 adds a non-destructive data integrity layer for production operations. It focuses on detecting database inconsistencies before they affect access control, QR/e-card generation, PDF reporting, payroll, scheduling, or finance dashboards.

## New backend module

- `server/dataIntegrity.ts`

It exposes a catalog of integrity checks, safe repair definitions, summary builders, CSV export, and Express route registration.

## New permission

- `platform.data.integrity`

Allowed roles:

- `super_admin`
- `admin`
- `manager`

## New API endpoints

- `GET /api/platform/data-integrity/overview`
  - Runs all integrity checks.
  - Returns posture, summary, failing/passing findings, and safe repair metadata.

- `GET /api/platform/data-integrity/checks`
  - Returns the public check catalog without SQL internals.

- `GET /api/platform/data-integrity/checks/:checkId/samples?limit=25`
  - Returns limited sample rows for one check.
  - Limit is capped at 100.

- `POST /api/platform/data-integrity/repairs/:repairId`
  - Defaults to dry-run.
  - Use `?apply=true` or `{ "apply": true }` only for controlled maintenance windows.

- `GET /api/platform/data-integrity/overview.csv`
  - Exports summary and findings as CSV.

## Integrity checks added

Membership:

- Member subscriptions without member.
- Legacy subscriptions without member.
- Active members without current subscription across both normalized and legacy subscription tables.
- Duplicate active member emails.
- Expired access tokens still active.

Finance:

- Invoices without member.
- Invoices linked to missing subscriptions.
- Finance transactions with invalid type.
- Finance transactions with negative amount.

Scheduling:

- Class bookings without member.
- Class bookings without class session.
- Private PT sessions without member.

HR/payroll:

- Attendance without employee.
- Payroll items without payroll run.
- Payroll items without employee.

Security:

- Expired password reset tokens not closed.

## Safe repairs added

- `expire-access-tokens`
  - Marks expired active QR/e-card tokens as `expired` and sets `revoked_at`.
  - Does not delete tokens.

- `revoke-expired-password-reset-tokens`
  - Marks expired, unused password reset tokens as revoked.
  - Does not expose or delete token hashes.

## New scripts

- `npm run db:integrity`
  - Runs integrity checks from CLI.
  - Returns exit code `2` when critical issues exist.

- `npm run db:integrity -- --json`
  - Outputs JSON for CI/monitoring ingestion.

- `npm run db:repair`
  - Lists safe repairs.

- `npm run db:repair -- --repair=expire-access-tokens`
  - Dry-run repair.

- `npm run db:repair -- --repair=expire-access-tokens --apply`
  - Applies repair.

## New migration

- `sql/015_data_integrity_hardening.sql`

Adds:

- `data_integrity_runs` support table.
- Indexes for integrity and eligibility lookups.

The migration is intentionally non-destructive. It does not add new foreign keys or hard check constraints that could fail on existing dirty data.

## Frontend

Settings > Database Maintenance now includes a **Data Integrity Center**:

- posture KPI,
- failing checks,
- affected rows,
- CSV export,
- safe repair dry-runs.

Apply-mode repairs are intentionally not exposed as a one-click UI action to reduce accidental production changes.

## Verification

Run locally/CI:

```bash
npm ci
npm run verify:ci
npm run db:migrate
npm run db:integrity
```

For a controlled repair window:

```bash
npm run db:repair -- --repair=expire-access-tokens
npm run db:repair -- --repair=expire-access-tokens --apply
npm run db:integrity
```
