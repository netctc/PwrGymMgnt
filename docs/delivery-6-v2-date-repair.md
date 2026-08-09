# Delivery 6 — Migrated DATE repair

This increment repairs the timezone shift introduced when legacy MySQL `DATE`
values were converted through UTC during the V2 backfill.

1. Preview without mutations:
   `npm run db:repair-v2-dates -- --output=release-evidence/v2-date-repair-dry-run.json`
2. Review the evidence. For the reported migration, `affectedMappings` should be 22.
3. Apply transactionally with a new evidence filename:
   `npm run db:repair-v2-dates -- --apply --output=release-evidence/v2-date-repair-apply.json`
4. Re-run structural reconciliation with a new filename:
   `npm run db:reconcile-v2 -- --output=release-evidence/v2-structural-reconciliation-after-date-repair.json`

The repair updates only `subscriptions` and `affiliations` reached through the
existing `member_subscriptions` migration mappings. It does not modify native
V2 subscriptions. Evidence files are never overwritten.
