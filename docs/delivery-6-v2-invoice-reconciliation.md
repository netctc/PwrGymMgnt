# Delivery 6 — V2 invoice reconciliation

This read-only gate validates invoices linked to legacy `member_subscriptions` after the V2 contract backfill. It checks mapping coverage, missing or incorrect `subscription_v2_id` values, orphan targets, member ownership, and basic monetary/status integrity.

It never updates invoices. A `PASS` removes only `invoices` from the pending cutover scopes; session balances and access decisions remain mandatory.

Run:

```cmd
npm run db:reconcile-v2-invoices -- --output=release-evidence/v2-invoice-reconciliation.json
```

Exit code `2` means discrepancies were found. Preserve the evidence and do not activate shadow mode or cutover.
