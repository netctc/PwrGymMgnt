/**
 * Subscriptions V2 — New subscription model with plan versions, multi-user, affiliations.
 * 
 * Read routes remain available for existing records. Feature flags guard creation and
 * evolution operations while the existing membership.ts module remains in transition.
 */

import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import type { Pool } from "mysql2/promise";
import { requirePermission } from "./rbac";
import { isFeatureEnabled } from "./featureFlags";
import { mapBalance } from "./sessionLedger";

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

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDate(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

async function requireFeature(pool: Pool, flag: string, res: Response): Promise<boolean> {
  const enabled = await isFeatureEnabled(pool, flag);
  if (!enabled) {
    res.status(404).json({ error: "This feature is not enabled" });
    return false;
  }
  return true;
}

export function registerSubscriptionsV2Routes(app: Express, poolProvider: PoolProvider) {

  // --- Plan Versions ---
  app.get("/api/v2/plan-versions", requirePermission("membership.read"), async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await requireFeature(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL", res)) return;
      const planId = normalizeString(req.query.planId);
      const where = planId ? "WHERE pv.plan_id = ?" : "WHERE pv.status = 'active'";
      const params = planId ? [planId] : [];
      const [rows]: any = await pool.query(
        `SELECT pv.*, sp.name AS plan_name FROM plan_versions pv LEFT JOIN subscription_plans sp ON sp.id = pv.plan_id ${where} ORDER BY pv.plan_id, pv.version_number DESC`,
        params,
      );
      res.json({ planVersions: rows.map(mapPlanVersion) });
    } catch (error) { next(error); }
  });

  app.post("/api/v2/plan-versions", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await requireFeature(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL", res)) return;

      const planId = normalizeString(req.body.planId);
      if (!planId) return res.status(400).json({ error: "planId is required" });

      // Get next version number
      const [maxRows]: any = await pool.query(
        "SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM plan_versions WHERE plan_id = ?", [planId]
      );
      const versionNumber = Number(maxRows[0]?.max_ver || 0) + 1;

      const id = createId("pv");
      await pool.query(
        `INSERT INTO plan_versions (id, plan_id, version_number, name, description, plan_type, price, currency, duration_days, auto_renew, max_members, sessions_unlimited, sessions_per_cycle, cycle_frequency, distribution_model, carryover_enabled, carryover_max, extra_session_price, consumption_priority, grace_period_days, benefits, restrictions, booking_policy, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, planId, versionNumber,
          normalizeString(req.body.name) || "Plan v" + versionNumber,
          normalizeString(req.body.description) || null,
          normalizeString(req.body.planType) || "individual",
          numberOrDefault(req.body.price, 0),
          normalizeString(req.body.currency) || "USD",
          numberOrDefault(req.body.durationDays, 30),
          req.body.autoRenew ? 1 : 0,
          numberOrDefault(req.body.maxMembers, 1),
          req.body.sessionsUnlimited !== false ? 1 : 0,
          req.body.sessionsUnlimited === false ? numberOrDefault(req.body.sessionsPerCycle, 20) : null,
          normalizeString(req.body.cycleFrequency) || "monthly",
          normalizeString(req.body.distributionModel) || "individual",
          req.body.carryoverEnabled ? 1 : 0,
          req.body.carryoverEnabled ? numberOrDefault(req.body.carryoverMax, null) : null,
          numberOrDefault(req.body.extraSessionPrice, null),
          numberOrDefault(req.body.consumptionPriority, 0),
          numberOrDefault(req.body.gracePeriodDays, 0),
          JSON.stringify(req.body.benefits || null),
          JSON.stringify(req.body.restrictions || null),
          JSON.stringify(req.body.bookingPolicy || null),
          "active",
        ],
      );

      const [rows]: any = await pool.query("SELECT * FROM plan_versions WHERE id = ?", [id]);
      res.status(201).json({ planVersion: mapPlanVersion(rows[0]) });
    } catch (error) { next(error); }
  });

  // --- Subscriptions ---
  app.get("/api/v2/subscriptions", requirePermission("membership.read"), async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const memberId = normalizeString(req.query.memberId);
      const status = normalizeString(req.query.status);
      const where: string[] = [];
      const params: any[] = [];
      if (memberId) {
        where.push(`(
          s.holder_member_id = ?
          OR EXISTS (
            SELECT 1
              FROM subscription_members sm_filter
             WHERE sm_filter.subscription_id = s.id
               AND sm_filter.member_id = ?
               AND sm_filter.status IN ('active', 'suspended')
          )
        )`);
        params.push(memberId, memberId);
      }
      if (status && status !== "all") { where.push("s.status = ?"); params.push(status); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const [rows]: any = await pool.query(
        `SELECT s.*, pv.name AS plan_name, pv.plan_type, pv.sessions_unlimited, pv.sessions_per_cycle, pv.distribution_model,
                holder.first_name AS holder_first_name, holder.last_name AS holder_last_name
         FROM subscriptions s
         LEFT JOIN plan_versions pv ON pv.id = s.plan_version_id
         LEFT JOIN members holder ON holder.id = s.holder_member_id
         ${clause} ORDER BY s.created_at DESC LIMIT 200`,
        params,
      );
      res.json({ subscriptions: rows.map(mapSubscription) });
    } catch (error) { next(error); }
  });

  app.post("/api/v2/subscriptions", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await requireFeature(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL", res)) return;
      const planVersionId = normalizeString(req.body.planVersionId);
      const holderMemberId = normalizeString(req.body.holderMemberId);
      if (!planVersionId || !holderMemberId) return res.status(400).json({ error: "planVersionId and holderMemberId are required" });

      // Get plan version
      const [pvRows]: any = await pool.query("SELECT * FROM plan_versions WHERE id = ? AND status = 'active'", [planVersionId]);
      if (pvRows.length === 0) return res.status(404).json({ error: "Plan version not found or inactive" });
      const pv = pvRows[0];

      const startDate = normalizeDate(req.body.startDate) || new Date().toISOString().slice(0, 10);
      const endDate = normalizeDate(req.body.endDate) || addDays(startDate, Number(pv.duration_days));

      const id = createId("sub");
      await pool.query(
        `INSERT INTO subscriptions (id, plan_id, plan_version_id, holder_member_id, status, start_date, end_date, auto_renew, price_paid, currency, payment_status, max_members)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 'paid', ?)`,
        [id, pv.plan_id, planVersionId, holderMemberId, startDate, endDate, pv.auto_renew, Number(pv.price), pv.currency, Number(pv.max_members)],
      );

      // Create subscription_member for holder
      const smId = createId("sm");
      await pool.query(
        "INSERT INTO subscription_members (id, subscription_id, member_id, role, status, joined_at) VALUES (?, ?, ?, 'holder', 'active', NOW())",
        [smId, id, holderMemberId],
      );

      // Create affiliation for holder
      const affId = createId("aff");
      await pool.query(
        `INSERT INTO affiliations (id, member_id, subscription_id, subscription_member_id, plan_version_id, status, role, is_primary, start_date, end_date, consumption_priority)
         VALUES (?, ?, ?, ?, ?, 'active', 'holder', 1, ?, ?, ?)`,
        [affId, holderMemberId, id, smId, planVersionId, startDate, endDate, Number(pv.consumption_priority)],
      );

      const [rows]: any = await pool.query("SELECT s.*, pv.name AS plan_name, pv.plan_type FROM subscriptions s LEFT JOIN plan_versions pv ON pv.id = s.plan_version_id WHERE s.id = ?", [id]);
      res.status(201).json({ subscription: mapSubscription(rows[0]), affiliationId: affId });
    } catch (error) { next(error); }
  });

  // --- Subscription Members (add/remove beneficiaries) ---

  app.get("/api/v2/subscriptions/:id/members", requirePermission("membership.read"), async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const [rows]: any = await pool.query(
        `SELECT sm.*, m.first_name, m.last_name, m.email
         FROM subscription_members sm
         LEFT JOIN members m ON m.id = sm.member_id
         WHERE sm.subscription_id = ?
         ORDER BY sm.role = 'holder' DESC, sm.joined_at ASC`,
        [req.params.id],
      );
      res.json({
        members: rows.map((r: any) => ({
          id: r.id, subscriptionId: r.subscription_id, memberId: r.member_id,
          role: r.role, status: r.status,
          joinedAt: r.joined_at ? new Date(r.joined_at).toISOString() : null,
          leftAt: r.left_at ? new Date(r.left_at).toISOString() : null,
          firstName: r.first_name || '', lastName: r.last_name || '', email: r.email || '',
        })),
      });
    } catch (error) { next(error); }
  });

  app.post("/api/v2/subscriptions/:id/members", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await requireFeature(pool, "ENABLE_MULTI_USER_PLANS", res)) return;

      const subscriptionId = req.params.id;
      const memberId = normalizeString(req.body.memberId);
      if (!memberId) return res.status(400).json({ error: "memberId is required" });

      // Verify subscription exists and check capacity
      const [subRows]: any = await pool.query(
        "SELECT * FROM subscriptions WHERE id = ? AND status = 'active' AND end_date >= CURDATE()",
        [subscriptionId],
      );
      if (subRows.length === 0) {
        return res.status(409).json({
          error: "Beneficiaries cannot be modified after the multi-user subscription has expired",
          code: "SUBSCRIPTION_EXPIRED",
        });
      }
      const sub = subRows[0];

      const [countRows]: any = await pool.query(
        "SELECT COUNT(*) AS c FROM subscription_members WHERE subscription_id = ? AND status IN ('active', 'suspended')",
        [subscriptionId],
      );
      if (Number(countRows[0]?.c || 0) >= Number(sub.max_members)) {
        return res.status(409).json({ error: "Subscription member limit reached", code: "CAPACITY_LIMIT_REACHED" });
      }

      // Check not already a member
      const [existing]: any = await pool.query(
        "SELECT id FROM subscription_members WHERE subscription_id = ? AND member_id = ? AND status IN ('active', 'suspended') LIMIT 1",
        [subscriptionId, memberId],
      );
      if (existing.length > 0) return res.status(409).json({ error: "Member is already in this subscription" });

      const smId = createId("sm");
      const role = normalizeString(req.body.role) || "beneficiary";
      await pool.query(
        "INSERT INTO subscription_members (id, subscription_id, member_id, role, status, joined_at, invited_by) VALUES (?, ?, ?, ?, 'active', NOW(), ?)",
        [smId, subscriptionId, memberId, role, req.user?.email || null],
      );

      // Create affiliation for the new member
      const affId = createId("aff");
      const startDate = new Date().toISOString().slice(0, 10);
      const endDate = sub.end_date instanceof Date ? sub.end_date.toISOString().slice(0, 10) : String(sub.end_date).slice(0, 10);
      await pool.query(
        `INSERT INTO affiliations (id, member_id, subscription_id, subscription_member_id, plan_version_id, status, role, is_primary, start_date, end_date, consumption_priority)
         VALUES (?, ?, ?, ?, ?, 'active', ?, 0, ?, ?, 0)`,
        [affId, memberId, subscriptionId, smId, sub.plan_version_id, role, startDate, endDate],
      );

      res.status(201).json({ subscriptionMember: { id: smId, memberId, role, status: "active" }, affiliationId: affId });
    } catch (error) { next(error); }
  });

  app.delete("/api/v2/subscriptions/:subId/members/:memberId", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await requireFeature(pool, "ENABLE_MULTI_USER_PLANS", res)) return;

      const { subId, memberId } = req.params;
      const [subscriptionRows]: any = await pool.query(
        "SELECT id FROM subscriptions WHERE id = ? AND status = 'active' AND end_date >= CURDATE()",
        [subId],
      );
      if (subscriptionRows.length === 0) {
        return res.status(409).json({
          error: "Beneficiaries cannot be modified after the multi-user subscription has expired",
          code: "SUBSCRIPTION_EXPIRED",
        });
      }

      // Cannot remove the holder
      const [smRows]: any = await pool.query(
        "SELECT id, role FROM subscription_members WHERE subscription_id = ? AND member_id = ? AND status IN ('active', 'suspended') LIMIT 1",
        [subId, memberId],
      );
      if (smRows.length === 0) return res.status(404).json({ error: "Member not found in subscription" });
      if (smRows[0].role === "holder") return res.status(400).json({ error: "Cannot remove the subscription holder" });

      // Deactivate subscription_member
      await pool.query(
        "UPDATE subscription_members SET status = 'removed', left_at = NOW() WHERE id = ?",
        [smRows[0].id],
      );

      // Cancel affiliated affiliations
      await pool.query(
        "UPDATE affiliations SET status = 'cancelled', updated_at = NOW() WHERE subscription_id = ? AND member_id = ? AND status = 'active'",
        [subId, memberId],
      );

      res.json({ ok: true, removed: memberId });
    } catch (error) { next(error); }
  });

  // --- Affiliations ---
  app.get("/api/v2/affiliations", requirePermission("membership.read"), async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await requireFeature(pool, "ENABLE_NEW_SUBSCRIPTION_MODEL", res)) return;
      const memberId = normalizeString(req.query.memberId);
      if (!memberId) return res.status(400).json({ error: "memberId is required" });
      const [rows]: any = await pool.query(
        `SELECT a.*, pv.name AS plan_name, pv.plan_type, pv.sessions_unlimited, s.status AS subscription_status
         FROM affiliations a
         LEFT JOIN plan_versions pv ON pv.id = a.plan_version_id
         LEFT JOIN subscriptions s ON s.id = a.subscription_id
         WHERE a.member_id = ? ORDER BY a.is_primary DESC, a.consumption_priority ASC, a.end_date ASC`,
        [memberId],
      );
      res.json({ affiliations: rows.map(mapAffiliation) });
    } catch (error) { next(error); }
  });

  // --- Session Balances ---
  app.get("/api/v2/session-balances", requirePermission("membership.read"), async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await requireFeature(pool, "ENABLE_SESSION_LEDGER", res)) return;
      const affiliationId = normalizeString(req.query.affiliationId);
      const subscriptionId = normalizeString(req.query.subscriptionId);
      const where: string[] = [];
      const params: any[] = [];
      if (affiliationId) { where.push("context_type = 'affiliation' AND context_id = ?"); params.push(affiliationId); }
      else if (subscriptionId) { where.push("context_type = 'subscription' AND context_id = ?"); params.push(subscriptionId); }
      else return res.status(400).json({ error: "affiliationId or subscriptionId is required" });
      const [rows]: any = await pool.query(`SELECT * FROM session_balances WHERE ${where.join(" AND ")} ORDER BY cycle_id DESC`, params);
      res.json({ balances: rows.map(mapBalance) });
    } catch (error) { next(error); }
  });

  // --- Session Movements ---
  app.get("/api/v2/session-movements", requirePermission("membership.read"), async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await requireFeature(pool, "ENABLE_SESSION_LEDGER", res)) return;
      const balanceId = normalizeString(req.query.balanceId);
      const affiliationId = normalizeString(req.query.affiliationId);
      const where: string[] = [];
      const params: any[] = [];
      if (balanceId) { where.push("balance_id = ?"); params.push(balanceId); }
      else if (affiliationId) { where.push("affiliation_id = ?"); params.push(affiliationId); }
      else return res.status(400).json({ error: "balanceId or affiliationId required" });
      const [rows]: any = await pool.query(`SELECT * FROM session_movements WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 200`, params);
      res.json({ movements: rows.map(mapMovementRow) });
    } catch (error) { next(error); }
  });

  // --- Feature Flags (admin) ---
  app.get("/api/v2/feature-flags", requirePermission("platform.audit.read"), async (_req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const [rows]: any = await pool.query("SELECT * FROM feature_flags ORDER BY flag_key");
      res.json({ flags: rows.map((r: any) => ({ id: r.id, key: r.flag_key, enabled: Boolean(r.enabled), scope: r.scope, scopeValue: r.scope_value, description: r.description })) });
    } catch (error) { next(error); }
  });

  app.put("/api/v2/feature-flags/:key", requirePermission("platform.audit.read"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const enabled = req.body.enabled ? 1 : 0;
      await pool.query("UPDATE feature_flags SET enabled = ? WHERE flag_key = ? AND scope = 'global'", [enabled, req.params.key]);
      res.json({ ok: true, key: req.params.key, enabled: Boolean(enabled) });
    } catch (error) { next(error); }
  });

  // --- Session Operations (consume, reserve, refund, adjust) ---

  app.post("/api/v2/sessions/consume", requirePermission("membership.access.validate"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await requireFeature(pool, "ENABLE_SESSION_LEDGER", res)) return;

      const affiliationId = normalizeString(req.body.affiliationId);
      if (!affiliationId) return res.status(400).json({ error: "affiliationId is required" });

      // Find active cycle for this affiliation's subscription
      const [affRows]: any = await pool.query("SELECT subscription_id FROM affiliations WHERE id = ? AND status = 'active' LIMIT 1", [affiliationId]);
      if (affRows.length === 0) return res.status(404).json({ error: "Active affiliation not found", code: "AFFILIATION_NOT_ACTIVE" });

      const [cycleRows]: any = await pool.query(
        "SELECT id FROM subscription_cycles WHERE subscription_id = ? AND status = 'active' ORDER BY cycle_number DESC LIMIT 1",
        [affRows[0].subscription_id],
      );
      if (cycleRows.length === 0) return res.status(400).json({ error: "No active cycle found" });
      const cycleId = cycleRows[0].id;

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const { getBalanceForUpdate, createMovement } = await import("./sessionLedger");
        const balance = await getBalanceForUpdate(connection, "affiliation", affiliationId, cycleId);
        const movement = await createMovement(connection, {
          balanceId: balance.id,
          affiliationId,
          cycleId,
          movementType: "consumption",
          quantity: numberOrDefault(req.body.quantity, 1),
          referenceType: normalizeString(req.body.referenceType) || "manual",
          referenceId: normalizeString(req.body.referenceId) || null,
          reason: normalizeString(req.body.reason) || "Manual consumption",
          performedBy: req.user?.email || "system",
          idempotencyKey: req.headers["idempotency-key"] as string || normalizeString(req.body.idempotencyKey) || null,
        });
        await connection.commit();
        res.status(201).json({ movement: { id: movement.id, balanceAfter: movement.balanceAfter, type: movement.movementType } });
      } catch (error: any) {
        await connection.rollback();
        if (error.code === "NO_SESSIONS_AVAILABLE") return res.status(400).json({ error: error.message, code: error.code });
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) { next(error); }
  });

  app.post("/api/v2/sessions/reserve", requirePermission("scheduling.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await requireFeature(pool, "ENABLE_SESSION_LEDGER", res)) return;

      const affiliationId = normalizeString(req.body.affiliationId);
      if (!affiliationId) return res.status(400).json({ error: "affiliationId is required" });

      const [affRows]: any = await pool.query("SELECT subscription_id FROM affiliations WHERE id = ? AND status = 'active' LIMIT 1", [affiliationId]);
      if (affRows.length === 0) return res.status(404).json({ error: "Active affiliation not found", code: "AFFILIATION_NOT_ACTIVE" });

      const [cycleRows]: any = await pool.query(
        "SELECT id FROM subscription_cycles WHERE subscription_id = ? AND status = 'active' ORDER BY cycle_number DESC LIMIT 1",
        [affRows[0].subscription_id],
      );
      if (cycleRows.length === 0) return res.status(400).json({ error: "No active cycle found" });

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const { getBalanceForUpdate, createMovement } = await import("./sessionLedger");
        const balance = await getBalanceForUpdate(connection, "affiliation", affiliationId, cycleRows[0].id);
        const movement = await createMovement(connection, {
          balanceId: balance.id,
          affiliationId,
          cycleId: cycleRows[0].id,
          movementType: "reservation",
          quantity: numberOrDefault(req.body.quantity, 1),
          referenceType: normalizeString(req.body.referenceType) || "class_booking",
          referenceId: normalizeString(req.body.referenceId) || null,
          reason: normalizeString(req.body.reason) || "Class reservation",
          performedBy: req.user?.email || "system",
          idempotencyKey: req.headers["idempotency-key"] as string || normalizeString(req.body.idempotencyKey) || null,
        });
        await connection.commit();
        res.status(201).json({ movement: { id: movement.id, balanceAfter: movement.balanceAfter, type: movement.movementType } });
      } catch (error: any) {
        await connection.rollback();
        if (error.code === "NO_SESSIONS_AVAILABLE") return res.status(400).json({ error: error.message, code: error.code });
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) { next(error); }
  });

  app.post("/api/v2/sessions/refund", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await requireFeature(pool, "ENABLE_SESSION_LEDGER", res)) return;

      const affiliationId = normalizeString(req.body.affiliationId);
      const relatedMovementId = normalizeString(req.body.relatedMovementId);
      if (!affiliationId) return res.status(400).json({ error: "affiliationId is required" });

      const [affRows]: any = await pool.query("SELECT subscription_id FROM affiliations WHERE id = ? LIMIT 1", [affiliationId]);
      if (affRows.length === 0) return res.status(404).json({ error: "Affiliation not found" });

      const [cycleRows]: any = await pool.query(
        "SELECT id FROM subscription_cycles WHERE subscription_id = ? AND status = 'active' ORDER BY cycle_number DESC LIMIT 1",
        [affRows[0].subscription_id],
      );
      if (cycleRows.length === 0) return res.status(400).json({ error: "No active cycle found" });

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const { getBalanceForUpdate, createMovement } = await import("./sessionLedger");
        const balance = await getBalanceForUpdate(connection, "affiliation", affiliationId, cycleRows[0].id);
        const movement = await createMovement(connection, {
          balanceId: balance.id,
          affiliationId,
          cycleId: cycleRows[0].id,
          movementType: "refund",
          quantity: numberOrDefault(req.body.quantity, 1),
          referenceType: normalizeString(req.body.referenceType) || "manual",
          referenceId: normalizeString(req.body.referenceId) || null,
          relatedMovementId: relatedMovementId || null,
          reason: normalizeString(req.body.reason) || "Session refund",
          performedBy: req.user?.email || "system",
          idempotencyKey: req.headers["idempotency-key"] as string || normalizeString(req.body.idempotencyKey) || null,
        });
        await connection.commit();
        res.status(201).json({ movement: { id: movement.id, balanceAfter: movement.balanceAfter, type: movement.movementType } });
      } catch (error: any) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) { next(error); }
  });

  app.post("/api/v2/sessions/adjust", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await requireFeature(pool, "ENABLE_SESSION_LEDGER", res)) return;

      const affiliationId = normalizeString(req.body.affiliationId);
      const direction = normalizeString(req.body.direction); // 'positive' or 'negative'
      const reason = normalizeString(req.body.reason);
      if (!affiliationId || !direction || !reason) return res.status(400).json({ error: "affiliationId, direction, and reason are required" });
      if (!["positive", "negative"].includes(direction)) return res.status(400).json({ error: "direction must be 'positive' or 'negative'" });

      const [affRows]: any = await pool.query("SELECT subscription_id FROM affiliations WHERE id = ? LIMIT 1", [affiliationId]);
      if (affRows.length === 0) return res.status(404).json({ error: "Affiliation not found" });

      const [cycleRows]: any = await pool.query(
        "SELECT id FROM subscription_cycles WHERE subscription_id = ? AND status = 'active' ORDER BY cycle_number DESC LIMIT 1",
        [affRows[0].subscription_id],
      );
      if (cycleRows.length === 0) return res.status(400).json({ error: "No active cycle found" });

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const { getBalanceForUpdate, createMovement } = await import("./sessionLedger");
        const balance = await getBalanceForUpdate(connection, "affiliation", affiliationId, cycleRows[0].id);
        const movementType = direction === "positive" ? "adjustment_positive" : "adjustment_negative";
        const movement = await createMovement(connection, {
          balanceId: balance.id,
          affiliationId,
          cycleId: cycleRows[0].id,
          movementType,
          quantity: numberOrDefault(req.body.quantity, 1),
          reason,
          performedBy: req.user?.email || "system",
          idempotencyKey: req.headers["idempotency-key"] as string || normalizeString(req.body.idempotencyKey) || null,
        });
        await connection.commit();
        res.status(201).json({ movement: { id: movement.id, balanceAfter: movement.balanceAfter, type: movement.movementType } });
      } catch (error: any) {
        await connection.rollback();
        if (error.code === "NO_SESSIONS_AVAILABLE") return res.status(400).json({ error: error.message, code: error.code });
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) { next(error); }
  });

  // --- Reconciliation & Worker Status ---

  app.post("/api/v2/sessions/reconcile", requirePermission("platform.audit.read"), async (_req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const { reconcileBalances } = await import("./workers");
      const result = await reconcileBalances(pool);
      res.json(result);
    } catch (error) { next(error); }
  });

  app.post("/api/v2/workers/run-cycles", requirePermission("platform.audit.read"), async (_req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const { processCycleClosings } = await import("./workers");
      const result = await processCycleClosings(pool);
      res.json(result);
    } catch (error) { next(error); }
  });

  app.post("/api/v2/workers/drain-outbox", requirePermission("platform.audit.read"), async (_req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const { drainOutbox } = await import("./workers");
      const result = await drainOutbox(pool);
      res.json(result);
    } catch (error) { next(error); }
  });

  app.post("/api/v2/workers/release-expired", requirePermission("platform.audit.read"), async (_req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const { releaseExpiredReservations } = await import("./workers");
      const result = await releaseExpiredReservations(pool);
      res.json(result);
    } catch (error) { next(error); }
  });
}

// --- Mappers ---

function mapPlanVersion(row: any) {
  return {
    id: row.id,
    planId: row.plan_id,
    planName: row.plan_name || row.name,
    versionNumber: Number(row.version_number),
    name: row.name,
    description: row.description || "",
    planType: row.plan_type,
    price: Number(row.price || 0),
    currency: row.currency || "USD",
    durationDays: Number(row.duration_days),
    autoRenew: Boolean(row.auto_renew),
    maxMembers: Number(row.max_members || 1),
    sessionsUnlimited: Boolean(row.sessions_unlimited),
    sessionsPerCycle: row.sessions_per_cycle ? Number(row.sessions_per_cycle) : null,
    cycleFrequency: row.cycle_frequency || "monthly",
    distributionModel: row.distribution_model || "individual",
    carryoverEnabled: Boolean(row.carryover_enabled),
    carryoverMax: row.carryover_max ? Number(row.carryover_max) : null,
    extraSessionPrice: row.extra_session_price ? Number(row.extra_session_price) : null,
    consumptionPriority: Number(row.consumption_priority || 0),
    gracePeriodDays: Number(row.grace_period_days || 0),
    benefits: typeof row.benefits === "string" ? JSON.parse(row.benefits || "null") : row.benefits,
    restrictions: typeof row.restrictions === "string" ? JSON.parse(row.restrictions || "null") : row.restrictions,
    bookingPolicy: typeof row.booking_policy === "string" ? JSON.parse(row.booking_policy || "null") : row.booking_policy,
    status: row.status,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
  };
}

function mapSubscription(row: any) {
  const holderFirstName = row.holder_first_name || "";
  const holderLastName = row.holder_last_name || "";
  return {
    id: row.id,
    planId: row.plan_id,
    planVersionId: row.plan_version_id,
    planName: row.plan_name || "",
    planType: row.plan_type || "individual",
    holderMemberId: row.holder_member_id,
    holderFirstName,
    holderLastName,
    holderName: `${holderFirstName} ${holderLastName}`.trim(),
    status: row.status,
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : "",
    endDate: row.end_date ? String(row.end_date).slice(0, 10) : "",
    autoRenew: Boolean(row.auto_renew),
    pricePaid: Number(row.price_paid || 0),
    currency: row.currency || "USD",
    paymentStatus: row.payment_status || "pending",
    maxMembers: Number(row.max_members || 1),
    sessionsUnlimited: row.sessions_unlimited !== undefined ? Boolean(row.sessions_unlimited) : true,
    sessionsPerCycle: row.sessions_per_cycle ? Number(row.sessions_per_cycle) : null,
    distributionModel: row.distribution_model || "individual",
    version: Number(row.version || 1),
    legacySubscriptionId: row.legacy_subscription_id || null,
  };
}

function mapAffiliation(row: any) {
  return {
    id: row.id,
    memberId: row.member_id,
    subscriptionId: row.subscription_id,
    planVersionId: row.plan_version_id,
    planName: row.plan_name || "",
    planType: row.plan_type || "individual",
    status: row.status,
    role: row.role,
    isPrimary: Boolean(row.is_primary),
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : "",
    endDate: row.end_date ? String(row.end_date).slice(0, 10) : "",
    sessionsUnlimited: row.sessions_unlimited !== undefined ? Boolean(row.sessions_unlimited) : true,
    subscriptionStatus: row.subscription_status || "",
    consumptionPriority: Number(row.consumption_priority || 0),
  };
}

function mapMovementRow(row: any) {
  return {
    id: row.id,
    balanceId: row.balance_id,
    affiliationId: row.affiliation_id || null,
    cycleId: row.cycle_id,
    movementType: row.movement_type,
    quantity: Number(row.quantity),
    direction: row.direction,
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    referenceType: row.reference_type || null,
    referenceId: row.reference_id || null,
    reason: row.reason || null,
    performedBy: row.performed_by || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
