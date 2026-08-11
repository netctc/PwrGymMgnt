# Delivery 6 — V2 access-decision shadow reconciliation

This read-only command compares the effective legacy membership rule with the
V2 contract, affiliation and payment rule for every migrated subscription.
It does not call the authorization endpoint, write access attempts, claim a
cooldown, consume sessions or send an opening command.

Run:

```cmd
npm run db:reconcile-v2-access-decisions -- --output=release-evidence/v2-access-decision-shadow.json
type release-evidence\v2-access-decision-shadow.json
```

`PASS` means every complete migrated mapping produced the same allow/deny
outcome. It makes the migration evidence eligible for a separately controlled
cutover; it does not itself change runtime routing or remove legacy fallback.

For a clean native V2 dataset with zero migration mappings, the comparison is
reported as `PASS` with `applicability: not_applicable`: there is no legacy/V2
pair to compare, and zero rows is not a discrepancy.

`BLOCKED` means the JSON must be reviewed before any rollout. Do not edit data
or enable cutover merely to force a match.

Blocked evidence includes a `mismatches` array with technical mapping IDs,
individual V2 rule outcomes and normalized denial reasons. It intentionally
excludes member names and contact details. Use this detail to diagnose the
rule difference before changing data or enabling cutover.
