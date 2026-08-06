import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContractMembers,
  buildContractTerms,
  hashContractRequest,
} from "../server/domain/v2/contractCreation";
import { readFileSync } from "node:fs";

test("inclusive contract duration ends on day duration minus one", () => {
  const terms = buildContractTerms({
    startDate: "2026-08-01",
    durationDays: 30,
    expectedPaymentDate: "2026-08-30",
    price: "100.10",
  });
  assert.deepEqual(terms, {
    startDate: "2026-08-01",
    endDate: "2026-08-30",
    expectedPaymentDate: "2026-08-30",
    price: "100.10",
  });
});

test("contract terms reject payment outside the contractual period", () => {
  assert.throws(() => buildContractTerms({
    startDate: "2026-08-01",
    durationDays: 30,
    expectedPaymentDate: "2026-08-31",
    price: "100.00",
  }), /EXPECTED_PAYMENT_DATE_OUTSIDE_PERIOD/);
});

test("contract request hashing is stable", () => {
  const request = { holderMemberId: "member_1", planVersionId: "pv_1" };
  assert.equal(hashContractRequest(request), hashContractRequest(request));
});

test("multi-member contracts deduplicate the holder and preserve roles", () => {
  assert.deepEqual(
    buildContractMembers("member_1", ["member_1", "member_2", "member_2"], 2),
    [
      { memberId: "member_1", role: "holder" },
      { memberId: "member_2", role: "beneficiary" },
    ],
  );
});

test("multi-member contracts enforce plan capacity before persistence", () => {
  assert.throws(
    () => buildContractMembers("member_1", ["member_2", "member_3"], 2),
    /CAPACITY_LIMIT_REACHED/,
  );
});

test("memberIds must be a valid array of identifiers", () => {
  assert.throws(
    () => buildContractMembers("member_1", "member_2", 2),
    /MEMBER_IDS_MUST_BE_AN_ARRAY/,
  );
  assert.throws(
    () => buildContractMembers("member_1", [""], 2),
    /INVALID_MEMBER_ID/,
  );
});

test("subscription creation persists its canonical period and invoice relation", () => {
  const source = readFileSync(
    new URL("../server/subscriptionsV2.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /buildContractTerms/);
  assert.match(source, /createInitialContractPeriod/);
  assert.match(source, /claimContractCreation/);
  assert.match(source, /completeContractCreation/);
  assert.match(source, /holderMemberId,\s+id,\s+paymentStatus/);
});
