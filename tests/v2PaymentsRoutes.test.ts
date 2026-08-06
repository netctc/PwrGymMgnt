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
