import test from "node:test";
import assert from "node:assert/strict";
import { assertExpectedPaymentDate, formatDisplayDate } from "../server/domain/v2/date";
import { moneyToMinor, subtractMoney } from "../server/domain/v2/money";
import { evaluateCandidates } from "../server/domain/v2/entitlementService";
import type { EntitlementCandidate } from "../server/domain/v2/contracts";

const base: EntitlementCandidate = {
  memberId: "member_1", memberStatus: "active", subscriptionId: "sub_1", affiliationId: "aff_1",
  contractStatus: "active", affiliationStatus: "active", contractStartDate: "2026-08-01", contractEndDate: "2026-08-30",
  affiliationStartDate: "2026-08-01", affiliationEndDate: "2026-08-30", expectedPaymentDate: "2026-08-10",
  amountDue: "100.00", amountPaid: "0.00", currency: "USD", isPrimary: true, consumptionPriority: 0, sessionsRemaining: null,
};

test("all visible business dates use dd/mm/yyyy", () => {
  assert.equal(formatDisplayDate("2026-08-06"), "06/08/2026");
  assert.throws(() => formatDisplayDate("2026-02-30"), /INVALID_BUSINESS_DATE/);
});

test("expected payment date can equal but never exceed period end", () => {
  assert.equal(assertExpectedPaymentDate("2026-08-30", "2026-08-01", "2026-08-30"), "2026-08-30");
  assert.throws(() => assertExpectedPaymentDate("2026-08-31", "2026-08-01", "2026-08-30"), /EXPECTED_PAYMENT_DATE_OUTSIDE_PERIOD/);
});

test("money remains exact without floating point", () => {
  assert.equal(moneyToMinor("100.10"), 10010n);
  assert.equal(subtractMoney("100.10", "0.20"), "99.90");
});

test("pending permits access through expected payment date and overdue blocks next day", () => {
  assert.equal(evaluateCandidates("member_1", [base], "2026-08-10").reasonCode, "PAYMENT_PENDING");
  const blocked = evaluateCandidates("member_1", [base], "2026-08-11");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reasonCode, "PAYMENT_OVERDUE");
});

test("another eligible subscription authorizes a member when one contract is overdue", () => {
  const paid: EntitlementCandidate = { ...base, subscriptionId: "sub_2", affiliationId: "aff_2", amountPaid: "100.00", paymentStatus: "paid", isPrimary: false };
  const decision = evaluateCandidates("member_1", [base, paid], "2026-08-11");
  assert.equal(decision.allowed, true);
  assert.equal(decision.subscriptionId, "sub_2");
});

test("selection across multiple plans is deterministic", () => {
  const a = { ...base, amountPaid: "100.00", paymentStatus: "paid" as const, isPrimary: false, consumptionPriority: 2 };
  const b = { ...a, subscriptionId: "sub_2", affiliationId: "aff_2", consumptionPriority: 1 };
  assert.equal(evaluateCandidates("member_1", [a, b], "2026-08-05").affiliationId, "aff_2");
});
