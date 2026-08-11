# Delivery 6 — V2 invoice reconciliation

This read-only gate validates invoices linked to legacy `member_subscriptions` after the V2 contract backfill. It checks mapping coverage, missing or incorrect `subscription_v2_id` values, orphan targets, member ownership, and basic monetary/status integrity.

It never updates invoices. A `PASS` removes only `invoices` from the pending cutover scopes; session balances and access decisions remain mandatory.

When the database contains no legacy-to-V2 migration mappings, migration-link
checks are reported as `not_applicable`. Native legacy and V2 invoice integrity
(foreign keys, member ownership, money fields and status) is still validated;
the command passes only when those checks have no issues.

Run:

```cmd
npm run db:reconcile-v2-invoices -- --output=release-evidence/v2-invoice-reconciliation.json
```

Exit code `2` means discrepancies were found. Preserve the evidence and do not activate shadow mode or cutover.
