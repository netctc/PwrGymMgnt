import crypto from "crypto";
import type { Express, Request } from "express";
import type { Pool, PoolConnection } from "mysql2/promise";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { requirePermission } from "./rbac";

type PoolProvider = () => Pool | null;
type AuthenticatedRequest = Request & { user?: { email?: string; uid?: string } };
type DbExecutor = Pool | PoolConnection;

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateOnly(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(raw) ? raw.slice(0, 10) : "";
}

function jsonObject(value: unknown): Record<string, any> {
  if (value && typeof value === "object") return value as Record<string, any>;
  if (typeof value !== "string" || !value.trim()) return {};
  try { return JSON.parse(value); } catch { return {}; }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function inclusiveDays(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function contractedSessions(source: any, periodStart: string, periodEnd: string) {
  if (Boolean(source.sessions_unlimited)) return 0;
  const perCycle = Math.max(0, Number(source.sessions_per_cycle || 0));
  const days = inclusiveDays(periodStart, periodEnd);
  const cycleDays = source.cycle_frequency === "weekly"
    ? 7
    : source.cycle_frequency === "quarterly"
      ? 90
      : source.cycle_frequency === "subscription"
        ? days
        : 30;
  return perCycle * Math.max(1, Math.ceil(days / cycleDays));
}

function requirePool(provider: PoolProvider) {
  const pool = provider();
  if (!pool) throw Object.assign(new Error("Database not connected"), { status: 503 });
  return pool;
}

function csv(value: unknown) {
  const normalized = String(value ?? "");
  return /[",\r\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

export async function upsertTrainerPlanCommission(
  db: DbExecutor,
  input: {
    subscriptionId: string;
    invoiceId: string;
    invoiceNumber: string;
    paymentStatus: string;
    dueDate?: string | null;
    createdBy?: string | null;
  },
) {
  const [rows]: any = await db.query(
    `SELECT s.id AS subscription_id, s.plan_id, s.plan_version_id,
            s.price_paid, s.currency, s.start_date, s.end_date,
            pv.name AS plan_name, pv.plan_type, pv.sessions_unlimited,
            pv.sessions_per_cycle, pv.cycle_frequency,
            pv.trainer_id, pv.trainer_name, pv.trainer_commission_percent,
            invoice.data AS invoice_data
       FROM subscriptions s
       JOIN plan_versions pv ON pv.id = s.plan_version_id
       LEFT JOIN invoices invoice ON invoice.id = ?
      WHERE s.id = ?
      LIMIT 1`,
    [input.invoiceId, input.subscriptionId],
  );
  const source = rows[0];
  const percent = Number(source?.trainer_commission_percent || 0);
  if (!source?.trainer_id || percent <= 0) return null;

  const grossAmount = Number(source.price_paid || 0);
  const trainerAmount = Math.round(grossAmount * percent) / 100;
  const gymAmount = Math.round((grossAmount - trainerAmount) * 100) / 100;
  const status = input.paymentStatus === "paid" ? "earned" : "pending";
  const cycleReference = `trainer_commission:${input.invoiceId}`;
  const commissionId = createId("tpc");
  const invoiceData = jsonObject(source.invoice_data);
  const periodStart = dateOnly(invoiceData.periodStart) || dateOnly(source.start_date);
  const periodEnd = dateOnly(invoiceData.periodEnd) || dateOnly(source.end_date);
  const sessionsContracted = contractedSessions(source, periodStart, periodEnd);

  await db.query(
    `INSERT INTO trainer_plan_commissions
      (id, trainer_id, trainer_name, subscription_id, plan_id, plan_version_id,
       plan_name, plan_type, invoice_id, invoice_number, cycle_reference,
       gross_amount, commission_percent, trainer_amount, gym_amount, currency,
       payment_status, due_date, period_start, period_end, sessions_contracted,
       amount_paid, amount_pending, earned_at, created_by, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       gross_amount = VALUES(gross_amount),
       commission_percent = VALUES(commission_percent),
       trainer_amount = VALUES(trainer_amount),
       gym_amount = VALUES(gym_amount),
       payment_status = CASE
         WHEN trainer_plan_commissions.payment_status = 'paid' THEN 'paid'
         WHEN trainer_plan_commissions.payment_status = 'partially_paid'
           THEN 'partially_paid'
         ELSE VALUES(payment_status)
       END,
       due_date = VALUES(due_date),
       period_start = VALUES(period_start),
       period_end = VALUES(period_end),
       sessions_contracted = VALUES(sessions_contracted),
       amount_pending = GREATEST(VALUES(trainer_amount) - trainer_plan_commissions.amount_paid, 0),
       earned_at = CASE
         WHEN VALUES(payment_status) = 'earned' THEN COALESCE(trainer_plan_commissions.earned_at, NOW())
         ELSE trainer_plan_commissions.earned_at
       END,
       data = VALUES(data),
       updated_at = CURRENT_TIMESTAMP`,
    [
      commissionId, source.trainer_id, source.trainer_name || source.trainer_id,
      source.subscription_id, source.plan_id, source.plan_version_id,
      source.plan_name, source.plan_type, input.invoiceId, input.invoiceNumber,
      cycleReference, grossAmount, percent, trainerAmount, gymAmount,
      source.currency || "USD", status, periodEnd, periodStart, periodEnd,
      sessionsContracted, trainerAmount,
      status === "earned" ? new Date() : null, input.createdBy || "system",
      JSON.stringify({
        source: "subscription_invoice",
        accountingTreatment: "separate_from_fixed_salary",
        sessionsPerCycle: Number(source.sessions_per_cycle || 0),
        cycleFrequency: source.cycle_frequency || "monthly",
      }),
    ],
  );

  const [commissionRows]: any = await db.query(
    "SELECT id FROM trainer_plan_commissions WHERE cycle_reference = ? LIMIT 1",
    [cycleReference],
  );
  const storedCommissionId = commissionRows[0]?.id || commissionId;

  if (status === "earned") {
    await db.query(
      `INSERT INTO finance_transactions
        (id, type, category, amount, transaction_date, source, reference_type,
         reference_id, description, status, created_by, approved_by, data)
       VALUES (?, 'expense', 'Trainer Plan Commission', ?, CURDATE(),
               'trainer_commission', 'trainer_plan_commission', ?, ?, 'posted', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         amount = VALUES(amount),
         transaction_date = VALUES(transaction_date),
         description = VALUES(description),
         status = 'posted',
         approved_by = VALUES(approved_by),
         data = VALUES(data),
         updated_at = CURRENT_TIMESTAMP`,
      [
        createId("ftx"), trainerAmount, storedCommissionId,
        `Trainer commission ${input.invoiceNumber} - ${source.trainer_name || source.trainer_id} - ${source.plan_name}`,
        input.createdBy || "system", input.createdBy || "system",
        JSON.stringify({
          source: "trainer_plan_commission",
          subscriptionId: source.subscription_id,
          invoiceId: input.invoiceId,
          invoiceNumber: input.invoiceNumber,
          trainerId: source.trainer_id,
          commissionPercent: percent,
          grossAmount,
          gymAmount,
          separateFromPayroll: true,
        }),
      ],
    );
  }

  return { commissionId: storedCommissionId, trainerAmount, gymAmount, status };
}

async function effectiveConsumedSessions(db: DbExecutor, commission: any) {
  const [rows]: any = await db.query(
    `SELECT COALESCE(SUM(movement.quantity), 0) AS sessions_consumed
       FROM session_movements movement
       JOIN affiliations affiliation ON affiliation.id = movement.affiliation_id
      WHERE affiliation.subscription_id = ?
        AND movement.movement_type IN ('consumption', 'adjustment_negative')
        AND movement.direction = '-'
        AND movement.created_at >= ?
        AND movement.created_at < DATE_ADD(?, INTERVAL 1 DAY)
        AND NOT EXISTS (
          SELECT 1
            FROM session_movements reversal
           WHERE reversal.related_movement_id = movement.id
             AND reversal.movement_type IN ('refund', 'compensation')
        )`,
    [commission.subscription_id, commission.period_start, commission.period_end],
  );
  return Math.max(0, Number(rows[0]?.sessions_consumed || 0));
}

async function settleCommission(
  pool: Pool,
  commissionId: string,
  paymentType: "partial" | "full",
  authorizedBy: string,
) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows]: any = await connection.query(
      "SELECT * FROM trainer_plan_commissions WHERE id = ? LIMIT 1 FOR UPDATE",
      [commissionId],
    );
    const commission = rows[0];
    if (!commission) {
      throw Object.assign(new Error("Commission not found"), { status: 404 });
    }
    if (!["earned", "partially_paid"].includes(commission.payment_status)) {
      throw Object.assign(
        new Error("Only earned or partially paid commissions can be settled"),
        { status: 409, code: "COMMISSION_NOT_PAYABLE" },
      );
    }

    const commissionTotal = roundMoney(Number(commission.trainer_amount || 0));
    const amountPaid = roundMoney(Number(commission.amount_paid || 0));
    const balanceBefore = roundMoney(Math.max(0, commissionTotal - amountPaid));
    if (balanceBefore <= 0) {
      throw Object.assign(
        new Error("This commission has no outstanding balance"),
        { status: 409, code: "COMMISSION_ALREADY_SETTLED" },
      );
    }

    const sessionsContracted = Math.max(0, Number(commission.sessions_contracted || 0));
    const sessionsConsumed = await effectiveConsumedSessions(connection, commission);
    let amount = balanceBefore;
    let sessionsPaidAfter = Math.max(0, Number(commission.sessions_paid || 0));

    if (paymentType === "partial") {
      if (sessionsContracted <= 0) {
        throw Object.assign(
          new Error("Partial payment is available only for limited-session plans"),
          { status: 409, code: "PARTIAL_PAYMENT_REQUIRES_LIMITED_SESSIONS" },
        );
      }
      const payableSessions = Math.min(sessionsConsumed, sessionsContracted);
      const proportionalEntitlement = roundMoney(
        commissionTotal * payableSessions / sessionsContracted,
      );
      amount = roundMoney(Math.min(balanceBefore, proportionalEntitlement - amountPaid));
      if (amount <= 0) {
        throw Object.assign(
          new Error("No new consumed sessions are available for partial payment"),
          {
            status: 409,
            code: "NO_PARTIAL_COMMISSION_AVAILABLE",
            details: { sessionsConsumed, sessionsContracted, amountPaid, proportionalEntitlement },
          },
        );
      }
      sessionsPaidAfter = payableSessions;
    }

    if (amount > balanceBefore || roundMoney(amountPaid + amount) > commissionTotal) {
      throw Object.assign(
        new Error("The settlement would exceed the total trainer commission"),
        { status: 409, code: "COMMISSION_TOTAL_EXCEEDED" },
      );
    }

    const paymentId = createId("tcp");
    const balanceAfter = roundMoney(Math.max(0, balanceBefore - amount));
    const newAmountPaid = roundMoney(amountPaid + amount);
    const paymentStatus = balanceAfter === 0 ? "paid" : "partially_paid";
    const financeTransactionId = createId("ftx");
    const idempotencyKey = paymentType === "partial"
      ? `trainer_commission_partial:${commissionId}:${sessionsConsumed}:${Math.round(amountPaid * 100)}`
      : `trainer_commission_full:${commissionId}`;

    await connection.query(
      `INSERT INTO trainer_commission_payments
        (id, commission_id, payment_type, amount, commission_total,
         balance_before, balance_after, sessions_contracted,
         sessions_consumed_snapshot, sessions_paid_before, sessions_paid_after,
         authorized_by, finance_transaction_id, idempotency_key, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paymentId, commissionId, paymentType, amount, commissionTotal,
        balanceBefore, balanceAfter, sessionsContracted, sessionsConsumed,
        Number(commission.sessions_paid || 0), sessionsPaidAfter,
        authorizedBy, financeTransactionId, idempotencyKey,
        JSON.stringify({
          source: "trainer_commission_settlement",
          invoiceId: commission.invoice_id,
          invoiceNumber: commission.invoice_number,
          subscriptionId: commission.subscription_id,
          proportionalToConsumedSessions: paymentType === "partial",
        }),
      ],
    );

    await connection.query(
      `UPDATE trainer_plan_commissions
          SET payment_status = ?,
              amount_paid = ?,
              amount_pending = ?,
              sessions_paid = ?,
              paid_at = CASE WHEN ? = 'paid' THEN NOW() ELSE paid_at END,
              data = JSON_SET(
                COALESCE(data, JSON_OBJECT()),
                '$.lastSettlementBy', ?,
                '$.lastSettlementType', ?
              )
        WHERE id = ?`,
      [
        paymentStatus, newAmountPaid, balanceAfter, sessionsPaidAfter,
        paymentStatus, authorizedBy, paymentType, commissionId,
      ],
    );

    await connection.query(
      `INSERT INTO finance_transactions
        (id, type, category, amount, transaction_date, source, reference_type,
         reference_id, description, status, created_by, approved_by, data)
       VALUES (?, 'transfer', ?, ?, CURDATE(), 'trainer_commission',
               'trainer_commission_payment', ?, ?, 'posted', ?, ?, ?)`,
      [
        financeTransactionId,
        paymentType === "partial"
          ? "Partial Trainer Commission Settlement"
          : "Trainer Commission Settlement",
        amount,
        paymentId,
        `${paymentType === "partial" ? "Partial" : "Final"} trainer commission settlement ${commission.invoice_number} - ${commission.trainer_name} - ${commission.plan_name}`,
        authorizedBy,
        authorizedBy,
        JSON.stringify({
          source: "trainer_commission_payment",
          commissionId,
          paymentId,
          paymentType,
          invoiceNumber: commission.invoice_number,
          subscriptionId: commission.subscription_id,
          sessionsConsumed,
          sessionsContracted,
          balanceBefore,
          balanceAfter,
          accountingTreatment: "commission_liability_settlement_no_duplicate_expense",
          separateFromPayroll: true,
        }),
      ],
    );

    await connection.query(
      "INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)",
      [
        paymentType === "partial"
          ? "trainer_commission_partially_paid"
          : "trainer_commission_paid",
        JSON.stringify({
          commissionId,
          paymentId,
          paymentType,
          amount,
          commissionTotal,
          balanceBefore,
          balanceAfter,
          sessionsConsumed,
          sessionsContracted,
          invoiceNumber: commission.invoice_number,
        }),
        authorizedBy,
      ],
    );

    await connection.commit();
    return {
      ok: true,
      paymentId,
      paymentType,
      paymentStatus,
      amount,
      amountPaid: newAmountPaid,
      amountPending: balanceAfter,
      sessionsConsumed,
      sessionsContracted,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function filters(req: Request) {
  const where: string[] = [];
  const values: unknown[] = [];
  const from = dateOnly(req.query.from);
  const to = dateOnly(req.query.to);
  const planType = text(req.query.planType);
  const paymentStatus = text(req.query.paymentStatus);
  const trainerId = text(req.query.trainerId);
  if (from) { where.push("DATE(tpc.created_at) >= ?"); values.push(from); }
  if (to) { where.push("DATE(tpc.created_at) <= ?"); values.push(to); }
  if (planType) { where.push("tpc.plan_type = ?"); values.push(planType); }
  if (paymentStatus) { where.push("tpc.payment_status = ?"); values.push(paymentStatus); }
  if (trainerId) { where.push("tpc.trainer_id = ?"); values.push(trainerId); }
  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", values };
}

async function commissionRows(pool: Pool, req: Request) {
  const { clause, values } = filters(req);
  const [rows]: any = await pool.query(
    `SELECT tpc.*,
            COALESCE((
              SELECT SUM(movement.quantity)
                FROM session_movements movement
                JOIN affiliations affiliation ON affiliation.id = movement.affiliation_id
               WHERE affiliation.subscription_id = tpc.subscription_id
                 AND movement.movement_type IN ('consumption', 'adjustment_negative')
                 AND movement.direction = '-'
                 AND movement.created_at >= tpc.period_start
                 AND movement.created_at < DATE_ADD(tpc.period_end, INTERVAL 1 DAY)
                 AND NOT EXISTS (
                   SELECT 1
                     FROM session_movements reversal
                    WHERE reversal.related_movement_id = movement.id
                      AND reversal.movement_type IN ('refund', 'compensation')
                 )
            ), 0) AS sessions_consumed,
            COALESCE((
              SELECT COUNT(*) FROM private_sessions ps
               WHERE ps.trainer_id = tpc.trainer_id
                 AND ps.status IN ('completed', 'attended')
                 AND ps.start_time >= COALESCE(?, '1000-01-01')
                 AND ps.start_time < DATE_ADD(COALESCE(?, '9998-12-31'), INTERVAL 1 DAY)
            ), 0) +
            COALESCE((
              SELECT COUNT(*) FROM class_sessions cs
               WHERE cs.trainer_id = tpc.trainer_id
                 AND cs.status IN ('completed', 'attended')
                 AND cs.start_time >= COALESCE(?, '1000-01-01')
                 AND cs.start_time < DATE_ADD(COALESCE(?, '9998-12-31'), INTERVAL 1 DAY)
            ), 0) AS sessions_completed
       FROM trainer_plan_commissions tpc
       ${clause}
      ORDER BY tpc.created_at DESC`,
    [dateOnly(req.query.from) || null, dateOnly(req.query.to) || null, dateOnly(req.query.from) || null, dateOnly(req.query.to) || null, ...values],
  );
  return rows;
}

async function commissionPaymentRows(pool: Pool, commissionIds: string[]) {
  if (!commissionIds.length) return [];
  const placeholders = commissionIds.map(() => "?").join(",");
  const [rows]: any = await pool.query(
    `SELECT payment.*, commission.trainer_id, commission.trainer_name,
            commission.plan_name, commission.invoice_number, commission.currency
       FROM trainer_commission_payments payment
       JOIN trainer_plan_commissions commission ON commission.id = payment.commission_id
      WHERE payment.commission_id IN (${placeholders})
      ORDER BY payment.paid_at DESC, payment.id DESC`,
    commissionIds,
  );
  return rows;
}

async function registeredTrainerPerformance(pool: Pool, req: Request) {
  const trainerId = text(req.query.trainerId);
  const [rows]: any = await pool.query(
    `SELECT e.id AS trainer_id,
            CONCAT_WS(' ', e.first_name, e.last_name) AS trainer_name,
            COALESCE((
              SELECT COUNT(*) FROM private_sessions ps
               WHERE ps.trainer_id = e.id
                 AND ps.status IN ('completed', 'attended')
                 AND ps.start_time >= COALESCE(?, '1000-01-01')
                 AND ps.start_time < DATE_ADD(COALESCE(?, '9998-12-31'), INTERVAL 1 DAY)
            ), 0) +
            COALESCE((
              SELECT COUNT(*) FROM class_sessions cs
               WHERE cs.trainer_id = e.id
                 AND cs.status IN ('completed', 'attended')
                 AND cs.start_time >= COALESCE(?, '1000-01-01')
                 AND cs.start_time < DATE_ADD(COALESCE(?, '9998-12-31'), INTERVAL 1 DAY)
            ), 0) AS sessions_completed
       FROM employees e
       LEFT JOIN admin_users au ON LOWER(TRIM(au.email)) = LOWER(TRIM(e.email))
      WHERE e.employment_status = 'active'
        AND (? = '' OR e.id = ?)
        AND (
          LOWER(COALESCE(au.role, '')) = 'trainer'
          OR LOWER(COALESCE(e.job_title, '')) LIKE '%trainer%'
          OR LOWER(COALESCE(e.department, '')) IN ('training', 'coaching')
        )
      ORDER BY trainer_name`,
    [
      dateOnly(req.query.from) || null, dateOnly(req.query.to) || null,
      dateOnly(req.query.from) || null, dateOnly(req.query.to) || null,
      trainerId, trainerId,
    ],
  );
  return rows;
}

export function registerTrainerCommissionRoutes(app: Express, provider: PoolProvider) {
  app.get("/api/v2/trainer-commissions/employees", requirePermission("membership.read"), async (_req, res, next) => {
    try {
      const pool = requirePool(provider);
      const [rows]: any = await pool.query(
        `SELECT e.id, CONCAT_WS(' ', e.first_name, e.last_name) AS name,
                e.email, e.job_title, e.department
           FROM employees e
          WHERE e.employment_status = 'active'
          ORDER BY e.first_name, e.last_name`,
      );
      res.json({ employees: rows });
    } catch (error) { next(error); }
  });

  app.get("/api/v2/trainer-commissions/trainers", requirePermission("membership.read"), async (_req, res, next) => {
    try {
      const pool = requirePool(provider);
      const rows = await registeredTrainerPerformance(pool, _req);
      res.json({ trainers: rows.map((row: any) => ({
        id: row.trainer_id,
        name: row.trainer_name,
      })) });
    } catch (error) { next(error); }
  });

  app.get("/api/v2/trainer-commissions", requirePermission("finance.read"), async (req, res, next) => {
    try {
      const pool = requirePool(provider);
      const rows = await commissionRows(pool, req);
      const payments = await commissionPaymentRows(pool, rows.map((row: any) => row.id));
      const registered = await registeredTrainerPerformance(pool, req);
      const trainers = new Map<string, any>(registered.map((row: any) => [
        row.trainer_id,
        {
          trainerId: row.trainer_id,
          trainerName: row.trainer_name,
          sessionsCompleted: Number(row.sessions_completed || 0),
          totalCommission: 0,
          pendingCommission: 0,
          paidCommission: 0,
          currency: "USD",
        },
      ]));
      for (const row of rows) {
        const summary = trainers.get(row.trainer_id) || {
          trainerId: row.trainer_id,
          trainerName: row.trainer_name,
          sessionsCompleted: Number(row.sessions_completed || 0),
          totalCommission: 0,
          pendingCommission: 0,
          paidCommission: 0,
          currency: row.currency || "USD",
        };
        summary.totalCommission += row.payment_status === "pending" ? 0 : Number(row.trainer_amount || 0);
        summary.pendingCommission += Number(row.amount_pending ?? row.trainer_amount ?? 0);
        summary.paidCommission += Number(row.amount_paid || 0);
        trainers.set(row.trainer_id, summary);
      }
      res.json({
        trainers: Array.from(trainers.values()),
        history: rows.map((row: any) => ({
          id: row.id,
          trainerId: row.trainer_id,
          trainerName: row.trainer_name,
          planName: row.plan_name,
          planType: row.plan_type,
          invoiceNumber: row.invoice_number,
          grossAmount: Number(row.gross_amount || 0),
          commissionPercent: Number(row.commission_percent || 0),
          trainerAmount: Number(row.trainer_amount || 0),
          gymAmount: Number(row.gym_amount || 0),
          amountPaid: Number(row.amount_paid || 0),
          amountPending: Number(row.amount_pending ?? row.trainer_amount ?? 0),
          sessionsContracted: Number(row.sessions_contracted || 0),
          sessionsConsumed: Number(row.sessions_consumed || 0),
          sessionsRemaining: Math.max(
            0,
            Number(row.sessions_contracted || 0) - Number(row.sessions_consumed || 0),
          ),
          sessionsPaid: Number(row.sessions_paid || 0),
          currency: row.currency || "USD",
          paymentStatus: row.payment_status,
          dueDate: row.due_date,
          earnedAt: row.earned_at,
          paidAt: row.paid_at,
          createdAt: row.created_at,
        })),
        payments: payments.map((payment: any) => ({
          id: payment.id,
          commissionId: payment.commission_id,
          trainerId: payment.trainer_id,
          trainerName: payment.trainer_name,
          planName: payment.plan_name,
          invoiceNumber: payment.invoice_number,
          paymentType: payment.payment_type,
          amount: Number(payment.amount || 0),
          commissionTotal: Number(payment.commission_total || 0),
          balanceBefore: Number(payment.balance_before || 0),
          balanceAfter: Number(payment.balance_after || 0),
          sessionsContracted: Number(payment.sessions_contracted || 0),
          sessionsConsumed: Number(payment.sessions_consumed_snapshot || 0),
          sessionsPaidBefore: Number(payment.sessions_paid_before || 0),
          sessionsPaidAfter: Number(payment.sessions_paid_after || 0),
          currency: payment.currency || "USD",
          authorizedBy: payment.authorized_by,
          paidAt: payment.paid_at,
        })),
      });
    } catch (error) { next(error); }
  });

  app.patch("/api/v2/trainer-commissions/:id/pay", requirePermission("finance.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(provider);
      const result = await settleCommission(
        pool,
        req.params.id,
        "full",
        req.user?.email || req.user?.uid || "system",
      );
      res.json(result);
    } catch (error) { next(error); }
  });

  app.patch("/api/v2/trainer-commissions/:id/pay-partial", requirePermission("finance.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await settleCommission(
        requirePool(provider),
        req.params.id,
        "partial",
        req.user?.email || req.user?.uid || "system",
      );
      res.json(result);
    } catch (error) { next(error); }
  });

  app.get("/api/v2/trainer-commissions/export.csv", requirePermission("finance.read"), async (req, res, next) => {
    try {
      const rows = await commissionRows(requirePool(provider), req);
      const headers = ["Trainer", "Sessions consumed", "Sessions remaining", "Sessions contracted", "Plan", "Plan type", "Invoice", "Gross", "Percentage", "Commission", "Paid", "Pending", "Gym share", "Currency", "Status", "Subscription end / Due date", "Earned at", "Paid at"];
      const body = rows.map((row: any) => [
        row.trainer_name, row.sessions_consumed,
        Math.max(0, Number(row.sessions_contracted || 0) - Number(row.sessions_consumed || 0)),
        row.sessions_contracted,
        row.plan_name, row.plan_type,
        row.invoice_number, row.gross_amount, row.commission_percent,
        row.trainer_amount, row.amount_paid, row.amount_pending,
        row.gym_amount, row.currency, row.payment_status,
        row.due_date || "", row.earned_at || "", row.paid_at || "",
      ].map(csv).join(","));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="trainer-commissions.csv"');
      res.send(`\uFEFF${headers.map(csv).join(",")}\r\n${body.join("\r\n")}`);
    } catch (error) { next(error); }
  });

  app.get("/api/v2/trainer-commissions/export.pdf", requirePermission("finance.read"), async (req, res, next) => {
    try {
      const pool = requirePool(provider);
      const rows = await commissionRows(pool, req);
      const payments = await commissionPaymentRows(pool, rows.map((row: any) => row.id));
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(17);
      doc.text("Trainer commissions and performance", 36, 38);
      doc.setFontSize(9);
      doc.text(`Generated ${new Date().toISOString()}`, 36, 54);
      autoTable(doc, {
        startY: 68,
        head: [["Trainer", "Consumed / remaining", "Plan", "Invoice", "Commission", "Paid", "Pending", "Gym", "Status", "Subscription end"]],
        body: rows.map((row: any) => [
          row.trainer_name,
          Number(row.sessions_contracted || 0) > 0
            ? `${row.sessions_consumed}/${Math.max(0, Number(row.sessions_contracted) - Number(row.sessions_consumed))}`
            : "Unlimited",
          row.plan_name, row.invoice_number,
          `${row.trainer_amount} ${row.currency}`,
          `${row.amount_paid} ${row.currency}`,
          `${row.amount_pending} ${row.currency}`,
          `${row.gym_amount} ${row.currency}`,
          row.payment_status, row.due_date || "",
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [43, 43, 43] },
      });
      if (payments.length) {
        doc.setFontSize(13);
        const startY = Math.min((doc as any).lastAutoTable?.finalY + 30 || 90, 520);
        doc.text("Commission payment history", 36, startY);
        autoTable(doc, {
          startY: startY + 10,
          head: [["Paid at", "Trainer", "Invoice", "Type", "Amount", "Consumed / remaining", "Balance", "Authorized by"]],
          body: payments.map((payment: any) => [
            payment.paid_at || "",
            payment.trainer_name,
            payment.invoice_number,
            payment.payment_type,
            `${payment.amount} ${payment.currency}`,
            `${payment.sessions_consumed_snapshot}/${Math.max(0, Number(payment.sessions_contracted) - Number(payment.sessions_consumed_snapshot))}`,
            `${payment.balance_after} ${payment.currency}`,
            payment.authorized_by,
          ]),
          styles: { fontSize: 7 },
          headStyles: { fillColor: [62, 74, 89] },
        });
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="trainer-commissions.pdf"');
      res.send(Buffer.from(doc.output("arraybuffer")));
    } catch (error) { next(error); }
  });
}
