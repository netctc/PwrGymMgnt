# Delivery 9 – MySQL Access Fix and Verification

## Issue reported
Members and staff were not being created in the MySQL database from the UI.

## Root causes found

1. **Environment variable mismatch**
   - Some setup instructions used `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
   - The server and migration script only accepted `DATABASE_HOSTNAME`, `DATABASE_USER_NAME`, `DATABASE_PASSWORD`, and `DATABASE_NAME`.
   - Result: the application could appear to run while the MySQL pool was not connected.

2. **Legacy Staff screen compatibility path used update-only behavior**
   - Some older screens still use Firestore-style helpers that are aliased to a MySQL REST compatibility layer.
   - `setDoc()` called `PUT /api/records/:table/:id`.
   - The server previously used SQL `UPDATE` only, which does nothing when the row does not already exist.
   - Result: staff creation could silently create no row.

3. **Staff was historically stored in the `users` collection/table**
   - The Staff page used `users` records with staff roles.
   - The database also has a formal `staff` table.
   - Result: even when data existed, it could be found in `users` instead of the expected `staff` table.

## Fixes implemented

### MySQL environment compatibility
The server, migration script, deployment check, and `.env.example` now support both naming styles:

Preferred:

```env
DATABASE_HOSTNAME=localhost
DATABASE_USER_NAME=root
DATABASE_PASSWORD=your_password
DATABASE_NAME=powergym
```

Compatibility aliases:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=powergym
```

### Generic MySQL compatibility API fixed
The `/api/records/:table` compatibility API now:

- Uses true MySQL persistence.
- Performs `INSERT ... ON DUPLICATE KEY UPDATE` for `PUT` requests.
- Correctly upserts new records created through legacy `setDoc()` code paths.
- Maps `users` staff roles into the `staff` table automatically.
- Keeps `users`, `staff`, and `members` table columns populated, not only JSON `data`.

### Firestore compatibility shim hardened
The local Firestore-style shim now:

- Sends authenticated same-origin requests to the MySQL REST compatibility API.
- Throws errors when MySQL API calls fail.
- Supports `where(..., 'in', [...])` filters used by the Staff page.
- Returns document refs for update flows.

### New SQL migration
Added:

```txt
sql/008_mysql_access_fix.sql
```

This ensures compatibility tables exist for:

- `users`
- `staff`
- `shifts`
- `appSettings`

### New MySQL verification command
Added:

```cmd
npm run db:verify
```

This command connects directly to MySQL and verifies create/read/update access for:

- members
- users/staff
- employees
- subscription plans
- class sessions
- finance transactions
- support tickets
- notifications

The script runs inside a transaction and rolls back the test data, so it does not leave test records behind.

## Files changed

- `server.ts`
- `src/lib/firestore-sql-shim.ts`
- `.env.example`
- `scripts/apply-migrations.mjs`
- `scripts/verify-deployment-env.mjs`
- `scripts/db-env.mjs`
- `scripts/verify-mysql-access.mjs`
- `sql/008_mysql_access_fix.sql`
- `package.json`

## Verification completed in package build

```cmd
npm run lint
npm run build
npm audit
```

Results:

- TypeScript passed.
- Production build passed.
- npm audit found 0 vulnerabilities.

## Required commands after installing this package

```cmd
npm ci
npm run db:migrate
npm run db:verify
npm run dev
```

Then open:

```txt
http://localhost:3000
```

## MySQL tables to check manually

After creating a member from the UI:

```sql
SELECT id, first_name, last_name, email, phone, status, join_date, plan
FROM members
ORDER BY created_at DESC
LIMIT 10;
```

After creating staff from the UI:

```sql
SELECT id, email, role, data
FROM users
ORDER BY created_at DESC
LIMIT 10;

SELECT id, first_name, last_name, email, role, status
FROM staff
ORDER BY created_at DESC
LIMIT 10;
```
