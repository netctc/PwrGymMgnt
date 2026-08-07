/**
 * Subscription Lifecycle — Freeze, suspend, cancel, change plan, renew.
 *
 * Handles state transitions for subscriptions and their affiliations.
 * All operations are transactional and auditable.
 */

import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import { requirePermission } from "./rbac";
import { isFeatureEnabled } from "./featureFlags";
import {
  assertNoOutstandingSubscriptionPayment,
  normalizePaymentStatus,
  OUTSTANDING_PAYMENT_STATUSES,
} from "./subscriptionPaymentRules";
import { upsertTrainerPlanCommission } from "./trainerCommissions";
import { minorToMoney, moneyToMinor } from "./domain/v2/money";

type PoolProvider = () => Pool | null;
type AuthenticatedRequest = Request & { user?: { uid?: string; email?: string; role?: string } };

function createId(prefix: string) {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

function createInvoiceNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `INV-${stamp}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function requirePool(poolProvider: PoolProvider) {
  const pool = poolProvider();
  if (!pool) throw Object.assign(new Error("Database not connected"), { status: 503 });
  return pool;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  active: ["suspended", "frozen", "cancelled", "expired"],
  suspended: ["active", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [], // terminal
  expired: ["active"], // renewal
  pending: ["active", "cancelled"],
};

export function registerSubscriptionLifecycleRoutes(app: Express, poolProvider: PoolProvider) {

  // Freeze subscription (temporary pause — preserves balance)
  app.post("/api/v2/subscriptions/:id/freeze", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await isFeatureEnabled(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL")) return res.status(404).json({ error: "Feature not enabled" });

      const result = await transitionSubscription(pool, req.params.id, "frozen", normalizeString(req.body.reason) || "Administrative freeze", req.user?.email);
      res.json(result);
    } catch (error) { next(error); }
  });

  // Suspend subscription (payment issue — blocks access)
  app.post("/api/v2/subscriptions/:id/suspend", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await isFeatureEnabled(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL")) return res.status(404).json({ error: "Feature not enabled" });

      const result = await transitionSubscription(pool, req.params.id, "suspended", normalizeString(req.body.reason) || "Payment suspended", req.user?.email);
      res.json(result);
    } catch (error) { next(error); }
  });

  // Reactivate subscription
  app.post("/api/v2/subscriptions/:id/reactivate", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await isFeatureEnabled(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL")) return res.status(404).json({ error: "Feature not enabled" });

      const result = await transitionSubscription(pool, req.params.id, "active", normalizeString(req.body.reason) || "Reactivated", req.user?.email);
      res.json(result);
    } catch (error) { next(error); }
  });

  // Cancel subscription
  app.post("/api/v2/subscriptions/:id/cancel", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await isFeatureEnabled(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL")) return res.status(404).json({ error: "Feature not enabled" });

      const result = await transitionSubscription(pool, req.params.id, "cancelled", normalizeString(req.body.reason) || "Cancelled by admin", req.user?.email);

      // Cancel all active affiliations
      await pool.query(
        "UPDATE affiliations SET status = 'cancelled', updated_at = NOW() WHERE subscription_id = ? AND status IN ('active', 'frozen', 'suspended')",
        [req.params.id],
      );

      // Cancel future bookings
      await pool.query(
        `UPDATE class_bookings SET status = 'cancelled', cancelled_at = NOW()
         WHERE member_id IN (SELECT member_id FROM subscription_members WHERE subscription_id = ? AND status = 'active')
           AND status = 'booked'
           AND class_id IN (SELECT id FROM class_sessions WHERE start_time > NOW())`,
        [req.params.id],
      );

      res.json(result);
    } catch (error) { next(error); }
  });

  // Schedule a plan change for the next cycle. The current contract is immutable.
  app.post("/api/v2/subscriptions/:id/change-plan", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await isFeatureEnabled(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL")) return res.status(404).json({ error: "Feature not enabled" });

      const newPlanVersionId = normalizeString(req.body.planVersionId);
      if (!newPlanVersionId) return res.status(400).json({ error: "planVersionId is required" });

      // Verify new plan exists
      const [pvRows]: any = await pool.query("SELECT * FROM plan_versions WHERE id = ? AND status = 'active'", [newPlanVersionId]);
      if (pvRows.length === 0) return res.status(404).json({ error: "Plan version not found" });
      const newPlan = pvRows[0];

      // Get current subscription
      const [subRows]: any = await pool.query("SELECT * FROM subscriptions WHERE id = ? AND status = 'active'", [req.params.id]);
      if (subRows.length === 0) return res.status(404).json({ error: "Active subscription not found" });
      const subscription = subRows[0];
      if (newPlanVersionId === subscription.plan_version_id) {
        return res.status(409).json({ error: "The selected plan is already active", code: "PLAN_ALREADY_ACTIVE" });
      }
      const [memberRows]: any = await pool.query(
        `SELECT COUNT(*) AS member_count FROM subscription_members
          WHERE subscription_id = ? AND status IN ('active', 'suspended')`,
        [req.params.id],
      );
      const memberCount = Number(memberRows[0]?.member_count || 0);
      const maximumMembers = Math.max(1, Number(newPlan.max_members || 1));
      if (memberCount > maximumMembers) {
        return res.status(409).json({
          error: `Selected plan allows ${maximumMembers} member(s), but this subscription currently has ${memberCount}`,
          code: "PLAN_CAPACITY_EXCEEDED",
        });
      }
      const currentEndDate = normalizeDate(subscription.end_date instanceof Date
        ? subscription.end_date.toISOString().slice(0, 10)
        : subscription.end_date);
      if (!currentEndDate) return res.status(409).json({ error: "The current subscription end date is invalid" });
      const effective = new Date(`${currentEndDate}T00:00:00.000Z`);
      effective.setUTCDate(effective.getUTCDate() + 1);
      const effectiveDate = effective.toISOString().slice(0, 10);
      const reason = normalizeString(req.body.reason) || "Plan change scheduled by admin";

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        await connection.query(
          `UPDATE subscriptions
              SET data = JSON_SET(COALESCE(data, JSON_OBJECT()),
                    '$.scheduledPlanVersionId', ?, '$.scheduledPlanId', ?,
                    '$.scheduledPlanName', ?, '$.scheduledPlanEffectiveDate', ?,
                    '$.scheduledPlanReason', ?),
                  version = version + 1, updated_at = NOW()
            WHERE id = ?`,
          [newPlanVersionId, newPlan.plan_id, newPlan.name, effectiveDate, reason, req.params.id],
        );

        await connection.query(
          `INSERT INTO subscription_member_history
            (id, subscription_id, member_id, action, performed_by, details)
           VALUES (?, ?, ?, 'plan_change_scheduled', ?, ?)`,
          [createId("smh"), req.params.id, subscription.holder_member_id,
           req.user?.email || req.user?.uid || null,
           JSON.stringify({ fromPlanVersionId: subscription.plan_version_id, toPlanVersionId: newPlanVersionId, effectiveDate, reason })],
        );

        // Log the change
        await connection.query(
          "INSERT INTO outbox_events (id, event_type, payload, status) VALUES (?, 'plan_changed', ?, 'pending')",
          [createId("evt"), JSON.stringify({ subscriptionId: req.params.id, currentPlanVersionId: subscription.plan_version_id, newPlanVersionId, effectiveDate, reason, changedBy: req.user?.email })],
        );

        await connection.commit();
        res.json({ ok: true, subscriptionId: req.params.id, currentPlanVersionId: subscription.plan_version_id, scheduledPlanVersionId: newPlanVersionId, effectiveDate });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) { next(error); }
  });

  // Renew subscription
  app.post("/api/v2/subscriptions/:id/renew", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await isFeatureEnabled(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL")) return res.status(404).json({ error: "Feature not enabled" });

      const [subRows]: any = await pool.query(
        `SELECT s.*, pv.name AS plan_name,
                holder.first_name AS holder_first_name,
                holder.last_name AS holder_last_name
           FROM subscriptions s
           LEFT JOIN plan_versions pv ON pv.id = s.plan_version_id
           LEFT JOIN members holder ON holder.id = s.holder_member_id
          WHERE s.id = ?`,
        [req.params.id],
      );
      if (subRows.length === 0) return res.status(404).json({ error: "Subscription not found" });
      const sub = subRows[0];
      const confirmOutstandingPayment = req.body.confirmOutstandingPayment === true;
      let outstandingPayment: Record<string, unknown> | null =
        OUTSTANDING_PAYMENT_STATUSES.includes(sub.payment_status)
          ? {
              subscriptionId: sub.id,
              paymentStatus: sub.payment_status,
              source: "current_subscription",
            }
          : null;
      try {
        await assertNoOutstandingSubscriptionPayment(
          pool,
          sub.holder_member_id,
          req.params.id,
        );
      } catch (error: any) {
        if (error?.code !== "OUTSTANDING_SUBSCRIPTION_PAYMENT") throw error;
        outstandingPayment = {
          subscriptionId: error.subscriptionId,
          paymentStatus: error.paymentStatus,
          source: "another_subscription",
        };
      }
      if (outstandingPayment && !confirmOutstandingPayment) {
        return res.status(409).json({
          error: "The current subscription payment must be settled or explicitly confirmed before renewal",
          code: "OUTSTANDING_SUBSCRIPTION_PAYMENT",
          ...outstandingPayment,
          confirmationRequired: true,
        });
      }
      const requestedPaymentStatus = normalizeString(req.body.paymentStatus).toLowerCase();
      if (!["paid", "partial", "pending"].includes(requestedPaymentStatus)) {
        return res.status(400).json({
          error: "paymentStatus is required and must be paid, partial or pending",
        });
      }
      const renewalPaymentStatus = normalizePaymentStatus(requestedPaymentStatus);

      const subscriptionData = typeof sub.data === "string" ? JSON.parse(sub.data || "{}") : sub.data || {};
      const scheduledPlanVersionId = normalizeString(subscriptionData.scheduledPlanVersionId);
      const requestedPlanVersionId =
        normalizeString(req.body.planVersionId) || scheduledPlanVersionId || sub.plan_version_id;
      const [pvRows]: any = await pool.query(
        `SELECT id, plan_id, name, duration_days, price, currency,
                max_members, status
           FROM plan_versions
          WHERE id = ?`,
        [requestedPlanVersionId],
      );
      if (pvRows.length === 0) {
        return res.status(404).json({ error: "Plan version not found" });
      }
      const renewalPlan = pvRows[0];
      if (
        requestedPlanVersionId !== sub.plan_version_id &&
        renewalPlan.status !== "active"
      ) {
        return res.status(409).json({ error: "Selected plan is not active" });
      }
      const amount = Number(renewalPlan.price || 0);
      const totalMinor = moneyToMinor(renewalPlan.price || 0);
      let paidMinor = renewalPaymentStatus === "paid" ? totalMinor : 0n;
      if (renewalPaymentStatus === "partial") {
        try {
          paidMinor = moneyToMinor(req.body.amountPaid);
        } catch {
          return res.status(400).json({ error: "amountPaid must be a valid monetary amount", code: "INVALID_PARTIAL_PAYMENT_AMOUNT" });
        }
        if (paidMinor <= 0n || paidMinor >= totalMinor) {
          return res.status(400).json({ error: "amountPaid must be greater than zero and lower than the invoice total", code: "INVALID_PARTIAL_PAYMENT_AMOUNT" });
        }
      }
      const amountPaid = minorToMoney(paidMinor);
      const amountPending = minorToMoney(totalMinor - paidMinor);
      const paymentMethod = normalizeString(req.body.paymentMethod);
      const paymentReference = normalizeString(req.body.paymentReference);
      const paymentNotes = normalizeString(req.body.paymentNotes);
      if (paidMinor > 0n && (!paymentMethod || !paymentReference)) {
        return res.status(400).json({
          error: "paymentMethod and paymentReference are required when money is received",
          code: "PAYMENT_TRACEABILITY_REQUIRED",
        });
      }
      const rawDurationDays = Number(renewalPlan.duration_days);
      const durationDays =
        Number.isFinite(rawDurationDays) && rawDurationDays > 0
          ? rawDurationDays
          : 30;
      const [memberCountRows]: any = await pool.query(
        `SELECT COUNT(*) AS member_count
           FROM subscription_members
          WHERE subscription_id = ?
            AND status IN ('active', 'suspended')`,
        [req.params.id],
      );
      const activeMemberCount = Number(memberCountRows[0]?.member_count || 0);
      const maximumMembers = Math.max(1, Number(renewalPlan.max_members || 1));
      if (activeMemberCount > maximumMembers) {
        return res.status(409).json({
          error: `Selected plan allows ${maximumMembers} member(s), but this subscription currently has ${activeMemberCount}`,
          code: "PLAN_CAPACITY_EXCEEDED",
        });
      }
      const [beneficiaryRows]: any = await pool.query(
        `SELECT sm.member_id, sm.status, sm.joined_at, a.end_date
           FROM subscription_members sm
           LEFT JOIN affiliations a ON a.subscription_member_id = sm.id
          WHERE sm.subscription_id = ? AND sm.role = 'beneficiary'
          ORDER BY sm.joined_at`,
        [req.params.id],
      );

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const currentEndDate =
        sub.end_date instanceof Date
          ? Number.isNaN(sub.end_date.getTime())
            ? null
            : sub.end_date.toISOString().slice(0, 10)
          : normalizeDate(String(sub.end_date || ""));
      const currentEnd = currentEndDate
        ? new Date(`${currentEndDate}T00:00:00.000Z`)
        : null;
      const renewAfterCurrentEnd = Boolean(currentEnd && currentEnd >= today);
      const newStart = renewAfterCurrentEnd
        ? new Date(currentEnd!.getTime())
        : new Date(today.getTime());
      if (renewAfterCurrentEnd) newStart.setUTCDate(newStart.getUTCDate() + 1);
      const newEnd = new Date(newStart);
      newEnd.setUTCDate(newEnd.getUTCDate() + durationDays);
      const newStartDate = newStart.toISOString().slice(0, 10);
      const newEndDate = newEnd.toISOString().slice(0, 10);
      const paymentDate =
        renewalPaymentStatus === "paid"
          ? today.toISOString().slice(0, 10)
          : normalizeDate(req.body.paymentDate);
      if (!paymentDate) {
        return res.status(400).json({
          error: "An estimated payment date is required for pending payments",
        });
      }
      if (["pending", "partial"].includes(renewalPaymentStatus) && paymentDate < today.toISOString().slice(0, 10)) {
        return res.status(400).json({
          error: "The estimated payment date cannot be in the past",
        });
      }
      if (["pending", "partial"].includes(renewalPaymentStatus) && paymentDate > newEndDate) {
        return res.status(400).json({
          error: "The estimated payment date cannot be after the subscription end date",
        });
      }

      await pool.query(
        `UPDATE subscriptions
            SET status = 'active',
                plan_version_id = ?,
                plan_id = ?,
                price_paid = ?,
                currency = ?,
                max_members = ?,
                start_date = ?,
                end_date = ?,
                payment_status = ?,
                data = JSON_SET(
                  JSON_REMOVE(COALESCE(data, JSON_OBJECT()),
                    '$.scheduledPlanVersionId', '$.scheduledPlanId', '$.scheduledPlanName',
                    '$.scheduledPlanEffectiveDate', '$.scheduledPlanReason'),
                  '$.expectedPaymentDate', ?,
                  '$.amountPaid', ?,
                  '$.amountPending', ?
                ),
                version = version + 1,
                updated_at = NOW()
          WHERE id = ?`,
        [
          requestedPlanVersionId,
          renewalPlan.plan_id,
          Number(renewalPlan.price || 0),
          renewalPlan.currency || sub.currency || "USD",
          maximumMembers,
          newStartDate,
          newEndDate,
          renewalPaymentStatus,
          ["pending", "partial"].includes(renewalPaymentStatus) ? paymentDate : null,
          amountPaid,
          amountPending,
          req.params.id,
        ],
      );

      // Extend current holder/beneficiary affiliations and reactivate expired ones.
      await pool.query(
        `UPDATE affiliations a
           JOIN subscription_members sm ON sm.id = a.subscription_member_id
            SET a.plan_version_id = ?,
                a.end_date = ?,
                a.data = JSON_REMOVE(COALESCE(a.data, JSON_OBJECT()), '$.expiryOverride'),
                a.updated_at = NOW()
          WHERE a.subscription_id = ?
            AND a.status IN ('active', 'suspended')
            AND sm.status IN ('active', 'suspended')`,
        [requestedPlanVersionId, newEndDate, req.params.id],
      );
      await pool.query(
        `UPDATE affiliations a
           JOIN subscription_members sm ON sm.id = a.subscription_member_id
            SET a.status = CASE WHEN sm.status = 'suspended' THEN 'suspended' ELSE 'active' END,
                a.plan_version_id = ?,
                a.start_date = ?,
                a.end_date = ?,
                a.data = JSON_REMOVE(COALESCE(a.data, JSON_OBJECT()), '$.expiryOverride'),
                a.updated_at = NOW()
          WHERE a.subscription_id = ?
            AND a.status = 'expired'
            AND sm.status IN ('active', 'suspended')`,
        [requestedPlanVersionId, newStartDate, newEndDate, req.params.id],
      );
      await pool.query(
        `INSERT INTO subscription_member_history
          (id, subscription_id, member_id, action, performed_by, details)
         VALUES (?, ?, ?, 'subscription_renewed', ?, ?)`,
        [
          createId("smh"),
          req.params.id,
          sub.holder_member_id,
          req.user?.email || req.user?.uid || null,
          JSON.stringify({
            previousStartDate: sub.start_date,
            previousEndDate: sub.end_date,
            previousPlanVersionId: sub.plan_version_id,
            newPlanVersionId: requestedPlanVersionId,
            scheduledPlanApplied: Boolean(scheduledPlanVersionId && scheduledPlanVersionId === requestedPlanVersionId),
            newStartDate,
            newEndDate,
            renewalPaymentStatus,
            paymentDate,
            beneficiaries: beneficiaryRows.map((member: any) => ({
              memberId: member.member_id,
              status: member.status,
              joinedAt: member.joined_at,
              previousEndDate: member.end_date,
            })),
          }),
        ],
      );
      const invoiceId = createId("inv");
      const invoiceNumber = createInvoiceNumber();
      const renewalCurrency = renewalPlan.currency || sub.currency || "USD";
      await pool.query(
        `INSERT INTO invoices
          (id, invoice_number, member_id, subscription_id, subscription_v2_id, status,
           subtotal, tax_amount, total, currency, due_date, paid_at, data)
         VALUES (?, ?, ?, NULL, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          invoiceNumber,
          sub.holder_member_id,
          req.params.id,
          renewalPaymentStatus === "paid" ? "paid" : "issued",
          amount,
          amount,
          renewalCurrency,
          paymentDate,
          renewalPaymentStatus === "paid" ? new Date() : null,
          JSON.stringify({
            source: "subscription_v2_renewal",
            subscriptionV2Id: req.params.id,
            periodStart: newStartDate,
            periodEnd: newEndDate,
            paymentStatus: renewalPaymentStatus,
            amountPaid,
            amountPending,
            expectedPaymentDate:
              ["pending", "partial"].includes(renewalPaymentStatus) ? paymentDate : null,
          }),
        ],
      );
      const holderName =
        `${sub.holder_first_name || ""} ${sub.holder_last_name || ""}`.trim() ||
        sub.holder_member_id;
      if (paidMinor > 0n) await pool.query(
        `INSERT INTO invoice_payment_events_v2
          (id, invoice_id, event_type, amount, currency, effective_date,
           reason, performed_by, idempotency_key, data)
         VALUES (?, ?, 'payment', ?, ?, ?, ?, ?, ?, ?)`,
        [
          createId("pay"), invoiceId, amountPaid, renewalCurrency,
          today.toISOString().slice(0, 10), "Subscription renewal payment",
          req.user?.email || req.user?.uid || "system",
          `subscription-renewal:${invoiceId}:payment`,
          JSON.stringify({ source: "subscription_v2_renewal", subscriptionId: req.params.id, amountPaid, amountPending, paymentMethod, reference: paymentReference, notes: paymentNotes }),
        ],
      );
      if (paidMinor > 0n) await pool.query(
        `INSERT INTO finance_transactions
          (id, type, category, amount, transaction_date, source,
           reference_type, reference_id, description, status,
           created_by, approved_by, data)
         VALUES (?, 'income', 'Membership Renewal', ?, ?, 'subscription',
                 'subscription_v2_renewal_invoice', ?, ?, ?, ?, ?, ?)`,
        [
          createId("ftx"),
          amountPaid,
          today.toISOString().slice(0, 10),
          invoiceId,
          `Subscription renewal ${invoiceNumber} - ${holderName} - ${renewalPlan.name || sub.plan_name || "plan"}`,
          "posted",
          req.user?.email || req.user?.uid || "system",
          req.user?.email || req.user?.uid || "system",
          JSON.stringify({
            source: "subscription_v2_renewal",
            subscriptionId: req.params.id,
            invoiceId,
            invoiceNumber,
            paymentStatus: renewalPaymentStatus,
            amountPaid,
            amountPending,
            currency: renewalCurrency,
          }),
        ],
      );
      await upsertTrainerPlanCommission(pool, {
        subscriptionId: req.params.id,
        invoiceId,
        invoiceNumber,
        paymentStatus: renewalPaymentStatus,
        dueDate: paymentDate,
        createdBy: req.user?.email || req.user?.uid || "system",
      });
      if (outstandingPayment) {
        await pool.query(
          `INSERT INTO audit_logs (action, details, performed_by)
           VALUES ('subscription_renewed_with_outstanding_payment', ?, ?)`,
          [
            JSON.stringify({
              renewedSubscriptionId: req.params.id,
              holderMemberId: sub.holder_member_id,
              invoiceNumber,
              newStartDate,
              newEndDate,
              outstandingPayment,
              operatorConfirmation: true,
            }),
            req.user?.email || req.user?.uid || "system",
          ],
        );
      }

      res.json({
        ok: true,
        subscriptionId: req.params.id,
        newPlanVersionId: requestedPlanVersionId,
        newStartDate,
        newEndDate,
        paymentStatus: renewalPaymentStatus,
        paymentDate,
        amountPaid,
        amountPending,
        invoiceNumber,
      });
    } catch (error) { next(error); }
  });

  // Branch/location configuration for subscriptions
  app.get("/api/v2/branches", requirePermission("membership.read"), async (_req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const [rows]: any = await pool.query("SELECT DISTINCT branch FROM access_points WHERE status = 'active' ORDER BY branch");
      res.json({ branches: rows.map((r: any) => r.branch) });
    } catch (error) { next(error); }
  });
}

async function transitionSubscription(pool: Pool, subscriptionId: string, targetStatus: string, reason: string, performedBy?: string | null): Promise<{ ok: boolean; previousStatus: string; newStatus: string }> {
  const [rows]: any = await pool.query("SELECT status FROM subscriptions WHERE id = ? LIMIT 1", [subscriptionId]);
  if (rows.length === 0) throw Object.assign(new Error("Subscription not found"), { status: 404 });

  const currentStatus = String(rows[0].status).toLowerCase();
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    throw Object.assign(new Error(`Cannot transition from '${currentStatus}' to '${targetStatus}'. Allowed: ${allowed.join(", ") || "none"}`), { status: 409 });
  }

  await pool.query(
    "UPDATE subscriptions SET status = ?, version = version + 1, updated_at = NOW() WHERE id = ?",
    [targetStatus, subscriptionId],
  );

  // Sync affiliation status (freeze/suspend propagates)
  if (["frozen", "suspended"].includes(targetStatus)) {
    await pool.query(
      "UPDATE affiliations SET status = ?, updated_at = NOW() WHERE subscription_id = ? AND status = 'active'",
      [targetStatus, subscriptionId],
    );
  } else if (targetStatus === "active") {
    await pool.query(
      "UPDATE affiliations SET status = 'active', updated_at = NOW() WHERE subscription_id = ? AND status IN ('frozen', 'suspended')",
      [subscriptionId],
    );
  }

  // Outbox event
  await pool.query(
    "INSERT INTO outbox_events (id, event_type, payload, status) VALUES (?, ?, ?, 'pending')",
    [createId("evt"), `subscription_${targetStatus}`, JSON.stringify({ subscriptionId, from: currentStatus, to: targetStatus, reason, performedBy })],
  );

  return { ok: true, previousStatus: currentStatus, newStatus: targetStatus };
}
