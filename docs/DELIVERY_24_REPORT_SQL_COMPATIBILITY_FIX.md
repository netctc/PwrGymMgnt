# Delivery 24 – Report SQL Compatibility Fix

## Scope

This delivery fixes SQL compatibility errors in the application PDF reports on deployed MySQL/MariaDB environments.

## Fixed Issues

### Plans, Subscriptions & Invoices PDF

Previous error:

```txt
Column 'status' in SELECT is ambiguous
```

Cause: the invoice PDF query joined `invoices` and `members`, and both tables can contain a `status` column. The query selected `status` without a table alias.

Fix: all invoice fields are now fully qualified with the `i.` invoice alias, including `i.status`, `i.total`, `i.created_at`, etc.

### Support & Notifications PDF

Previous error:

```txt
Unknown column 'category' in 'SELECT'
```

Cause: the real `support_tickets` schema uses `inquiry_type`, not `category`.

Fix: the report now selects:

```sql
st.inquiry_type AS category
```

so the PDF column label remains `Category` while the SQL matches the database schema.

### Notifications PDF Compatibility

The report also now uses the deployed notification schema:

```sql
COALESCE(n.user_id, n.role, 'all') AS recipient_user_id
n.type AS priority
```

This avoids dependency on non-existing `recipient_user_id` and `priority` columns.

## Changed Files

- `server/reports.ts`
- `docs/DELIVERY_24_REPORT_SQL_COMPATIBILITY_FIX.md`

## Deployment

No database migration is required.

Deploy to Render with the existing settings:

```txt
Build Command:
npm run render:build && npm run render:predeploy

Start Command:
npm run render:start
```

## Validation

After deployment, test these PDF downloads:

- Reports > Plans, Subscriptions & Invoices
- Reports > Support & Notifications
- Any direct links:
  - `/api/reports/plans-subscriptions.pdf`
  - `/api/reports/support.pdf`
