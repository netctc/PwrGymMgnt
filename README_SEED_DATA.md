# PowerGym Management - Test Seed Data

This package contains a MySQL seed file for the PowerGym Management project.

## File

- `sql/009_test_seed_data.sql`

## What it loads

- 20 members with different states and subscription validity cases
- Staff/users/employees with one record for each main role/category
- Subscription plans, subscriptions, invoices, and QR access tokens
- Group classes, bookings, private classes, trainers, rooms, and staff shifts
- HR attendance, payroll run/items, accounting/finance records
- Settings, notifications, support tickets, deployment checklist, and audit/security samples

## How to run

Run this after applying migrations:

```cmd
cd C:\Users\MA\Desktop\dev\PowerGymManagement
npm run db:migrate
mysql -u root -p powergym < sql\009_test_seed_data.sql
```

If your database name is different, replace `powergym` with your DB name.

The file is idempotent: it removes and reloads only records with the `seed_` prefix, plus `settings.general` for demo configuration.
