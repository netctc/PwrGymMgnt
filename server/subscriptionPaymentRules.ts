import type { Pool, PoolConnection } from "mysql2/promise";

export const PAYMENT_STATUSES = new Set([
  "pending",
  "partial",
  "paid",
  "overdue",
  "waived",
  "refunded",
]);

export const OUTSTANDING_PAYMENT_STATUSES = ["pending", "partial", "overdue"] as const;

export function normalizePaymentStatus(value: unknown, fallback = "pending") {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!status) return fallback;
  if (!PAYMENT_STATUSES.has(status)) {
    throw Object.assign(new Error("Invalid subscription payment status"), {
      status: 400,
      code: "INVALID_PAYMENT_STATUS",
    });
  }
  return status;
}

export type OutstandingSubscriptionPayment = {
  subscriptionId: string;
  paymentStatus: string;
  subscriptionStatus: string;
  endDate: string | null;
  planName: string | null;
};

export async function findOutstandingSubscriptionPayment(
  db: Pool | PoolConnection,
  memberId: string,
  excludeSubscriptionId?: string,
): Promise<OutstandingSubscriptionPayment | null> {
  const params: string[] = [memberId, memberId];
  let exclusion = "";
  if (excludeSubscriptionId) {
    exclusion = "AND s.id <> ?";
    params.push(excludeSubscriptionId);
  }
  const [rows]: any = await db.query(
    `SELECT s.id, s.payment_status, s.status AS subscription_status,
            s.end_date, pv.name AS plan_name
       FROM subscriptions s
       LEFT JOIN subscription_members sm
         ON sm.subscription_id = s.id
        AND sm.member_id = ?
        AND sm.status IN ('active', 'suspended', 'removed')
       LEFT JOIN plan_versions pv ON pv.id = s.plan_version_id
      WHERE (s.holder_member_id = ? OR sm.member_id IS NOT NULL)
        AND s.payment_status IN ('pending', 'partial', 'overdue')
        ${exclusion}
      ORDER BY s.created_at DESC
      LIMIT 1`,
    params,
  );
  if (!rows.length) return null;
  return {
    subscriptionId: rows[0].id,
    paymentStatus: rows[0].payment_status,
    subscriptionStatus: rows[0].subscription_status,
    endDate: rows[0].end_date ? String(rows[0].end_date).slice(0, 10) : null,
    planName: rows[0].plan_name || null,
  };
}

export async function assertNoOutstandingSubscriptionPayment(
  db: Pool | PoolConnection,
  memberId: string,
  excludeSubscriptionId?: string,
) {
  const outstanding = await findOutstandingSubscriptionPayment(
    db,
    memberId,
    excludeSubscriptionId,
  );
  if (outstanding) {
    throw Object.assign(
      new Error(
        `Outstanding payment for ${outstanding.planName || "a previous subscription"} must be settled before subscribing or renewing`,
      ),
      {
        status: 409,
        code: "OUTSTANDING_SUBSCRIPTION_PAYMENT",
        subscriptionId: outstanding.subscriptionId,
        paymentStatus: outstanding.paymentStatus,
      },
    );
  }
}
