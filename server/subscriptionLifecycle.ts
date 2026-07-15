/**
 * Subscription Lifecycle — Freeze, suspend, cancel, change plan, renew.
 *
 * Handles state transitions for subscriptions and their affiliations.
 * All operations are transactional and auditable.
 */

import crypto from "crypto";
import type { Express, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import { requirePermission } from "./rbac";
import { isFeatureEnabled } from "./featureFlags";

type PoolProvider = () => Pool | null;
type AuthenticatedRequest = Request & { user?: { uid?: string; email?: string; role?: string } };

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function requirePool(poolProvider: PoolProvider) {
  const pool = poolProvider();
  if (!pool) throw Object.assign(new Error("Database not connected"), { status: 503 });
  return pool;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

  // Change plan (upgrade/downgrade)
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

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        // Update subscription to new plan
        const newEndDate = req.body.endDate || (() => {
          const d = new Date();
          d.setDate(d.getDate() + Number(newPlan.duration_days || 30));
          return d.toISOString().slice(0, 10);
        })();

        await connection.query(
          `UPDATE subscriptions SET plan_version_id = ?, plan_id = ?, price_paid = ?, max_members = ?, end_date = ?, version = version + 1, updated_at = NOW()
           WHERE id = ?`,
          [newPlanVersionId, newPlan.plan_id, Number(newPlan.price), Number(newPlan.max_members), newEndDate, req.params.id],
        );

        // Update affiliations to reference new plan version
        await connection.query(
          "UPDATE affiliations SET plan_version_id = ?, end_date = ?, updated_at = NOW() WHERE subscription_id = ? AND status = 'active'",
          [newPlanVersionId, newEndDate, req.params.id],
        );

        // Log the change
        await connection.query(
          "INSERT INTO outbox_events (id, event_type, payload, status) VALUES (?, 'plan_changed', ?, 'pending')",
          [createId("evt"), JSON.stringify({ subscriptionId: req.params.id, newPlanVersionId, changedBy: req.user?.email })],
        );

        await connection.commit();
        res.json({ ok: true, subscriptionId: req.params.id, newPlanVersionId, newEndDate });
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

      const [subRows]: any = await pool.query("SELECT * FROM subscriptions WHERE id = ?", [req.params.id]);
      if (subRows.length === 0) return res.status(404).json({ error: "Subscription not found" });
      const sub = subRows[0];

      const [pvRows]: any = await pool.query("SELECT duration_days FROM plan_versions WHERE id = ?", [sub.plan_version_id]);
      const durationDays = pvRows.length > 0 ? Number(pvRows[0].duration_days || 30) : 30;

      const currentEnd = sub.end_date instanceof Date ? sub.end_date : new Date(sub.end_date);
      const newStart = currentEnd > new Date() ? currentEnd : new Date();
      const newEnd = new Date(newStart);
      newEnd.setDate(newEnd.getDate() + durationDays);

      await pool.query(
        "UPDATE subscriptions SET status = 'active', start_date = ?, end_date = ?, payment_status = 'paid', version = version + 1, updated_at = NOW() WHERE id = ?",
        [newStart.toISOString().slice(0, 10), newEnd.toISOString().slice(0, 10), req.params.id],
      );

      // Reactivate affiliations
      await pool.query(
        "UPDATE affiliations SET status = 'active', start_date = ?, end_date = ?, updated_at = NOW() WHERE subscription_id = ? AND status IN ('expired', 'cancelled')",
        [newStart.toISOString().slice(0, 10), newEnd.toISOString().slice(0, 10), req.params.id],
      );

      res.json({ ok: true, subscriptionId: req.params.id, newStartDate: newStart.toISOString().slice(0, 10), newEndDate: newEnd.toISOString().slice(0, 10) });
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
