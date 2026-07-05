# Delivery 45 - Demo Database Reset and Full Scenario Dataset

## Purpose

Adds a controlled reset/seed utility that recreates a complete PowerGym demo database for testing all core workflows after the Warehouse, Inventory and POS module.

The tool is intentionally destructive and requires an explicit confirmation flag.

## New command

```bash
npm run db:reset-demo -- --confirm=RESET_DEMO_DATA
```

Convenience alias:

```bash
npm run db:demo
```

Dry-run preview:

```bash
npm run db:reset-demo -- --confirm=RESET_DEMO_DATA --dry-run --json
```

Skip migrations if the schema is already current:

```bash
npm run db:reset-demo -- --confirm=RESET_DEMO_DATA --skip-migrations
```

Production guard:

- The script refuses to run when `NODE_ENV=production` unless `--allow-production` is explicitly passed.
- Use `--allow-production` only for a controlled demo environment, never for a real customer database.

## What it resets

The script truncates operational/demo tables, including membership, subscriptions, invoices, access tokens, classes, bookings, HR/payroll, finance, support, notifications, platform audit tables, warehouse products, suppliers, POs, stock movements and POS sales.

It does not drop the schema. It runs migrations first by default to ensure all required tables exist.

## Dataset created

### Access accounts

All demo users use this password:

```text
PowerGym@2026!
```

Seeded roles:

- `superadmin@powergym.demo` - super_admin
- `admin@powergym.demo` - admin
- `manager@powergym.demo` - manager
- `accounting@powergym.demo` - accounting
- `warehouse.manager@powergym.demo` - warehouse_manager
- `cashier@powergym.demo` - cashier
- `reception@powergym.demo` - reception
- `trainer@powergym.demo` - trainer

### Membership

- 20 members.
- Active, expired, paused and pending scenarios.
- 5 subscription plans.
- Structured `member_subscriptions` plus legacy `subscriptions` compatibility rows.
- Paid, issued and overdue invoices.
- QR/e-card access tokens for active members.
- Last access timestamps for the member directory.

### HR and scheduling

- 10 employees.
- 5 trainers.
- Staff rows mapped to application roles.
- Employee attendance samples.
- Payroll run and payroll items.
- 6 group class sessions.
- 24 class bookings.
- 10 private training sessions.

### Warehouse, inventory and POS

- 6 suppliers.
- 30 products across 3 categories:
  - Supplements
  - Equipment
  - Apparel
- SKU and barcode data.
- Cost, retail, wholesale and member pricing.
- Low-stock, out-of-stock, overstock-ready and expiring item scenarios.
- Product batches for lot/expiry testing.
- Purchase orders in `pending`, `shipped`, `received` and `invoiced` states.
- Purchase order items.
- POS sales with line items and payment methods.
- Stock movements for received POs and POS sales.
- Pricing rules/promotions.

### Accounting and finance

Creates finance transactions for:

- Membership renewals.
- POS income.
- Cost of Goods Sold.
- Inventory purchases.
- Payroll.
- Rent.
- Utilities.
- Private training income.

Also seeds budgets, loan, rental and recurring entries.

### Support, notifications and audit

- Support tickets and messages.
- Notifications and preferences.
- Security audit events.
- Security events.
- Audit log entries.

## Recommended reset workflow

```bash
npm ci
npm run db:backup -- --label=before-demo-reset
npm run db:reset-demo -- --confirm=RESET_DEMO_DATA
npm run db:integrity -- --json
npm run verify:ci
npm run dev
```

If MySQL client tools are not installed, `db:backup` may fail because `mysqldump` is unavailable. Configure `MYSQLDUMP_PATH` or install MySQL Client Tools before running a real backup.

## Smoke tests after reset

1. Login as `superadmin@powergym.demo` using `PowerGym@2026!`.
2. Open Members and verify 20 members, mixed statuses and expiry dates.
3. Open a member profile and confirm invoice/receipt data.
4. Open QR Access and validate an active demo token from the seeded `access_tokens.data.demoRawToken` value if needed.
5. Open HR/Payroll and verify 10 employees and payroll data.
6. Open Classes and Private PT and verify scheduled sessions/bookings.
7. Open Warehouse and verify 30 products, suppliers, POs and POS sales.
8. Open Accounting and verify POS Sales, COGS, Membership Renewal, Inventory Purchase, Payroll, Rent and Utilities entries.
9. Export reports from Reports and Warehouse.
10. Run `npm run db:integrity -- --json` and review any intentional warning scenarios.

## Files changed

- `scripts/db-reset-demo.mjs`
- `package.json`
- `docs/DELIVERY_45_DEMO_DATABASE_RESET_DATASET.md`
