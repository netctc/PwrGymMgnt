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
import { getSessionBalanceContext, mapBalance } from "./sessionLedger";
import { createInitialCycle } from "./subscriptionCycles";
import {
  assertNoOutstandingSubscriptionPayment,
  normalizePaymentStatus,
} from "./subscriptionPaymentRules";

type PoolProvider = () => Pool | null;
type AuthenticatedRequest = Request & { user?: { uid?: string; email?: string; role?: string } };

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function createInvoiceNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `INV-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
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
    let connection: any = null;
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
      await assertNoOutstandingSubscriptionPayment(pool, holderMemberId);

      const startDate = normalizeDate(req.body.startDate) || new Date().toISOString().slice(0, 10);
      const endDate = normalizeDate(req.body.endDate) || addDays(startDate, Number(pv.duration_days));
      const rawPaymentStatus = normalizeString(req.body.paymentStatus);
      if (!["paid", "pending"].includes(rawPaymentStatus)) {
        return res.status(400).json({ error: "paymentStatus must be paid or pending" });
      }
      if (endDate < startDate) {
        return res.status(400).json({ error: "endDate cannot be before startDate" });
      }
      const paymentStatus = normalizePaymentStatus(rawPaymentStatus);
      const today = new Date().toISOString().slice(0, 10);
      const paymentDate =
        paymentStatus === "paid" ? today : normalizeDate(req.body.paymentDate);
      if (!paymentDate) {
        return res.status(400).json({
          error: "An estimated payment date is required for pending payments",
        });
      }
      if (paymentStatus === "pending" && paymentDate < today) {
        return res.status(400).json({
          error: "The estimated payment date cannot be in the past",
        });
      }
      if (paymentStatus === "pending" && paymentDate > endDate) {
        return res.status(400).json({
          error: "The estimated payment date cannot be after the subscription end date",
        });
      }

      const id = createId("sub");
      connection = await pool.getConnection();
      await connection.beginTransaction();
      await connection.query(
        `INSERT INTO subscriptions (id, plan_id, plan_version_id, holder_member_id, status, start_date, end_date, auto_renew, price_paid, currency, payment_status, max_members)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
        [id, pv.plan_id, planVersionId, holderMemberId, startDate, endDate, pv.auto_renew, Number(pv.price), pv.currency, paymentStatus, Number(pv.max_members)],
      );

      // Create subscription_member for holder
      const smId = createId("sm");
      await connection.query(
        "INSERT INTO subscription_members (id, subscription_id, member_id, role, status, joined_at) VALUES (?, ?, ?, 'holder', 'active', NOW())",
        [smId, id, holderMemberId],
      );

      // Create affiliation for holder
      const affId = createId("aff");
      const [existingAffiliations]: any = await connection.query(
        `SELECT id
           FROM affiliations
          WHERE member_id = ?
            AND status = 'active'
            AND end_date >= CURDATE()
          LIMIT 1
          FOR UPDATE`,
        [holderMemberId],
      );
      const isPrimary = existingAffiliations.length === 0 ? 1 : 0;
      await connection.query(
        `INSERT INTO affiliations (id, member_id, subscription_id, subscription_member_id, plan_version_id, status, role, is_primary, start_date, end_date, consumption_priority)
         VALUES (?, ?, ?, ?, ?, 'active', 'holder', ?, ?, ?, ?)`,
        [affId, holderMemberId, id, smId, planVersionId, isPrimary, startDate, endDate, Number(pv.consumption_priority)],
      );

      await createInitialCycle(
        connection,
        id,
        startDate,
        endDate,
        pv.sessions_unlimited ? null : Number(pv.sessions_per_cycle || 0),
        pv.distribution_model || "individual",
        [affId],
        {
          cycleFrequency: pv.cycle_frequency || "monthly",
          subscriptionEndDate: endDate,
          customAllocations: {
            [affId]: Number(
              (typeof pv.data === "string" ? JSON.parse(pv.data || "{}") : pv.data)
                ?.holderSessionsPerCycle || pv.sessions_per_cycle || 0,
            ),
          },
        },
      );
      const invoiceId = createId("inv");
      const invoiceNumber = createInvoiceNumber();
      await connection.query(
        `INSERT INTO invoices
          (id, invoice_number, member_id, subscription_id, status,
           subtotal, tax_amount, total, currency, due_date, paid_at, data)
         VALUES (?, ?, ?, NULL, ?, ?, 0, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          invoiceNumber,
          holderMemberId,
          paymentStatus === "paid" ? "paid" : "issued",
          Number(pv.price || 0),
          Number(pv.price || 0),
          pv.currency || "USD",
          paymentDate,
          paymentStatus === "paid" ? new Date() : null,
          JSON.stringify({
            source: "subscription_v2",
            subscriptionV2Id: id,
            paymentStatus,
            expectedPaymentDate:
              paymentStatus === "pending" ? paymentDate : null,
          }),
        ],
      );
      await connection.query(
        `UPDATE subscriptions
            SET data = JSON_SET(
              COALESCE(data, JSON_OBJECT()),
              '$.expectedPaymentDate', ?
            )
          WHERE id = ?`,
        [paymentStatus === "pending" ? paymentDate : null, id],
      );
      await connection.query(
        `INSERT INTO finance_transactions
          (id, type, category, amount, transaction_date, source, reference_type,
           reference_id, description, status, created_by, approved_by, data)
         VALUES (?, 'income', 'Membership Subscription', ?, ?,
                 'subscription', 'subscription_v2_payment', ?, ?, ?, ?, ?, ?)`,
        [
          createId("ftx"),
          Number(pv.price || 0),
          paymentDate,
          id,
          `Subscription payment ${invoiceNumber} - member ${holderMemberId} - ${pv.name || "plan"}`,
          paymentStatus === "paid" ? "posted" : "pending",
          req.user?.email || req.user?.uid || "system",
          paymentStatus === "paid"
            ? req.user?.email || req.user?.uid || "system"
            : null,
          JSON.stringify({
            source: "subscription_v2",
            subscriptionId: id,
            paymentStatus,
            invoiceNumber,
            currency: pv.currency || "USD",
          }),
        ],
      );
      await connection.query(
        "INSERT INTO outbox_events (id, event_type, payload, status) VALUES (?, 'subscription_created', ?, 'pending')",
        [
          createId("evt"),
          JSON.stringify({
            subscriptionId: id,
            holderMemberId,
            planVersionId,
            paymentStatus,
          }),
        ],
      );
      await connection.commit();
      const [rows]: any = await pool.query("SELECT s.*, pv.name AS plan_name, pv.plan_type FROM subscriptions s LEFT JOIN plan_versions pv ON pv.id = s.plan_version_id WHERE s.id = ?", [id]);
      res.status(201).json({
        subscription: mapSubscription(rows[0]),
        affiliationId: affId,
        invoiceNumber,
        paymentDate,
      });
    } catch (error) {
      if (connection) await connection.rollback();
      next(error);
    } finally {
      if (connection) connection.release();
    }
  });

  app.patch("/api/v2/subscriptions/:id/payment-status", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    let connection: any = null;
    try {
      const pool = requirePool(poolProvider);
      const paymentStatus = normalizePaymentStatus(req.body.paymentStatus);
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [rows]: any = await connection.query(
        `SELECT s.payment_status, s.price_paid, s.currency, s.start_date,
                s.end_date, s.data, s.holder_member_id,
                pv.name AS plan_name,
                holder.first_name AS holder_first_name,
                holder.last_name AS holder_last_name
           FROM subscriptions s
           LEFT JOIN plan_versions pv ON pv.id = s.plan_version_id
           LEFT JOIN members holder ON holder.id = s.holder_member_id
          WHERE s.id = ?
          LIMIT 1
          FOR UPDATE`,
        [req.params.id],
      );
      if (!rows.length) {
        await connection.rollback();
        return res.status(404).json({ error: "Subscription not found" });
      }
      const previousPaymentStatus = rows[0].payment_status;
      if (previousPaymentStatus === "paid" && paymentStatus !== "paid") {
        await connection.rollback();
        return res.status(409).json({
          error: "A paid subscription payment status is locked",
          code: "PAID_SUBSCRIPTION_LOCKED",
        });
      }
      const today = new Date().toISOString().slice(0, 10);
      const paymentDate =
        paymentStatus === "paid" ? today : normalizeDate(req.body.paymentDate);
      if (!paymentDate) {
        await connection.rollback();
        return res.status(400).json({
          error: "An estimated payment date is required for pending payments",
        });
      }
      if (paymentStatus === "pending" && paymentDate < today) {
        await connection.rollback();
        return res.status(400).json({
          error: "The estimated payment date cannot be in the past",
        });
      }
      if (
        paymentStatus === "pending" &&
        paymentDate > String(rows[0].end_date).slice(0, 10)
      ) {
        await connection.rollback();
        return res.status(400).json({
          error: "The estimated payment date cannot be after the subscription end date",
        });
      }

      let invoiceNumber: string | null = null;
      let invoiceId: string | null = null;
      let accountingReferenceType = "subscription_v2_payment";
      let accountingReferenceId = req.params.id;
      let accountingCategory = "Membership Subscription";
      let accountingDescriptionPrefix = "Subscription payment";
      const [invoiceRows]: any = await connection.query(
        `SELECT id, invoice_number, data
           FROM invoices
          WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.subscriptionV2Id')) = ?
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE`,
        [req.params.id],
      );
      const existingInvoiceData =
        typeof invoiceRows[0]?.data === "string"
          ? JSON.parse(invoiceRows[0].data || "{}")
          : invoiceRows[0]?.data || {};
      if (invoiceRows.length) {
        invoiceId = invoiceRows[0].id;
        invoiceNumber = invoiceRows[0].invoice_number;
        if (existingInvoiceData.source === "subscription_v2_renewal") {
          accountingReferenceType = "subscription_v2_renewal_invoice";
          accountingReferenceId = invoiceId!;
          accountingCategory = "Membership Renewal";
          accountingDescriptionPrefix = "Subscription renewal";
        }
        await connection.query(
          `UPDATE invoices
              SET status = ?,
                  due_date = ?,
                  paid_at = CASE WHEN ? = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END,
                  data = JSON_SET(
                    COALESCE(data, JSON_OBJECT()),
                    '$.paymentStatus', ?,
                    '$.expectedPaymentDate', ?
                  ),
                  updated_at = NOW()
            WHERE id = ?`,
          [
            paymentStatus === "paid" ? "paid" : "issued",
            paymentDate,
            paymentStatus,
            paymentStatus,
            paymentStatus === "pending" ? paymentDate : null,
            invoiceId,
          ],
        );
      } else {
        invoiceId = createId("inv");
        invoiceNumber = createInvoiceNumber();
        await connection.query(
          `INSERT INTO invoices
            (id, invoice_number, member_id, subscription_id, status,
             subtotal, tax_amount, total, currency, due_date, paid_at, data)
           VALUES (?, ?, ?, NULL, ?, ?, 0, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            invoiceNumber,
            rows[0].holder_member_id,
            paymentStatus === "paid" ? "paid" : "issued",
            Number(rows[0].price_paid || 0),
            Number(rows[0].price_paid || 0),
            rows[0].currency || "USD",
            paymentDate,
            paymentStatus === "paid" ? new Date() : null,
            JSON.stringify({
              source: "subscription_v2",
              subscriptionV2Id: req.params.id,
              paymentStatus,
              expectedPaymentDate:
                paymentStatus === "pending" ? paymentDate : null,
            }),
          ],
        );
      }
      await connection.query(
        `UPDATE subscriptions
            SET payment_status = ?,
                data = JSON_SET(
                  COALESCE(data, JSON_OBJECT()),
                  '$.expectedPaymentDate', ?
                ),
                version = version + 1,
                updated_at = NOW()
          WHERE id = ?`,
        [
          paymentStatus,
          paymentStatus === "pending" ? paymentDate : null,
          req.params.id,
        ],
      );
      const accountingStatus = paymentStatus === "paid" ? "posted" : "pending";
      const holderName = `${rows[0].holder_first_name || ""} ${rows[0].holder_last_name || ""}`.trim();
      const accountingTransactionId = createId("ftx");
      await connection.query(
        `INSERT INTO finance_transactions
          (id, type, category, amount, transaction_date, source, reference_type,
           reference_id, description, status, created_by, approved_by, data)
         VALUES (?, 'income', ?, ?, ?,
                 'subscription', ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           amount = VALUES(amount),
           transaction_date = VALUES(transaction_date),
           description = VALUES(description),
           status = VALUES(status),
           approved_by = VALUES(approved_by),
           data = VALUES(data),
           updated_at = CURRENT_TIMESTAMP`,
        [
          accountingTransactionId,
          accountingCategory,
          Number(rows[0].price_paid || 0),
          paymentDate,
          accountingReferenceType,
          accountingReferenceId,
          `${accountingDescriptionPrefix}${invoiceNumber ? ` ${invoiceNumber}` : ""} - ${holderName || "member"} - ${rows[0].plan_name || "plan"}`,
          accountingStatus,
          req.user?.email || req.user?.uid || "system",
          paymentStatus === "paid"
            ? req.user?.email || req.user?.uid || "system"
            : null,
          JSON.stringify({
            source: "subscription_v2",
            subscriptionId: req.params.id,
            paymentStatus,
            previousPaymentStatus,
            invoiceNumber,
            currency: rows[0].currency || "USD",
          }),
        ],
      );
      await connection.query(
        "INSERT INTO outbox_events (id, event_type, payload, status) VALUES (?, 'subscription_payment_status_changed', ?, 'pending')",
        [createId("evt"), JSON.stringify({
          subscriptionId: req.params.id,
          previousPaymentStatus,
          paymentStatus,
          changedBy: req.user?.email || req.user?.uid || null,
        })],
      );
      await connection.commit();
      res.json({
        ok: true,
        previousPaymentStatus,
        paymentStatus,
        paymentDate,
        accountingStatus,
        invoiceNumber,
        paymentStatusLocked: paymentStatus === "paid",
      });
    } catch (error) {
      if (connection) await connection.rollback();
      next(error);
    } finally {
      if (connection) connection.release();
    }
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
      await assertNoOutstandingSubscriptionPayment(pool, memberId);

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
  app.get("/api/v2/subscriptions/:id/session-summary", requirePermission("membership.read"), async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const [rows]: any = await pool.query(
        `SELECT s.id AS subscription_id, s.payment_status,
                pv.sessions_unlimited, pv.sessions_per_cycle, pv.cycle_frequency,
                pv.distribution_model, sc.id AS cycle_id, sc.cycle_number,
                sc.start_date AS cycle_start_date, sc.end_date AS cycle_end_date,
                COALESCE(SUM(sb.included), 0) AS included,
                COALESCE(SUM(sb.carried_over), 0) AS carried_over,
                COALESCE(SUM(sb.purchased), 0) AS purchased,
                COALESCE(SUM(sb.adjustments_positive), 0) AS adjustments_positive,
                COALESCE(SUM(sb.refunds), 0) AS refunds,
                COALESCE(SUM(sb.reserved), 0) AS reserved,
                COALESCE(SUM(sb.consumed), 0) AS consumed,
                COALESCE(SUM(sb.expired), 0) AS expired,
                COALESCE(SUM(sb.adjustments_negative), 0) AS adjustments_negative,
                COALESCE(SUM(sb.available), 0) AS available
           FROM subscriptions s
           JOIN plan_versions pv ON pv.id = s.plan_version_id
           LEFT JOIN subscription_cycles sc
             ON sc.subscription_id = s.id AND sc.status = 'active'
           LEFT JOIN session_balances sb ON sb.cycle_id = sc.id
          WHERE s.id = ?
          GROUP BY s.id, pv.id, sc.id`,
        [req.params.id],
      );
      if (!rows.length) return res.status(404).json({ error: "Subscription not found" });
      const row = rows[0];
      res.json({
        summary: {
          subscriptionId: row.subscription_id,
          paymentStatus: row.payment_status,
          sessionsUnlimited: Boolean(row.sessions_unlimited),
          sessionsPerCycle: row.sessions_per_cycle === null ? null : Number(row.sessions_per_cycle),
          cycleFrequency: row.cycle_frequency,
          distributionModel: row.distribution_model,
          cycleId: row.cycle_id || null,
          cycleNumber: row.cycle_number ? Number(row.cycle_number) : null,
          cycleStartDate: row.cycle_start_date ? String(row.cycle_start_date).slice(0, 10) : null,
          cycleEndDate: row.cycle_end_date ? String(row.cycle_end_date).slice(0, 10) : null,
          nextResetDate: row.cycle_end_date ? String(row.cycle_end_date).slice(0, 10) : null,
          included: Number(row.included),
          assigned: Number(row.included),
          reserved: Number(row.reserved),
          consumed: Number(row.consumed),
          cancelledOrReturned: Number(row.refunds),
          additional: Number(row.purchased),
          accumulated: Number(row.carried_over),
          adjustmentsPositive: Number(row.adjustments_positive),
          adjustmentsNegative: Number(row.adjustments_negative),
          expired: Number(row.expired),
          remaining: Number(row.available),
        },
      });
    } catch (error) { next(error); }
  });

  app.post("/api/v2/affiliations/:id/primary", requirePermission("membership.write"), async (req, res, next) => {
    let connection: any = null;
    try {
      const pool = requirePool(poolProvider);
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [rows]: any = await connection.query(
        `SELECT a.id, a.member_id
           FROM affiliations a
           JOIN subscriptions s ON s.id = a.subscription_id
          WHERE a.id = ?
            AND a.status = 'active'
            AND a.end_date >= CURDATE()
            AND s.status = 'active'
            AND s.end_date >= CURDATE()
          LIMIT 1
          FOR UPDATE`,
        [req.params.id],
      );
      if (!rows.length) {
        await connection.rollback();
        return res.status(409).json({
          error: "Only an active affiliation can be selected as primary",
          code: "AFFILIATION_NOT_ACTIVE",
        });
      }
      await connection.query(
        "UPDATE affiliations SET is_primary = 0, updated_at = NOW() WHERE member_id = ?",
        [rows[0].member_id],
      );
      await connection.query(
        "UPDATE affiliations SET is_primary = 1, updated_at = NOW() WHERE id = ?",
        [req.params.id],
      );
      await connection.commit();
      res.json({ ok: true, affiliationId: req.params.id });
    } catch (error) {
      if (connection) await connection.rollback();
      next(error);
    } finally {
      if (connection) connection.release();
    }
  });

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

  app.post("/api/v2/sessions/register-event", requirePermission("membership.access.validate"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const affiliationId = normalizeString(req.body.affiliationId);
      const eventMoment = normalizeString(req.body.eventMoment);
      const referenceType = normalizeString(req.body.referenceType) || "service";
      const referenceId = normalizeString(req.body.referenceId);
      const quantity = Math.max(1, numberOrDefault(req.body.quantity, 1));
      if (!affiliationId || !eventMoment || !referenceId) {
        return res.status(400).json({
          error: "affiliationId, eventMoment and referenceId are required",
        });
      }
      const [affRows]: any = await pool.query(
        `SELECT a.subscription_id, pv.distribution_model, pv.sessions_unlimited,
                pv.booking_policy
           FROM affiliations a
           JOIN subscriptions s ON s.id = a.subscription_id AND s.status = 'active'
           JOIN plan_versions pv ON pv.id = a.plan_version_id
          WHERE a.id = ? AND a.status = 'active' AND a.end_date >= CURDATE()
          LIMIT 1`,
        [affiliationId],
      );
      if (!affRows.length) return res.status(404).json({ error: "Active affiliation not found" });
      if (affRows[0].sessions_unlimited) {
        return res.json({ processed: false, reason: "UNLIMITED_PLAN" });
      }
      const policy = typeof affRows[0].booking_policy === "string"
        ? JSON.parse(affRows[0].booking_policy || "{}")
        : (affRows[0].booking_policy || {});
      const deductionMoment = policy.deductionMoment || "booking_confirmation";
      if (eventMoment !== "no_show" && eventMoment !== deductionMoment) {
        return res.json({
          processed: false,
          reason: "DEDUCTION_DEFERRED",
          configuredMoment: deductionMoment,
        });
      }
      const [cycleRows]: any = await pool.query(
        "SELECT id FROM subscription_cycles WHERE subscription_id = ? AND status = 'active' ORDER BY cycle_number DESC LIMIT 1",
        [affRows[0].subscription_id],
      );
      if (!cycleRows.length) return res.status(409).json({ error: "No active cycle found" });
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const { createMovement, getBalanceForUpdate } = await import("./sessionLedger");
        const context = getSessionBalanceContext(
          affRows[0].distribution_model,
          affRows[0].subscription_id,
          affiliationId,
        );
        const balance = await getBalanceForUpdate(
          connection,
          context.contextType,
          context.contextId,
          cycleRows[0].id,
        );
        const [reservationRows]: any = await connection.query(
          `SELECT id, quantity
             FROM session_movements
            WHERE balance_id = ?
              AND reference_type = ?
              AND reference_id = ?
              AND movement_type = 'reservation'
              AND NOT EXISTS (
                SELECT 1 FROM session_movements follow_up
                 WHERE follow_up.related_movement_id = session_movements.id
                   AND follow_up.movement_type IN ('release', 'consumption')
              )
            ORDER BY created_at DESC LIMIT 1`,
          [balance.id, referenceType, referenceId],
        );
        const reservation = reservationRows[0];
        const shouldConsume = eventMoment !== "no_show" || policy.noShowConsumesSession !== false;
        let releaseMovement = null;
        if (reservation) {
          releaseMovement = await createMovement(connection, {
            balanceId: balance.id,
            affiliationId,
            cycleId: cycleRows[0].id,
            movementType: "release",
            quantity: Number(reservation.quantity),
            referenceType,
            referenceId,
            relatedMovementId: reservation.id,
            reason: shouldConsume
              ? "Reservation converted to final consumption"
              : "No-show policy returned the reserved session",
            performedBy: req.user?.email || req.user?.uid || "system",
            idempotencyKey: `event_release_${reservation.id}`,
          });
        }
        let movement = null;
        if (shouldConsume) {
          movement = await createMovement(connection, {
            balanceId: balance.id,
            affiliationId,
            cycleId: cycleRows[0].id,
            movementType: "consumption",
            quantity,
            referenceType,
            referenceId,
            relatedMovementId: reservation?.id || null,
            reason: normalizeString(req.body.reason) || `Session consumed at ${eventMoment}`,
            performedBy: req.user?.email || req.user?.uid || "system",
            idempotencyKey:
              req.headers["idempotency-key"] as string ||
              normalizeString(req.body.idempotencyKey) ||
              `session_event_${eventMoment}_${referenceType}_${referenceId}`,
          });
        }
        await connection.commit();
        res.status(201).json({
          processed: true,
          configuredMoment: deductionMoment,
          source: normalizeString(req.body.source) || "system",
          releaseMovementId: releaseMovement?.id || null,
          movement,
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) { next(error); }
  });

  app.post("/api/v2/sessions/consume", requirePermission("membership.access.validate"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      if (!await requireFeature(pool, "ENABLE_SESSION_LEDGER", res)) return;

      const affiliationId = normalizeString(req.body.affiliationId);
      if (!affiliationId) return res.status(400).json({ error: "affiliationId is required" });

      // Find active cycle for this affiliation's subscription
      const [affRows]: any = await pool.query(
        `SELECT a.subscription_id, pv.distribution_model
           FROM affiliations a
           JOIN plan_versions pv ON pv.id = a.plan_version_id
          WHERE a.id = ? AND a.status = 'active' LIMIT 1`,
        [affiliationId],
      );
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
        const context = getSessionBalanceContext(affRows[0].distribution_model, affRows[0].subscription_id, affiliationId);
        const balance = await getBalanceForUpdate(connection, context.contextType, context.contextId, cycleId);
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

      const [affRows]: any = await pool.query(
        `SELECT a.subscription_id, pv.distribution_model
           FROM affiliations a
           JOIN plan_versions pv ON pv.id = a.plan_version_id
          WHERE a.id = ? AND a.status = 'active' LIMIT 1`,
        [affiliationId],
      );
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
        const context = getSessionBalanceContext(affRows[0].distribution_model, affRows[0].subscription_id, affiliationId);
        const balance = await getBalanceForUpdate(connection, context.contextType, context.contextId, cycleRows[0].id);
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

      const [affRows]: any = await pool.query(
        `SELECT a.subscription_id, pv.distribution_model
           FROM affiliations a
           JOIN plan_versions pv ON pv.id = a.plan_version_id
          WHERE a.id = ? LIMIT 1`,
        [affiliationId],
      );
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
        const context = getSessionBalanceContext(affRows[0].distribution_model, affRows[0].subscription_id, affiliationId);
        const balance = await getBalanceForUpdate(connection, context.contextType, context.contextId, cycleRows[0].id);
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

      const [affRows]: any = await pool.query(
        `SELECT a.subscription_id, pv.distribution_model
           FROM affiliations a
           JOIN plan_versions pv ON pv.id = a.plan_version_id
          WHERE a.id = ? LIMIT 1`,
        [affiliationId],
      );
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
        const context = getSessionBalanceContext(affRows[0].distribution_model, affRows[0].subscription_id, affiliationId);
        const balance = await getBalanceForUpdate(connection, context.contextType, context.contextId, cycleRows[0].id);
        const movementType = direction === "positive" ? "adjustment_positive" : "adjustment_negative";
        const movement = await createMovement(connection, {
          balanceId: balance.id,
          affiliationId,
          cycleId: cycleRows[0].id,
          movementType,
          quantity: numberOrDefault(req.body.quantity, 1),
          referenceType: normalizeString(req.body.referenceType) || "manual_adjustment",
          referenceId: normalizeString(req.body.referenceId) || null,
          relatedMovementId: normalizeString(req.body.relatedMovementId) || null,
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

  app.post("/api/v2/sessions/purchase", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const affiliationId = normalizeString(req.body.affiliationId);
      const quantity = Math.max(1, numberOrDefault(req.body.quantity, 1));
      if (!affiliationId) return res.status(400).json({ error: "affiliationId is required" });
      const [affRows]: any = await pool.query(
        `SELECT a.subscription_id, pv.distribution_model, pv.extra_session_price,
                pv.data AS plan_data
           FROM affiliations a
           JOIN plan_versions pv ON pv.id = a.plan_version_id
          WHERE a.id = ? AND a.status = 'active' LIMIT 1`,
        [affiliationId],
      );
      if (!affRows.length) return res.status(404).json({ error: "Active affiliation not found" });
      const planData = typeof affRows[0].plan_data === "string"
        ? JSON.parse(affRows[0].plan_data || "{}")
        : (affRows[0].plan_data || {});
      if (!planData.allowExtraSessions && affRows[0].extra_session_price === null) {
        return res.status(409).json({
          error: "This plan does not allow additional session purchases",
          code: "EXTRA_SESSIONS_NOT_ALLOWED",
        });
      }
      const [cycleRows]: any = await pool.query(
        "SELECT id FROM subscription_cycles WHERE subscription_id = ? AND status = 'active' ORDER BY cycle_number DESC LIMIT 1",
        [affRows[0].subscription_id],
      );
      if (!cycleRows.length) return res.status(409).json({ error: "No active cycle found" });
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const { getBalanceForUpdate, createMovement } = await import("./sessionLedger");
        const context = getSessionBalanceContext(
          affRows[0].distribution_model,
          affRows[0].subscription_id,
          affiliationId,
        );
        const balance = await getBalanceForUpdate(
          connection,
          context.contextType,
          context.contextId,
          cycleRows[0].id,
        );
        const movement = await createMovement(connection, {
          balanceId: balance.id,
          affiliationId,
          cycleId: cycleRows[0].id,
          movementType: "purchase",
          quantity,
          referenceType: "additional_session_purchase",
          referenceId: normalizeString(req.body.referenceId) || null,
          reason: normalizeString(req.body.reason) || "Additional sessions purchased",
          performedBy: req.user?.email || req.user?.uid || "system",
          idempotencyKey: req.headers["idempotency-key"] as string || normalizeString(req.body.idempotencyKey) || null,
        });
        await connection.commit();
        res.status(201).json({
          movement,
          unitPrice: Number(affRows[0].extra_session_price || 0),
          totalPrice: Number(affRows[0].extra_session_price || 0) * quantity,
        });
      } catch (error) {
        await connection.rollback();
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
  const subscriptionData =
    typeof row.data === "string"
      ? JSON.parse(row.data || "{}")
      : row.data || {};
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
    expectedPaymentDate:
      subscriptionData.expectedPaymentDate || null,
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
