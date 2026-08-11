import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertNoOutstandingSubscriptionPayment,
  findOutstandingSubscriptionPayment,
} from "../server/subscriptionPaymentRules";

const read = (path: string) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("outstanding payment lookup includes active and inactive subscriptions", async () => {
  const calls: Array<{ sql: string; params: string[] }> = [];
  const db = {
    async query(sql: string, params: string[]) {
      calls.push({ sql, params });
      return [[{
        id: "sub_pending",
        payment_status: "pending",
        subscription_status: "inactive",
        end_date: "2026-08-31",
        plan_name: "Gold",
      }]];
    },
  } as any;

  const result = await findOutstandingSubscriptionPayment(db, "member_1");
  assert.deepEqual(result, {
    subscriptionId: "sub_pending",
    paymentStatus: "pending",
    subscriptionStatus: "inactive",
    endDate: "2026-08-31",
    planName: "Gold",
  });
  assert.doesNotMatch(calls[0].sql, /s\.status\s*=/);
  assert.deepEqual(calls[0].params, ["member_1", "member_1"]);
});

test("existing strict payment guard keeps its previous behavior", async () => {
  const db = {
    async query() {
      return [[{
        id: "sub_pending",
        payment_status: "pending",
        subscription_status: "active",
        end_date: "2026-08-31",
        plan_name: "Gold",
      }]];
    },
  } as any;

  await assert.rejects(
    () => assertNoOutstandingSubscriptionPayment(db, "member_1"),
    (error: any) =>
      error.code === "OUTSTANDING_SUBSCRIPTION_PAYMENT" &&
      error.subscriptionId === "sub_pending",
  );
});

test("new subscription flows require explicit confirmation and audit both decisions", () => {
  const subscriptions = read("server/subscriptionsV2.ts");
  const planManagement = read("server/planManagement.ts");
  const members = read("src/pages/Members.tsx");
  const wizard = read("src/pages/HybridSubscriptionWizard.tsx");
  const subscriptionsApi = read("src/lib/subscriptionsV2Api.ts");
  const planManagementApi = read("src/lib/planManagementApi.ts");
  const server = read("server.ts");

  assert.match(subscriptions, /OUTSTANDING_SUBSCRIPTION_PAYMENT_CONFIRMATION_REQUIRED/);
  assert.match(subscriptions, /subscription_created_with_pending_payment_confirmed/);
  assert.match(subscriptions, /subscription_creation_with_pending_payment_cancelled/);
  assert.match(planManagement, /multi_user_subscription_created_with_pending_payment_confirmed/);
  assert.match(members, /recordPendingPaymentDecision/);
  assert.match(members, /confirmOutstandingPayment: true/);
  assert.match(wizard, /pendingPaymentWarning/);
  assert.match(wizard, /recordPendingPaymentDecision/);
  assert.match(wizard, /confirmOutstandingPayment: true/);
  assert.match(subscriptionsApi, /typeof apiError === 'string'/);
  assert.match(planManagementApi, /typeof apiError === "string"/);
  assert.match(server, /code: err\?\.code \|\| null/);
});
