# Delivery 6 — V2 invoice-link repair

This increment fills only `invoices.subscription_v2_id` for legacy-linked invoices whose migrated V2 subscription is proven by `migration_mappings`.

## Safety properties

- Dry-run is the default and performs no writes.
- `--apply` is required to update data.
- Existing non-null V2 links are never overwritten.
- Missing mappings, incorrect links, orphan mapping targets, or member mismatches block the repair.
- Apply runs in one transaction and verifies the result before commit.
- Evidence files use exclusive creation and are never overwritten.
- Re-running apply is idempotent and updates zero invoices.

This repair does not change invoice totals, currency, status, dates, legacy links, contracts, session balances, or access decisions. It does not enable shadow mode or cutover.
