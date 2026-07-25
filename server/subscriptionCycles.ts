/**
 * Subscription Cycles — manages cycle lifecycle, allocation, carryover, and expiration.
 *
 * Responsible for:
 * - Creating cycles when subscriptions start
 * - Allocating sessions at the beginning of each cycle
 * - Processing carryover from previous cycles
 * - Expiring unused sessions at cycle end
 * - Idempotent cycle transitions
 */

import crypto from "crypto";
import type { Pool, PoolConnection } from "mysql2/promise";
import { createMovement, getBalanceForUpdate, type MovementType } from "./sessionLedger";

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export type CycleInfo = {
  id: string;
  subscriptionId: string;
  cycleNumber: number;
  startDate: string;
  endDate: string;
  status: string;
  sessionsAllocated: number;
  sessionsCarried: number;
};

/**
 * Create the initial cycle for a new subscription.
 * Idempotent: skips if cycle #1 already exists.
 */
export async function createInitialCycle(
  db: PoolConnection,
  subscriptionId: string,
  startDate: string,
  endDate: string,
  sessionsPerCycle: number | null,
  distributionModel: string,
  affiliationIds: string[],
  options: {
    cycleFrequency?: string;
    subscriptionEndDate?: string;
    customAllocations?: Record<string, number>;
  } = {},
): Promise<CycleInfo> {
  const idempotencyKey = `cycle_init_${subscriptionId}_1`;

  // Check if already exists
  const [existing]: any = await db.query(
    "SELECT * FROM subscription_cycles WHERE subscription_id = ? AND cycle_number = 1 LIMIT 1",
    [subscriptionId],
  );
  if (existing.length > 0) return mapCycle(existing[0]);

  const cycleId = createId("cyc");
  const cycleEndDate = calculateCycleEnd(
    startDate,
    options.cycleFrequency || "plan_duration",
    options.subscriptionEndDate || endDate,
  );
  await db.query(
    `INSERT INTO subscription_cycles (id, subscription_id, cycle_number, start_date, end_date, status, sessions_allocated, sessions_carried, idempotency_key)
     VALUES (?, ?, 1, ?, ?, 'active', ?, 0, ?)`,
    [cycleId, subscriptionId, startDate, cycleEndDate, sessionsPerCycle || 0, idempotencyKey],
  );

  // Allocate sessions if plan is limited
  if (sessionsPerCycle && sessionsPerCycle > 0) {
    await allocateSessions(
      db,
      cycleId,
      subscriptionId,
      sessionsPerCycle,
      distributionModel,
      affiliationIds,
      null,
      options.customAllocations,
    );
  }

  return {
    id: cycleId,
    subscriptionId,
    cycleNumber: 1,
    startDate,
    endDate: cycleEndDate,
    status: "active",
    sessionsAllocated: sessionsPerCycle || 0,
    sessionsCarried: 0,
  };
}

/**
 * Allocate sessions for a cycle based on distribution model.
 */
async function allocateSessions(
  db: PoolConnection,
  cycleId: string,
  subscriptionId: string,
  totalSessions: number,
  distributionModel: string,
  affiliationIds: string[],
  performedBy: string | null,
  customAllocations?: Record<string, number>,
): Promise<void> {
  if (distributionModel === "shared") {
    // Single shared balance for the subscription
    const balance = await getBalanceForUpdate(db, "subscription", subscriptionId, cycleId);
    await createMovement(db, {
      balanceId: balance.id,
      cycleId,
      movementType: "allocation",
      quantity: totalSessions,
      reason: "Cycle allocation (shared pool)",
      performedBy: performedBy || "system",
      idempotencyKey: `alloc_${cycleId}_shared`,
    });
  } else if (distributionModel === "individual") {
    // The configured quantity belongs to every member, not to the group as a whole.
    for (const affiliationId of affiliationIds) {
      const qty = totalSessions;
      if (qty <= 0) continue;
      const balance = await getBalanceForUpdate(db, "affiliation", affiliationId, cycleId);
      await createMovement(db, {
        balanceId: balance.id,
        affiliationId,
        cycleId,
        movementType: "allocation",
        quantity: qty,
        reason: "Cycle allocation (individual)",
        performedBy: performedBy || "system",
        idempotencyKey: `alloc_${cycleId}_${affiliationId}`,
      });
    }
  } else if (distributionModel === "custom") {
    for (const affiliationId of affiliationIds) {
      const qty = Math.max(0, Number(customAllocations?.[affiliationId] || 0));
      if (qty <= 0) continue;
      const balance = await getBalanceForUpdate(db, "affiliation", affiliationId, cycleId);
      await createMovement(db, {
        balanceId: balance.id,
        affiliationId,
        cycleId,
        movementType: "allocation",
        quantity: qty,
        reason: "Cycle allocation (custom)",
        performedBy: performedBy || "system",
        idempotencyKey: `alloc_${cycleId}_${affiliationId}`,
      });
    }
  }
}

export async function allocateAffiliationInActiveCycle(
  db: PoolConnection,
  input: {
    cycleId: string;
    subscriptionId: string;
    affiliationId: string;
    distributionModel: string;
    sessionsPerCycle: number;
    customQuantity?: number;
    performedBy?: string;
  },
) {
  if (input.distributionModel === "shared") return null;
  const quantity = input.distributionModel === "custom"
    ? Math.max(0, Number(input.customQuantity || 0))
    : Math.max(0, Number(input.sessionsPerCycle || 0));
  if (!quantity) return null;
  await allocateSessions(
    db,
    input.cycleId,
    input.subscriptionId,
    quantity,
    input.distributionModel,
    [input.affiliationId],
    input.performedBy || null,
    { [input.affiliationId]: quantity },
  );
  return quantity;
}

/**
 * Close the current cycle and open the next one.
 * Handles carryover and expiration.
 * Idempotent via idempotency_key on the new cycle.
 */
export async function closeCycleAndOpenNext(
  pool: Pool,
  subscriptionId: string,
  options: {
    sessionsPerCycle: number | null;
    distributionModel: string;
    affiliationIds: string[];
    carryoverEnabled: boolean;
    carryoverMax: number | null;
    cycleFrequency: string;
    subscriptionEndDate?: string;
    customAllocations?: Record<string, number>;
    performedBy?: string;
  },
): Promise<{ closedCycle: CycleInfo; newCycle: CycleInfo } | null> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Lock the current active cycle
    const [activeRows]: any = await connection.query(
      "SELECT * FROM subscription_cycles WHERE subscription_id = ? AND status = 'active' ORDER BY cycle_number DESC LIMIT 1 FOR UPDATE",
      [subscriptionId],
    );
    if (activeRows.length === 0) {
      await connection.rollback();
      return null;
    }

    const currentCycle = activeRows[0];
    const nextNumber = Number(currentCycle.cycle_number) + 1;
    const idempotencyKey = `cycle_init_${subscriptionId}_${nextNumber}`;

    // Check idempotency
    const [existingNext]: any = await connection.query(
      "SELECT * FROM subscription_cycles WHERE idempotency_key = ? LIMIT 1",
      [idempotencyKey],
    );
    if (existingNext.length > 0) {
      await connection.rollback();
      return { closedCycle: mapCycle(currentCycle), newCycle: mapCycle(existingNext[0]) };
    }

    // Calculate carryover from current cycle balances
    let carryover = 0;
    if (options.carryoverEnabled) {
      const [balanceRows]: any = await connection.query(
        "SELECT SUM(available) AS total_available FROM session_balances WHERE cycle_id = ? AND available > 0",
        [currentCycle.id],
      );
      carryover = Math.min(
        Number(balanceRows[0]?.total_available || 0),
        options.carryoverMax || Number.MAX_SAFE_INTEGER,
      );
    }

    // Expire remaining sessions in current cycle (set available to 0)
    const [remainingBalances]: any = await connection.query(
      "SELECT * FROM session_balances WHERE cycle_id = ? AND available > 0 FOR UPDATE",
      [currentCycle.id],
    );
    for (const bal of remainingBalances) {
      const expireQty = Number(bal.available) - (options.carryoverEnabled ? 0 : 0);
      if (expireQty > 0 && !options.carryoverEnabled) {
        await createMovement(connection, {
          balanceId: bal.id,
          cycleId: currentCycle.id,
          movementType: "expiration",
          quantity: expireQty,
          reason: "Cycle end expiration",
          performedBy: options.performedBy || "system",
          idempotencyKey: `expire_${currentCycle.id}_${bal.id}`,
        });
      }
    }

    // Close current cycle
    await connection.query(
      "UPDATE subscription_cycles SET status = 'closed', closed_at = NOW() WHERE id = ?",
      [currentCycle.id],
    );

    // Calculate next cycle dates
    const nextStart = String(currentCycle.end_date).slice(0, 10);
    const nextEnd = calculateCycleEnd(
      nextStart,
      options.cycleFrequency,
      options.subscriptionEndDate,
    );
    if (options.subscriptionEndDate && nextStart >= options.subscriptionEndDate) {
      await connection.commit();
      return { closedCycle: mapCycle(currentCycle), newCycle: mapCycle(currentCycle) };
    }

    // Create next cycle
    const nextCycleId = createId("cyc");
    await connection.query(
      `INSERT INTO subscription_cycles (id, subscription_id, cycle_number, start_date, end_date, status, sessions_allocated, sessions_carried, idempotency_key)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [nextCycleId, subscriptionId, nextNumber, nextStart, nextEnd, options.sessionsPerCycle || 0, carryover, idempotencyKey],
    );

    // Allocate sessions for new cycle
    if (options.sessionsPerCycle && options.sessionsPerCycle > 0) {
      await allocateSessions(
        connection, nextCycleId, subscriptionId, options.sessionsPerCycle,
        options.distributionModel, options.affiliationIds, options.performedBy || null,
        options.customAllocations,
      );
    }

    // Add carryover if applicable
    if (carryover > 0 && options.affiliationIds.length > 0) {
      if (options.distributionModel === "shared") {
        const balance = await getBalanceForUpdate(connection, "subscription", subscriptionId, nextCycleId);
        await createMovement(connection, {
          balanceId: balance.id,
          cycleId: nextCycleId,
          movementType: "carryover",
          quantity: carryover,
          reason: `Carryover from cycle ${currentCycle.cycle_number}`,
          performedBy: options.performedBy || "system",
          idempotencyKey: `carry_${nextCycleId}_shared`,
        });
      } else {
        // Distribute carryover equally for individual model
        const perPerson = Math.floor(carryover / options.affiliationIds.length);
        for (const affId of options.affiliationIds) {
          if (perPerson <= 0) break;
          const balance = await getBalanceForUpdate(connection, "affiliation", affId, nextCycleId);
          await createMovement(connection, {
            balanceId: balance.id,
            affiliationId: affId,
            cycleId: nextCycleId,
            movementType: "carryover",
            quantity: perPerson,
            reason: `Carryover from cycle ${currentCycle.cycle_number}`,
            performedBy: options.performedBy || "system",
            idempotencyKey: `carry_${nextCycleId}_${affId}`,
          });
        }
      }
    }

    await connection.commit();

    const [closedRows]: any = await pool.query("SELECT * FROM subscription_cycles WHERE id = ?", [currentCycle.id]);
    const [newRows]: any = await pool.query("SELECT * FROM subscription_cycles WHERE id = ?", [nextCycleId]);
    return { closedCycle: mapCycle(closedRows[0]), newCycle: mapCycle(newRows[0]) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function calculateCycleEnd(startDate: string, frequency: string, subscriptionEndDate?: string): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  switch (frequency) {
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case "plan_duration":
    case "subscription":
      return subscriptionEndDate || startDate;
    default:
      d.setUTCMonth(d.getUTCMonth() + 1);
  }
  const calculated = d.toISOString().slice(0, 10);
  return subscriptionEndDate && calculated > subscriptionEndDate
    ? subscriptionEndDate
    : calculated;
}

function mapCycle(row: any): CycleInfo {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    cycleNumber: Number(row.cycle_number),
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : "",
    endDate: row.end_date ? String(row.end_date).slice(0, 10) : "",
    status: row.status,
    sessionsAllocated: Number(row.sessions_allocated || 0),
    sessionsCarried: Number(row.sessions_carried || 0),
  };
}
