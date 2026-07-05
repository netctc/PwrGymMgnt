# Delivery 37 - QR e-card subscription expiry hotfix

## Problem

Clicking **Generate e-Card Token** could return:

```text
Member has no active subscription expiry date for QR e-card
```

even when the member was active and had a future expiry date.

## Root cause

The hardened e-card token flow introduced in Phase 1 only checked the newer `member_subscriptions` table with strict filters:

- exact lowercase `status = 'active'`,
- mandatory `start_date <= CURDATE()`,
- mandatory `end_date >= CURDATE()`.

Some deployments still have valid membership expiry data in the legacy `subscriptions` table, or use status casing such as `Active`. In those cases, the UI/member record could show a valid future expiry, while the e-card token endpoint rejected the member because it only trusted one table and one exact status format.

## Fix

Added `loadCurrentEcardSubscription()` in `server/membership.ts` and reused it across e-card flows.

The lookup now:

1. Checks `member_subscriptions` first.
2. Uses case-insensitive active status matching with `LOWER(TRIM(status)) = 'active'`.
3. Accepts nullable `start_date` while still requiring a valid future/current `end_date`.
4. Falls back to the legacy `subscriptions` table when no active structured subscription is found.
5. Normalizes the legacy row into the same shape expected by PDF/e-card code.

Updated flows:

- `POST /api/membership/members/:id/access-token`
- `POST /api/membership/members/:id/ecard/pdf`
- `POST /api/membership/members/:id/ecard/deliver`
- `POST /api/membership/validate-access`

Also made active member checks case-insensitive for e-card validation paths.

## Regression tests

Added `tests/membershipEcard.test.ts` covering:

- valid future expiry in `member_subscriptions`,
- fallback to legacy `subscriptions`,
- `null` result when no valid future active subscription exists.

Updated `npm run test` and `npm run test:ci` to include the new test file.

## Verification

Executed successfully:

```bash
npm ci --ignore-scripts
npm run lint
npm run test:ci
npm run build
npm run audit
```

Results:

- lint: OK
- test:ci: OK, 38/38 tests
- build: OK
- audit: OK, 0 vulnerabilities

## Operational note

If a member still fails after this hotfix, check that the member has either:

- an `active` row in `member_subscriptions`, or
- an `active` row in legacy `subscriptions`,

with `end_date` today or in the future. Future `end_date` is required for QR/e-card issuance.
