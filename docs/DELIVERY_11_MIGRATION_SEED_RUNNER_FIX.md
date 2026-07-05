# Delivery 11 - Migration, Diagnosis and Seed Runner Fix

## Problem found from user logs

The remote MySQL network connection was working far enough to resolve DNS and open TCP, but two SQL compatibility issues were blocking setup:

1. `npm run db:diagnose` used `CURRENT_USER() AS current_user`. On the target MariaDB server, aliasing the result as `current_user` caused a parse error because `current_user` is treated as a reserved/special identifier.
2. `npm run db:migrate` applied every `.sql` file under `sql/`, including `009_test_seed_data.sql`. The seed file contained `DELIMITER`, which is supported by the interactive `mysql` client but not by the Node `mysql2` migration runner.

## Changes made

- Changed diagnosis SQL alias to `current_user_name`.
- Updated migration runner to skip seed files by default.
- Added `npm run db:seed` for loading demo data intentionally.
- Converted `009_test_seed_data.sql` to be Node/mysql2 compatible by removing `DELIMITER` and stored procedure usage.
- Added direct seed runner: `scripts/apply-seed.mjs`.

## Correct command order

```bash
npm ci
npm run db:diagnose
npm run db:migrate
npm run db:verify
npm run db:seed
npm run dev
```

## Notes

- `db:migrate` now applies schema files only.
- `db:seed` loads demo/test data.
- The seed remains idempotent and can be re-run; it only cleans/reloads records using the `seed_` prefix.
