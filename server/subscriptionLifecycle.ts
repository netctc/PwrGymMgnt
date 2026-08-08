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
  const raw = value instanceof Date && !Number.isNaN(value.getTime())
    ? value.toISOString().slice(0, 10)
    : normalizeString(value);
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

async function completeFreeze(
  connection: any,
  row: any,
  resumeDate: string,
  reason: string,
  resumedBy: string,
) {
  const startDate = normalizeDate(row.start_date);
  const plannedEndDate = normalizeDate(row.planned_end_date);
  const originalEndDate = normalizeDate(row.original_end_date);
  if (!startDate || !plannedEndDate || !originalEndDate) {
    throw Object.assign(new Error("The stored freeze dates are invalid"), { status: 409 });
  }
  if (resumeDate < startDate) throw Object.assign(new Error("Resume date cannot be before the freeze start date"), { status: 400 });
  const effectiveEnd = resumeDate < plannedEndDate ? resumeDate : plannedEndDate;
  const frozenDays = daysBetween(startDate, effectiveEnd) + 1;
  const extensionDays = row.extends_end_date ? frozenDays : 0;
  const plannedDays = daysBetween(startDate, plannedEndDate) + 1;
  const correctionDays = extensionDays - (row.extends_end_date ? plannedDays : 0);
  const recalculatedEndDate = row.extends_end_date ? addDays(originalEndDate, frozenDays) : originalEndDate;

  await connection.query(
    "UPDATE subscription_freezes SET resumed_at = NOW(), actual_end_date = ?, resumed_reason = ?, resumed_by = ?, frozen_days = ?, status = 'completed' WHERE id = ? AND status = 'active'",
    [effectiveEnd, reason, resumedBy, frozenDays, row.freeze_id],
  );
  await connection.query(
    "UPDATE subscriptions SET status = 'active', end_date = ?, version = version + 1, updated_at = NOW() WHERE id = ?",
    [recalculatedEndDate, row.subscription_id],
  );
  await connection.query(
    "UPDATE affiliations SET status = 'active', end_date = DATE_ADD(end_date, INTERVAL ? DAY), updated_at = NOW() WHERE subscription_id = ? AND status = 'frozen'",
    [correctionDays, row.subscription_id],
  );
  await connection.query(
    "UPDATE subscription_cycles SET end_date = DATE_ADD(end_date, INTERVAL ? DAY) WHERE subscription_id = ? AND status = 'active'",
    [correctionDays, row.subscription_id],
  );
  await connection.query(
    "UPDATE subscription_periods_v2 SET end_date = DATE_ADD(end_date, INTERVAL ? DAY) WHERE subscription_id = ? AND status IN ('active', 'pending_activation')",
    [correctionDays, row.subscription_id],
  );
  await connection.query(
    "INSERT INTO outbox_events (id, event_type, payload, status) VALUES (?, 'subscription_resumed', ?, 'pending')",
    [createId("evt"), JSON.stringify({ subscriptionId: row.subscription_id, freezeId: row.freeze_id, resumeDate: effectiveEnd, frozenDays, extensionDays, recalculatedEndDate, reason, performedBy: resumedBy })],
  );
  return { resumeDate: effectiveEnd, frozenDays, extensionDays, recalculatedEndDate };
}

export async function resumeActiveSubscriptionFreeze(
  pool: Pool,
  subscriptionId: string,
  resumeDate: string,
  reason: string,
  resumedBy: string,
) {
  const normalizedResumeDate = normalizeDate(resumeDate);
  if (!normalizedResumeDate) throw Object.assign(new Error("Resume date is invalid"), { status: 400 });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows]: any = await connection.query(
      `SELECT s.id AS subscription_id, s.status, f.id AS freeze_id, f.start_date,
              f.planned_end_date, f.original_end_date, f.extends_end_date
         FROM subscriptions s
         LEFT JOIN subscription_freezes f
           ON f.subscription_id = s.id AND f.status = 'active'
        WHERE s.id = ? FOR UPDATE`,
      [subscriptionId],
    );
    if (!rows.length) throw Object.assign(new Error("Subscription not found"), { status: 404 });
    if (rows[0].status !== "frozen" || !rows[0].freeze_id) {
      throw Object.assign(new Error("No active freeze was found for this subscription"), { status: 409 });
    }
    const result = await completeFreeze(connection, rows[0], normalizedResumeDate, reason, resumedBy);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function reconcileExpiredSubscriptionFreezes(pool: Pool, subscriptionId?: string) {
  const params: unknown[] = [];
  const subscriptionFilter = subscriptionId ? " AND f.subscription_id = ?" : "";
  if (subscriptionId) params.push(subscriptionId);
  const [dueRows]: any = await pool.query(
    `SELECT f.id AS freeze_id, f.subscription_id, f.start_date, f.planned_end_date,
            f.original_end_date, f.extends_end_date
       FROM subscription_freezes f
       JOIN subscriptions s ON s.id = f.subscription_id
      WHERE f.status = 'active' AND s.status = 'frozen'
        AND f.planned_end_date < CURDATE()${subscriptionFilter}`,
    params,
  );
  let resumed = 0;
  for (const due of dueRows) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [locked]: any = await connection.query(
        `SELECT f.id AS freeze_id, f.subscription_id, f.start_date, f.planned_end_date,
                f.original_end_date, f.extends_end_date
           FROM subscription_freezes f JOIN subscriptions s ON s.id = f.subscription_id
          WHERE f.id = ? AND f.status = 'active' AND s.status = 'frozen' FOR UPDATE`,
        [due.freeze_id],
      );
      if (locked.length) {
        await completeFreeze(connection, locked[0], normalizeDate(locked[0].planned_end_date)!, "Freeze period completed automatically", "system:freeze_worker");
        resumed++;
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  return { resumed };
}

function daysBetween(start: string, end: string) {
  return Math.max(0, Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86400000));
}

async function completeSubscriptionCancellation(connection: any, cancellation: any, completedBy: string) {
  const [subscriptionRows]: any = await connection.query(
    `SELECT s.id, s.status, s.holder_member_id, s.price_paid, s.currency,
            pv.data AS plan_data
       FROM subscriptions s
       JOIN plan_versions pv ON pv.id = s.plan_version_id
      WHERE s.id = ? FOR UPDATE`,
    [cancellation.subscription_id],
  );
  if (!subscriptionRows.length) throw Object.assign(new Error("Subscription not found"), { status: 404 });
  const subscription = subscriptionRows[0];
  if (subscription.status === "cancelled") return { alreadyCancelled: true, affectedMembers: 0, cancelledBookings: 0, cancelledSessions: 0 };
  if (!["active", "frozen", "suspended", "pending"].includes(String(subscription.status))) {
    throw Object.assign(new Error(`Cannot cancel a subscription in '${subscription.status}' status`), { status: 409 });
  }

  const [memberRows]: any = await connection.query(
    `SELECT member_id FROM subscription_members
      WHERE subscription_id = ? AND status IN ('active', 'suspended') FOR UPDATE`,
    [cancellation.subscription_id],
  );
  const memberIds = memberRows.map((row: any) => row.member_id);

  await connection.query(
    `UPDATE subscriptions
        SET status = 'cancelled', auto_renew = 0,
            data = JSON_REMOVE(COALESCE(data, JSON_OBJECT()),
              '$.scheduledPlanVersionId', '$.scheduledPlanId', '$.scheduledPlanName',
              '$.scheduledPlanEffectiveDate', '$.scheduledPlanReason',
              '$.scheduledPaymentStatus', '$.scheduledExpectedPaymentDate'),
            version = version + 1, updated_at = NOW()
      WHERE id = ?`,
    [cancellation.subscription_id],
  );
  await connection.query(
    `UPDATE affiliations SET status = 'cancelled', is_primary = 0, updated_at = NOW()
      WHERE subscription_id = ? AND status IN ('active', 'frozen', 'suspended')`,
    [cancellation.subscription_id],
  );
  await connection.query(
    `UPDATE subscription_members SET status = 'cancelled', left_at = NOW()
      WHERE subscription_id = ? AND status IN ('active', 'suspended')`,
    [cancellation.subscription_id],
  );

  let cancelledBookings = 0;
  let cancelledSessions = 0;
  if (memberIds.length) {
    const placeholders = memberIds.map(() => "?").join(", ");
    const [bookingResult]: any = await connection.query(
      `UPDATE class_bookings booking
       JOIN class_sessions class_session ON class_session.id = booking.class_id
          SET booking.status = 'cancelled', booking.cancelled_at = NOW(),
              booking.data = JSON_SET(COALESCE(booking.data, JSON_OBJECT()),
                '$.cancellationReason', ?, '$.subscriptionCancellationId', ?)
        WHERE booking.member_id IN (${placeholders})
          AND booking.status = 'booked' AND class_session.start_time >= NOW()
          AND (
            EXISTS (
              SELECT 1 FROM session_movements movement
              JOIN affiliations movement_affiliation ON movement_affiliation.id = movement.affiliation_id
              WHERE movement.reference_id = booking.id
                AND movement.reference_type IN ('class_booking', 'booking')
                AND movement_affiliation.subscription_id = ?
            )
            OR NOT EXISTS (
              SELECT 1 FROM affiliations alternative
              WHERE alternative.member_id = booking.member_id
                AND alternative.subscription_id <> ?
                AND alternative.status = 'active'
            )
          )`,
      [cancellation.reason, cancellation.cancellation_id, ...memberIds, cancellation.subscription_id, cancellation.subscription_id],
    );
    cancelledBookings = Number(bookingResult.affectedRows || 0);
    const [sessionResult]: any = await connection.query(
      `UPDATE private_sessions
          SET status = 'cancelled', updated_at = NOW(),
              data = JSON_SET(COALESCE(data, JSON_OBJECT()),
                '$.cancellationReason', ?, '$.subscriptionCancellationId', ?)
        WHERE member_id IN (${placeholders})
          AND status = 'scheduled' AND start_time >= NOW()
          AND NOT EXISTS (
            SELECT 1 FROM affiliations alternative
            WHERE alternative.member_id = private_sessions.member_id
              AND alternative.subscription_id <> ?
              AND alternative.status = 'active'
          )`,
      [cancellation.reason, cancellation.cancellation_id, ...memberIds, cancellation.subscription_id],
    );
    cancelledSessions = Number(sessionResult.affectedRows || 0);
  }

  const planData = typeof subscription.plan_data === "string"
    ? JSON.parse(subscription.plan_data || "{}")
    : (subscription.plan_data || {});
  const refundPolicy = planData.cancellationPolicy?.refundPolicy || planData.refundPolicy || { mode: "manual_review" };
  const refundReview = {
    required: refundPolicy.mode !== "none",
    automaticRefundCreated: false,
    policy: refundPolicy,
    contractualAmount: Number(subscription.price_paid || 0),
    currency: subscription.currency || "USD",
  };
  await connection.query(
    `UPDATE subscription_cancellations
        SET status = 'completed', refund_review = ?, affected_members = ?,
            cancelled_bookings = ?, cancelled_sessions = ?, completed_at = NOW(), completed_by = ?
      WHERE id = ? AND status = 'scheduled'`,
    [JSON.stringify(refundReview), memberIds.length, cancelledBookings, cancelledSessions, completedBy, cancellation.cancellation_id],
  );
  await connection.query(
    `INSERT INTO subscription_member_history
      (id, subscription_id, member_id, action, performed_by, details)
     VALUES (?, ?, ?, 'subscription_cancelled', ?, ?)`,
    [createId("smh"), cancellation.subscription_id, subscription.holder_member_id, completedBy,
     JSON.stringify({ cancellationId: cancellation.cancellation_id, effectiveDate: normalizeDate(cancellation.effective_date), reason: cancellation.reason, affectedMembers: memberIds.length, cancelledBookings, cancelledSessions, refundReview })],
  );
  await connection.query(
    `INSERT INTO outbox_events (id, event_type, payload, status)
     VALUES (?, 'subscription_cancelled', ?, 'pending')`,
    [createId("evt"), JSON.stringify({ subscriptionId: cancellation.subscription_id, cancellationId: cancellation.cancellation_id, effectiveDate: normalizeDate(cancellation.effective_date), reason: cancellation.reason, performedBy: completedBy, refundReview })],
  );
  return { alreadyCancelled: false, affectedMembers: memberIds.length, cancelledBookings, cancelledSessions, refundReview };
}

export async function reconcileScheduledSubscriptionCancellations(pool: Pool, subscriptionId?: string) {
  const params: unknown[] = [];
  const filter = subscriptionId ? " AND subscription_id = ?" : "";
  if (subscriptionId) params.push(subscriptionId);
  const [dueRows]: any = await pool.query(
    `SELECT id AS cancellation_id, subscription_id, effective_date, reason
       FROM subscription_cancellations
      WHERE status = 'scheduled' AND effective_date <= CURDATE()${filter}
      ORDER BY effective_date, created_at LIMIT 50`,
    params,
  );
  let cancelled = 0;
  for (const due of dueRows) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [locked]: any = await connection.query(
        `SELECT id AS cancellation_id, subscription_id, effective_date, reason
           FROM subscription_cancellations WHERE id = ? AND status = 'scheduled' FOR UPDATE`,
        [due.cancellation_id],
      );
      if (locked.length) {
        await completeSubscriptionCancellation(connection, locked[0], "system:cancellation_worker");
        cancelled++;
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  return { cancelled };
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

  // Freeze subscription. The plan-version snapshot owns the applicable policy.
  app.post("/api/v2/subscriptions/:id/freeze", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await isFeatureEnabled(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL")) return res.status(404).json({ error: "Feature not enabled" });
      const reason = normalizeString(req.body.reason);
      const startDate = normalizeDate(req.body.startDate);
      const plannedEndDate = normalizeDate(req.body.endDate);
      if (!reason || !startDate || !plannedEndDate) return res.status(400).json({ error: "reason, startDate and endDate are required" });
      if (plannedEndDate < startDate) return res.status(400).json({ error: "Freeze end date cannot be before its start date" });

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows]: any = await connection.query(
          `SELECT s.status, s.start_date, s.end_date, s.holder_member_id, pv.data AS plan_data
             FROM subscriptions s JOIN plan_versions pv ON pv.id = s.plan_version_id
            WHERE s.id = ? FOR UPDATE`, [req.params.id]);
        if (!rows.length) throw Object.assign(new Error("Subscription not found"), { status: 404 });
        if (rows[0].status !== "active") throw Object.assign(new Error("Only an active subscription can be frozen"), { status: 409 });
        const planData = typeof rows[0].plan_data === "string" ? JSON.parse(rows[0].plan_data || "{}") : (rows[0].plan_data || {});
        const policy = { allowed: true, maximumDays: 30, maximumFreezesPerCycle: 1, extendsEndDate: true, ...(planData.freezePolicy || {}) };
        if (!policy.allowed) throw Object.assign(new Error("This plan does not allow freezes"), { status: 409 });
        const plannedDays = daysBetween(startDate, plannedEndDate) + 1;
        if (plannedDays > Number(policy.maximumDays || 30)) throw Object.assign(new Error(`This plan allows a maximum freeze of ${policy.maximumDays || 30} days`), { status: 409 });
        const [countRows]: any = await connection.query(
          "SELECT COUNT(*) AS freeze_count FROM subscription_freezes WHERE subscription_id = ? AND created_at >= (SELECT start_date FROM subscriptions WHERE id = ?)",
          [req.params.id, req.params.id]);
        if (Number(countRows[0]?.freeze_count || 0) >= Number(policy.maximumFreezesPerCycle || 1)) throw Object.assign(new Error("The freeze allowance for this cycle has already been used"), { status: 409 });
        const freezeId = createId("frz");
        const originalEndDate = normalizeDate(rows[0].end_date);
        if (!originalEndDate) throw Object.assign(new Error("The subscription end date is invalid"), { status: 409 });
        const projectedEndDate = policy.extendsEndDate ? addDays(originalEndDate, plannedDays) : originalEndDate;
        await connection.query(
          `INSERT INTO subscription_freezes (id, subscription_id, start_date, planned_end_date, original_end_date, reason, extends_end_date, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
          [freezeId, req.params.id, startDate, plannedEndDate, originalEndDate, reason, policy.extendsEndDate ? 1 : 0, req.user?.email || req.user?.uid || null]);
        await connection.query("UPDATE subscriptions SET status = 'frozen', end_date = ?, version = version + 1, updated_at = NOW() WHERE id = ?", [projectedEndDate, req.params.id]);
        await connection.query("UPDATE affiliations SET status = 'frozen', end_date = DATE_ADD(end_date, INTERVAL ? DAY), updated_at = NOW() WHERE subscription_id = ? AND status = 'active'", [policy.extendsEndDate ? plannedDays : 0, req.params.id]);
        await connection.query("UPDATE subscription_cycles SET end_date = DATE_ADD(end_date, INTERVAL ? DAY) WHERE subscription_id = ? AND status = 'active'", [policy.extendsEndDate ? plannedDays : 0, req.params.id]);
        await connection.query("UPDATE subscription_periods_v2 SET end_date = DATE_ADD(end_date, INTERVAL ? DAY) WHERE subscription_id = ? AND status IN ('active', 'pending_activation')", [policy.extendsEndDate ? plannedDays : 0, req.params.id]);
        await connection.query("INSERT INTO outbox_events (id, event_type, payload, status) VALUES (?, 'subscription_frozen', ?, 'pending')", [createId("evt"), JSON.stringify({ subscriptionId: req.params.id, freezeId, startDate, plannedEndDate, reason, performedBy: req.user?.email })]);
        await connection.commit();
        res.json({ ok: true, previousStatus: "active", newStatus: "frozen", freezeId, startDate, plannedEndDate, plannedDays, extendsEndDate: Boolean(policy.extendsEndDate), projectedEndDate });
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    } catch (error) { next(error); }
  });

  app.post("/api/v2/subscriptions/:id/resume", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await isFeatureEnabled(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL")) return res.status(404).json({ error: "Feature not enabled" });
      const reason = normalizeString(req.body.reason);
      const resumeDate = normalizeDate(req.body.resumeDate) || new Date().toISOString().slice(0, 10);
      if (!reason) return res.status(400).json({ error: "reason is required" });
      const result = await resumeActiveSubscriptionFreeze(pool, req.params.id, resumeDate, reason, req.user?.email || req.user?.uid || "operator");
      res.json({ ok: true, previousStatus: "frozen", newStatus: "active", ...result });
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

      const reason = normalizeString(req.body.reason);
      const effectiveDate = normalizeDate(req.body.effectiveDate);
      const today = new Date().toISOString().slice(0, 10);
      if (!reason || !effectiveDate) return res.status(400).json({ error: "reason and effectiveDate are required" });
      if (effectiveDate < today) return res.status(400).json({ error: "The effective cancellation date cannot be in the past" });
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows]: any = await connection.query("SELECT status FROM subscriptions WHERE id = ? FOR UPDATE", [req.params.id]);
        if (!rows.length) throw Object.assign(new Error("Subscription not found"), { status: 404 });
        if (!["active", "frozen", "suspended", "pending"].includes(String(rows[0].status))) {
          throw Object.assign(new Error(`Cannot cancel a subscription in '${rows[0].status}' status`), { status: 409 });
        }
        const [existing]: any = await connection.query(
          "SELECT id FROM subscription_cancellations WHERE subscription_id = ? AND status = 'scheduled' FOR UPDATE",
          [req.params.id],
        );
        if (existing.length) throw Object.assign(new Error("This subscription already has a scheduled cancellation"), { status: 409 });
        const cancellationId = createId("cnl");
        const actor = req.user?.email || req.user?.uid || "operator";
        await connection.query(
          `INSERT INTO subscription_cancellations
            (id, subscription_id, effective_date, reason, status, created_by)
           VALUES (?, ?, ?, ?, 'scheduled', ?)`,
          [cancellationId, req.params.id, effectiveDate, reason, actor],
        );
        let completion: any = null;
        if (effectiveDate === today) {
          completion = await completeSubscriptionCancellation(connection, { cancellation_id: cancellationId, subscription_id: req.params.id, effective_date: effectiveDate, reason }, actor);
        }
        await connection.commit();
        res.json({ ok: true, cancellationId, effectiveDate, status: completion ? "completed" : "scheduled", ...completion });
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
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
      let scheduledPaymentStatus: string;
      try {
        scheduledPaymentStatus = normalizePaymentStatus(req.body.paymentStatus);
      } catch (error: any) {
        return res.status(error?.status || 400).json({ error: error?.message || "Invalid payment status", code: error?.code });
      }
      const requiresExpectedPaymentDate = ["pending", "partial"].includes(scheduledPaymentStatus);
      const scheduledExpectedPaymentDate = requiresExpectedPaymentDate
        ? normalizeDate(req.body.expectedPaymentDate) || effectiveDate
        : null;
      if (requiresExpectedPaymentDate && scheduledExpectedPaymentDate! < effectiveDate) {
        return res.status(400).json({
          error: "The estimated payment date cannot be before the new plan start date",
          code: "INVALID_SCHEDULED_PAYMENT_DATE",
        });
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        await connection.query(
          `UPDATE subscriptions
              SET data = JSON_SET(COALESCE(data, JSON_OBJECT()),
                    '$.scheduledPlanVersionId', ?, '$.scheduledPlanId', ?,
                    '$.scheduledPlanName', ?, '$.scheduledPlanEffectiveDate', ?,
                    '$.scheduledPlanReason', ?, '$.scheduledPaymentStatus', ?,
                    '$.scheduledExpectedPaymentDate', ?),
                  version = version + 1, updated_at = NOW()
            WHERE id = ?`,
          [newPlanVersionId, newPlan.plan_id, newPlan.name, effectiveDate, reason,
           scheduledPaymentStatus, scheduledExpectedPaymentDate, req.params.id],
        );

        await connection.query(
          `INSERT INTO subscription_member_history
            (id, subscription_id, member_id, action, performed_by, details)
           VALUES (?, ?, ?, 'plan_change_scheduled', ?, ?)`,
          [createId("smh"), req.params.id, subscription.holder_member_id,
           req.user?.email || req.user?.uid || null,
           JSON.stringify({ fromPlanVersionId: subscription.plan_version_id, toPlanVersionId: newPlanVersionId, effectiveDate, reason, paymentStatus: scheduledPaymentStatus, expectedPaymentDate: scheduledExpectedPaymentDate })],
        );

        // Log the change
        await connection.query(
          "INSERT INTO outbox_events (id, event_type, payload, status) VALUES (?, 'plan_changed', ?, 'pending')",
          [createId("evt"), JSON.stringify({ subscriptionId: req.params.id, currentPlanVersionId: subscription.plan_version_id, newPlanVersionId, effectiveDate, reason, paymentStatus: scheduledPaymentStatus, expectedPaymentDate: scheduledExpectedPaymentDate, changedBy: req.user?.email })],
        );

        await connection.commit();
        res.json({ ok: true, subscriptionId: req.params.id, currentPlanVersionId: subscription.plan_version_id, scheduledPlanVersionId: newPlanVersionId, effectiveDate, paymentStatus: scheduledPaymentStatus, expectedPaymentDate: scheduledExpectedPaymentDate });
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
                    '$.scheduledPlanEffectiveDate', '$.scheduledPlanReason',
                    '$.scheduledPaymentStatus', '$.scheduledExpectedPaymentDate'),
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
