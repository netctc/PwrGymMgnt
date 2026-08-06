import type { Express } from "express";
import type { Pool, PoolConnection } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { requirePermission, type AuthenticatedRequest } from "./rbac";
import { deriveInvoicePaymentSummary, type PaymentEvent } from "./domain/v2/paymentLedger";

type PoolProvider = () => Pool | null;

function requirePool(provider: PoolProvider) {
  const pool = provider();
  if (!pool) throw new Error("Database is not available");
  return pool;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(value: unknown) {
  const result = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : "";
}

function id(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

async function loadEvents(connection: PoolConnection, invoiceId: string, lock = false) {
  const [rows]: any = await connection.query(
    `SELECT id, event_type, amount, currency, effective_date, reason,
            performed_by, idempotency_key, created_at
       FROM invoice_payment_events_v2
      WHERE invoice_id = ?
      ORDER BY created_at, id${lock ? " FOR UPDATE" : ""}`,
    [invoiceId],
  );
  return rows;
}

function summarize(invoice: any, events: any[]) {
  return deriveInvoicePaymentSummary({
    total: String(invoice.total),
    dueDate: dateOnly(invoice.due_date) || today(),
    today: today(),
    events: events.map((event): PaymentEvent => ({
      type: event.event_type,
      amount: String(event.amount),
    })),
  });
}

export function registerPaymentsV2Routes(app: Express, poolProvider: PoolProvider) {
  app.get("/api/v2/accounting/invoices", requirePermission("finance.read"), async (_req, res, next) => {
    let connection: PoolConnection | null = null;
    try {
      connection = await requirePool(poolProvider).getConnection();
      const [invoices]: any = await connection.query(
        `SELECT i.id, i.invoice_number, i.member_id, i.subscription_v2_id,
                i.total, i.currency, i.due_date, i.created_at,
                CONCAT_WS(' ', m.first_name, m.last_name) AS member_name,
                pv.name AS plan_name
           FROM invoices i
           JOIN members m ON m.id = i.member_id
           LEFT JOIN subscriptions s ON s.id = i.subscription_v2_id
           LEFT JOIN plan_versions pv ON pv.id = s.plan_version_id
          WHERE i.subscription_v2_id IS NOT NULL
          ORDER BY i.created_at DESC
          LIMIT 500`,
      );
      const invoiceIds = invoices.map((invoice: any) => invoice.id);
      let events: any[] = [];
      if (invoiceIds.length) {
        const placeholders = invoiceIds.map(() => "?").join(",");
        const [eventRows]: any = await connection.query(
          `SELECT id, invoice_id, event_type, amount, currency, effective_date,
                  reason, performed_by, idempotency_key, created_at
             FROM invoice_payment_events_v2
            WHERE invoice_id IN (${placeholders})
            ORDER BY created_at, id`,
          invoiceIds,
        );
        events = eventRows;
      }
      res.json({
        invoices: invoices.map((invoice: any) => {
          const invoiceEvents = events.filter((event) => event.invoice_id === invoice.id);
          return {
            id: invoice.id,
            invoiceNumber: invoice.invoice_number,
            memberId: invoice.member_id,
            memberName: invoice.member_name || "",
            subscriptionId: invoice.subscription_v2_id,
            planName: invoice.plan_name || "",
            currency: invoice.currency,
            dueDate: dateOnly(invoice.due_date),
            createdAt: invoice.created_at,
            ...summarize(invoice, invoiceEvents),
            events: invoiceEvents.map((event) => ({
              id: event.id,
              type: event.event_type,
              amount: String(event.amount),
              effectiveDate: dateOnly(event.effective_date),
              reason: event.reason || "",
              performedBy: event.performed_by || "",
              createdAt: event.created_at,
            })),
          };
        }),
      });
    } catch (error) {
      next(error);
    } finally {
      connection?.release();
    }
  });

  app.post("/api/v2/accounting/invoices/:id/payments", requirePermission("finance.write"), async (req: AuthenticatedRequest, res, next) => {
    let connection: PoolConnection | null = null;
    try {
      const idempotencyKey = String(req.get("Idempotency-Key") || req.body.idempotencyKey || "").trim();
      const amountPaid = String(req.body.amountPaid ?? "").trim();
      const effectiveDate = dateOnly(req.body.effectiveDate) || today();
      if (!idempotencyKey) return res.status(400).json({ error: "Idempotency-Key is required", code: "PAYMENT_IDEMPOTENCY_REQUIRED" });

      connection = await requirePool(poolProvider).getConnection();
      await connection.beginTransaction();
      const [invoiceRows]: any = await connection.query(
        `SELECT id, invoice_number, member_id, subscription_v2_id, total,
                currency, due_date
           FROM invoices
          WHERE id = ? AND subscription_v2_id IS NOT NULL
          LIMIT 1 FOR UPDATE`,
        [req.params.id],
      );
      if (!invoiceRows.length) {
        await connection.rollback();
        return res.status(404).json({ error: "V2 invoice not found" });
      }
      const invoice = invoiceRows[0];
      const [replayRows]: any = await connection.query(
        `SELECT id, invoice_id, amount FROM invoice_payment_events_v2
          WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey],
      );
      if (replayRows.length) {
        if (replayRows[0].invoice_id !== invoice.id) {
          await connection.rollback();
          return res.status(409).json({ error: "Idempotency key belongs to another invoice", code: "PAYMENT_IDEMPOTENCY_CONFLICT" });
        }
        const events = await loadEvents(connection, invoice.id, true);
        const summary = summarize(invoice, events);
        await connection.commit();
        return res.json({ paymentEventId: replayRows[0].id, summary, idempotentReplay: true });
      }

      const existingEvents = await loadEvents(connection, invoice.id, true);
      let summary;
      try {
        summary = deriveInvoicePaymentSummary({
          total: String(invoice.total),
          dueDate: dateOnly(invoice.due_date) || today(),
          today: today(),
          events: [
            ...existingEvents.map((event): PaymentEvent => ({ type: event.event_type, amount: String(event.amount) })),
            { type: "payment", amount: amountPaid },
          ],
        });
      } catch (error: any) {
        await connection.rollback();
        return res.status(400).json({ error: error.message, code: error.message });
      }

      const eventId = id("pay");
      const actor = req.user?.email || req.user?.uid || "system";
      await connection.query(
        `INSERT INTO invoice_payment_events_v2
          (id, invoice_id, event_type, amount, currency, effective_date,
           reason, performed_by, idempotency_key, data)
         VALUES (?, ?, 'payment', ?, ?, ?, ?, ?, ?, ?)`,
        [eventId, invoice.id, amountPaid, invoice.currency, effectiveDate,
          String(req.body.reason || "Partial payment").trim(), actor, idempotencyKey,
          JSON.stringify({ source: "accounting", subscriptionId: invoice.subscription_v2_id })],
      );
      await connection.query(
        `UPDATE invoices
            SET status = ?, paid_at = CASE WHEN ? = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END,
                data = JSON_SET(COALESCE(data, JSON_OBJECT()),
                  '$.paymentStatus', ?, '$.amountPaid', ?, '$.amountPending', ?),
                updated_at = NOW()
          WHERE id = ?`,
        [summary.status, summary.status, summary.status, summary.netPaid, summary.balanceDue, invoice.id],
      );
      await connection.query(
        `UPDATE subscriptions
            SET payment_status = ?,
                status = CASE
                  WHEN ? IN ('paid', 'waived')
                   AND status = 'suspended'
                   AND JSON_UNQUOTE(JSON_EXTRACT(COALESCE(data, JSON_OBJECT()), '$.suspensionType')) = 'financial'
                  THEN 'active'
                  ELSE status
                END,
                data = JSON_SET(COALESCE(data, JSON_OBJECT()),
                  '$.amountPaid', ?, '$.amountPending', ?,
                  '$.financiallySettledAt', CASE WHEN ? IN ('paid', 'waived') THEN ? ELSE NULL END),
                version = version + 1, updated_at = NOW()
          WHERE id = ?`,
        [summary.status, summary.status, summary.netPaid, summary.balanceDue,
          summary.status, effectiveDate, invoice.subscription_v2_id],
      );
      await connection.query(
        `INSERT INTO finance_transactions
          (id, type, category, amount, transaction_date, source, reference_type,
           reference_id, description, status, created_by, approved_by, data)
         VALUES (?, 'income', 'Membership Payment', ?, ?, 'accounting',
                 'invoice_v2_payment', ?, ?, 'posted', ?, ?, ?)`,
        [id("ftx"), amountPaid, effectiveDate, eventId,
          `Payment ${invoice.invoice_number}`, actor, actor,
          JSON.stringify({ invoiceId: invoice.id, subscriptionId: invoice.subscription_v2_id,
            amountPaid: summary.netPaid, amountPending: summary.balanceDue })],
      );
      await connection.query(
        `INSERT INTO audit_logs (action, details, performed_by)
         VALUES ('invoice_partial_payment_recorded', ?, ?)`,
        [JSON.stringify({ invoiceId: invoice.id, subscriptionId: invoice.subscription_v2_id,
          paymentEventId: eventId, amount: amountPaid, amountPaid: summary.netPaid,
          amountPending: summary.balanceDue, status: summary.status }), actor],
      );
      await connection.commit();
      res.status(201).json({ paymentEventId: eventId, summary, idempotentReplay: false });
    } catch (error) {
      if (connection) await connection.rollback();
      next(error);
    } finally {
      connection?.release();
    }
  });

  app.post("/api/v2/accounting/invoices/:id/waivers", requirePermission("finance.write"), async (req: AuthenticatedRequest, res, next) => {
    let connection: PoolConnection | null = null;
    try {
      const idempotencyKey = String(req.get("Idempotency-Key") || req.body.idempotencyKey || "").trim();
      const amount = String(req.body.amount ?? "").trim();
      const reason = String(req.body.reason || "").trim();
      const effectiveDate = dateOnly(req.body.effectiveDate) || today();
      if (!idempotencyKey) return res.status(400).json({ error: "Idempotency-Key is required", code: "PAYMENT_IDEMPOTENCY_REQUIRED" });
      if (!reason) return res.status(400).json({ error: "Waiver reason is required", code: "WAIVER_REASON_REQUIRED" });

      connection = await requirePool(poolProvider).getConnection();
      await connection.beginTransaction();
      const [invoiceRows]: any = await connection.query(
        `SELECT id, invoice_number, subscription_v2_id, total, currency, due_date
           FROM invoices WHERE id = ? AND subscription_v2_id IS NOT NULL
          LIMIT 1 FOR UPDATE`, [req.params.id],
      );
      if (!invoiceRows.length) { await connection.rollback(); return res.status(404).json({ error: "V2 invoice not found" }); }
      const invoice = invoiceRows[0];
      const [replayRows]: any = await connection.query(
        `SELECT id, invoice_id FROM invoice_payment_events_v2 WHERE idempotency_key = ? LIMIT 1`, [idempotencyKey],
      );
      if (replayRows.length) {
        if (replayRows[0].invoice_id !== invoice.id) { await connection.rollback(); return res.status(409).json({ error: "Idempotency key belongs to another invoice", code: "PAYMENT_IDEMPOTENCY_CONFLICT" }); }
        const summary = summarize(invoice, await loadEvents(connection, invoice.id, true));
        await connection.commit();
        return res.json({ waiverEventId: replayRows[0].id, summary, idempotentReplay: true });
      }
      const events = await loadEvents(connection, invoice.id, true);
      let summary;
      try {
        summary = deriveInvoicePaymentSummary({ total: String(invoice.total), dueDate: dateOnly(invoice.due_date) || today(), today: today(),
          events: [...events.map((event): PaymentEvent => ({ type: event.event_type, amount: String(event.amount) })), { type: "waive", amount }] });
      } catch (error: any) { await connection.rollback(); return res.status(400).json({ error: error.message, code: error.message }); }

      const eventId = id("waive");
      const actor = req.user?.email || req.user?.uid || "system";
      await connection.query(
        `INSERT INTO invoice_payment_events_v2
          (id, invoice_id, event_type, amount, currency, effective_date, reason, performed_by, idempotency_key, data)
         VALUES (?, ?, 'waive', ?, ?, ?, ?, ?, ?, ?)`,
        [eventId, invoice.id, amount, invoice.currency, effectiveDate, reason, actor, idempotencyKey,
          JSON.stringify({ source: "accounting", subscriptionId: invoice.subscription_v2_id, nonCashAdjustment: true })],
      );
      await connection.query(
        `UPDATE invoices SET status = ?, data = JSON_SET(COALESCE(data, JSON_OBJECT()),
          '$.paymentStatus', ?, '$.amountPaid', ?, '$.amountPending', ?, '$.amountWaived', ?), updated_at = NOW() WHERE id = ?`,
        [summary.status, summary.status, summary.netPaid, summary.balanceDue, summary.waived, invoice.id],
      );
      await connection.query(
        `UPDATE subscriptions SET payment_status = ?,
            status = CASE WHEN ? = 'waived' AND status = 'suspended'
              AND JSON_UNQUOTE(JSON_EXTRACT(COALESCE(data, JSON_OBJECT()), '$.suspensionType')) = 'financial' THEN 'active' ELSE status END,
            data = JSON_SET(COALESCE(data, JSON_OBJECT()), '$.amountPaid', ?, '$.amountPending', ?, '$.amountWaived', ?),
            version = version + 1, updated_at = NOW() WHERE id = ?`,
        [summary.status, summary.status, summary.netPaid, summary.balanceDue, summary.waived, invoice.subscription_v2_id],
      );
      await connection.query(`INSERT INTO audit_logs (action, details, performed_by) VALUES ('invoice_balance_waived', ?, ?)`,
        [JSON.stringify({ invoiceId: invoice.id, subscriptionId: invoice.subscription_v2_id, waiverEventId: eventId, amount, reason, amountPending: summary.balanceDue, status: summary.status }), actor]);
      await connection.commit();
      res.status(201).json({ waiverEventId: eventId, summary, idempotentReplay: false });
    } catch (error) { if (connection) await connection.rollback(); next(error); }
    finally { connection?.release(); }
  });

  app.post("/api/v2/accounting/payments/:id/refunds", requirePermission("finance.write"), async (req: AuthenticatedRequest, res, next) => {
    let connection: PoolConnection | null = null;
    try {
      const idempotencyKey = String(req.get("Idempotency-Key") || req.body.idempotencyKey || "").trim();
      const amount = String(req.body.amount ?? "").trim();
      const reason = String(req.body.reason || "").trim();
      const effectiveDate = dateOnly(req.body.effectiveDate) || today();
      if (!idempotencyKey) return res.status(400).json({ error: "Idempotency-Key is required", code: "PAYMENT_IDEMPOTENCY_REQUIRED" });
      if (!reason) return res.status(400).json({ error: "Refund reason is required", code: "REFUND_REASON_REQUIRED" });

      connection = await requirePool(poolProvider).getConnection();
      await connection.beginTransaction();
      const [paymentRows]: any = await connection.query(
        `SELECT pe.id, pe.invoice_id, i.invoice_number, i.subscription_v2_id, i.total, i.currency, i.due_date
           FROM invoice_payment_events_v2 pe JOIN invoices i ON i.id = pe.invoice_id
          WHERE pe.id = ? AND pe.event_type = 'payment' AND i.subscription_v2_id IS NOT NULL
          LIMIT 1 FOR UPDATE`, [req.params.id],
      );
      if (!paymentRows.length) { await connection.rollback(); return res.status(404).json({ error: "V2 payment not found" }); }
      const invoice = paymentRows[0];
      const [replayRows]: any = await connection.query(
        `SELECT id, invoice_id FROM invoice_payment_events_v2 WHERE idempotency_key = ? LIMIT 1`, [idempotencyKey],
      );
      if (replayRows.length) {
        if (replayRows[0].invoice_id !== invoice.invoice_id) { await connection.rollback(); return res.status(409).json({ error: "Idempotency key belongs to another invoice", code: "PAYMENT_IDEMPOTENCY_CONFLICT" }); }
        const summary = summarize({ ...invoice, id: invoice.invoice_id }, await loadEvents(connection, invoice.invoice_id, true));
        await connection.commit();
        return res.json({ refundEventId: replayRows[0].id, summary, idempotentReplay: true });
      }
      const events = await loadEvents(connection, invoice.invoice_id, true);
      let summary;
      try {
        summary = deriveInvoicePaymentSummary({ total: String(invoice.total), dueDate: dateOnly(invoice.due_date) || today(), today: today(),
          events: [...events.map((event): PaymentEvent => ({ type: event.event_type, amount: String(event.amount) })), { type: "refund", amount }] });
      } catch (error: any) { await connection.rollback(); return res.status(400).json({ error: error.message, code: error.message }); }

      const eventId = id("refund");
      const actor = req.user?.email || req.user?.uid || "system";
      await connection.query(
        `INSERT INTO invoice_payment_events_v2
          (id, invoice_id, event_type, amount, currency, effective_date, reason, performed_by, idempotency_key, data)
         VALUES (?, ?, 'refund', ?, ?, ?, ?, ?, ?, ?)`,
        [eventId, invoice.invoice_id, amount, invoice.currency, effectiveDate, reason, actor, idempotencyKey,
          JSON.stringify({ source: "accounting", subscriptionId: invoice.subscription_v2_id, refundedPaymentEventId: invoice.id })],
      );
      await connection.query(
        `UPDATE invoices SET status = ?, paid_at = CASE WHEN ? IN ('paid', 'waived') THEN paid_at ELSE NULL END,
          data = JSON_SET(COALESCE(data, JSON_OBJECT()), '$.paymentStatus', ?, '$.amountPaid', ?, '$.amountPending', ?, '$.amountRefunded', ?),
          updated_at = NOW() WHERE id = ?`,
        [summary.status, summary.status, summary.status, summary.netPaid, summary.balanceDue, summary.refunded, invoice.invoice_id],
      );
      await connection.query(
        `UPDATE subscriptions SET payment_status = ?, status = CASE WHEN ? = 'refunded' THEN 'cancelled' ELSE status END,
          data = JSON_SET(COALESCE(data, JSON_OBJECT()), '$.amountPaid', ?, '$.amountPending', ?, '$.amountRefunded', ?, '$.refundEffectiveDate', ?),
          version = version + 1, updated_at = NOW() WHERE id = ?`,
        [summary.status, summary.status, summary.netPaid, summary.balanceDue, summary.refunded, effectiveDate, invoice.subscription_v2_id],
      );
      if (summary.status === "refunded") {
        await connection.query(`UPDATE affiliations SET status = 'cancelled', updated_at = NOW()
          WHERE subscription_id = ? AND status IN ('active', 'frozen', 'suspended')`, [invoice.subscription_v2_id]);
      }
      await connection.query(
        `INSERT INTO finance_transactions
          (id, type, category, amount, transaction_date, source, reference_type, reference_id, description, status, created_by, approved_by, data)
         VALUES (?, 'expense', 'Membership Refund', ?, ?, 'accounting', 'invoice_v2_refund', ?, ?, 'posted', ?, ?, ?)`,
        [id("ftx"), amount, effectiveDate, eventId, `Refund ${invoice.invoice_number}`, actor, actor,
          JSON.stringify({ invoiceId: invoice.invoice_id, subscriptionId: invoice.subscription_v2_id, refundedPaymentEventId: invoice.id, amountRefunded: summary.refunded })],
      );
      await connection.query(`INSERT INTO audit_logs (action, details, performed_by) VALUES ('invoice_payment_refunded', ?, ?)`,
        [JSON.stringify({ invoiceId: invoice.invoice_id, subscriptionId: invoice.subscription_v2_id, paymentEventId: invoice.id, refundEventId: eventId, amount, reason, status: summary.status }), actor]);
      await connection.commit();
      res.status(201).json({ refundEventId: eventId, summary, entitlementCancelled: summary.status === "refunded", idempotentReplay: false });
    } catch (error) { if (connection) await connection.rollback(); next(error); }
    finally { connection?.release(); }
  });
}
