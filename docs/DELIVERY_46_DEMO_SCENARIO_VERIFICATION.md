# Delivery 46 - Demo Scenario Verification

## Purpose

This delivery adds a read-only verification layer for the demo database reset introduced in Delivery 45. After running the demo reset, operators can verify that the seeded database contains enough coherent data for member, QR/e-card, scheduling, warehouse, POS, accounting, support and security scenarios.

## Changes

### Fixed demo seed runtime issue

`scripts/db-reset-demo.mjs` now correctly creates demo user IDs with normal template strings. This fixes a runtime issue in dry-run and reset mode where user IDs referenced an undefined `session` object.

### New demo verification CLI

Added:

```bash
scripts/db-demo-verify.mjs
scripts/db-demo-verify-utils.mjs
```

New commands:

```bash
npm run db:demo:verify
npm run db:demo:verify -- --json
npm run db:demo:verify -- --strict=false
npm run db:demo:check
npm run ops:demo-readiness
```

Updated command:

```bash
npm run ops:demo-reset
```

`ops:demo-reset` now runs preflight, resets demo data, verifies demo scenario readiness, then runs data integrity checks.

## What is verified

The verifier checks that the database has the expected scenario coverage:

- demo users and roles
- at least 20 members
- active members with future subscriptions
- expired, pending and paused member scenarios
- invoices and active QR/e-card tokens
- at least 10 employees and 5 trainers
- private training sessions, classes and bookings
- 30 warehouse products across at least 3 categories
- suppliers, purchase orders, POS sales and stock movements
- accounting transactions for membership renewals, POS sales, COGS and inventory purchases
- POS/accounting synchronization
- paid invoice/accounting synchronization
- support tickets, notifications and audit logs

## Recommended workflow

```bash
npm ci
npm run db:backup -- --label=before-demo-reset
npm run db:reset-demo -- --confirm=RESET_DEMO_DATA
npm run db:demo:verify
npm run db:integrity -- --json
npm run verify:ci
npm run dev
```

For machine-readable output:

```bash
npm run db:demo:verify -- --json
```

For non-blocking verification during demos:

```bash
npm run db:demo:verify -- --strict=false
```

## Exit behavior

- Critical failed checks return exit code `1` by default.
- Warning checks show `WARN` but do not fail the command unless they are promoted in future rules.
- `--strict=false` keeps the command non-blocking even when critical checks fail, useful for diagnostics.

## Tests

Added:

```bash
tests/demoVerify.test.ts
```

The test validates pass/warn/fail behavior, summary generation and human-readable formatting.
