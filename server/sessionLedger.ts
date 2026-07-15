/**
 * Session Ledger Service — Immutable movement tracking and balance management.
 * 
 * This module handles:
 * - Session balance calculation (derived from movements)
 * - Movement creation (allocation, reservation, consumption, refund, etc.)
 * - Idempotency enforcement
 * - Transactional balance updates with optimistic locking
 */

import crypto from "crypto";
import type { Pool, PoolConnection } from "mysql2/promise";

export type MovementType =
  | "allocation"
  | "reservation"
  | "release"
  | "consumption"
  | "refund"
  | "purchase"
  | "carryover"
  | "expiration"
  | "adjustment_positive"
  | "adjustment_negative"
  | "compensation";

export type CreateMovementInput = {
  balanceId: string;
  affiliationId?: string;
  cycleId: string;
  movementType: MovementType;
  quantity: number;
  referenceType?: string;
  referenceId?: string;
  relatedMovementId?: string;
  reason?: string;
  performedBy?: string;
  idempotencyKey?: string;
};

export type SessionBalance = {
  id: string;
  contextType: string;
  contextId: string;
  cycleId: string;
  included: number;
  carriedOver: number;
  purchased: number;
  adjustmentsPositive: number;
  refunds: number;
  reserved: number;
  consumed: number;
  expired: number;
  adjustmentsNegative: number;
  available: number;
  version: number;
};

export type SessionMovement = {
  id: string;
  balanceId: string;
  affiliationId: string | null;
  cycleId: string;
  movementType: MovementType;
  quantity: number;
  direction: "+" | "-";
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  relatedMovementId: string | null;
  reason: string | null;
  performedBy: string | null;
  idempotencyKey: string | null;
  createdAt: string;
};

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function getDirection(type: MovementType): "+" | "-" {
  switch (type) {
    case "allocation":
    case "release":
    case "refund":
    case "purchase":
    case "carryover":
    case "adjustment_positive":
    case "compensation":
      return "+";
    case "reservation":
    case "consumption":
    case "expiration":
    case "adjustment_negative":
      return "-";
  }
}

function getBalanceField(type: MovementType): string {
  switch (type) {
    case "allocation": return "included";
    case "carryover": return "carried_over";
    case "purchase": return "purchased";
    case "adjustment_positive": return "adjustments_positive";
    case "compensation": return "adjustments_positive";
    case "refund": return "refunds";
    case "reservation": return "reserved";
    case "release": return "reserved"; // decrements reserved
    case "consumption": return "consumed";
    case "expiration": return "expired";
    case "adjustment_negative": return "adjustments_negative";
  }
}

/**
 * Check if an idempotency key was already processed.
 * Returns the stored result if found, null otherwise.
 */
export async function checkIdempotencyKey(db: Pool | PoolConnection, key: string): Promise<{ status: number; body: any } | null> {
  const [rows]: any = await db.query(
    "SELECT result_status, result_body FROM idempotency_keys WHERE id = ? AND expires_at > NOW() LIMIT 1",
    [key],
  );
  if (rows.length === 0) return null;
  return { status: rows[0].result_status, body: rows[0].result_body ? JSON.parse(rows[0].result_body) : null };
}

/**
 * Store an idempotency key result.
 */
export async function storeIdempotencyKey(db: Pool | PoolConnection, key: string, operation: string, status: number, body: any): Promise<void> {
  await db.query(
    "INSERT IGNORE INTO idempotency_keys (id, operation, result_status, result_body, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))",
    [key, operation, status, JSON.stringify(body)],
  );
}

/**
 * Get or create a session balance for a context+cycle.
 * Uses SELECT ... FOR UPDATE for transactional safety.
 */
export async function getBalanceForUpdate(db: PoolConnection, contextType: string, contextId: string, cycleId: string): Promise<SessionBalance & { _raw: any }> {
  const [rows]: any = await db.query(
    "SELECT * FROM session_balances WHERE context_type = ? AND context_id = ? AND cycle_id = ? FOR UPDATE",
    [contextType, contextId, cycleId],
  );

  if (rows.length > 0) {
    const row = rows[0];
    return {
      id: row.id,
      contextType: row.context_type,
      contextId: row.context_id,
      cycleId: row.cycle_id,
      included: Number(row.included),
      carriedOver: Number(row.carried_over),
      purchased: Number(row.purchased),
      adjustmentsPositive: Number(row.adjustments_positive),
      refunds: Number(row.refunds),
      reserved: Number(row.reserved),
      consumed: Number(row.consumed),
      expired: Number(row.expired),
      adjustmentsNegative: Number(row.adjustments_negative),
      available: Number(row.available),
      version: Number(row.version),
      _raw: row,
    };
  }

  // Create new balance
  const id = createId("bal");
  await db.query(
    `INSERT INTO session_balances (id, context_type, context_id, cycle_id, included, carried_over, purchased, adjustments_positive, refunds, reserved, consumed, expired, adjustments_negative, available, version)
     VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1)`,
    [id, contextType, contextId, cycleId],
  );

  return {
    id,
    contextType,
    contextId,
    cycleId,
    included: 0,
    carriedOver: 0,
    purchased: 0,
    adjustmentsPositive: 0,
    refunds: 0,
    reserved: 0,
    consumed: 0,
    expired: 0,
    adjustmentsNegative: 0,
    available: 0,
    version: 1,
    _raw: null,
  };
}

/**
 * Calculate available sessions from balance fields.
 */
function calculateAvailable(balance: SessionBalance, fieldDelta: { field: string; delta: number; direction: "+" | "-" }): number {
  const positive = balance.included + balance.carriedOver + balance.purchased + balance.adjustmentsPositive + balance.refunds;
  const negative = balance.reserved + balance.consumed + balance.expired + balance.adjustmentsNegative;

  let available = positive - negative;

  // Apply the pending delta
  if (fieldDelta.direction === "+") {
    if (["reserved", "consumed", "expired", "adjustments_negative"].includes(fieldDelta.field.replace(/_/g, ""))) {
      // These fields are in the negative side but we're releasing (e.g., release reduces reserved)
      available += fieldDelta.delta;
    } else {
      available += fieldDelta.delta;
    }
  } else {
    available -= fieldDelta.delta;
  }

  return available;
}

/**
 * Create an immutable movement and update the materialized balance transactionally.
 * Must be called within an active transaction (PoolConnection).
 * 
 * Returns the created movement or throws if:
 * - Balance would go negative (for debit operations)
 * - Idempotency key conflict
 * - Optimistic locking failure
 */
export async function createMovement(db: PoolConnection, input: CreateMovementInput): Promise<SessionMovement> {
  // Check idempotency
  if (input.idempotencyKey) {
    const [existing]: any = await db.query(
      "SELECT id FROM session_movements WHERE idempotency_key = ? LIMIT 1",
      [input.idempotencyKey],
    );
    if (existing.length > 0) {
      const [mov]: any = await db.query("SELECT * FROM session_movements WHERE id = ?", [existing[0].id]);
      return mapMovement(mov[0]);
    }
  }

  // Get balance with lock
  const [balRows]: any = await db.query(
    "SELECT * FROM session_balances WHERE id = ? FOR UPDATE",
    [input.balanceId],
  );
  if (balRows.length === 0) {
    throw Object.assign(new Error("Balance not found"), { status: 404 });
  }

  const bal = balRows[0];
  const direction = getDirection(input.movementType);
  const field = getBalanceField(input.movementType);
  const currentAvailable = Number(bal.available);
  const balanceBefore = currentAvailable;

  // Validate: no negative balance for debit operations
  if (direction === "-" && input.movementType !== "release") {
    if (currentAvailable < input.quantity) {
      throw Object.assign(new Error("Insufficient session balance"), { status: 400, code: "NO_SESSIONS_AVAILABLE" });
    }
  }

  // Special case: release reduces 'reserved' counter (positive direction reduces negative field)
  let balanceAfter: number;
  let updateSql: string;

  if (input.movementType === "release") {
    // Release: decrement reserved, increment available
    balanceAfter = balanceBefore + input.quantity;
    updateSql = `UPDATE session_balances SET reserved = reserved - ?, available = ?, last_movement_id = ?, version = version + 1 WHERE id = ? AND version = ?`;
  } else if (direction === "+") {
    balanceAfter = balanceBefore + input.quantity;
    updateSql = `UPDATE session_balances SET ${field} = ${field} + ?, available = ?, last_movement_id = ?, version = version + 1 WHERE id = ? AND version = ?`;
  } else {
    balanceAfter = balanceBefore - input.quantity;
    updateSql = `UPDATE session_balances SET ${field} = ${field} + ?, available = ?, last_movement_id = ?, version = version + 1 WHERE id = ? AND version = ?`;
  }

  // Create movement
  const movementId = createId("mov");
  await db.query(
    `INSERT INTO session_movements (id, balance_id, affiliation_id, cycle_id, movement_type, quantity, direction, balance_before, balance_after, reference_type, reference_id, related_movement_id, reason, performed_by, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      movementId,
      input.balanceId,
      input.affiliationId || null,
      input.cycleId,
      input.movementType,
      input.quantity,
      direction,
      balanceBefore,
      balanceAfter,
      input.referenceType || null,
      input.referenceId || null,
      input.relatedMovementId || null,
      input.reason || null,
      input.performedBy || null,
      input.idempotencyKey || null,
    ],
  );

  // Update balance with optimistic lock
  const [result]: any = await db.query(updateSql, [input.quantity, balanceAfter, movementId, input.balanceId, Number(bal.version)]);
  if (result.affectedRows === 0) {
    throw Object.assign(new Error("Concurrent balance modification detected — retry"), { status: 409, code: "IDEMPOTENCY_CONFLICT" });
  }

  return {
    id: movementId,
    balanceId: input.balanceId,
    affiliationId: input.affiliationId || null,
    cycleId: input.cycleId,
    movementType: input.movementType,
    quantity: input.quantity,
    direction,
    balanceBefore,
    balanceAfter,
    referenceType: input.referenceType || null,
    referenceId: input.referenceId || null,
    relatedMovementId: input.relatedMovementId || null,
    reason: input.reason || null,
    performedBy: input.performedBy || null,
    idempotencyKey: input.idempotencyKey || null,
    createdAt: new Date().toISOString(),
  };
}

function mapMovement(row: any): SessionMovement {
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
    relatedMovementId: row.related_movement_id || null,
    reason: row.reason || null,
    performedBy: row.performed_by || null,
    idempotencyKey: row.idempotency_key || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

export function mapBalance(row: any): SessionBalance {
  return {
    id: row.id,
    contextType: row.context_type,
    contextId: row.context_id,
    cycleId: row.cycle_id,
    included: Number(row.included || 0),
    carriedOver: Number(row.carried_over || 0),
    purchased: Number(row.purchased || 0),
    adjustmentsPositive: Number(row.adjustments_positive || 0),
    refunds: Number(row.refunds || 0),
    reserved: Number(row.reserved || 0),
    consumed: Number(row.consumed || 0),
    expired: Number(row.expired || 0),
    adjustmentsNegative: Number(row.adjustments_negative || 0),
    available: Number(row.available || 0),
    version: Number(row.version || 1),
  };
}
