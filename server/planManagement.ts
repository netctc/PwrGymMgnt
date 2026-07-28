import crypto from "crypto";
import type { Express, Request } from "express";
import type { Pool, PoolConnection } from "mysql2/promise";
import { requirePermission } from "./rbac";
import {
  allocateAffiliationInActiveCycle,
  createInitialCycle,
} from "./subscriptionCycles";
import {
  assertNoOutstandingSubscriptionPayment,
  normalizePaymentStatus,
} from "./subscriptionPaymentRules";
import { upsertTrainerPlanCommission } from "./trainerCommissions";

type PoolProvider = () => Pool | null;
type AuthenticatedRequest = Request & { user?: { email?: string; uid?: string } };

const PLAN_TYPES = new Set(["individual", "family", "group", "corporate"]);
const PLAN_STATUSES = new Set(["draft", "active", "suspended", "cancelled", "archived"]);
const MEMBER_STATUSES = new Set(["active", "suspended", "removed"]);

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function createInvoiceNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `INV-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function requirePool(provider: PoolProvider) {
  const pool = provider();
  if (!pool) throw Object.assign(new Error("Database not connected"), { status: 503 });
  return pool;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: unknown, fallback = false) {
  return value === undefined ? fallback : Boolean(value);
}

function json(value: unknown, fallback: unknown = {}) {
  if (value === undefined || value === null || value === "") return JSON.stringify(fallback);
  return JSON.stringify(value);
}

function parseJson(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function dateOnly(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(`${raw.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function addDays(start: string, durationDays: number) {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.max(1, durationDays));
  return date.toISOString().slice(0, 10);
}

function normalizePlanInput(body: any) {
  const planType = text(body.planType) || "individual";
  if (!PLAN_TYPES.has(planType)) throw Object.assign(new Error("Invalid plan type"), { status: 400 });
  const status = text(body.status) || "draft";
  if (!PLAN_STATUSES.has(status)) throw Object.assign(new Error("Invalid plan status"), { status: 400 });
  const name = text(body.name);
  if (!name) throw Object.assign(new Error("Plan name is required"), { status: 400 });
  const durationDays = Math.max(1, number(body.durationDays, 30));
  const validFrom = dateOnly(body.validFrom);
  const validTo = validFrom ? (dateOnly(body.validTo) || addDays(validFrom, durationDays)) : null;
  const isIndividual = planType === "individual";
  const sessionsUnlimited = isIndividual ? bool(body.sessionsUnlimited, true) : true;
  const requestedSessionsUnlimited = bool(body.sessionsUnlimited, true);
  const maxMembers = isIndividual ? 1 : Math.max(2, number(body.maxMembers, 2));
  const trainerId = text(body.trainerId);
  const trainerCommissionPercent = Math.max(0, Math.min(100, number(body.trainerCommissionPercent, 0)));
  if (trainerCommissionPercent > 0 && !trainerId) {
    throw Object.assign(new Error("A trainer is required when a commission percentage is configured"), { status: 400 });
  }
  const bookingPolicy = {
    futureBookingPolicy: text(body.futureBookingPolicy) || "cancel",
    deductionMoment: text(body.deductionMoment) || "booking_confirmation",
    cancellationWindowMinutes: Math.max(0, number(body.cancellationWindowMinutes, 120)),
    autoRefundOnTime: bool(body.autoRefundOnTime, true),
    lateCancellationThreshold: Math.max(1, number(body.lateCancellationThreshold, 2)),
    lateCancellationPenalty: Math.max(0, number(body.lateCancellationPenalty, 1)),
    noShowConsumesSession: bool(body.noShowConsumesSession, true),
    reschedulingAllowed: bool(body.reschedulingAllowed, true),
    staffExceptionsAllowed: bool(body.staffExceptionsAllowed, true),
    gymCancellationRefund: bool(body.gymCancellationRefund, true),
  };
  return {
    name,
    description: text(body.description),
    trainerId: trainerId || null,
    trainerName: "",
    trainerCommissionPercent,
    planType,
    price: Math.max(0, number(body.price, 0)),
    currency: text(body.currency).toUpperCase() || "USD",
    durationDays,
    validFrom,
    validTo,
    maxMembers,
    sessionsUnlimited: isIndividual ? sessionsUnlimited : requestedSessionsUnlimited,
    sessionsPerCycle: !requestedSessionsUnlimited || (isIndividual && !sessionsUnlimited)
      ? Math.max(1, number(body.sessionsPerCycle, 1))
      : null,
    cycleFrequency: text(body.cycleFrequency) || "monthly",
    distributionModel: isIndividual ? "individual" : (text(body.distributionModel) || "shared"),
    holderSessionsPerCycle: Math.max(0, number(body.holderSessionsPerCycle, 0)),
    beneficiarySessionsPerCycle: Math.max(0, number(body.beneficiarySessionsPerCycle, 0)),
    carryoverEnabled: bool(body.carryoverEnabled, false),
    carryoverMax: body.carryoverMax === null || body.carryoverMax === "" ? null : Math.max(0, number(body.carryoverMax, 0)),
    carryoverExpiryDays: body.carryoverExpiryDays === null || body.carryoverExpiryDays === "" ? null : Math.max(1, number(body.carryoverExpiryDays, 30)),
    allowExtraSessions: bool(body.allowExtraSessions, false),
    extraSessionPrice: body.extraSessionPrice === null || body.extraSessionPrice === "" ? null : Math.max(0, number(body.extraSessionPrice, 0)),
    consumptionPriority: Math.max(0, number(body.consumptionPriority, 0)),
    sharedBenefits: isIndividual ? true : bool(body.sharedBenefits, true),
    futureBookingPolicy: bookingPolicy.futureBookingPolicy,
    bookingPolicy,
    benefits: body.benefits || {},
    restrictions: body.restrictions || {},
    status,
  };
}

function mapPlan(row: any) {
  const data: any = parseJson(row.version_data);
  return {
    id: row.plan_id,
    planVersionId: row.plan_version_id,
    versionNumber: Number(row.version_number || 1),
    name: row.version_name || row.plan_name,
    description: row.version_description || row.plan_description || "",
    trainerId: row.trainer_id || null,
    trainerName: row.trainer_name || "",
    trainerCommissionPercent: Number(row.trainer_commission_percent || 0),
    planType: row.plan_type || "individual",
    price: Number(row.version_price || 0),
    currency: row.version_currency || "USD",
    durationDays: Number(row.duration_days || 30),
    validFrom: data.validFrom || null,
    validTo: data.validTo || null,
    maxMembers: Number(row.max_members || 1),
    sessionsUnlimited: Boolean(row.sessions_unlimited),
    sessionsPerCycle: row.sessions_per_cycle === null ? null : Number(row.sessions_per_cycle),
    cycleFrequency: row.cycle_frequency || "monthly",
    distributionModel: row.distribution_model || "individual",
    holderSessionsPerCycle: Number(data.holderSessionsPerCycle || 0),
    beneficiarySessionsPerCycle: Number(data.beneficiarySessionsPerCycle || 0),
    carryoverEnabled: Boolean(row.carryover_enabled),
    carryoverMax: row.carryover_max === null ? null : Number(row.carryover_max),
    carryoverExpiryDays: row.carryover_expiry_days === null ? null : Number(row.carryover_expiry_days),
    allowExtraSessions: data.allowExtraSessions === true,
    extraSessionPrice: row.extra_session_price === null ? null : Number(row.extra_session_price),
    consumptionPriority: Number(row.consumption_priority || 0),
    sharedBenefits: data.sharedBenefits !== false,
    futureBookingPolicy: data.futureBookingPolicy || "cancel",
    bookingPolicy: parseJson(row.booking_policy),
    benefits: parseJson(row.benefits),
    restrictions: parseJson(row.restrictions),
    status: row.version_status || row.plan_status || "draft",
    createdAt: row.version_created_at,
  };
}

const PLAN_SELECT = `
  SELECT sp.id AS plan_id, sp.name AS plan_name, sp.description AS plan_description,
         sp.status AS plan_status, pv.id AS plan_version_id, pv.version_number,
         pv.name AS version_name, pv.description AS version_description,
         pv.trainer_id, pv.trainer_name, pv.trainer_commission_percent,
         pv.plan_type, pv.price AS version_price, pv.currency AS version_currency,
         pv.duration_days, pv.max_members, pv.sessions_unlimited, pv.sessions_per_cycle,
         pv.cycle_frequency, pv.distribution_model, pv.carryover_enabled, pv.carryover_max,
         pv.carryover_expiry_days, pv.extra_session_price, pv.consumption_priority,
         pv.benefits, pv.restrictions, pv.booking_policy,
         pv.status AS version_status, pv.data AS version_data, pv.created_at AS version_created_at
    FROM subscription_plans sp
    JOIN plan_versions pv ON pv.id = (
      SELECT pv2.id FROM plan_versions pv2
       WHERE pv2.plan_id = sp.id
       ORDER BY pv2.version_number DESC LIMIT 1
    )`;

async function insertPlanVersion(connection: PoolConnection, planId: string, versionNumber: number, input: ReturnType<typeof normalizePlanInput>) {
  const id = createId("pv");
  await connection.query(
    `INSERT INTO plan_versions
      (id, plan_id, version_number, name, description, trainer_id, trainer_name,
       trainer_commission_percent, plan_type, price, currency,
       duration_days, max_members, sessions_unlimited, sessions_per_cycle,
       cycle_frequency, distribution_model, carryover_enabled, carryover_max,
       carryover_expiry_days, extra_session_price, consumption_priority,
       benefits, restrictions, booking_policy, status, published_at, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, planId, versionNumber, input.name, input.description || null,
      input.trainerId, input.trainerName || null, input.trainerCommissionPercent,
      input.planType,
      input.price, input.currency, input.durationDays, input.maxMembers,
      input.sessionsUnlimited ? 1 : 0, input.sessionsPerCycle, input.cycleFrequency,
      input.distributionModel, input.carryoverEnabled ? 1 : 0, input.carryoverMax,
      input.carryoverExpiryDays, input.allowExtraSessions ? input.extraSessionPrice : null,
      input.consumptionPriority, json(input.benefits, {}), json(input.restrictions, {}),
      json(input.bookingPolicy),
      input.status, input.status === "active" ? new Date() : null,
      json({
        validFrom: input.validFrom,
        validTo: input.validTo,
        sharedBenefits: input.sharedBenefits,
        futureBookingPolicy: input.futureBookingPolicy,
        holderSessionsPerCycle: input.holderSessionsPerCycle,
        beneficiarySessionsPerCycle: input.beneficiarySessionsPerCycle,
        allowExtraSessions: input.allowExtraSessions,
      }),
    ],
  );
  return id;
}

async function resolveTrainer(connection: PoolConnection, input: ReturnType<typeof normalizePlanInput>) {
  if (!input.trainerId) {
    input.trainerName = "";
    input.trainerCommissionPercent = 0;
    return;
  }
  const [rows]: any = await connection.query(
    `SELECT e.id, CONCAT_WS(' ', e.first_name, e.last_name) AS name
       FROM employees e
       LEFT JOIN admin_users au ON LOWER(TRIM(au.email)) = LOWER(TRIM(e.email))
      WHERE e.id = ? AND e.employment_status = 'active'
        AND (
          LOWER(COALESCE(au.role, '')) = 'trainer'
          OR LOWER(COALESCE(e.job_title, '')) LIKE '%trainer%'
          OR LOWER(COALESCE(e.department, '')) IN ('training', 'coaching')
        )
      LIMIT 1`,
    [input.trainerId],
  );
  if (!rows.length) throw Object.assign(new Error("The selected trainer is not active or was not found"), { status: 400 });
  input.trainerName = rows[0].name || input.trainerId;
}

async function auditTrainerAssignment(
  connection: PoolConnection,
  input: {
    planId: string;
    planVersionId: string;
    previous?: any;
    current: ReturnType<typeof normalizePlanInput>;
    changedBy?: string | null;
  },
) {
  await connection.query(
    `INSERT INTO trainer_plan_assignment_history
      (id, plan_id, plan_version_id, previous_trainer_id, previous_trainer_name,
       previous_commission_percent, trainer_id, trainer_name, commission_percent,
       changed_by, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      createId("tpah"), input.planId, input.planVersionId,
      input.previous?.trainer_id || null, input.previous?.trainer_name || null,
      input.previous?.trainer_commission_percent ?? null,
      input.current.trainerId, input.current.trainerName || null,
      input.current.trainerCommissionPercent, input.changedBy || "system",
      json({ source: "plan_version", versioned: true }),
    ],
  );
}

export function registerPlanManagementRoutes(app: Express, provider: PoolProvider) {
  app.get("/api/v2/plan-management/plans", requirePermission("membership.read"), async (_req, res, next) => {
    try {
      const pool = requirePool(provider);
      const [rows]: any = await pool.query(`${PLAN_SELECT} ORDER BY sp.name`);
      res.json({ plans: rows.map(mapPlan) });
    } catch (error) { next(error); }
  });

  app.post("/api/v2/plan-management/plans", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    const pool = requirePool(provider);
    const connection = await pool.getConnection();
    try {
      const input = normalizePlanInput(req.body);
      const planId = createId("plan");
      await connection.beginTransaction();
      await resolveTrainer(connection, input);
      await connection.query(
        `INSERT INTO subscription_plans (id, name, description, duration_days, price, currency, status, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [planId, input.name, input.description || null, input.durationDays, input.price, input.currency, input.status, json({ planType: input.planType })],
      );
      const planVersionId = await insertPlanVersion(connection, planId, 1, input);
      await auditTrainerAssignment(connection, {
        planId,
        planVersionId,
        current: input,
        changedBy: req.user?.email || req.user?.uid,
      });
      await connection.commit();
      const [rows]: any = await pool.query(`${PLAN_SELECT} WHERE sp.id = ?`, [planId]);
      res.status(201).json({ plan: mapPlan(rows[0]), planVersionId });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally { connection.release(); }
  });

  app.put("/api/v2/plan-management/plans/:id", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    const pool = requirePool(provider);
    const connection = await pool.getConnection();
    try {
      const input = normalizePlanInput(req.body);
      await connection.beginTransaction();
      await resolveTrainer(connection, input);
      const [current]: any = await connection.query(
        `SELECT version_number, trainer_id, trainer_name, trainer_commission_percent
           FROM plan_versions
          WHERE plan_id = ?
          ORDER BY version_number DESC
          LIMIT 1
          FOR UPDATE`,
        [req.params.id],
      );
      if (!Number(current[0]?.version_number)) throw Object.assign(new Error("Plan not found"), { status: 404 });
      await connection.query(
        `UPDATE subscription_plans SET name = ?, description = ?, duration_days = ?, price = ?, currency = ?, status = ?, data = ? WHERE id = ?`,
        [input.name, input.description || null, input.durationDays, input.price, input.currency, input.status, json({ planType: input.planType }), req.params.id],
      );
      const planVersionId = await insertPlanVersion(connection, req.params.id, Number(current[0].version_number) + 1, input);
      await auditTrainerAssignment(connection, {
        planId: req.params.id,
        planVersionId,
        previous: current[0],
        current: input,
        changedBy: req.user?.email || req.user?.uid,
      });
      await connection.commit();
      const [rows]: any = await pool.query(`${PLAN_SELECT} WHERE sp.id = ?`, [req.params.id]);
      res.json({ plan: mapPlan(rows[0]) });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally { connection.release(); }
  });

  app.get("/api/v2/list-maintenance", requirePermission("platform.audit.read"), async (_req, res, next) => {
    try {
      const pool = requirePool(provider);
      const [lists]: any = await pool.query("SELECT * FROM maintenance_lists ORDER BY name_en");
      const [items]: any = await pool.query("SELECT * FROM maintenance_list_items ORDER BY list_id, sort_order, label_en");
      res.json({
        lists: lists.map((list: any) => ({
          id: list.id, key: list.list_key, nameEn: list.name_en, nameAr: list.name_ar,
          descriptionEn: list.description_en || "", descriptionAr: list.description_ar || "",
          status: list.status,
          items: items.filter((item: any) => item.list_id === list.id).map((item: any) => ({
            id: item.id, code: item.item_code, labelEn: item.label_en, labelAr: item.label_ar,
            sortOrder: Number(item.sort_order), status: item.status, isSystem: Boolean(item.is_system),
            metadata: parseJson(item.metadata),
          })),
        })),
      });
    } catch (error) { next(error); }
  });

  app.post("/api/v2/list-maintenance/:listId/items", requirePermission("platform.audit.read"), async (req, res, next) => {
    try {
      const pool = requirePool(provider);
      const code = text(req.body.code).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
      const labelEn = text(req.body.labelEn);
      const labelAr = text(req.body.labelAr);
      if (!code || !labelEn || !labelAr) return res.status(400).json({ error: "Code, English label and Arabic label are required" });
      const id = createId("mli");
      await pool.query(
        `INSERT INTO maintenance_list_items (id, list_id, item_code, label_en, label_ar, sort_order, status, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.params.listId, code, labelEn, labelAr, number(req.body.sortOrder, 0), text(req.body.status) || "active", json(req.body.metadata, {})],
      );
      res.status(201).json({ item: { id, code, labelEn, labelAr } });
    } catch (error) { next(error); }
  });

  app.put("/api/v2/list-maintenance/:listId/items/:itemId", requirePermission("platform.audit.read"), async (req, res, next) => {
    try {
      const pool = requirePool(provider);
      const labelEn = text(req.body.labelEn);
      const labelAr = text(req.body.labelAr);
      if (!labelEn || !labelAr) return res.status(400).json({ error: "English and Arabic labels are required" });
      await pool.query(
        `UPDATE maintenance_list_items SET label_en = ?, label_ar = ?, sort_order = ?, status = ?, metadata = ?
          WHERE id = ? AND list_id = ?`,
        [labelEn, labelAr, number(req.body.sortOrder, 0), text(req.body.status) || "active", json(req.body.metadata, {}), req.params.itemId, req.params.listId],
      );
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  app.delete("/api/v2/list-maintenance/:listId/items/:itemId", requirePermission("platform.audit.read"), async (req, res, next) => {
    try {
      const pool = requirePool(provider);
      const [rows]: any = await pool.query(
        "SELECT is_system FROM maintenance_list_items WHERE id = ? AND list_id = ?",
        [req.params.itemId, req.params.listId],
      );
      if (!rows.length) return res.status(404).json({ error: "List item not found" });
      if (rows[0].is_system) return res.status(409).json({ error: "System list items cannot be deleted; set them inactive instead" });
      await pool.query("DELETE FROM maintenance_list_items WHERE id = ? AND list_id = ?", [req.params.itemId, req.params.listId]);
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  app.post(
    ["/api/v2/plan-management/subscriptions/hybrid", "/api/v2/subscriptions/hybrid"],
    requirePermission("membership.write"),
    async (req: AuthenticatedRequest, res, next) => {
    const pool = requirePool(provider);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const planVersionId = text(req.body.planVersionId);
      if (!planVersionId) throw Object.assign(new Error("Plan version is required"), { status: 400 });
      const [planRows]: any = await connection.query(
        `SELECT pv.*, sp.name AS catalog_name
           FROM plan_versions pv JOIN subscription_plans sp ON sp.id = pv.plan_id
          WHERE pv.id = ? AND pv.status = 'active' FOR UPDATE`,
        [planVersionId],
      );
      if (!planRows.length) throw Object.assign(new Error("Active plan version not found"), { status: 404 });
      const plan = planRows[0];
      if (plan.plan_type === "individual") {
        throw Object.assign(new Error("The hybrid flow is available only for family, group and corporate plans"), { status: 409 });
      }

      const requestedMembers = Array.isArray(req.body.members) && req.body.addMembersNow !== false ? req.body.members : [];
      if (requestedMembers.length + 1 > Number(plan.max_members)) {
        throw Object.assign(new Error("The selected members exceed the contracted capacity"), { status: 409, code: "CAPACITY_LIMIT_REACHED" });
      }

      const resolveMember = async (candidate: any, source: string) => {
        const existingId = text(candidate?.memberId);
        if (existingId) {
          const [existingRows]: any = await connection.query("SELECT id, email FROM members WHERE id = ? LIMIT 1", [existingId]);
          if (!existingRows.length) throw Object.assign(new Error(`Member ${existingId} not found`), { status: 404 });
          return { id: existingRows[0].id, email: text(existingRows[0].email).toLowerCase(), created: false };
        }
        const input = candidate?.newMember || candidate || {};
        const firstName = text(input.firstName);
        const lastName = text(input.lastName);
        const requestedEmail = text(input.email).toLowerCase();
        const phone = text(input.phone);
        if (!firstName || !lastName) {
          throw Object.assign(new Error("First name and last name are required for each new member"), { status: 400 });
        }
        if (!requestedEmail && !phone) {
          throw Object.assign(new Error("An email address or phone number is required for each new member"), { status: 400 });
        }
        const [duplicates]: any = await connection.query(
          `SELECT id FROM members
            WHERE (? <> '' AND LOWER(email) = ?)
               OR (? <> '' AND phone = ?)
            LIMIT 1`,
          [requestedEmail, requestedEmail, phone, phone],
        );
        if (duplicates.length) {
          throw Object.assign(new Error("A member with the same email address or phone number already exists"), { status: 409 });
        }
        const memberId = createId("member");
        const email = requestedEmail ||
          `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${memberId.slice(-8)}@powergym.local`;
        await connection.query(
          `INSERT INTO members (id, first_name, last_name, email, phone, status, join_date, data)
           VALUES (?, ?, ?, ?, ?, 'active', CURDATE(), ?)`,
          [memberId, firstName, lastName, email, phone || null, json({ source, contactEmailGenerated: !requestedEmail })],
        );
        return { id: memberId, email, created: true };
      };

      const holder = await resolveMember(req.body.holder || {}, "hybrid_subscription_holder");
      await assertNoOutstandingSubscriptionPayment(connection, holder.id);
      const uniqueMemberIds = new Set<string>([holder.id]);
      const uniqueEmails = new Set<string>(holder.email ? [holder.email] : []);
      const resolvedMembers: Array<{ id: string; created: boolean; joinedAt: string; restrictions: unknown; benefitsOverride: unknown }> = [];
      for (const candidate of requestedMembers) {
        const resolved = await resolveMember(candidate, "hybrid_subscription_beneficiary");
        await assertNoOutstandingSubscriptionPayment(connection, resolved.id);
        if (uniqueMemberIds.has(resolved.id) || (resolved.email && uniqueEmails.has(resolved.email))) {
          throw Object.assign(new Error("The same person cannot be added twice to one subscription"), { status: 409 });
        }
        uniqueMemberIds.add(resolved.id);
        if (resolved.email) uniqueEmails.add(resolved.email);
        resolvedMembers.push({
          id: resolved.id,
          created: resolved.created,
          joinedAt: dateOnly(candidate?.joinedAt) || dateOnly(req.body.startDate) || new Date().toISOString().slice(0, 10),
          restrictions: candidate?.restrictions || {},
          benefitsOverride: candidate?.benefitsOverride || {},
        });
      }

      const startDate = dateOnly(req.body.startDate) || new Date().toISOString().slice(0, 10);
      const endDate = dateOnly(req.body.endDate) || addDays(startDate, Number(plan.duration_days || 30));
      const paymentStatus = normalizePaymentStatus(req.body.paymentStatus, "pending");
      const subscriptionId = createId("sub");
      await connection.query(
        `INSERT INTO subscriptions
          (id, plan_id, plan_version_id, holder_member_id, status, start_date, end_date,
           auto_renew, price_paid, currency, payment_status, max_members, notes)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          subscriptionId, plan.plan_id, planVersionId, holder.id, startDate, endDate,
          plan.auto_renew ? 1 : 0, Number(plan.price || 0), plan.currency || "USD",
          paymentStatus, Number(plan.max_members), text(req.body.notes) || null,
        ],
      );

      const insertSubscriptionMember = async (
        memberId: string,
        role: "holder" | "beneficiary",
        joinedAt: string,
        restrictions: unknown,
        benefitsOverride: unknown,
      ) => {
        const subscriptionMemberId = createId("sm");
        await connection.query(
          `INSERT INTO subscription_members
            (id, subscription_id, member_id, role, status, joined_at, invited_by, restrictions)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
          [
            subscriptionMemberId, subscriptionId, memberId, role, `${joinedAt} 00:00:00`,
            req.user?.email || req.user?.uid || null, json(restrictions, {}),
          ],
        );
        const affiliationId = createId("aff");
        await connection.query(
          `INSERT INTO affiliations
            (id, member_id, subscription_id, subscription_member_id, plan_version_id,
             status, role, is_primary, start_date, end_date, benefits_override,
             restrictions_override, consumption_priority)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
          [
            affiliationId, memberId, subscriptionId, subscriptionMemberId, planVersionId,
            role, role === "holder" ? 1 : 0, joinedAt, endDate,
            json(benefitsOverride, {}), json(restrictions, {}), Number(plan.consumption_priority || 0),
          ],
        );
        await connection.query(
          `INSERT INTO subscription_member_history
            (id, subscription_id, subscription_member_id, member_id, action, new_status, performed_by, details)
           VALUES (?, ?, ?, ?, 'added', 'active', ?, ?)`,
          [
            createId("smh"), subscriptionId, subscriptionMemberId, memberId,
            req.user?.email || req.user?.uid || null, json({ role, joinedAt, createdWithSubscription: true }),
          ],
        );
        return { subscriptionMemberId, affiliationId };
      };

      const createdAffiliations: Array<{ id: string; role: "holder" | "beneficiary"; benefitsOverride: any }> = [];
      const holderAffiliation = await insertSubscriptionMember(holder.id, "holder", startDate, {}, {});
      createdAffiliations.push({ id: holderAffiliation.affiliationId, role: "holder", benefitsOverride: {} });
      for (const member of resolvedMembers) {
        const created = await insertSubscriptionMember(member.id, "beneficiary", member.joinedAt, member.restrictions, member.benefitsOverride);
        createdAffiliations.push({ id: created.affiliationId, role: "beneficiary", benefitsOverride: member.benefitsOverride });
      }
      const planData: any = parseJson(plan.data);
      const customAllocations = Object.fromEntries(
        createdAffiliations.map((affiliation) => [
          affiliation.id,
          Number(
            affiliation.benefitsOverride?.sessionsPerCycle ??
            (affiliation.role === "holder"
              ? planData.holderSessionsPerCycle
              : planData.beneficiarySessionsPerCycle) ??
            plan.sessions_per_cycle ??
            0,
          ),
        ]),
      );
      await createInitialCycle(
        connection,
        subscriptionId,
        startDate,
        endDate,
        plan.sessions_unlimited ? null : Number(plan.sessions_per_cycle || 0),
        plan.distribution_model || "shared",
        createdAffiliations.map((affiliation) => affiliation.id),
        {
          cycleFrequency: plan.cycle_frequency || "monthly",
          subscriptionEndDate: endDate,
          customAllocations,
        },
      );
      const invoiceId = createId("inv");
      const invoiceNumber = createInvoiceNumber();
      const paymentDate = paymentStatus === "paid" ? startDate : startDate;
      await connection.query(
        `INSERT INTO invoices
          (id, invoice_number, member_id, subscription_id, status,
           subtotal, tax_amount, total, currency, due_date, paid_at, data)
         VALUES (?, ?, ?, NULL, ?, ?, 0, ?, ?, ?, ?, ?)`,
        [
          invoiceId, invoiceNumber, holder.id,
          paymentStatus === "paid" ? "paid" : "issued",
          Number(plan.price || 0), Number(plan.price || 0), plan.currency || "USD",
          paymentDate, paymentStatus === "paid" ? new Date() : null,
          json({ source: "hybrid_subscription", subscriptionV2Id: subscriptionId, paymentStatus }),
        ],
      );
      await connection.query(
        `INSERT INTO finance_transactions
          (id, type, category, amount, transaction_date, source, reference_type,
           reference_id, description, status, created_by, approved_by, data)
         VALUES (?, 'income', 'Membership Subscription', ?, ?,
                 'subscription', 'subscription_v2_payment', ?, ?, ?, ?, ?, ?)`,
        [
          createId("ftx"), Number(plan.price || 0), paymentDate, subscriptionId,
          `Subscription payment ${invoiceNumber} - member ${holder.id} - ${plan.name || plan.catalog_name}`,
          paymentStatus === "paid" ? "posted" : "pending",
          req.user?.email || req.user?.uid || "system",
          paymentStatus === "paid" ? req.user?.email || req.user?.uid || "system" : null,
          json({ source: "hybrid_subscription", subscriptionId, invoiceNumber, paymentStatus }),
        ],
      );
      await upsertTrainerPlanCommission(connection, {
        subscriptionId,
        invoiceId,
        invoiceNumber,
        paymentStatus,
        dueDate: paymentDate,
        createdBy: req.user?.email || req.user?.uid || "system",
      });
      await connection.query(
        `INSERT INTO outbox_events (id, event_type, payload, status)
         VALUES (?, 'multi_user_subscription_created', ?, 'pending')`,
        [createId("evt"), json({ subscriptionId, holderMemberId: holder.id, membersAdded: resolvedMembers.length, addMembersNow: req.body.addMembersNow !== false })],
      );
      await connection.commit();
      res.status(201).json({
        subscription: {
          id: subscriptionId,
          planId: plan.plan_id,
          planVersionId,
          planName: plan.name || plan.catalog_name,
          planType: plan.plan_type,
          holderMemberId: holder.id,
          startDate,
          endDate,
          maxMembers: Number(plan.max_members),
          status: "active",
          paymentStatus,
        },
        holder: { memberId: holder.id, created: holder.created },
        membersAdded: resolvedMembers.length,
        capacity: {
          maximum: Number(plan.max_members),
          occupied: resolvedMembers.length + 1,
          available: Number(plan.max_members) - resolvedMembers.length - 1,
        },
      });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally { connection.release(); }
    },
  );

  app.patch("/api/v2/plan-management/subscriptions/:id/dates", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    const pool = requirePool(provider);
    const connection = await pool.getConnection();
    try {
      const startDate = dateOnly(req.body.startDate);
      const endDate = dateOnly(req.body.endDate);
      if (!startDate || !endDate || endDate < startDate) {
        return res.status(400).json({ error: "Valid start and end dates are required" });
      }
      await connection.beginTransaction();
      const [rows]: any = await connection.query(
        "SELECT start_date, end_date FROM subscriptions WHERE id = ? FOR UPDATE",
        [req.params.id],
      );
      if (!rows.length) throw Object.assign(new Error("Subscription not found"), { status: 404 });
      const previousStartDate = dateOnly(rows[0].start_date);
      const previousEndDate = dateOnly(rows[0].end_date);
      await connection.query(
        "UPDATE subscriptions SET start_date = ?, end_date = ?, version = version + 1, updated_at = NOW() WHERE id = ?",
        [startDate, endDate, req.params.id],
      );
      await connection.query(
        `UPDATE affiliations
            SET start_date = CASE WHEN role = 'holder' THEN ? ELSE GREATEST(start_date, ?) END,
                end_date = ?,
                data = JSON_REMOVE(COALESCE(data, JSON_OBJECT()), '$.expiryOverride'),
                updated_at = NOW()
          WHERE subscription_id = ? AND status IN ('active', 'suspended')`,
        [startDate, startDate, endDate, req.params.id],
      );
      await connection.query(
        `INSERT INTO subscription_member_history
          (id, subscription_id, member_id, action, performed_by, details)
         SELECT ?, ?, holder_member_id, 'subscription_dates_changed', ?, ?
           FROM subscriptions WHERE id = ?`,
        [
          createId("smh"), req.params.id, req.user?.email || req.user?.uid || null,
          json({ previousStartDate, previousEndDate, startDate, endDate }), req.params.id,
        ],
      );
      await connection.commit();
      res.json({ ok: true, startDate, endDate });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally { connection.release(); }
  });

  app.get("/api/v2/plan-management/subscriptions/:id/members", requirePermission("membership.read"), async (req, res, next) => {
    try {
      const pool = requirePool(provider);
      const [subscriptions]: any = await pool.query(
        `SELECT s.id, s.max_members, s.status, s.start_date, s.end_date,
                pv.duration_days, pv.plan_type
           FROM subscriptions s
           JOIN plan_versions pv ON pv.id = s.plan_version_id
          WHERE s.id = ?`,
        [req.params.id],
      );
      if (!subscriptions.length) return res.status(404).json({ error: "Subscription not found" });
      const [members]: any = await pool.query(
        `SELECT sm.*, m.first_name, m.last_name, m.email,
                a.start_date AS affiliation_start_date,
                a.end_date AS affiliation_end_date,
                a.data AS affiliation_data
           FROM subscription_members sm
           LEFT JOIN members m ON m.id = sm.member_id
           LEFT JOIN affiliations a ON a.subscription_member_id = sm.id
          WHERE sm.subscription_id = ? ORDER BY sm.role = 'holder' DESC, sm.joined_at`,
        [req.params.id],
      );
      const occupiedCount = members.filter((member: any) => member.status !== "removed").length;
      const subscriptionEndDate = dateOnly(subscriptions[0].end_date);
      const canModifyBeneficiaries =
        subscriptions[0].status === "active" &&
        Boolean(subscriptionEndDate && subscriptionEndDate >= new Date().toISOString().slice(0, 10));
      res.json({
        subscription: {
          id: subscriptions[0].id,
          status: subscriptions[0].status,
          startDate: dateOnly(subscriptions[0].start_date),
          endDate: subscriptionEndDate,
          durationDays: Number(subscriptions[0].duration_days || 30),
          planType: subscriptions[0].plan_type,
          canModifyBeneficiaries,
        },
        capacity: {
          maximum: Number(subscriptions[0].max_members),
          occupied: occupiedCount,
          available: Math.max(0, Number(subscriptions[0].max_members) - occupiedCount),
        },
        members: members.map((member: any) => ({
          id: member.id, memberId: member.member_id, role: member.role, status: member.status,
          joinedAt: member.joined_at, leftAt: member.left_at,
          firstName: member.first_name || "", lastName: member.last_name || "", email: member.email || "",
          effectiveStartDate: dateOnly(member.affiliation_start_date),
          effectiveEndDate: dateOnly(member.affiliation_end_date) || subscriptionEndDate,
          maximumEndDate: member.role === "beneficiary"
            ? addDays(
                dateOnly(member.joined_at) ||
                  subscriptionEndDate ||
                  new Date().toISOString().slice(0, 10),
                Number(subscriptions[0].duration_days || 30),
              )
            : subscriptionEndDate,
          expiryOverride: Boolean((parseJson(member.affiliation_data) as any).expiryOverride),
          restrictions: parseJson(member.restrictions),
        })),
      });
    } catch (error) { next(error); }
  });

  app.post("/api/v2/plan-management/subscriptions/:id/members", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    const pool = requirePool(provider);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [subscriptions]: any = await connection.query(
        `SELECT s.*, pv.plan_type, pv.distribution_model, pv.sessions_unlimited,
                pv.sessions_per_cycle, pv.data AS plan_data
           FROM subscriptions s JOIN plan_versions pv ON pv.id = s.plan_version_id
          WHERE s.id = ? AND s.status = 'active' AND s.end_date >= CURDATE() FOR UPDATE`,
        [req.params.id],
      );
      if (!subscriptions.length) {
        throw Object.assign(
          new Error("Beneficiaries cannot be modified after the multi-user subscription has expired"),
          { status: 409, code: "SUBSCRIPTION_EXPIRED" },
        );
      }
      const subscription = subscriptions[0];
      if (subscription.plan_type === "individual") {
        throw Object.assign(new Error("Individual plans cannot have beneficiaries"), { status: 409 });
      }
      const [counts]: any = await connection.query(
        "SELECT COUNT(*) AS occupied FROM subscription_members WHERE subscription_id = ? AND status IN ('active', 'suspended')",
        [req.params.id],
      );
      if (Number(counts[0]?.occupied || 0) >= Number(subscription.max_members)) {
        throw Object.assign(new Error("Subscription member limit reached"), { status: 409, code: "CAPACITY_LIMIT_REACHED" });
      }

      let memberId = text(req.body.memberId);
      if (!memberId) {
        const newMember = req.body.newMember || {};
        const firstName = text(newMember.firstName);
        const lastName = text(newMember.lastName);
        const requestedEmail = text(newMember.email).toLowerCase();
        const phone = text(newMember.phone);
        if (!firstName || !lastName) {
          throw Object.assign(new Error("First name and last name are required for a new member"), { status: 400 });
        }
        if (!requestedEmail && !phone) {
          throw Object.assign(new Error("An email address or phone number is required for a new member"), { status: 400 });
        }
        const [duplicates]: any = await connection.query(
          `SELECT id FROM members
            WHERE (? <> '' AND LOWER(email) = ?)
               OR (? <> '' AND phone = ?)
            LIMIT 1`,
          [requestedEmail, requestedEmail, phone, phone],
        );
        if (duplicates.length) {
          throw Object.assign(new Error("A member with the same email address or phone number already exists"), { status: 409 });
        }
        memberId = createId("member");
        const email = requestedEmail ||
          `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${memberId.slice(-8)}@powergym.local`;
        await connection.query(
          `INSERT INTO members (id, first_name, last_name, email, phone, status, join_date, data)
           VALUES (?, ?, ?, ?, ?, 'active', CURDATE(), ?)`,
          [
            memberId, firstName, lastName, email, phone || null,
            json({ source: "multi_user_plan", contactEmailGenerated: !requestedEmail }),
          ],
        );
      } else {
        const [members]: any = await connection.query("SELECT id FROM members WHERE id = ? LIMIT 1", [memberId]);
        if (!members.length) throw Object.assign(new Error("Member not found"), { status: 404 });
      }
      await assertNoOutstandingSubscriptionPayment(connection, memberId);

      const [existing]: any = await connection.query(
        "SELECT id FROM subscription_members WHERE subscription_id = ? AND member_id = ? AND status IN ('active', 'suspended') LIMIT 1",
        [req.params.id, memberId],
      );
      if (existing.length) throw Object.assign(new Error("Member is already active in this subscription"), { status: 409 });

      const joinedAt = dateOnly(req.body.joinedAt) || new Date().toISOString().slice(0, 10);
      const subscriptionEndDate = dateOnly(subscription.end_date);
      if (!subscriptionEndDate || joinedAt > subscriptionEndDate) {
        throw Object.assign(
          new Error("The beneficiary join date must be on or before the subscription expiry date"),
          { status: 400 },
        );
      }
      const memberStatus = text(req.body.status) || "active";
      if (!MEMBER_STATUSES.has(memberStatus) || memberStatus === "removed") {
        throw Object.assign(new Error("New subscription members must be active or suspended"), { status: 400 });
      }
      const subscriptionMemberId = createId("sm");
      await connection.query(
        `INSERT INTO subscription_members
          (id, subscription_id, member_id, role, status, joined_at, invited_by, restrictions)
         VALUES (?, ?, ?, 'beneficiary', ?, ?, ?, ?)`,
        [
          subscriptionMemberId, req.params.id, memberId, memberStatus, `${joinedAt} 00:00:00`,
          req.user?.email || req.user?.uid || null, json(req.body.restrictions, {}),
        ],
      );
      const affiliationId = createId("aff");
      const endDate = subscriptionEndDate;
      await connection.query(
        `INSERT INTO affiliations
          (id, member_id, subscription_id, subscription_member_id, plan_version_id,
           status, role, is_primary, start_date, end_date, benefits_override,
           restrictions_override, consumption_priority)
         VALUES (?, ?, ?, ?, ?, ?, 'beneficiary', 0, ?, ?, ?, ?, 0)`,
        [
          affiliationId, memberId, req.params.id, subscriptionMemberId, subscription.plan_version_id,
          memberStatus, joinedAt, endDate, json(req.body.benefitsOverride, {}),
          json(req.body.restrictions, {}),
        ],
      );
      if (!subscription.sessions_unlimited) {
        const [cycleRows]: any = await connection.query(
          "SELECT id FROM subscription_cycles WHERE subscription_id = ? AND status = 'active' ORDER BY cycle_number DESC LIMIT 1",
          [req.params.id],
        );
        if (cycleRows.length) {
          const planData: any = parseJson(subscription.plan_data);
          await allocateAffiliationInActiveCycle(connection, {
            cycleId: cycleRows[0].id,
            subscriptionId: req.params.id,
            affiliationId,
            distributionModel: subscription.distribution_model || "shared",
            sessionsPerCycle: Number(subscription.sessions_per_cycle || 0),
            customQuantity: Number(
              req.body.benefitsOverride?.sessionsPerCycle ??
              planData.beneficiarySessionsPerCycle ??
              subscription.sessions_per_cycle ??
              0,
            ),
            performedBy: req.user?.email || req.user?.uid || "system",
          });
        }
      }
      await connection.query(
        `INSERT INTO subscription_member_history
          (id, subscription_id, subscription_member_id, member_id, action, new_status, performed_by, details)
         VALUES (?, ?, ?, ?, 'added', ?, ?, ?)`,
        [
          createId("smh"), req.params.id, subscriptionMemberId, memberId, memberStatus,
          req.user?.email || req.user?.uid || null,
          json({ joinedAt, benefitsOverride: req.body.benefitsOverride || {}, restrictions: req.body.restrictions || {} }),
        ],
      );
      await connection.commit();
      res.status(201).json({
        member: { subscriptionMemberId, memberId, affiliationId, status: memberStatus },
        capacity: {
          maximum: Number(subscription.max_members),
          occupied: Number(counts[0]?.occupied || 0) + 1,
          available: Math.max(0, Number(subscription.max_members) - Number(counts[0]?.occupied || 0) - 1),
        },
      });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally { connection.release(); }
  });

  app.patch("/api/v2/plan-management/subscriptions/:subscriptionId/members/:memberId", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    const pool = requirePool(provider);
    const connection = await pool.getConnection();
    try {
      const status = text(req.body.status);
      if (!MEMBER_STATUSES.has(status)) return res.status(400).json({ error: "Invalid member status" });
      await connection.beginTransaction();
      const [rows]: any = await connection.query(
        `SELECT sm.id, sm.role, sm.status, s.max_members,
                s.status AS subscription_status, s.end_date AS subscription_end_date
           FROM subscription_members sm
           JOIN subscriptions s ON s.id = sm.subscription_id
          WHERE sm.subscription_id = ? AND sm.member_id = ?
          ORDER BY sm.created_at DESC LIMIT 1 FOR UPDATE`,
        [req.params.subscriptionId, req.params.memberId],
      );
      if (!rows.length) throw Object.assign(new Error("Subscription member not found"), { status: 404 });
      const subscriptionEndDate = dateOnly(rows[0].subscription_end_date);
      if (
        rows[0].subscription_status !== "active" ||
        !subscriptionEndDate ||
        subscriptionEndDate < new Date().toISOString().slice(0, 10)
      ) {
        throw Object.assign(
          new Error("Beneficiaries cannot be modified after the multi-user subscription has expired"),
          { status: 409, code: "SUBSCRIPTION_EXPIRED" },
        );
      }
      if (rows[0].role === "holder" && status !== "active") throw Object.assign(new Error("The subscription holder cannot be suspended or removed"), { status: 409 });
      const previousStatus = rows[0].status;
      if (status === "active" && previousStatus === "removed") {
        const [counts]: any = await connection.query(
          "SELECT COUNT(*) AS occupied FROM subscription_members WHERE subscription_id = ? AND status IN ('active', 'suspended')",
          [req.params.subscriptionId],
        );
        if (Number(counts[0]?.occupied || 0) >= Number(rows[0].max_members)) {
          throw Object.assign(new Error("Subscription member limit reached"), { status: 409, code: "CAPACITY_LIMIT_REACHED" });
        }
      }
      const leftAt = status === "removed" ? new Date() : null;
      await connection.query(
        "UPDATE subscription_members SET status = ?, left_at = ?, restrictions = ? WHERE id = ?",
        [status, leftAt, json(req.body.restrictions, {}), rows[0].id],
      );
      await connection.query(
        "UPDATE affiliations SET status = ?, restrictions_override = ?, updated_at = NOW() WHERE subscription_id = ? AND member_id = ?",
        [status === "removed" ? "cancelled" : status, json(req.body.restrictions, {}), req.params.subscriptionId, req.params.memberId],
      );
      const futureBookingPolicy = text(req.body.futureBookingPolicy) || "cancel";
      let cancelledGroupBookings = 0;
      let cancelledPrivateSessions = 0;
      if (status !== "active" && futureBookingPolicy === "cancel") {
        const [groupResult]: any = await connection.query(
          `UPDATE class_bookings cb
             JOIN class_sessions cs ON cs.id = cb.class_id
              SET cb.status = 'cancelled', cb.cancelled_at = NOW()
            WHERE cb.member_id = ? AND cb.status = 'booked' AND cs.start_time > NOW()`,
          [req.params.memberId],
        );
        const [privateResult]: any = await connection.query(
          `UPDATE private_sessions
              SET status = 'cancelled', updated_at = NOW()
            WHERE member_id = ? AND status = 'scheduled' AND start_time > NOW()`,
          [req.params.memberId],
        );
        cancelledGroupBookings = Number(groupResult?.affectedRows || 0);
        cancelledPrivateSessions = Number(privateResult?.affectedRows || 0);
      }
      await connection.query(
        `INSERT INTO subscription_member_history
          (id, subscription_id, subscription_member_id, member_id, action, previous_status, new_status, performed_by, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createId("smh"), req.params.subscriptionId, rows[0].id, req.params.memberId,
          "status_changed", previousStatus, status, req.user?.email || req.user?.uid || null,
          json({ futureBookingPolicy, cancelledGroupBookings, cancelledPrivateSessions, restrictions: req.body.restrictions || {} }),
        ],
      );
      await connection.query(
        `INSERT INTO outbox_events (id, event_type, payload, status)
         VALUES (?, 'subscription_member_status_changed', ?, 'pending')`,
        [createId("evt"), json({
          subscriptionId: req.params.subscriptionId,
          memberId: req.params.memberId,
          previousStatus,
          newStatus: status,
          futureBookingPolicy,
          cancelledGroupBookings,
          cancelledPrivateSessions,
        })],
      );
      await connection.commit();
      res.json({ ok: true, previousStatus, newStatus: status, futureBookingPolicy, cancelledGroupBookings, cancelledPrivateSessions });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally { connection.release(); }
  });

  app.patch("/api/v2/plan-management/subscriptions/:subscriptionId/members/:memberId/expiry", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    const pool = requirePool(provider);
    const connection = await pool.getConnection();
    try {
      const requestedEndDate = dateOnly(req.body.endDate);
      if (!requestedEndDate) {
        return res.status(400).json({ error: "A valid beneficiary expiry date is required" });
      }
      await connection.beginTransaction();
      const [rows]: any = await connection.query(
        `SELECT sm.id AS subscription_member_id, sm.role, sm.status, sm.joined_at,
                s.status AS subscription_status, s.end_date AS subscription_end_date,
                pv.duration_days, a.id AS affiliation_id, a.end_date AS current_end_date
           FROM subscription_members sm
           JOIN subscriptions s ON s.id = sm.subscription_id
           JOIN plan_versions pv ON pv.id = s.plan_version_id
           LEFT JOIN affiliations a ON a.subscription_member_id = sm.id
          WHERE sm.subscription_id = ? AND sm.member_id = ?
          ORDER BY sm.created_at DESC LIMIT 1 FOR UPDATE`,
        [req.params.subscriptionId, req.params.memberId],
      );
      if (!rows.length || !rows[0].affiliation_id) {
        throw Object.assign(new Error("Beneficiary affiliation not found"), { status: 404 });
      }
      const member = rows[0];
      if (member.role !== "beneficiary") {
        throw Object.assign(new Error("The holder expiry is controlled by the main subscription"), { status: 409 });
      }
      const subscriptionEndDate = dateOnly(member.subscription_end_date);
      const today = new Date().toISOString().slice(0, 10);
      if (
        member.subscription_status !== "active" ||
        !subscriptionEndDate ||
        subscriptionEndDate < today
      ) {
        throw Object.assign(
          new Error("Beneficiary expiry cannot be changed after the multi-user subscription has expired"),
          { status: 409, code: "SUBSCRIPTION_EXPIRED" },
        );
      }
      if (!["active", "suspended"].includes(member.status)) {
        throw Object.assign(new Error("Only active or suspended beneficiaries can receive an expiry exception"), { status: 409 });
      }
      const joinedAt = dateOnly(member.joined_at) || subscriptionEndDate;
      const maximumEndDate = addDays(joinedAt, Number(member.duration_days || 30));
      if (requestedEndDate < subscriptionEndDate) {
        throw Object.assign(
          new Error("The beneficiary expiry cannot be earlier than the main subscription expiry"),
          { status: 400 },
        );
      }
      if (requestedEndDate > maximumEndDate) {
        throw Object.assign(
          new Error(`The beneficiary expiry cannot exceed ${maximumEndDate}`),
          { status: 400, code: "BENEFICIARY_DURATION_LIMIT" },
        );
      }
      const previousEndDate = dateOnly(member.current_end_date) || subscriptionEndDate;
      const expiryOverride = requestedEndDate !== subscriptionEndDate;
      await connection.query(
        `UPDATE affiliations
            SET end_date = ?,
                data = JSON_SET(COALESCE(data, JSON_OBJECT()), '$.expiryOverride', ?),
                version = version + 1,
                updated_at = NOW()
          WHERE id = ?`,
        [requestedEndDate, expiryOverride ? 1 : 0, member.affiliation_id],
      );
      await connection.query(
        `INSERT INTO subscription_member_history
          (id, subscription_id, subscription_member_id, member_id, action, performed_by, details)
         VALUES (?, ?, ?, ?, 'beneficiary_expiry_changed', ?, ?)`,
        [
          createId("smh"), req.params.subscriptionId, member.subscription_member_id,
          req.params.memberId, req.user?.email || req.user?.uid || null,
          json({ previousEndDate, newEndDate: requestedEndDate, maximumEndDate, expiryOverride }),
        ],
      );
      await connection.commit();
      res.json({
        ok: true,
        previousEndDate,
        endDate: requestedEndDate,
        maximumEndDate,
        expiryOverride,
      });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally { connection.release(); }
  });

  app.patch("/api/v2/plan-management/subscriptions/:id/holder", requirePermission("membership.write"), async (req: AuthenticatedRequest, res, next) => {
    const pool = requirePool(provider);
    const connection = await pool.getConnection();
    try {
      const newHolderMemberId = text(req.body.newHolderMemberId);
      if (!newHolderMemberId) {
        return res.status(400).json({ error: "newHolderMemberId is required" });
      }
      await connection.beginTransaction();
      const [subscriptions]: any = await connection.query(
        `SELECT id, holder_member_id, status, end_date
           FROM subscriptions
          WHERE id = ? FOR UPDATE`,
        [req.params.id],
      );
      if (!subscriptions.length) {
        throw Object.assign(new Error("Subscription not found"), { status: 404 });
      }
      const subscription = subscriptions[0];
      const subscriptionEndDate = dateOnly(subscription.end_date);
      if (
        subscription.status !== "active" ||
        !subscriptionEndDate ||
        subscriptionEndDate < new Date().toISOString().slice(0, 10)
      ) {
        throw Object.assign(
          new Error("The holder cannot be changed after the multi-user subscription has expired"),
          { status: 409, code: "SUBSCRIPTION_EXPIRED" },
        );
      }
      const previousHolderMemberId = text(subscription.holder_member_id);
      if (previousHolderMemberId === newHolderMemberId) {
        throw Object.assign(new Error("The selected member is already the subscription holder"), { status: 409 });
      }
      const [memberRows]: any = await connection.query(
        `SELECT id, member_id, role, status
           FROM subscription_members
          WHERE subscription_id = ?
            AND member_id IN (?, ?)
            AND status IN ('active', 'suspended')
          FOR UPDATE`,
        [req.params.id, previousHolderMemberId, newHolderMemberId],
      );
      const previousHolder = memberRows.find(
        (member: any) => member.member_id === previousHolderMemberId && member.role === "holder",
      );
      const newHolder = memberRows.find(
        (member: any) => member.member_id === newHolderMemberId && member.role === "beneficiary",
      );
      if (!previousHolder) {
        throw Object.assign(new Error("Current subscription holder record not found"), { status: 409 });
      }
      if (!newHolder || newHolder.status !== "active") {
        throw Object.assign(
          new Error("The new holder must be an active beneficiary of the same subscription"),
          { status: 409 },
        );
      }
      await connection.query(
        "UPDATE subscription_members SET role = 'beneficiary', updated_at = NOW() WHERE id = ?",
        [previousHolder.id],
      );
      await connection.query(
        "UPDATE subscription_members SET role = 'holder', updated_at = NOW() WHERE id = ?",
        [newHolder.id],
      );
      await connection.query(
        "UPDATE affiliations SET role = 'beneficiary', is_primary = 0, updated_at = NOW() WHERE subscription_member_id = ?",
        [previousHolder.id],
      );
      await connection.query(
        "UPDATE affiliations SET role = 'holder', is_primary = 1, end_date = ?, data = JSON_REMOVE(COALESCE(data, JSON_OBJECT()), '$.expiryOverride'), updated_at = NOW() WHERE subscription_member_id = ?",
        [subscriptionEndDate, newHolder.id],
      );
      await connection.query(
        "UPDATE subscriptions SET holder_member_id = ?, version = version + 1, updated_at = NOW() WHERE id = ?",
        [newHolderMemberId, req.params.id],
      );
      const performedBy = req.user?.email || req.user?.uid || null;
      await connection.query(
        `INSERT INTO subscription_member_history
          (id, subscription_id, subscription_member_id, member_id, action, performed_by, details)
         VALUES
          (?, ?, ?, ?, 'holder_transferred_out', ?, ?),
          (?, ?, ?, ?, 'holder_transferred_in', ?, ?)`,
        [
          createId("smh"), req.params.id, previousHolder.id, previousHolderMemberId,
          performedBy, json({ newHolderMemberId }),
          createId("smh"), req.params.id, newHolder.id, newHolderMemberId,
          performedBy, json({ previousHolderMemberId }),
        ],
      );
      await connection.query(
        `INSERT INTO outbox_events (id, event_type, payload, status)
         VALUES (?, 'subscription_holder_changed', ?, 'pending')`,
        [
          createId("evt"),
          json({ subscriptionId: req.params.id, previousHolderMemberId, newHolderMemberId }),
        ],
      );
      await connection.commit();
      res.json({ ok: true, previousHolderMemberId, newHolderMemberId });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally { connection.release(); }
  });

  app.get("/api/v2/plan-management/subscriptions/:id/member-history", requirePermission("membership.read"), async (req, res, next) => {
    try {
      const pool = requirePool(provider);
      const [rows]: any = await pool.query(
        "SELECT * FROM subscription_member_history WHERE subscription_id = ? ORDER BY created_at DESC LIMIT 200",
        [req.params.id],
      );
      res.json({ history: rows.map((row: any) => ({
        id: row.id, memberId: row.member_id, action: row.action,
        previousStatus: row.previous_status, newStatus: row.new_status,
        effectiveAt: row.effective_at, performedBy: row.performed_by,
        details: parseJson(row.details),
      })) });
    } catch (error) { next(error); }
  });
}
