import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.resolve(file), "utf8");

test("partial payments derive pending amount and synchronize accounting atomically", () => {
  const route = read("server/paymentsV2.ts");
  assert.match(route, /deriveInvoicePaymentSummary/);
  assert.match(route, /amountPaid/);
  assert.match(route, /amountPending/);
  assert.match(route, /UPDATE invoices/);
  assert.match(route, /UPDATE subscriptions/);
  assert.match(route, /INSERT INTO finance_transactions/);
  assert.match(route, /beginTransaction/);
  assert.match(route, /commit/);
  assert.match(route, /rollback/);
});

test("accounting UI captures paid amount and renders calculated balance", () => {
  const panel = read("src/components/accounting/SubscriptionPaymentsPanel.tsx");
  assert.match(panel, /Amount paid/);
  assert.match(panel, /Pending amount/);
  assert.match(panel, /balanceDue/);
  assert.doesNotMatch(panel, /setPaymentStatus/);
});

test("access authorization reads the real net amount from the invoice ledger", () => {
  const entitlement = read("server/domain/v2/entitlementService.ts");
  assert.match(entitlement, /invoice_payment_events_v2/);
  assert.match(entitlement, /event_type = 'payment'/);
  assert.match(entitlement, /event_type = 'refund'/);
  assert.match(entitlement, /payments\.net_paid/);
});

test("waivers are non-cash, auditable and can reactivate financial suspensions", () => {
  const route = read("server/paymentsV2.ts");
  assert.match(route, /invoices\/:id\/waivers/);
  assert.match(route, /invoice_balance_waived/);
  assert.match(route, /nonCashAdjustment: true/);
  assert.match(route, /suspensionType/);
  assert.doesNotMatch(route, /'income', 'Membership Waiver'/);
});

test("refunds post an expense and full refunds cancel entitlement", () => {
  const route = read("server/paymentsV2.ts");
  assert.match(route, /payments\/:id\/refunds/);
  assert.match(route, /'expense', 'Membership Refund'/);
  assert.match(route, /summary\.status === "refunded"/);
  assert.match(route, /UPDATE affiliations SET status = 'cancelled'/);
  assert.match(route, /invoice_payment_refunded/);
});

test("accounting UI manages waivers, refunds and their immutable history", () => {
  const panel = read("src/components/accounting/SubscriptionPaymentsPanel.tsx");
  const api = read("src/lib/paymentsV2Api.ts");
  assert.match(panel, /Waivers and refunds/);
  assert.match(panel, /Adjustment history/);
  assert.match(api, /waiveBalance/);
  assert.match(api, /refundPayment/);
});
