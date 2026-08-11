# Delivery 6 — V2 operational test-data reset

This reset keeps all existing identity, workforce and configuration records: `admin_users`, `users`, `staff`, `employees`, roles, permission overrides, HR departments/job titles, settings, feature flags and access points. It deletes and regenerates operational demo records only.

## Safety contract

- Run only against a database containing test data.
- Take and verify a backup first.
- The command requires both the literal `RESET_DEMO_DATA` confirmation and the exact database name.
- Deletion and insertion use one transaction. A seed failure rolls the operational changes back.
- The reset never changes existing password hashes.
- Existing active trainers are reused by class and PT examples.
- Invoice links are validated before any database connection: legacy invoices
  use `subscription_id`, while V2 invoices use `subscription_v2_id`.

## Windows CMD procedure

Replace `pwrgymdb` if the configured `DB_NAME` is different.

```cmd
npm run db:backup
npm run db:reset-test-data -- --dry-run --confirm=RESET_DEMO_DATA --database=pwrgymdb --json
npm run db:reset-test-data -- --confirm=RESET_DEMO_DATA --database=pwrgymdb --backup-confirmed
npm run db:verify-test-data
```

Then run the V2 checks:

```cmd
npm run db:reconcile-v2-invoices -- --output=release-evidence/v2-invoices-after-test-reset.json
npm run db:reconcile-v2-session-balances -- --output=release-evidence/v2-session-balances-after-test-reset.json
```

The old migration shadow compares legacy mappings and is not a cutover requirement for a clean V2-only dataset. Do not reuse old `migration_mappings` or old reconciliation evidence after the reset.
