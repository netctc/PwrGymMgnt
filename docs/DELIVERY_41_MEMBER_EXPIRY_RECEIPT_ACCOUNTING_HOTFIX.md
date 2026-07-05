# Delivery 41 - Member expiry, receipt link, and accounting posting hotfix

## Scope

This hotfix addresses four operational membership issues:

1. Member Directory now displays an **Expiry** column.
2. A member whose stored status is `active` but whose subscription expiry date is in the past is shown as **expired** in the membership UI and member-directory PDF.
3. The member profile now exposes a **Last Receipt** card and per-invoice **Receipt PDF** download action.
4. Membership renewal and invoice payment now create/update an income transaction in `finance_transactions` so membership payments are visible in Accounting.

## Backend changes

- `server/membership.ts`
  - Added `currentExpiry` to mapped members.
  - Added derived member status logic: active + past expiry is returned as `expired`.
  - Updated member list and member detail queries to include latest subscription expiry.
  - Added `GET /api/membership/invoices/:id/receipt.pdf`.
  - Added PDF receipt generation for invoices/subscription renewals.
  - Added `insertMembershipRenewalFinanceTransaction()`.
  - Subscription renewal now inserts an income transaction with:
    - `type = income`
    - `category = Membership Renewal`
    - `source = membership`
    - `reference_type = membership_invoice`
    - `reference_id = invoice.id`
  - Marking an invoice paid also creates/updates the linked finance transaction.
  - Ensures `finance_transactions` exists before membership operations use it.

- `server/reports.ts`
  - Members Directory PDF includes the expiry column and derived status.

## Frontend changes

- `src/lib/membershipApi.ts`
  - Added `currentExpiry` to `MembershipMember`.
  - Added `downloadInvoiceReceipt()`.

- `src/pages/Members.tsx`
  - Added **Expiry** column to Member Directory.
  - Status badge uses derived status client-side as a safeguard.
  - Member Profile shows expiry.
  - Member Profile shows **Last Receipt** with PDF download.
  - Invoice list includes **Receipt PDF** per invoice.

## Expected behavior

- Renewing a subscription extends the expiry, updates the member plan/status, creates an invoice, and creates a matching Accounting income transaction.
- If an active member's expiry is in the past, the UI shows the member as expired instead of active.
- The latest receipt can be downloaded from the View Member screen.

## Verification

Run in the target environment:

```bash
npm ci
npm run verify:ci
```

Manual smoke test:

1. Open Members.
2. Confirm the new Expiry column appears.
3. Renew a member subscription.
4. Open View Member and download Last Receipt PDF.
5. Open Accounting and confirm a Membership Renewal income transaction appears.
6. Test a member with past expiry and stored active status; it should display as expired.
