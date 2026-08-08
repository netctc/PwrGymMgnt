/**
 * Workers — Background processes for the evolution system.
 *
 * Handles:
 * - Cycle closing and opening (scheduled)
 * - Outbox event draining (polling)
 * - Expired reservation cleanup
 * - Balance reconciliation
 *
 * Uses MySQL-based distributed locking to prevent duplicate execution
 * across multiple instances.
 */

import crypto from "crypto";
import type { Pool } from "mysql2/promise";
import { closeCycleAndOpenNext } from "./subscriptionCycles";
import { appLogger } from "./observability";

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Acquire a distributed lock in MySQL.
 * Returns true if lock acquired, false if another instance holds it.
 */
async function acquireLock(pool: Pool, lockName: string): Promise<boolean> {
  try {
    const [rows]: any = await pool.query("SELECT GET_LOCK(?, 0) AS acquired", [lockName]);
    return Number(rows[0]?.acquired) === 1;
  } catch {
    return false;
  }
}

async function releaseLock(pool: Pool, lockName: string): Promise<void> {
  try {
    await pool.query("SELECT RELEASE_LOCK(?)", [lockName]);
  } catch { /* ignore */ }
}

/**
 * Process due cycle closings.
 * Finds active cycles whose end_date has passed and closes them.
 */
export async function processCycleClosings(pool: Pool): Promise<{ processed: number; errors: number }> {
  const locked = await acquireLock(pool, "powergym_cycle_closing");
  if (!locked) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;

  try {
    // Find subscriptions with active cycles past their end date
    const [rows]: any = await pool.query(`
      SELECT sc.id AS cycle_id, sc.subscription_id, s.plan_version_id,
             s.end_date AS subscription_end_date, s.payment_status,
             pv.sessions_per_cycle, pv.distribution_model, pv.carryover_enabled,
             pv.carryover_max, pv.cycle_frequency, pv.data AS plan_data
      FROM subscription_cycles sc
      JOIN subscriptions s ON s.id = sc.subscription_id
      JOIN plan_versions pv ON pv.id = s.plan_version_id
      WHERE sc.status = 'active'
        AND sc.end_date < CURDATE()
        AND s.status = 'active'
        AND s.payment_status IN ('paid', 'waived')
      LIMIT 50
    `);

    for (const row of rows) {
      try {
        // Get active affiliations for this subscription
        const [affRows]: any = await pool.query(
          `SELECT id, role, benefits_override
             FROM affiliations
            WHERE subscription_id = ? AND status = 'active'`,
          [row.subscription_id],
        );
        const affiliationIds = affRows.map((a: any) => a.id);
        const planData = typeof row.plan_data === "string"
          ? JSON.parse(row.plan_data || "{}")
          : (row.plan_data || {});
        const customAllocations = Object.fromEntries(
          affRows.map((affiliation: any) => {
            const override = typeof affiliation.benefits_override === "string"
              ? JSON.parse(affiliation.benefits_override || "{}")
              : (affiliation.benefits_override || {});
            return [
              affiliation.id,
              Number(
                override.sessionsPerCycle ??
                (affiliation.role === "holder"
                  ? planData.holderSessionsPerCycle
                  : planData.beneficiarySessionsPerCycle) ??
                row.sessions_per_cycle ??
                0,
              ),
            ];
          }),
        );

        await closeCycleAndOpenNext(pool, row.subscription_id, {
          sessionsPerCycle: row.sessions_per_cycle ? Number(row.sessions_per_cycle) : null,
          distributionModel: row.distribution_model || "individual",
          affiliationIds,
          carryoverEnabled: Boolean(row.carryover_enabled),
          carryoverMax: row.carryover_max ? Number(row.carryover_max) : null,
          cycleFrequency: row.cycle_frequency || "monthly",
          subscriptionEndDate: String(row.subscription_end_date).slice(0, 10),
          customAllocations,
          performedBy: "system:cycle_worker",
        });
        processed++;
      } catch (error: any) {
        errors++;
        appLogger.error("Cycle closing failed", { subscriptionId: row.subscription_id, error: error.message });
      }
    }
  } finally {
    await releaseLock(pool, "powergym_cycle_closing");
  }

  return { processed, errors };
}

/**
 * Drain the outbox: process pending events.
 */
export async function drainOutbox(pool: Pool): Promise<{ processed: number; errors: number }> {
  const locked = await acquireLock(pool, "powergym_outbox_drain");
  if (!locked) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;

  try {
    const [rows]: any = await pool.query(
      "SELECT * FROM outbox_events WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100"
    );

    for (const event of rows) {
      try {
        // Process based on event type
        const payload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;

        // Generate notifications from outbox events
        try {
          const { processOutboxNotification } = await import("./evolutionNotifications");
          await processOutboxNotification(pool, event.event_type, payload);
        } catch { /* notification failures don't block outbox processing */ }

        switch (event.event_type) {
          case "session_consumed":
          case "session_reserved":
          case "cycle_closed":
          case "cycle_opened":
          case "access_granted":
          case "access_denied":
          case "subscription_cancelled":
          case "subscription_frozen":
          case "subscription_resumed":
          case "subscription_suspended":
          case "plan_changed":
            appLogger.info("Outbox event processed", { eventType: event.event_type, eventId: event.id });
            break;
          default:
            appLogger.warn("Unknown outbox event type", { eventType: event.event_type, eventId: event.id });
        }

        await pool.query(
          "UPDATE outbox_events SET status = 'sent', processed_at = NOW(), attempts = attempts + 1 WHERE id = ?",
          [event.id],
        );
        processed++;
      } catch (error: any) {
        errors++;
        await pool.query(
          "UPDATE outbox_events SET attempts = attempts + 1, last_attempt_at = NOW(), status = IF(attempts >= 5, 'failed', 'pending') WHERE id = ?",
          [event.id],
        );
      }
    }
  } finally {
    await releaseLock(pool, "powergym_outbox_drain");
  }

  return { processed, errors };
}

/**
 * Release expired reservations (sessions reserved but not consumed within time limit).
 * Default: reservations older than 24 hours without corresponding consumption.
 */
export async function releaseExpiredReservations(pool: Pool): Promise<{ released: number }> {
  const locked = await acquireLock(pool, "powergym_expired_reservations");
  if (!locked) return { released: 0 };

  let released = 0;

  try {
    const [settingRows]: any = await pool.query(
      `SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.seconds')) AS UNSIGNED)
              AS reservation_seconds
         FROM maintenance_list_items
        WHERE list_id = 'ml_consumption_deduplication'
          AND item_code = 'reservation_lock'
          AND status = 'active'
        LIMIT 1`,
    );
    const reservationSeconds = Math.max(
      60,
      Number(settingRows[0]?.reservation_seconds || 86400),
    );
    // Find reservation movements without a corresponding consumption or release
    const [rows]: any = await pool.query(`
      SELECT m.id, m.balance_id, m.affiliation_id, m.cycle_id, m.quantity, m.reference_id
      FROM session_movements m
      WHERE m.movement_type = 'reservation'
        AND m.created_at < DATE_SUB(NOW(), INTERVAL ? SECOND)
        AND NOT EXISTS (
          SELECT 1 FROM session_movements m2
          WHERE m2.related_movement_id = m.id
            AND m2.movement_type IN ('release', 'consumption')
        )
        AND NOT EXISTS (
          SELECT 1 FROM session_movements m3
          WHERE m3.reference_id = m.reference_id
            AND m3.reference_type = m.reference_type
            AND m3.movement_type IN ('release', 'consumption')
            AND m3.id <> m.id
        )
      LIMIT 50
    `, [reservationSeconds]);

    for (const mov of rows) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const { getBalanceForUpdate, createMovement } = await import("./sessionLedger");
        await getBalanceForUpdate(connection, "affiliation", mov.affiliation_id, mov.cycle_id);
        await createMovement(connection, {
          balanceId: mov.balance_id,
          affiliationId: mov.affiliation_id,
          cycleId: mov.cycle_id,
          movementType: "release",
          quantity: Number(mov.quantity),
          referenceType: "expired_reservation",
          referenceId: mov.reference_id,
          relatedMovementId: mov.id,
          reason: "Reservation expired (24h limit)",
          performedBy: "system:reservation_cleanup",
          idempotencyKey: `expire_reservation_${mov.id}`,
        });
        await connection.commit();
        released++;
      } catch {
        await connection.rollback();
      } finally {
        connection.release();
      }
    }
  } finally {
    await releaseLock(pool, "powergym_expired_reservations");
  }

  return { released };
}

export async function notifyExpiringSessionBalances(pool: Pool): Promise<{ created: number }> {
  const locked = await acquireLock(pool, "powergym_session_expiry_alerts");
  if (!locked) return { created: 0 };
  let created = 0;
  try {
    const [settingRows]: any = await pool.query(
      `SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.days')) AS UNSIGNED) AS warning_days
         FROM maintenance_list_items
        WHERE list_id = 'ml_session_expiry_alerts'
          AND item_code = 'warning_days'
          AND status = 'active'
        LIMIT 1`,
    );
    const warningDays = Math.min(90, Math.max(1, Number(settingRows[0]?.warning_days || 7)));
    const [rows]: any = await pool.query(
      `SELECT sc.id AS cycle_id, sc.end_date, sb.available,
              pv.name AS plan_name,
              CASE
                WHEN sb.context_type = 'affiliation' THEN context_aff.member_id
                ELSE s.holder_member_id
              END AS member_id,
              CONCAT_WS(' ', m.first_name, m.last_name) AS member_name
         FROM subscription_cycles sc
         JOIN subscriptions s ON s.id = sc.subscription_id
         JOIN plan_versions pv ON pv.id = s.plan_version_id
         JOIN session_balances sb ON sb.cycle_id = sc.id
         LEFT JOIN affiliations context_aff
           ON sb.context_type = 'affiliation' AND context_aff.id = sb.context_id
         JOIN members m ON m.id = CASE
           WHEN sb.context_type = 'affiliation' THEN context_aff.member_id
           ELSE s.holder_member_id
         END
        WHERE sc.status = 'active'
          AND pv.sessions_unlimited = 0
          AND sb.available > 0
          AND sc.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
             WHERE JSON_UNQUOTE(JSON_EXTRACT(n.data, '$.source')) = 'session_expiry_alert'
               AND JSON_UNQUOTE(JSON_EXTRACT(n.data, '$.cycleId')) = sc.id
               AND (
                 n.user_id = CASE
                   WHEN sb.context_type = 'affiliation' THEN context_aff.member_id
                   ELSE s.holder_member_id
                 END
                 OR n.role = 'reception'
               )
          )
        ORDER BY sc.end_date ASC`,
      [warningDays],
    );
    for (const row of rows) {
      const body =
        `${row.member_name} has ${Number(row.available)} session(s) remaining in ${row.plan_name}, expiring on ${String(row.end_date).slice(0, 10)}. ` +
        `لدى ${row.member_name} عدد ${Number(row.available)} جلسة متبقية في ${row.plan_name} وتنتهي في ${String(row.end_date).slice(0, 10)}.`;
      const data = JSON.stringify({
        source: "session_expiry_alert",
        cycleId: row.cycle_id,
        memberId: row.member_id,
        remainingSessions: Number(row.available),
        expiryDate: String(row.end_date).slice(0, 10),
        warningDays,
      });
      await pool.query(
        `INSERT INTO notifications
          (id, user_id, role, title, body, type, channel, link_url, expires_at, data)
         VALUES
          (?, ?, NULL, ?, ?, 'warning', 'in_app', '/members', DATE_ADD(?, INTERVAL 1 DAY), ?),
          (?, NULL, 'reception', ?, ?, 'warning', 'in_app', '/members', DATE_ADD(?, INTERVAL 1 DAY), ?)`,
        [
          createId("notif"), row.member_id,
          "Sessions expire soon / جلسات على وشك الانتهاء", body, row.end_date, data,
          createId("notif"),
          "Member sessions expire soon / جلسات عضو على وشك الانتهاء", body, row.end_date, data,
        ],
      );
      created += 2;
    }
  } finally {
    await releaseLock(pool, "powergym_session_expiry_alerts");
  }
  return { created };
}

export async function expireCarriedSessions(pool: Pool): Promise<{ expired: number }> {
  const locked = await acquireLock(pool, "powergym_carryover_expiration");
  if (!locked) return { expired: 0 };
  let expired = 0;
  try {
    const [rows]: any = await pool.query(
      `SELECT sb.id AS balance_id, sb.context_type, sb.context_id, sb.cycle_id,
              sb.carried_over, sb.available
         FROM session_balances sb
         JOIN subscription_cycles sc ON sc.id = sb.cycle_id AND sc.status = 'active'
         JOIN subscriptions s ON s.id = sc.subscription_id
         JOIN plan_versions pv ON pv.id = s.plan_version_id
        WHERE sb.carried_over > 0
          AND sb.available > 0
          AND pv.carryover_expiry_days IS NOT NULL
          AND DATE_ADD(sc.start_date, INTERVAL pv.carryover_expiry_days DAY) <= CURDATE()
          AND NOT EXISTS (
            SELECT 1 FROM session_movements sm
             WHERE sm.balance_id = sb.id
               AND sm.movement_type = 'expiration'
               AND sm.idempotency_key = CONCAT('carryover_expire_', sb.id)
          )
        LIMIT 100`,
    );
    for (const row of rows) {
      const quantity = Math.min(Number(row.carried_over), Number(row.available));
      if (quantity <= 0) continue;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const { createMovement } = await import("./sessionLedger");
        await createMovement(connection, {
          balanceId: row.balance_id,
          cycleId: row.cycle_id,
          movementType: "expiration",
          quantity,
          referenceType: "carryover_expiration",
          referenceId: row.balance_id,
          reason: "Accumulated sessions reached their configured expiry",
          performedBy: "system:carryover_expiration",
          idempotencyKey: `carryover_expire_${row.balance_id}`,
        });
        await connection.commit();
        expired += quantity;
      } catch {
        await connection.rollback();
      } finally {
        connection.release();
      }
    }
  } finally {
    await releaseLock(pool, "powergym_carryover_expiration");
  }
  return { expired };
}

/**
 * Reconcile balances: verify that materialized balances match movement sums.
 * Reports discrepancies but does NOT auto-fix (requires manual adjustment).
 */
export async function reconcileBalances(pool: Pool): Promise<{ checked: number; discrepancies: Array<{ balanceId: string; field: string; expected: number; actual: number }> }> {
  const [rows]: any = await pool.query(`
    SELECT sb.id, sb.context_type, sb.context_id, sb.cycle_id,
           sb.included, sb.consumed, sb.reserved, sb.refunds, sb.expired,
           sb.adjustments_positive, sb.adjustments_negative, sb.carried_over, sb.purchased, sb.available,
           COALESCE(SUM(CASE WHEN sm.movement_type = 'allocation' THEN sm.quantity ELSE 0 END), 0) AS calc_included,
           COALESCE(SUM(CASE WHEN sm.movement_type = 'consumption' THEN sm.quantity ELSE 0 END), 0) AS calc_consumed,
           COALESCE(SUM(CASE WHEN sm.movement_type = 'reservation' THEN sm.quantity ELSE 0 END), 0) AS calc_reserved_add,
           COALESCE(SUM(CASE WHEN sm.movement_type = 'release' THEN sm.quantity ELSE 0 END), 0) AS calc_reserved_sub,
           COALESCE(SUM(CASE WHEN sm.movement_type = 'refund' THEN sm.quantity ELSE 0 END), 0) AS calc_refunds,
           COALESCE(SUM(CASE WHEN sm.movement_type = 'expiration' THEN sm.quantity ELSE 0 END), 0) AS calc_expired,
           COALESCE(SUM(CASE WHEN sm.movement_type = 'carryover' THEN sm.quantity ELSE 0 END), 0) AS calc_carried
    FROM session_balances sb
    LEFT JOIN session_movements sm ON sm.balance_id = sb.id
    GROUP BY sb.id
    LIMIT 500
  `);

  const discrepancies: Array<{ balanceId: string; field: string; expected: number; actual: number }> = [];

  for (const row of rows) {
    const checks: Array<[string, number, number]> = [
      ["included", Number(row.calc_included), Number(row.included)],
      ["consumed", Number(row.calc_consumed), Number(row.consumed)],
      ["reserved", Number(row.calc_reserved_add) - Number(row.calc_reserved_sub), Number(row.reserved)],
      ["refunds", Number(row.calc_refunds), Number(row.refunds)],
      ["expired", Number(row.calc_expired), Number(row.expired)],
      ["carried_over", Number(row.calc_carried), Number(row.carried_over)],
    ];

    for (const [field, expected, actual] of checks) {
      if (expected !== actual) {
        discrepancies.push({ balanceId: row.id, field, expected, actual });
      }
    }
  }

  return { checked: rows.length, discrepancies };
}

/**
 * Register all workers as a periodic task.
 * Call this from server.ts with a cron or setInterval.
 */
export function startWorkers(poolProvider: () => Pool | null, intervalMs = 60_000): NodeJS.Timeout {
  const run = async () => {
    const pool = poolProvider();
    if (!pool) return;

    try {
      const cycles = await processCycleClosings(pool);
      if (cycles.processed > 0) appLogger.info("Cycles processed", cycles);

      const outbox = await drainOutbox(pool);
      if (outbox.processed > 0) appLogger.info("Outbox drained", outbox);

      const expired = await releaseExpiredReservations(pool);
      if (expired.released > 0) appLogger.info("Expired reservations released", expired);

      const carryover = await expireCarriedSessions(pool);
      if (carryover.expired > 0) appLogger.info("Carried sessions expired", carryover);

      const expiryAlerts = await notifyExpiringSessionBalances(pool);
      if (expiryAlerts.created > 0) appLogger.info("Session expiry alerts created", expiryAlerts);

      const { reconcileExpiredSubscriptionFreezes } = await import("./subscriptionLifecycle");
      const freezes = await reconcileExpiredSubscriptionFreezes(pool);
      if (freezes.resumed > 0) appLogger.info("Expired subscription freezes resumed", freezes);

      const { reconcileScheduledSubscriptionCancellations } = await import("./subscriptionLifecycle");
      const cancellations = await reconcileScheduledSubscriptionCancellations(pool);
      if (cancellations.cancelled > 0) appLogger.info("Scheduled subscription cancellations completed", cancellations);
    } catch (error: any) {
      appLogger.error("Worker cycle failed", { error: error.message });
    }
  };

  // Run immediately on start, then on interval
  void run();
  return setInterval(run, intervalMs);
}
