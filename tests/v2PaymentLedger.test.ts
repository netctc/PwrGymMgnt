import assert from "node:assert/strict";
import test from "node:test";
import { deriveInvoicePaymentSummary } from "../server/domain/v2/paymentLedger";

test("derives pending, partial and paid without floating point arithmetic", () => {
  const base = { total: "100.10", dueDate: "2026-08-10", today: "2026-08-10" };
  assert.equal(deriveInvoicePaymentSummary(base).status, "pending");
  const partial = deriveInvoicePaymentSummary({ ...base, events: [{ type: "payment", amount: "40.05" }] });
  assert.equal(partial.status, "partial");
  assert.equal(partial.balanceDue, "60.05");
  const paid = deriveInvoicePaymentSummary({ ...base, events: [
    { type: "payment", amount: "40.05" },
    { type: "payment", amount: "60.05" },
  ] });
  assert.equal(paid.status, "paid");
  assert.equal(paid.balanceDue, "0.00");
});

test("becomes overdue only after the due date, with no grace day", () => {
  assert.equal(deriveInvoicePaymentSummary({ total: "50.00", dueDate: "2026-08-10", today: "2026-08-10" }).status, "pending");
  assert.equal(deriveInvoicePaymentSummary({ total: "50.00", dueDate: "2026-08-10", today: "2026-08-11" }).status, "overdue");
});

test("derives waived and refunded and rejects invalid settlement", () => {
  assert.equal(deriveInvoicePaymentSummary({
    total: "50.00", dueDate: "2026-08-10", today: "2026-08-10",
    events: [{ type: "waive", amount: "50.00" }],
  }).status, "waived");
  assert.equal(deriveInvoicePaymentSummary({
    total: "50.00", dueDate: "2026-08-10", today: "2026-08-10",
    events: [{ type: "payment", amount: "50.00" }, { type: "refund", amount: "50.00" }],
  }).status, "refunded");
  assert.throws(() => deriveInvoicePaymentSummary({
    total: "50.00", dueDate: "2026-08-10", today: "2026-08-10",
    events: [{ type: "refund", amount: "1.00" }],
  }), /REFUND_EXCEEDS_COLLECTED_AMOUNT/);
});
