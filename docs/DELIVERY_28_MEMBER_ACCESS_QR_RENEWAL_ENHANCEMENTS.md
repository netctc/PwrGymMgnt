# Delivery 28 - Member Access, QR e-Card, and Renewal Enhancements

## Scope
Implemented requested enhancements for the Member section, QR e-card workflow, subscription renewal logic, and new member defaults.

## Member Section
- Added `Last Access` to the member model and MySQL storage.
- Added `Last Access` column in the Member Directory.
- Added read-only `Last Access` field in the member profile sheet.
- Added access filters:
  - All access dates
  - Accessed today
  - Accessed on selected date
- Extended member status filters and member form status values to include:
  - Active
  - Inactive
  - Suspended
  - Canceled
  - Disabled
  - Paused
  - Expired
  - Archived

## QR e-Card
- Removed the manual optional expiry input from the QR workflow.
- Added locked `Expiry Date` field derived from the member's active subscription end date.
- Backend now generates access tokens using the member's active subscription expiry date.
- Added Email and WhatsApp distribution buttons after QR token generation.
- QR generation is blocked when the member has no active subscription expiry date.

## Renew Subscription
- Backend renewal logic now uses the current active subscription expiry date:
  - If current expiry is in the past or missing, new start date is today.
  - If current expiry is in the future, new start date is expiry date + 1 day.
- End date is calculated from start date + selected plan duration.
- The renewal dialog displays locked Start Date and End Date fields.

## New Member Default
- New members now default to `inactive` in both frontend and backend.

## Database Changes
Added migration:

```txt
sql/010_member_access_qr_renewal_enhancements.sql
```

This adds:

```sql
members.last_access_at
```

The QR scanner/access validation endpoint updates `members.last_access_at` after a successful validated access.

## Updated Files
- `server/membership.ts`
- `src/lib/membershipApi.ts`
- `src/pages/Members.tsx`
- `sql/010_member_access_qr_renewal_enhancements.sql`
- `sql/009_test_seed_data.sql`
- `README.md`

## Validation
Syntax transpilation was checked for the modified TypeScript/TSX files.
Run locally after extraction:

```cmd
npm ci
npm run db:migrate
npm run db:verify
npm run build
```
