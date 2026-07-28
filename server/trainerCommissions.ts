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
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
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
            s.price_paid, s.currency, pv.name AS plan_name, pv.plan_type,
            pv.trainer_id, pv.trainer_name, pv.trainer_commission_percent
       FROM subscriptions s
       JOIN plan_versions pv ON pv.id = s.plan_version_id
      WHERE s.id = ?
      LIMIT 1`,
    [input.subscriptionId],
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

  await db.query(
    `INSERT INTO trainer_plan_commissions
      (id, trainer_id, trainer_name, subscription_id, plan_id, plan_version_id,
       plan_name, plan_type, invoice_id, invoice_number, cycle_reference,
       gross_amount, commission_percent, trainer_amount, gym_amount, currency,
       payment_status, due_date, earned_at, created_by, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       gross_amount = VALUES(gross_amount),
       commission_percent = VALUES(commission_percent),
       trainer_amount = VALUES(trainer_amount),
       gym_amount = VALUES(gym_amount),
       payment_status = CASE
         WHEN trainer_plan_commissions.payment_status = 'paid' THEN 'paid'
         ELSE VALUES(payment_status)
       END,
       due_date = VALUES(due_date),
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
      source.currency || "USD", status, input.dueDate || null,
      status === "earned" ? new Date() : null, input.createdBy || "system",
      JSON.stringify({ source: "subscription_invoice", accountingTreatment: "separate_from_fixed_salary" }),
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
        summary.pendingCommission += row.payment_status === "pending" || row.payment_status === "earned"
          ? Number(row.trainer_amount || 0) : 0;
        summary.paidCommission += row.payment_status === "paid" ? Number(row.trainer_amount || 0) : 0;
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
          currency: row.currency || "USD",
          paymentStatus: row.payment_status,
          dueDate: row.due_date,
          earnedAt: row.earned_at,
          paidAt: row.paid_at,
          createdAt: row.created_at,
        })),
      });
    } catch (error) { next(error); }
  });

  app.patch("/api/v2/trainer-commissions/:id/pay", requirePermission("finance.write"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(provider);
      const [result]: any = await pool.query(
        `UPDATE trainer_plan_commissions
            SET payment_status = 'paid', paid_at = NOW(),
                data = JSON_SET(COALESCE(data, JSON_OBJECT()), '$.paidBy', ?)
          WHERE id = ? AND payment_status = 'earned'`,
        [req.user?.email || req.user?.uid || "system", req.params.id],
      );
      if (!result.affectedRows) return res.status(409).json({ error: "Only earned commissions can be marked as paid" });
      res.json({ ok: true, paymentStatus: "paid" });
    } catch (error) { next(error); }
  });

  app.get("/api/v2/trainer-commissions/export.csv", requirePermission("finance.read"), async (req, res, next) => {
    try {
      const rows = await commissionRows(requirePool(provider), req);
      const headers = ["Trainer", "Sessions", "Plan", "Plan type", "Invoice", "Gross", "Percentage", "Commission", "Gym share", "Currency", "Status", "Due date", "Earned at", "Paid at"];
      const body = rows.map((row: any) => [
        row.trainer_name, row.sessions_completed, row.plan_name, row.plan_type,
        row.invoice_number, row.gross_amount, row.commission_percent,
        row.trainer_amount, row.gym_amount, row.currency, row.payment_status,
        row.due_date || "", row.earned_at || "", row.paid_at || "",
      ].map(csv).join(","));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="trainer-commissions.csv"');
      res.send(`\uFEFF${headers.map(csv).join(",")}\r\n${body.join("\r\n")}`);
    } catch (error) { next(error); }
  });

  app.get("/api/v2/trainer-commissions/export.pdf", requirePermission("finance.read"), async (req, res, next) => {
    try {
      const rows = await commissionRows(requirePool(provider), req);
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(17);
      doc.text("Trainer commissions and performance", 36, 38);
      doc.setFontSize(9);
      doc.text(`Generated ${new Date().toISOString()}`, 36, 54);
      autoTable(doc, {
        startY: 68,
        head: [["Trainer", "Sessions", "Plan", "Invoice", "Gross", "%", "Commission", "Gym", "Status", "Due"]],
        body: rows.map((row: any) => [
          row.trainer_name, row.sessions_completed, row.plan_name, row.invoice_number,
          `${row.gross_amount} ${row.currency}`, row.commission_percent,
          `${row.trainer_amount} ${row.currency}`, `${row.gym_amount} ${row.currency}`,
          row.payment_status, row.due_date || "",
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [43, 43, 43] },
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="trainer-commissions.pdf"');
      res.send(Buffer.from(doc.output("arraybuffer")));
    } catch (error) { next(error); }
  });
}
