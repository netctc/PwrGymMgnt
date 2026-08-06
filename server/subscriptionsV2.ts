/**
 * Subscriptions V2 — New subscription model with plan versions, multi-user, affiliations.
 * 
 * Read routes remain available for existing records. Feature flags guard creation and
 * evolution operations while the existing membership.ts module remains in transition.
 */

import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import type { Pool } from "mysql2/promise";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { requirePermission } from "./rbac";
import { isFeatureEnabled } from "./featureFlags";
import { getSessionBalanceContext, mapBalance } from "./sessionLedger";
import { createInitialCycle } from "./subscriptionCycles";
import {
  assertNoOutstandingSubscriptionPayment,
  findOutstandingSubscriptionPayment,
  normalizePaymentStatus,
} from "./subscriptionPaymentRules";
import { upsertTrainerPlanCommission } from "./trainerCommissions";
import {
  buildContractTerms,
  claimContractCreation,
  completeContractCreation,
  createInitialContractPeriod,
  hashContractRequest,
} from "./domain/v2/contractCreation";

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
      const status = normalizeString(req.query.status) || "active";
      const memberStatus = normalizeString(req.query.memberStatus);
      const paymentStatus = normalizeString(req.query.paymentStatus);
      const planId = normalizeString(req.query.planId);
      const planType = normalizeString(req.query.planType);
      const trainerId = normalizeString(req.query.trainerId);
      const from = normalizeDate(req.query.from);
      const to = normalizeDate(req.query.to);
      const sessions = normalizeString(req.query.sessions);
      const search = normalizeString(req.query.search).toLowerCase();
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
      if (status !== "all") { where.push("s.status = ?"); params.push(status); }
      if (memberStatus && memberStatus !== "all") {
        where.push("LOWER(TRIM(holder.status)) = ?");
        params.push(memberStatus.toLowerCase());
      }
      if (paymentStatus && paymentStatus !== "all") {
        where.push("s.payment_status = ?");
        params.push(paymentStatus);
      }
      if (planId && planId !== "all") {
        where.push("s.plan_id = ?");
        params.push(planId);
      }
      if (planType && planType !== "all") {
        where.push("pv.plan_type = ?");
        params.push(planType);
      }
      if (trainerId && trainerId !== "all") {
        where.push("pv.trainer_id = ?");
        params.push(trainerId);
      }
      if (from) {
        where.push("s.end_date >= ?");
        params.push(from);
      }
      if (to) {
        where.push("s.start_date <= ?");
        params.push(to);
      }
      if (sessions === "limited") where.push("pv.sessions_unlimited = 0");
      if (sessions === "unlimited") where.push("pv.sessions_unlimited = 1");
      if (search) {
        where.push(`(
          LOWER(CONCAT(COALESCE(holder.first_name, ''), ' ', COALESCE(holder.last_name, ''))) LIKE ?
          OR LOWER(COALESCE(holder.email, '')) LIKE ?
          OR LOWER(COALESCE(pv.name, '')) LIKE ?
          OR LOWER(COALESCE(pv.trainer_name, '')) LIKE ?
          OR LOWER(s.id) LIKE ?
        )`);
        const pattern = `%${search}%`;
        params.push(pattern, pattern, pattern, pattern, pattern);
      }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const [rows]: any = await pool.query(
        `SELECT s.*, pv.name AS plan_name, pv.plan_type, pv.sessions_unlimited,
                pv.sessions_per_cycle, pv.distribution_model, pv.cycle_frequency,
                pv.trainer_id, pv.trainer_name,
                holder.first_name AS holder_first_name,
                holder.last_name AS holder_last_name,
                holder.email AS holder_email,
                holder.status AS holder_status,
                (
                  SELECT a_holder.id
                    FROM affiliations a_holder
                   WHERE a_holder.subscription_id = s.id
                     AND a_holder.member_id = s.holder_member_id
                   ORDER BY (a_holder.role = 'holder') DESC, a_holder.created_at
                   LIMIT 1
                ) AS holder_affiliation_id,
                (
                  SELECT COUNT(*)
                    FROM subscription_members sm_count
                   WHERE sm_count.subscription_id = s.id
                     AND sm_count.status IN ('active', 'suspended')
                ) AS active_members,
                (
                  SELECT COALESCE(SUM(sb_summary.included), 0)
                    FROM subscription_cycles sc_summary
                    JOIN session_balances sb_summary ON sb_summary.cycle_id = sc_summary.id
                   WHERE sc_summary.subscription_id = s.id
                     AND sc_summary.status = 'active'
                ) AS sessions_contracted,
                (
                  SELECT COALESCE(SUM(movement.quantity), 0)
                    FROM session_movements movement
                    JOIN affiliations movement_affiliation
                      ON movement_affiliation.id = movement.affiliation_id
                    JOIN subscription_cycles movement_cycle
                      ON movement_cycle.id = movement.cycle_id
                   WHERE movement_affiliation.subscription_id = s.id
                     AND movement_cycle.status = 'active'
                     AND movement.direction = '-'
                     AND movement.movement_type IN ('consumption', 'adjustment_negative')
                     AND NOT EXISTS (
                       SELECT 1
                         FROM session_movements reversal
                        WHERE reversal.related_movement_id = movement.id
                          AND reversal.direction = '+'
                          AND reversal.movement_type IN ('refund', 'compensation', 'adjustment_positive')
                     )
                ) AS sessions_consumed,
                (
                  SELECT COALESCE(SUM(sb_summary.available), 0)
                    FROM subscription_cycles sc_summary
                    JOIN session_balances sb_summary ON sb_summary.cycle_id = sc_summary.id
                   WHERE sc_summary.subscription_id = s.id
                     AND sc_summary.status = 'active'
                ) AS sessions_remaining
         FROM subscriptions s
         LEFT JOIN plan_versions pv ON pv.id = s.plan_version_id
         LEFT JOIN members holder ON holder.id = s.holder_member_id
         ${clause} ORDER BY s.created_at DESC LIMIT 500`,
        params,
      );

      const [legacyRows]: any = await pool.query(
        `SELECT ms.*, member.first_name AS holder_first_name,
                member.last_name AS holder_last_name,
                member.email AS holder_email,
                member.status AS holder_status,
                COALESCE(
                  JSON_UNQUOTE(JSON_EXTRACT(ms.data, '$.paymentStatus')),
                  (
                    SELECT CASE WHEN i.status = 'paid' THEN 'paid' ELSE 'pending' END
                      FROM invoices i
                     WHERE i.subscription_id = ms.id
                     ORDER BY i.created_at DESC
                     LIMIT 1
                  ),
                  'pending'
                ) AS resolved_payment_status
           FROM member_subscriptions ms
           JOIN members member ON member.id = ms.member_id
          WHERE NOT EXISTS (
                  SELECT 1
                    FROM subscriptions migrated
                   WHERE migrated.legacy_subscription_id = ms.id
                )
          ORDER BY ms.created_at DESC
          LIMIT 500`,
      );
      const normalizedSearch = search.toLowerCase();
      const legacySubscriptions = legacyRows
        .map((row: any) => ({
          id: row.id,
          planId: row.plan_id || null,
          planVersionId: null,
          planName: row.plan_name || "",
          planType: "individual",
          trainerId: null,
          trainerName: null,
          holderMemberId: row.member_id,
          holderFirstName: row.holder_first_name || "",
          holderLastName: row.holder_last_name || "",
          holderName: `${row.holder_first_name || ""} ${row.holder_last_name || ""}`.trim(),
          holderEmail: row.holder_email || "",
          holderStatus: row.holder_status || "",
          holderAffiliationId: null,
          status: row.status,
          startDate: row.start_date ? String(row.start_date).slice(0, 10) : "",
          endDate: row.end_date ? String(row.end_date).slice(0, 10) : "",
          autoRenew: false,
          pricePaid: Number(row.price || 0),
          currency: row.currency || "USD",
          paymentStatus: row.resolved_payment_status || "pending",
          expectedPaymentDate: null,
          maxMembers: 1,
          activeMembers: 1,
          sessionsUnlimited: true,
          sessionsPerCycle: null,
          cycleFrequency: "subscription",
          distributionModel: "individual",
          sessionsContracted: null,
          sessionsConsumed: null,
          sessionsRemaining: null,
          version: 1,
          legacySubscriptionId: row.id,
          source: "legacy",
        }))
        .filter((subscription: any) => {
          if (memberId && subscription.holderMemberId !== memberId) return false;
          if (
            status !== "all" &&
            String(subscription.status).toLowerCase() !== status.toLowerCase()
          ) return false;
          if (
            memberStatus &&
            memberStatus !== "all" &&
            String(subscription.holderStatus).toLowerCase() !== memberStatus.toLowerCase()
          ) return false;
          if (
            paymentStatus &&
            paymentStatus !== "all" &&
            subscription.paymentStatus !== paymentStatus
          ) return false;
          if (planId && planId !== "all" && subscription.planId !== planId) return false;
          if (planType && planType !== "all" && subscription.planType !== planType) return false;
          if (trainerId && trainerId !== "all") return false;
          if (from && subscription.endDate < from) return false;
          if (to && subscription.startDate > to) return false;
          if (sessions === "limited") return false;
          if (
            normalizedSearch &&
            ![
              subscription.id,
              subscription.planName,
              subscription.holderName,
              subscription.holderEmail,
            ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch))
          ) return false;
          return true;
        });
      const subscriptions = [
        ...rows.map(mapSubscription),
        ...legacySubscriptions,
      ].sort((left: any, right: any) =>
        String(right.startDate || "").localeCompare(String(left.startDate || "")),
      );
      const [planRows]: any = await pool.query(
        `SELECT DISTINCT id, name
           FROM (
             SELECT s.plan_id AS id, pv.name
               FROM subscriptions s
               JOIN plan_versions pv ON pv.id = s.plan_version_id
             UNION
             SELECT ms.plan_id AS id, ms.plan_name AS name
               FROM member_subscriptions ms
           ) available_plans
          WHERE id IS NOT NULL
          ORDER BY name`,
      );
      const [trainerRows]: any = await pool.query(
        `SELECT DISTINCT pv.trainer_id AS id, pv.trainer_name AS name
           FROM subscriptions s
           JOIN plan_versions pv ON pv.id = s.plan_version_id
          WHERE pv.trainer_id IS NOT NULL
            AND TRIM(COALESCE(pv.trainer_name, '')) <> ''
          ORDER BY pv.trainer_name`,
      );
      res.json({
        subscriptions,
        filterOptions: {
          plans: planRows.map((row: any) => ({ id: row.id, name: row.name })),
          trainers: trainerRows.map((row: any) => ({ id: row.id, name: row.name })),
        },
      });
    } catch (error) { next(error); }
  });

  app.post("/api/v2/subscriptions", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    let connection: any = null;
    try {
      const pool = requirePool(poolProvider);
      const planVersionId = normalizeString(req.body.planVersionId);
      const holderMemberId = normalizeString(req.body.holderMemberId);
      if (!planVersionId || !holderMemberId) return res.status(400).json({ error: "planVersionId and holderMemberId are required" });

      // Get plan version
      const [pvRows]: any = await pool.query("SELECT * FROM plan_versions WHERE id = ? AND status = 'active'", [planVersionId]);
      if (pvRows.length === 0) return res.status(404).json({ error: "Plan version not found or inactive" });
      const pv = pvRows[0];
      const confirmedOutstandingPayment = req.body.confirmOutstandingPayment === true;

      const rawPaymentStatus = normalizeString(req.body.paymentStatus);
      if (!["paid", "pending"].includes(rawPaymentStatus)) {
        return res.status(400).json({ error: "paymentStatus must be paid or pending" });
      }
      const paymentStatus = normalizePaymentStatus(rawPaymentStatus);
      const today = new Date().toISOString().slice(0, 10);
      const requestedStartDate =
        normalizeDate(req.body.startDate) || today;
      const requestedPaymentDate =
        paymentStatus === "paid"
          ? requestedStartDate
          : normalizeDate(req.body.paymentDate);
      if (!requestedPaymentDate) {
        return res.status(400).json({
          error: "An expected payment date is required for pending payments",
        });
      }
      if (paymentStatus === "pending" && requestedPaymentDate < today) {
        return res.status(400).json({
          error: "The expected payment date cannot be in the past",
        });
      }
      let terms: ReturnType<typeof buildContractTerms>;
      try {
        terms = buildContractTerms({
          startDate: requestedStartDate,
          endDate: normalizeDate(req.body.endDate) || undefined,
          durationDays: pv.duration_days,
          expectedPaymentDate: requestedPaymentDate,
          price: pv.price,
        });
      } catch (error: any) {
        return res.status(400).json({
          error: error?.message || "Invalid contract terms",
          code: error?.message || "INVALID_CONTRACT_TERMS",
        });
      }
      const {
        startDate,
        endDate,
        expectedPaymentDate: paymentDate,
        price,
      } = terms;

      const id = createId("sub");
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const idempotencyKey = normalizeString(req.get("Idempotency-Key"));
      const correlationId = idempotencyKey || createId("cor");
      if (idempotencyKey) {
        const claimed = await claimContractCreation(
          connection,
          idempotencyKey,
          hashContractRequest(req.body),
        );
        if (!claimed) {
          await connection.rollback();
          return res.status(409).json({
            error: "This contract creation request was already processed",
            code: "IDEMPOTENT_REQUEST_ALREADY_PROCESSED",
          });
        }
      }
      const outstandingPayment = await findOutstandingSubscriptionPayment(
        connection,
        holderMemberId,
      );
      if (outstandingPayment && !confirmedOutstandingPayment) {
        await connection.rollback();
        return res.status(409).json({
          error: "The member already has an active or inactive plan with a pending payment. Explicit confirmation is required to create another subscription.",
          code: "OUTSTANDING_SUBSCRIPTION_PAYMENT_CONFIRMATION_REQUIRED",
          outstandingPayment,
        });
      }
      const [duplicateAffiliations]: any = await connection.query(
        `SELECT a.id
           FROM affiliations a
           JOIN subscriptions existing_subscription
             ON existing_subscription.id = a.subscription_id
          WHERE a.member_id = ?
            AND a.status IN ('active', 'suspended')
            AND a.end_date >= CURDATE()
            AND existing_subscription.plan_id = ?
            AND existing_subscription.status = 'active'
            AND existing_subscription.end_date >= CURDATE()
          LIMIT 1
          FOR UPDATE`,
        [holderMemberId, pv.plan_id],
      );
      const [duplicateLegacySubscriptions]: any = await connection.query(
        `SELECT id
           FROM member_subscriptions
          WHERE member_id = ?
            AND plan_id = ?
            AND LOWER(TRIM(status)) = 'active'
            AND end_date >= CURDATE()
          LIMIT 1
          FOR UPDATE`,
        [holderMemberId, pv.plan_id],
      );
      if (
        duplicateAffiliations.length > 0 ||
        duplicateLegacySubscriptions.length > 0
      ) {
        await connection.rollback();
        return res.status(409).json({
          error: "The member already has an active subscription to this plan",
          code: "DUPLICATE_ACTIVE_PLAN",
        });
      }
      await connection.query(
        `INSERT INTO subscriptions (id, plan_id, plan_version_id, holder_member_id, status, start_date, end_date, auto_renew, price_paid, currency, payment_status, max_members)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
        [id, pv.plan_id, planVersionId, holderMemberId, startDate, endDate, pv.auto_renew, price, pv.currency, paymentStatus, Number(pv.max_members)],
      );

      const periodId = await createInitialContractPeriod(connection, {
        subscriptionId: id,
        terms,
        actorId: req.user?.email || req.user?.uid || null,
        correlationId,
      });

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
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          invoiceNumber,
          holderMemberId,
          id,
          paymentStatus === "paid" ? "paid" : "issued",
          price,
          price,
          pv.currency || "USD",
          paymentDate,
          paymentStatus === "paid" ? new Date() : null,
          JSON.stringify({
            source: "subscription_v2",
            subscriptionV2Id: id,
            periodStart: startDate,
            periodEnd: endDate,
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
          price,
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
      await upsertTrainerPlanCommission(connection, {
        subscriptionId: id,
        invoiceId,
        invoiceNumber,
        paymentStatus,
        dueDate: paymentDate,
        createdBy: req.user?.email || req.user?.uid || "system",
      });
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
      if (outstandingPayment && confirmedOutstandingPayment) {
        await connection.query(
          "INSERT INTO audit_logs (action, details, performed_by) VALUES ('subscription_created_with_pending_payment_confirmed', ?, ?)",
          [
            JSON.stringify({
              decision: "confirmed",
              holderMemberId,
              planVersionId,
              newSubscriptionId: id,
              newPaymentStatus: paymentStatus,
              outstandingPayment,
            }),
            req.user?.email || req.user?.uid || "system",
          ],
        );
      }
      if (idempotencyKey) {
        await completeContractCreation(connection, idempotencyKey, 201, {
          subscriptionId: id,
          affiliationId: affId,
          periodId,
          invoiceNumber,
        });
      }
      await connection.commit();
      const [rows]: any = await pool.query("SELECT s.*, pv.name AS plan_name, pv.plan_type FROM subscriptions s LEFT JOIN plan_versions pv ON pv.id = s.plan_version_id WHERE s.id = ?", [id]);
      res.status(201).json({
        subscription: mapSubscription(rows[0]),
        affiliationId: affId,
        periodId,
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

  app.post("/api/v2/subscriptions/pending-payment-decision", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const holderMemberId = normalizeString(req.body.holderMemberId);
      const memberIds = Array.from(new Set([
        holderMemberId,
        ...(Array.isArray(req.body.memberIds)
          ? req.body.memberIds.map(normalizeString)
          : []),
      ].filter(Boolean)));
      const planVersionId = normalizeString(req.body.planVersionId);
      const decision = normalizeString(req.body.decision).toLowerCase();
      if (!memberIds.length || !planVersionId || decision !== "cancelled") {
        return res.status(400).json({
          error: "At least one member, planVersionId and decision=cancelled are required",
        });
      }
      const outstandingPayments = (
        await Promise.all(memberIds.map(async (memberId) => ({
          memberId,
          payment: await findOutstandingSubscriptionPayment(pool, memberId),
        })))
      ).filter((entry) => entry.payment);
      await pool.query(
        "INSERT INTO audit_logs (action, details, performed_by) VALUES ('subscription_creation_with_pending_payment_cancelled', ?, ?)",
        [
          JSON.stringify({
            decision,
            memberIds,
            planVersionId,
            outstandingPayments,
          }),
          req.user?.email || req.user?.uid || "system",
        ],
      );
      res.json({ ok: true, decision });
    } catch (error) { next(error); }
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
              periodStart: rows[0].start_date,
              periodEnd: rows[0].end_date,
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
      if (invoiceId && invoiceNumber) {
        await upsertTrainerPlanCommission(connection, {
          subscriptionId: req.params.id,
          invoiceId,
          invoiceNumber,
          paymentStatus,
          dueDate: paymentDate,
          createdBy: req.user?.email || req.user?.uid || "system",
        });
      }
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
        `SELECT sm.*, m.first_name, m.last_name, m.email,
                a.id AS affiliation_id
         FROM subscription_members sm
         LEFT JOIN members m ON m.id = sm.member_id
         LEFT JOIN affiliations a
           ON a.subscription_id = sm.subscription_id
          AND a.member_id = sm.member_id
          AND a.status IN ('active', 'suspended')
         WHERE sm.subscription_id = ?
         ORDER BY sm.role = 'holder' DESC, sm.joined_at ASC`,
        [req.params.id],
      );
      res.json({
        members: rows.map((r: any) => ({
          id: r.id, subscriptionId: r.subscription_id, memberId: r.member_id,
          affiliationId: r.affiliation_id || null,
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

  app.get("/api/v2/subscriptions/:id/session-history.pdf", requirePermission("membership.read"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const [subscriptionRows]: any = await pool.query(
        `SELECT s.id, s.start_date, s.end_date, s.payment_status,
                pv.name AS plan_name, pv.plan_type, pv.sessions_unlimited,
                pv.trainer_name AS responsible_trainer,
                CONCAT_WS(' ', holder.first_name, holder.last_name) AS holder_name
           FROM subscriptions s
           JOIN plan_versions pv ON pv.id = s.plan_version_id
           JOIN members holder ON holder.id = s.holder_member_id
          WHERE s.id = ?
          LIMIT 1`,
        [req.params.id],
      );
      if (!subscriptionRows.length) {
        return res.status(404).json({ error: "Subscription not found" });
      }
      const subscription = subscriptionRows[0];
      if (Boolean(subscription.sessions_unlimited)) {
        return res.status(409).json({
          error: "Session history PDF is available only for limited-session subscriptions",
        });
      }

      const [movementRows]: any = await pool.query(
        `SELECT CONCAT_WS(' ', member.first_name, member.last_name) AS member_name,
                pv.name AS plan_name,
                COALESCE(
                  NULLIF(private_session.trainer_name, ''),
                  NULLIF(class_session.trainer_name, ''),
                  NULLIF(pv.trainer_name, ''),
                  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(movement.data, '$.trainerName')), ''),
                  'N/A'
                ) AS trainer_name,
                COALESCE(
                  private_session.start_time,
                  class_session.start_time,
                  movement.created_at
                ) AS session_datetime,
                CASE
                  WHEN private_session.id IS NOT NULL
                    THEN TIMESTAMPDIFF(MINUTE, private_session.start_time, private_session.end_time)
                  WHEN class_session.id IS NOT NULL
                    THEN TIMESTAMPDIFF(MINUTE, class_session.start_time, class_session.end_time)
                  ELSE CAST(JSON_UNQUOTE(JSON_EXTRACT(movement.data, '$.durationMinutes')) AS UNSIGNED)
                END AS duration_minutes,
                movement.quantity,
                movement.reason,
                reversal.created_at AS returned_at,
                CASE WHEN reversal.id IS NULL THEN 'Consumed' ELSE 'Returned' END AS movement_status
           FROM session_movements movement
           JOIN affiliations affiliation ON affiliation.id = movement.affiliation_id
           JOIN members member ON member.id = affiliation.member_id
           JOIN plan_versions pv ON pv.id = affiliation.plan_version_id
           LEFT JOIN private_sessions private_session
             ON movement.reference_id = private_session.id
            AND movement.reference_type IN ('private_session', 'private_pt', 'private_class')
           LEFT JOIN class_bookings booking
             ON movement.reference_id = booking.id
            AND movement.reference_type IN ('class_booking', 'booking')
           LEFT JOIN class_sessions class_session ON class_session.id = booking.class_id
           LEFT JOIN session_movements reversal
             ON reversal.id = (
               SELECT reversal_pick.id
                 FROM session_movements reversal_pick
                WHERE reversal_pick.related_movement_id = movement.id
                  AND reversal_pick.direction = '+'
                  AND reversal_pick.movement_type IN ('refund', 'compensation', 'adjustment_positive')
                ORDER BY reversal_pick.created_at DESC, reversal_pick.id DESC
                LIMIT 1
             )
          WHERE affiliation.subscription_id = ?
            AND movement.direction = '-'
            AND movement.movement_type IN ('consumption', 'adjustment_negative')
          ORDER BY session_datetime ASC, movement.id ASC`,
        [req.params.id],
      );

      const [cycleRows]: any = await pool.query(
        `SELECT cycle.cycle_number, cycle.start_date, cycle.end_date, cycle.status,
                COALESCE(SUM(balance.included), 0) AS contracted,
                COALESCE(SUM(balance.available), 0) AS remaining,
                COALESCE(SUM(balance.reserved), 0) AS reserved
           FROM subscription_cycles cycle
           LEFT JOIN session_balances balance ON balance.cycle_id = cycle.id
          WHERE cycle.subscription_id = ?
          GROUP BY cycle.id
          ORDER BY cycle.cycle_number`,
        [req.params.id],
      );

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(18);
      doc.text("Subscription session history", 36, 36);
      doc.setFontSize(10);
      doc.text(`Holder: ${subscription.holder_name || "N/A"}`, 36, 54);
      doc.text(`Plan: ${subscription.plan_name || "N/A"}`, 36, 68);
      doc.text(
        `Validity: ${String(subscription.start_date).slice(0, 10)} - ${String(subscription.end_date).slice(0, 10)} | Payment: ${subscription.payment_status}`,
        36,
        82,
      );
      doc.text(`Generated: ${new Date().toISOString()}`, 36, 96);

      autoTable(doc, {
        startY: 112,
        head: [["Member", "Trainer", "Plan", "Session date & time", "Duration", "Quantity", "Status", "Returned at"]],
        body: movementRows.map((row: any) => [
          row.member_name || "N/A",
          row.trainer_name || subscription.responsible_trainer || "N/A",
          row.plan_name || subscription.plan_name,
          row.session_datetime ? new Date(row.session_datetime).toISOString().replace("T", " ").slice(0, 16) : "N/A",
          row.duration_minutes === null ? "N/A" : `${Number(row.duration_minutes)} min`,
          Number(row.quantity || 0),
          row.movement_status,
          row.returned_at ? new Date(row.returned_at).toISOString().replace("T", " ").slice(0, 16) : "",
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [43, 43, 43] },
      });

      const cycleStartY = Math.min((doc as any).lastAutoTable?.finalY + 30 || 150, 520);
      doc.setFontSize(13);
      doc.text("Unconsumed sessions by cycle", 36, cycleStartY);
      autoTable(doc, {
        startY: cycleStartY + 10,
        head: [["Cycle", "Start", "End", "Status", "Contracted", "Reserved", "Not consumed"]],
        body: cycleRows.map((row: any) => [
          Number(row.cycle_number || 0),
          String(row.start_date || "").slice(0, 10),
          String(row.end_date || "").slice(0, 10),
          row.status,
          Number(row.contracted || 0),
          Number(row.reserved || 0),
          Number(row.remaining || 0),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [62, 74, 89] },
      });

      await pool.query(
        "INSERT INTO audit_logs (action, details, performed_by) VALUES ('subscription_session_history_pdf_exported', ?, ?)",
        [
          JSON.stringify({
            subscriptionId: req.params.id,
            planName: subscription.plan_name,
            movementCount: movementRows.length,
            cycleCount: cycleRows.length,
          }),
          req.user?.email || req.user?.uid || "system",
        ],
      );
      res.setHeader("Content-Type", "application/pdf");
      const safeSubscriptionId = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, "");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="subscription-session-history-${safeSubscriptionId || "report"}.pdf"`,
      );
      res.send(Buffer.from(doc.output("arraybuffer")));
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
        await connection.query(
          "INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)",
          [
            "subscription_session_consumed",
            JSON.stringify({
              subscriptionId: affRows[0].subscription_id,
              affiliationId,
              movementId: movement.id,
              quantity: numberOrDefault(req.body.quantity, 1),
              reason: normalizeString(req.body.reason) || "Manual consumption",
              balanceAfter: movement.balanceAfter,
            }),
            req.user?.email || req.user?.uid || "system",
          ],
        );
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

      const affiliationId = normalizeString(req.body.affiliationId);
      const direction = normalizeString(req.body.direction); // 'positive' or 'negative'
      const reason = normalizeString(req.body.reason);
      const quantity = numberOrDefault(req.body.quantity, 1);
      if (!affiliationId || !direction || !reason) return res.status(400).json({ error: "affiliationId, direction, and reason are required" });
      if (!["positive", "negative"].includes(direction)) return res.status(400).json({ error: "direction must be 'positive' or 'negative'" });
      if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ error: "quantity must be a positive integer" });
      }

      const [affRows]: any = await pool.query(
        `SELECT a.subscription_id, pv.distribution_model, pv.sessions_unlimited
           FROM affiliations a
           JOIN subscriptions s ON s.id = a.subscription_id
           JOIN plan_versions pv ON pv.id = a.plan_version_id
          WHERE a.id = ?
            AND a.status = 'active'
            AND a.end_date >= CURDATE()
            AND s.status = 'active'
            AND s.end_date >= CURDATE()
          LIMIT 1`,
        [affiliationId],
      );
      if (affRows.length === 0) return res.status(404).json({ error: "Active affiliation not found" });
      if (Boolean(affRows[0].sessions_unlimited)) {
        return res.status(409).json({ error: "Unlimited plans do not have a session balance" });
      }

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
          quantity,
          referenceType: normalizeString(req.body.referenceType) || "manual_adjustment",
          referenceId: normalizeString(req.body.referenceId) || null,
          relatedMovementId: normalizeString(req.body.relatedMovementId) || null,
          reason,
          performedBy: req.user?.email || "system",
          idempotencyKey: req.headers["idempotency-key"] as string || normalizeString(req.body.idempotencyKey) || null,
        });
        await connection.query(
          "INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)",
          [
            direction === "negative"
              ? "subscription_session_deducted"
              : "subscription_session_adjusted_positive",
            JSON.stringify({
              subscriptionId: affRows[0].subscription_id,
              affiliationId,
              movementId: movement.id,
              quantity,
              direction,
              reason,
              balanceAfter: movement.balanceAfter,
            }),
            req.user?.email || req.user?.uid || "system",
          ],
        );
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

  app.post("/api/v2/sessions/return-latest", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    let connection: any = null;
    try {
      const pool = requirePool(poolProvider);
      const affiliationId = normalizeString(req.body.affiliationId);
      const reason = normalizeString(req.body.reason);
      const requestedIdempotencyKey =
        req.headers["idempotency-key"] as string ||
        normalizeString(req.body.idempotencyKey);
      if (!affiliationId || !reason) {
        return res.status(400).json({ error: "affiliationId and reason are required" });
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();
      if (requestedIdempotencyKey) {
        const [existingRows]: any = await connection.query(
          `SELECT id, related_movement_id, balance_after, movement_type
             FROM session_movements
            WHERE idempotency_key = ?
            LIMIT 1`,
          [requestedIdempotencyKey],
        );
        if (existingRows.length) {
          await connection.commit();
          return res.json({
            movement: {
              id: existingRows[0].id,
              relatedMovementId: existingRows[0].related_movement_id,
              balanceAfter: Number(existingRows[0].balance_after),
              type: existingRows[0].movement_type,
            },
            idempotentReplay: true,
          });
        }
      }
      const [affRows]: any = await connection.query(
        `SELECT a.subscription_id, pv.distribution_model, pv.sessions_unlimited,
                sc.id AS cycle_id
           FROM affiliations a
           JOIN subscriptions s ON s.id = a.subscription_id
           JOIN plan_versions pv ON pv.id = a.plan_version_id
           JOIN subscription_cycles sc
             ON sc.subscription_id = s.id
            AND sc.status = 'active'
          WHERE a.id = ?
            AND a.status = 'active'
            AND a.end_date >= CURDATE()
            AND s.status = 'active'
            AND s.end_date >= CURDATE()
          ORDER BY sc.cycle_number DESC
          LIMIT 1
          FOR UPDATE`,
        [affiliationId],
      );
      if (!affRows.length) {
        await connection.rollback();
        return res.status(404).json({ error: "Active limited-session affiliation or cycle not found" });
      }
      if (Boolean(affRows[0].sessions_unlimited)) {
        await connection.rollback();
        return res.status(409).json({ error: "Unlimited plans do not have sessions to return" });
      }

      const [movementRows]: any = await connection.query(
        `SELECT original.id, original.quantity
           FROM session_movements original
          WHERE original.affiliation_id = ?
            AND original.cycle_id = ?
            AND original.movement_type IN ('consumption', 'adjustment_negative')
            AND NOT EXISTS (
              SELECT 1
                FROM session_movements reversal
               WHERE reversal.related_movement_id = original.id
                 AND reversal.movement_type IN ('refund', 'compensation')
            )
          ORDER BY original.created_at DESC, original.id DESC
          LIMIT 1
          FOR UPDATE`,
        [affiliationId, affRows[0].cycle_id],
      );
      if (!movementRows.length) {
        await connection.rollback();
        return res.status(409).json({
          error: "No deducted session is available to return",
          code: "NO_RETURNABLE_SESSION",
        });
      }

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
        affRows[0].cycle_id,
      );
      const original = movementRows[0];
      const movement = await createMovement(connection, {
        balanceId: balance.id,
        affiliationId,
        cycleId: affRows[0].cycle_id,
        movementType: "refund",
        quantity: Number(original.quantity || 1),
        referenceType: "subscription_directory_return",
        referenceId: createId("return"),
        relatedMovementId: original.id,
        reason,
        performedBy: req.user?.email || req.user?.uid || "system",
        idempotencyKey: requestedIdempotencyKey || `return_${original.id}`,
      });
      await connection.query(
        "INSERT INTO audit_logs (action, details, performed_by) VALUES ('subscription_session_returned', ?, ?)",
        [
          JSON.stringify({
            subscriptionId: affRows[0].subscription_id,
            affiliationId,
            movementId: movement.id,
            originalMovementId: original.id,
            quantity: Number(original.quantity || 1),
            reason,
            balanceAfter: movement.balanceAfter,
          }),
          req.user?.email || req.user?.uid || "system",
        ],
      );
      await connection.commit();
      res.status(201).json({
        movement: {
          id: movement.id,
          relatedMovementId: original.id,
          balanceAfter: movement.balanceAfter,
          type: movement.movementType,
        },
      });
    } catch (error) {
      if (connection) await connection.rollback();
      next(error);
    } finally {
      if (connection) connection.release();
    }
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
    trainerId: row.trainer_id || null,
    trainerName: row.trainer_name || null,
    holderMemberId: row.holder_member_id,
    holderFirstName,
    holderLastName,
    holderName: `${holderFirstName} ${holderLastName}`.trim(),
    holderEmail: row.holder_email || "",
    holderStatus: row.holder_status || "",
    holderAffiliationId: row.holder_affiliation_id || null,
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
    activeMembers: Number(row.active_members || 1),
    sessionsUnlimited: row.sessions_unlimited !== undefined ? Boolean(row.sessions_unlimited) : true,
    sessionsPerCycle: row.sessions_per_cycle ? Number(row.sessions_per_cycle) : null,
    cycleFrequency: row.cycle_frequency || "subscription",
    distributionModel: row.distribution_model || "individual",
    sessionsContracted:
      row.sessions_contracted === undefined || row.sessions_contracted === null
        ? null
        : Number(row.sessions_contracted),
    sessionsConsumed:
      row.sessions_consumed === undefined || row.sessions_consumed === null
        ? null
        : Number(row.sessions_consumed),
    sessionsRemaining:
      row.sessions_remaining === undefined || row.sessions_remaining === null
        ? null
        : Number(row.sessions_remaining),
    version: Number(row.version || 1),
    legacySubscriptionId: row.legacy_subscription_id || null,
    source: "v2",
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
