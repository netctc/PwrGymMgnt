# Delivery 42 - Report Status Filter Test Hotfix

## Purpose

This hotfix updates the automated report SQL test after the Member Expiry / Receipt / Accounting change.

The Members Directory report no longer filters directly with `m.status = ?`. It now filters by the effective member status expression so that a member stored as `active` but with a past subscription expiry is treated as `expired`.

## Fixed

- Updated `tests/reports.test.ts` to assert the derived status SQL expression:
  - `CASE WHEN LOWER(TRIM(m.status)) = 'active' ... THEN 'expired' ELSE m.status END = ?`
- Kept the original safety expectations:
  - date filters are parameterized,
  - status value remains parameterized,
  - search text remains parameterized,
  - unsafe search text is not interpolated into SQL.

## Validation

Run locally:

```bash
npm ci
npm run verify:ci
```

The previous failure:

```txt
AssertionError: expected /m\.status = \?/ but received derived status CASE expression
```

is expected to be resolved by this test update.
