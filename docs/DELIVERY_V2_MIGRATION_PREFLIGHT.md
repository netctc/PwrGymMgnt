# V2 migration — preflight and transactional backfill

This is the first increment of Delivery 6. It makes the existing legacy-to-V2
backfill safe to inspect and safe to retry. It does not enable shadow mode and
does not disable or remove any legacy read path.

## Safe sequence

1. Create and verify a database backup.
2. Apply the schema migrations with `npm run db:migrate`.
3. Run the non-mutating inventory:

   ```bash
   npm run db:backfill-v2:dry -- --output=release-evidence/v2-backfill-dry-run.json
   ```

4. Review the source and proposed counts in the evidence file.
5. Apply the transactional backfill in a maintenance window:

   ```bash
   npm run db:backfill-v2 -- --output=release-evidence/v2-backfill-apply.json
   ```

6. Re-run the dry-run. Every proposed count must be zero.

## Guarantees in this increment

- Dry-run performs no DDL and no DML.
- A missing or incompatible V2 schema stops the command and requires the normal
  migration runner; the backfill never renames or creates tables implicitly.
- Apply mode commits the whole batch or rolls the whole batch back.
- Existing `migration_mappings` continue to make reruns idempotent.
- Evidence files use exclusive creation and cannot silently overwrite a prior
  migration record.

Do not activate shadow mode until reconciliation covers contracts, invoices,
affiliations, session balances, and legacy/V2 access decisions.

## Post-backfill structural reconciliation

After the apply and idempotency runs succeed, execute the read-only structural
checkpoint:

```bash
npm run db:reconcile-v2 -- --output=release-evidence/v2-structural-reconciliation.json
```

`PASS` requires complete mappings, existing targets, matching core contract
fields, one holder relationship and one mapped holder affiliation per legacy
subscription. The command never writes to the database and exits with code 2
when it finds a discrepancy. A structural `PASS` does not authorize cutover:
invoice, session-balance and access-decision shadow comparisons remain required.
