/**
 * Access Authorization Service — Unified motor for QR, facial, and manual access.
 *
 * Single entry point for all access decisions. Handles:
 * - Identity resolution (QR token, biometric profile, manual lookup)
 * - Affiliation selection with priority rules
 * - Session consumption (when applicable)
 * - Anti-replay / cooldown enforcement
 * - Idempotent access attempt recording
 * - Opening command generation
 */

import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import type { Pool, PoolConnection } from "mysql2/promise";
import { requirePermission } from "./rbac";
import { isFeatureEnabled } from "./featureFlags";
import {
  createMovement,
  getBalanceForUpdate,
  getSessionBalanceContext,
  checkIdempotencyKey,
  storeIdempotencyKey,
} from "./sessionLedger";

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

// --- Types ---

export type AccessRequest = {
  method: "qr" | "facial" | "manual";
  accessPointId?: string;
  branch?: string;
  zone?: string;
  direction?: "entry" | "exit";
  // QR-specific
  tokenHash?: string;
  memberId?: string;
  // Facial-specific
  biometricProfileId?: string;
  personType?: "member" | "employee";
  personId?: string;
  confidenceScore?: number;
  // Manual-specific
  operatorEmail?: string;
  // Shared
  affiliationId?: string; // Explicit affiliation selection
  reservationAffiliationId?: string; // Affiliation stored immutably on a reservation
  serviceType?: string;
  confirmSessionConsumption?: boolean;
  idempotencyKey?: string;
  requestId?: string;
};

export type AccessDecision = {
  authorized: boolean;
  reason: string;
  personType: "member" | "employee" | "visitor" | "unknown" | null;
  personId: string | null;
  personName: string | null;
  affiliationId: string | null;
  subscriptionId: string | null;
  planName: string | null;
  movementId: string | null;
  openingCommandId: string | null;
  attemptId: string;
  requestId: string;
  sessionsRemaining: number | null;
  requiresAffiliationSelection?: boolean;
  requiresConsumptionConfirmation?: boolean;
  affiliationOptions?: AffiliationOption[];
};

type AffiliationOption = {
  affiliationId: string;
  subscriptionId: string;
  planName: string;
  sessionsAvailable: number | null;
  isPrimary: boolean;
  consumptionPriority: number;
};

type AffiliationCandidate = AffiliationOption & {
  cycleId: string | null;
  sessionsUnlimited: boolean;
  distributionModel: string;
  deductionMoment: string;
};

type AffiliationSelection = {
  selected: AffiliationCandidate | null;
  options: AffiliationOption[];
  reason?: string;
};

// --- Core Authorization Logic ---

async function resolveIdentity(
  pool: Pool,
  req: AccessRequest,
): Promise<{ personType: "member" | "employee" | null; personId: string | null; personName: string | null }> {
  if (req.method === "qr" && req.tokenHash) {
    // Resolve via access_tokens
    const [rows]: any = await pool.query(
      `SELECT at.member_id, m.first_name, m.last_name
       FROM access_tokens at
       JOIN members m ON m.id = at.member_id
       WHERE at.token_hash = ? AND at.status = 'active' AND (at.expires_at IS NULL OR at.expires_at > NOW())
       LIMIT 1`,
      [req.tokenHash],
    );
    if (rows.length === 0) return { personType: null, personId: null, personName: null };
    return {
      personType: "member",
      personId: rows[0].member_id,
      personName: `${rows[0].first_name || ""} ${rows[0].last_name || ""}`.trim(),
    };
  }

  if (req.method === "manual" && req.memberId) {
    const [rows]: any = await pool.query(
      "SELECT id, first_name, last_name FROM members WHERE id = ? AND status = 'active' LIMIT 1",
      [req.memberId],
    );
    if (rows.length === 0) return { personType: null, personId: null, personName: null };
    return { personType: "member", personId: rows[0].id, personName: `${rows[0].first_name || ""} ${rows[0].last_name || ""}`.trim() };
  }

  if (req.method === "facial" && req.personId) {
    if (req.personType === "employee") {
      const [rows]: any = await pool.query(
        "SELECT id, first_name, last_name FROM employees WHERE id = ? AND employment_status = 'active' LIMIT 1",
        [req.personId],
      );
      if (rows.length === 0) return { personType: null, personId: null, personName: null };
      return { personType: "employee", personId: rows[0].id, personName: `${rows[0].first_name || ""} ${rows[0].last_name || ""}`.trim() };
    }
    const [rows]: any = await pool.query(
      "SELECT id, first_name, last_name FROM members WHERE id = ? AND status = 'active' LIMIT 1",
      [req.personId],
    );
    if (rows.length === 0) return { personType: null, personId: null, personName: null };
    return { personType: "member", personId: rows[0].id, personName: `${rows[0].first_name || ""} ${rows[0].last_name || ""}`.trim() };
  }

  return { personType: null, personId: null, personName: null };
}

async function selectAffiliation(
  pool: Pool,
  memberId: string,
  requestedAffiliationId?: string,
  reservationAffiliationId?: string,
  serviceType?: string,
): Promise<AffiliationSelection> {
  const [rows]: any = await pool.query(
    `SELECT a.id, a.subscription_id, a.is_primary, a.consumption_priority, a.end_date,
            pv.name AS plan_name, pv.sessions_unlimited, pv.distribution_model,
            pv.booking_policy, pv.benefits, pv.restrictions,
            a.benefits_override,
            a.restrictions_override AS affiliation_restrictions,
            (SELECT id FROM subscription_cycles WHERE subscription_id = a.subscription_id AND status = 'active' ORDER BY cycle_number DESC LIMIT 1) AS cycle_id
     FROM affiliations a
     JOIN plan_versions pv ON pv.id = a.plan_version_id
     JOIN subscriptions s
       ON s.id = a.subscription_id
      AND s.status = 'active'
      AND s.start_date <= CURDATE()
      AND s.end_date >= CURDATE()
     WHERE a.member_id = ?
       AND a.status = 'active'
       AND a.start_date <= CURDATE()
       AND a.end_date >= CURDATE()
     ORDER BY a.is_primary DESC, a.consumption_priority ASC, a.end_date ASC`,
    [memberId],
  );

  const parseJson = (value: any) => {
    if (!value) return {};
    if (typeof value === "object") return value;
    try { return JSON.parse(value); } catch { return {}; }
  };
  const candidates: AffiliationCandidate[] = [];
  let serviceRejected = false;
  let balanceRejected = false;
  for (const row of rows) {
    const benefits = {
      ...parseJson(row.benefits),
      ...parseJson(row.benefits_override),
    };
    const restrictions = {
      ...parseJson(row.restrictions),
      ...parseJson(row.affiliation_restrictions),
    };
    const includedServices = benefits.services || benefits.serviceTypes || benefits.includedServices;
    const blockedServices = restrictions.blockedServices || restrictions.excludedServices;
    if (
      serviceType &&
      Array.isArray(includedServices) &&
      includedServices.length > 0 &&
      !includedServices.includes(serviceType)
    ) {
      serviceRejected = true;
      continue;
    }
    if (
      serviceType &&
      Array.isArray(blockedServices) &&
      blockedServices.includes(serviceType)
    ) {
      serviceRejected = true;
      continue;
    }

    const sessionsUnlimited = Boolean(row.sessions_unlimited);
    let sessionsAvailable: number | null = null;
    if (!sessionsUnlimited) {
      if (!row.cycle_id) continue;
      const context = getSessionBalanceContext(
        row.distribution_model || "individual",
        row.subscription_id,
        row.id,
      );
      const [balanceRows]: any = await pool.query(
        `SELECT available
           FROM session_balances
          WHERE context_type = ? AND context_id = ? AND cycle_id = ?
          LIMIT 1`,
        [context.contextType, context.contextId, row.cycle_id],
      );
      sessionsAvailable = Number(balanceRows[0]?.available || 0);
      if (sessionsAvailable <= 0) {
        balanceRejected = true;
        continue;
      }
    }
    const policy = parseJson(row.booking_policy);
    candidates.push({
      affiliationId: row.id,
      subscriptionId: row.subscription_id,
      planName: row.plan_name,
      cycleId: row.cycle_id,
      sessionsUnlimited,
      sessionsAvailable,
      distributionModel: row.distribution_model || "individual",
      deductionMoment: policy.deductionMoment || "check_in",
      isPrimary: Boolean(row.is_primary),
      consumptionPriority: Number(row.consumption_priority || 0),
    });
  }
  const options = candidates.map((candidate) => ({
    affiliationId: candidate.affiliationId,
    subscriptionId: candidate.subscriptionId,
    planName: candidate.planName,
    sessionsAvailable: candidate.sessionsAvailable,
    isPrimary: candidate.isPrimary,
    consumptionPriority: candidate.consumptionPriority,
  }));
  if (!candidates.length) {
    return {
      selected: null,
      options: [],
      reason: serviceRejected
        ? "SERVICE_NOT_INCLUDED"
        : balanceRejected
          ? "NO_SESSIONS_AVAILABLE"
          : undefined,
    };
  }

  // 1. Explicit member/operator choice.
  if (requestedAffiliationId) {
    const explicit = candidates.find(
      (candidate) => candidate.affiliationId === requestedAffiliationId,
    );
    return explicit
      ? { selected: explicit, options }
      : { selected: null, options, reason: "REQUESTED_AFFILIATION_NOT_ELIGIBLE" };
  }
  // 2. Affiliation immutably associated with the reservation.
  if (reservationAffiliationId) {
    const reserved = candidates.find(
      (candidate) => candidate.affiliationId === reservationAffiliationId,
    );
    if (reserved) return { selected: reserved, options };
  }
  // 3. Member's primary affiliation, only when unambiguous.
  const primaries = candidates.filter((candidate) => candidate.isPrimary);
  if (primaries.length === 1) return { selected: primaries[0], options };
  // 4. Gym consumption priority. A tie requires operator selection.
  const minimumPriority = Math.min(
    ...candidates.map((candidate) => candidate.consumptionPriority),
  );
  const prioritized = candidates.filter(
    (candidate) => candidate.consumptionPriority === minimumPriority,
  );
  if (prioritized.length === 1) return { selected: prioritized[0], options };
  return {
    selected: null,
    options,
    reason: "AFFILIATION_SELECTION_REQUIRED",
  };
}

async function checkAndClaimCooldown(
  pool: Pool,
  personId: string,
  accessPointId: string | undefined,
): Promise<boolean> {
  if (!accessPointId) return false;
  const [settingRows]: any = await pool.query(
    `SELECT COALESCE(
       (SELECT cooldown_seconds FROM access_points WHERE id = ? LIMIT 1),
       (SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.seconds')) AS UNSIGNED)
          FROM maintenance_list_items
         WHERE list_id = 'ml_consumption_deduplication'
           AND item_code = 'access_control'
           AND status = 'active'
         LIMIT 1),
       60
     ) AS cooldown_seconds`,
    [accessPointId],
  );
  const cooldownSeconds = Math.max(
    1,
    Number(settingRows[0]?.cooldown_seconds || 60),
  );
  const [insertResult]: any = await pool.query(
    `INSERT IGNORE INTO access_replay_locks
      (person_id, access_point_id, last_seen_at)
     VALUES (?, ?, NOW())`,
    [personId, accessPointId],
  );
  if (Number(insertResult.affectedRows || 0) === 1) return false;
  const [updateResult]: any = await pool.query(
    `UPDATE access_replay_locks
        SET last_seen_at = NOW()
      WHERE person_id = ?
        AND access_point_id = ?
        AND last_seen_at <= DATE_SUB(NOW(), INTERVAL ? SECOND)`,
    [personId, accessPointId, cooldownSeconds],
  );
  return Number(updateResult.affectedRows || 0) === 0;
}

/**
 * Core authorization function. Used by all access methods.
 */
export async function authorizeAccess(pool: Pool, req: AccessRequest): Promise<AccessDecision> {
  const requestId = req.requestId || createId("req");
  const attemptId = createId("att");

  // Check idempotency
  if (req.idempotencyKey) {
    const cached = await checkIdempotencyKey(pool, req.idempotencyKey);
    if (cached) return cached.body as AccessDecision;
  }

  // Step 1: Resolve identity
  const identity = await resolveIdentity(pool, req);
  if (!identity.personId) {
    const decision = buildDenied(attemptId, requestId, "IDENTITY_NOT_RESOLVED", null, null, null);
    await recordAttempt(pool, attemptId, req, decision);
    return decision;
  }

  // Step 2: Employees don't consume sessions (just authorize)
  if (identity.personType === "employee") {
    const decision: AccessDecision = {
      authorized: true,
      reason: "EMPLOYEE_ACCESS",
      personType: "employee",
      personId: identity.personId,
      personName: identity.personName,
      affiliationId: null,
      subscriptionId: null,
      planName: null,
      movementId: null,
      openingCommandId: null,
      attemptId,
      requestId,
      sessionsRemaining: null,
    };
    await recordAttempt(pool, attemptId, req, decision);
    if (req.idempotencyKey) await storeIdempotencyKey(pool, req.idempotencyKey, "access_authorize", 200, decision);
    return decision;
  }

  // Step 3: Check if session ledger is enabled
  const ledgerEnabled = await isFeatureEnabled(pool, "ENABLE_SESSION_LEDGER");

  // Step 4: Select affiliation
  const selection = await selectAffiliation(
    pool,
    identity.personId,
    req.affiliationId,
    req.reservationAffiliationId,
    req.serviceType,
  );
  const affiliation = selection.selected;
  if (!affiliation) {
    if (selection.reason) {
      const decision = buildDenied(
        attemptId,
        requestId,
        selection.reason,
        identity.personType,
        identity.personId,
        identity.personName,
      );
      decision.requiresAffiliationSelection =
        selection.reason === "AFFILIATION_SELECTION_REQUIRED";
      decision.affiliationOptions = selection.options;
      await recordAttempt(pool, attemptId, req, decision);
      return decision;
    }
    // Fallback: check old member_subscriptions for backward compat
    const [legacyRows]: any = await pool.query(
      `SELECT id, plan_name FROM member_subscriptions
       WHERE member_id = ? AND LOWER(TRIM(status)) = 'active' AND end_date >= CURDATE()
       LIMIT 1`,
      [identity.personId],
    );
    if (legacyRows.length > 0) {
      // Legacy mode: authorize without consuming (unlimited plan behavior)
      const decision: AccessDecision = {
        authorized: true,
        reason: "LEGACY_SUBSCRIPTION_ACTIVE",
        personType: "member",
        personId: identity.personId,
        personName: identity.personName,
        affiliationId: null,
        subscriptionId: null,
        planName: legacyRows[0].plan_name || "Active Plan",
        movementId: null,
        openingCommandId: null,
        attemptId,
        requestId,
        sessionsRemaining: null,
      };
      await recordAttempt(pool, attemptId, req, decision);
      if (req.idempotencyKey) await storeIdempotencyKey(pool, req.idempotencyKey, "access_authorize", 200, decision);
      return decision;
    }

    const decision = buildDenied(attemptId, requestId, "NO_ACTIVE_AFFILIATION", identity.personType, identity.personId, identity.personName);
    await recordAttempt(pool, attemptId, req, decision);
    return decision;
  }

  // Step 5: Consume session if ledger active and plan is limited
  let movementId: string | null = null;
  let sessionsRemaining: number | null = null;

  if (
    ledgerEnabled &&
    !affiliation.sessionsUnlimited &&
    affiliation.cycleId &&
    affiliation.deductionMoment === "check_in"
  ) {
    if (!req.confirmSessionConsumption) {
      const decision = buildDenied(
        attemptId,
        requestId,
        "SESSION_CONSUMPTION_CONFIRMATION_REQUIRED",
        identity.personType,
        identity.personId,
        identity.personName,
      );
      decision.affiliationId = affiliation.affiliationId;
      decision.subscriptionId = affiliation.subscriptionId;
      decision.planName = affiliation.planName;
      decision.sessionsRemaining = affiliation.sessionsAvailable;
      decision.requiresConsumptionConfirmation = true;
      decision.affiliationOptions = selection.options;
      await recordAttempt(pool, attemptId, req, decision);
      return decision;
    }
    const cooldownActive = await checkAndClaimCooldown(
      pool,
      identity.personId,
      req.accessPointId,
    );
    if (cooldownActive) {
      const decision = buildDenied(
        attemptId,
        requestId,
        "COOLDOWN_ACTIVE",
        identity.personType,
        identity.personId,
        identity.personName,
      );
      decision.affiliationId = affiliation.affiliationId;
      decision.planName = affiliation.planName;
      await recordAttempt(pool, attemptId, req, decision);
      return decision;
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const context = getSessionBalanceContext(
        affiliation.distributionModel,
        affiliation.subscriptionId,
        affiliation.affiliationId,
      );
      const balance = await getBalanceForUpdate(
        connection,
        context.contextType,
        context.contextId,
        affiliation.cycleId,
      );

      if (balance.available <= 0) {
        await connection.rollback();
        const decision = buildDenied(attemptId, requestId, "NO_SESSIONS_AVAILABLE", identity.personType, identity.personId, identity.personName);
        decision.affiliationId = affiliation.affiliationId;
        decision.planName = affiliation.planName;
        decision.sessionsRemaining = 0;
        await recordAttempt(pool, attemptId, req, decision);
        return decision;
      }

      const movement = await createMovement(connection, {
        balanceId: balance.id,
        affiliationId: affiliation.affiliationId,
        cycleId: affiliation.cycleId,
        movementType: "consumption",
        quantity: 1,
        referenceType: "access_attempt",
        referenceId: attemptId,
        reason: `Access via ${req.method}`,
        performedBy: req.operatorEmail || "system",
        idempotencyKey: req.idempotencyKey ? `consume_${req.idempotencyKey}` : `consume_${attemptId}`,
      });

      await connection.commit();
      movementId = movement.id;
      sessionsRemaining = movement.balanceAfter;
    } catch (error: any) {
      await connection.rollback();
      if (error.code === "NO_SESSIONS_AVAILABLE") {
        const decision = buildDenied(attemptId, requestId, "NO_SESSIONS_AVAILABLE", identity.personType, identity.personId, identity.personName);
        decision.affiliationId = affiliation.affiliationId;
        await recordAttempt(pool, attemptId, req, decision);
        return decision;
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  if (
    !ledgerEnabled ||
    affiliation.sessionsUnlimited ||
    affiliation.deductionMoment !== "check_in"
  ) {
    const cooldownActive = await checkAndClaimCooldown(
      pool,
      identity.personId,
      req.accessPointId,
    );
    if (cooldownActive) {
      const decision = buildDenied(
        attemptId,
        requestId,
        "COOLDOWN_ACTIVE",
        identity.personType,
        identity.personId,
        identity.personName,
      );
      decision.affiliationId = affiliation.affiliationId;
      decision.planName = affiliation.planName;
      await recordAttempt(pool, attemptId, req, decision);
      return decision;
    }
  }

  // Step 6: Build authorized decision
  const decision: AccessDecision = {
    authorized: true,
    reason: "ACCESS_GRANTED",
    personType: "member",
    personId: identity.personId,
    personName: identity.personName,
    affiliationId: affiliation.affiliationId,
    subscriptionId: affiliation.subscriptionId,
    planName: affiliation.planName,
    movementId,
    openingCommandId: null, // Set by device layer
    attemptId,
    requestId,
    sessionsRemaining,
  };

  await recordAttempt(pool, attemptId, req, decision);
  if (req.idempotencyKey) await storeIdempotencyKey(pool, req.idempotencyKey, "access_authorize", 200, decision);
  return decision;
}

// --- Helpers ---

function buildDenied(attemptId: string, requestId: string, reason: string, personType: string | null, personId: string | null, personName: string | null): AccessDecision {
  return {
    authorized: false,
    reason,
    personType: personType as any,
    personId,
    personName,
    affiliationId: null,
    subscriptionId: null,
    planName: null,
    movementId: null,
    openingCommandId: null,
    attemptId,
    requestId,
    sessionsRemaining: null,
  };
}

async function recordAttempt(pool: Pool, attemptId: string, req: AccessRequest, decision: AccessDecision): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO access_attempts (id, access_point_id, person_type, person_id, method, decision, denial_reason, affiliation_id, movement_id, confidence_score, idempotency_key, request_id, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attemptId,
        req.accessPointId || null,
        decision.personType,
        decision.personId,
        req.method,
        decision.authorized ? "authorized" : "denied",
        decision.authorized ? null : decision.reason,
        decision.affiliationId,
        decision.movementId,
        req.confidenceScore || null,
        req.idempotencyKey || null,
        decision.requestId,
        JSON.stringify({ branch: req.branch, zone: req.zone, direction: req.direction }),
      ],
    );
  } catch {
    // Non-blocking: access attempt recording should not prevent authorization
  }
}

// --- Access Attempts Table (ensure exists) ---

async function ensureAccessTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS access_attempts (
      id               VARCHAR(64)   PRIMARY KEY,
      access_point_id  VARCHAR(64)   NULL,
      person_type      VARCHAR(32)   NULL,
      person_id        VARCHAR(255)  NULL,
      method           VARCHAR(32)   NOT NULL,
      decision         VARCHAR(32)   NOT NULL,
      denial_reason    VARCHAR(120)  NULL,
      affiliation_id   VARCHAR(64)   NULL,
      movement_id      VARCHAR(64)   NULL,
      confidence_score DECIMAL(5,4)  NULL,
      idempotency_key  VARCHAR(128)  NULL,
      request_id       VARCHAR(80)   NULL,
      created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      data             JSON          NULL,
      UNIQUE KEY uq_access_attempts_idempotency (idempotency_key),
      INDEX idx_access_attempts_person    (person_id, created_at),
      INDEX idx_access_attempts_point     (access_point_id, created_at),
      INDEX idx_access_attempts_decision  (decision),
      INDEX idx_access_attempts_method    (method)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS access_points (
      id             VARCHAR(64)  PRIMARY KEY,
      name           VARCHAR(180) NOT NULL,
      branch         VARCHAR(120) NOT NULL,
      zone           VARCHAR(120) NULL,
      direction      VARCHAR(16)  NOT NULL DEFAULT 'entry',
      access_methods JSON         NOT NULL,
      status         VARCHAR(32)  NOT NULL DEFAULT 'active',
      cooldown_seconds INT        NOT NULL DEFAULT 60,
      created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS access_replay_locks (
      person_id       VARCHAR(255) NOT NULL,
      access_point_id VARCHAR(64)  NOT NULL,
      last_seen_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (person_id, access_point_id),
      INDEX idx_access_replay_seen (last_seen_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// --- API Routes ---

export function registerAccessAuthorizationRoutes(app: Express, poolProvider: PoolProvider) {
  let schemaReady: Promise<void> | null = null;

  async function getPool() {
    const pool = requirePool(poolProvider);
    if (!schemaReady) {
      schemaReady = ensureAccessTables(pool).catch(() => { schemaReady = null; });
    }
    await schemaReady;
    return pool;
  }

  // Unified access validation endpoint
  app.post("/api/access/authorize", requirePermission("membership.access.validate"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await getPool();
      const enabled = await isFeatureEnabled(pool, "ENABLE_UNIFIED_ACCESS");
      if (!enabled) {
        return res.status(404).json({ error: "Unified access is not enabled" });
      }

      const accessReq: AccessRequest = {
        method: req.body.method || "manual",
        accessPointId: req.body.accessPointId || null,
        branch: req.body.branch || null,
        zone: req.body.zone || null,
        direction: req.body.direction || "entry",
        tokenHash: req.body.tokenHash || null,
        memberId: req.body.memberId || null,
        biometricProfileId: req.body.biometricProfileId || null,
        personType: req.body.personType || null,
        personId: req.body.personId || null,
        confidenceScore: req.body.confidenceScore || null,
        operatorEmail: req.user?.email || null,
        affiliationId: req.body.affiliationId || null,
        reservationAffiliationId: req.body.reservationAffiliationId || null,
        serviceType: req.body.serviceType || null,
        confirmSessionConsumption:
          req.body.confirmSessionConsumption === true,
        idempotencyKey: req.headers["idempotency-key"] as string || req.body.idempotencyKey || null,
        requestId: (req as any).requestId || createId("req"),
      };

      const decision = await authorizeAccess(pool, accessReq);
      const status =
        decision.authorized ||
        decision.requiresAffiliationSelection ||
        decision.requiresConsumptionConfirmation
          ? 200
          : 403;
      res.status(status).json(decision);
    } catch (error) {
      next(error);
    }
  });

  // Access attempts history
  app.get("/api/access/attempts", requirePermission("membership.access.validate"), async (req, res, next) => {
    try {
      const pool = await getPool();
      const memberId = String(req.query.memberId || "").trim();
      const limit = Math.min(200, Number(req.query.limit) || 50);
      const where = memberId ? "WHERE person_id = ?" : "";
      const params = memberId ? [memberId] : [];
      const [rows]: any = await pool.query(
        `SELECT * FROM access_attempts ${where} ORDER BY created_at DESC LIMIT ?`,
        [...params, limit],
      );
      res.json({
        attempts: rows.map((r: any) => ({
          id: r.id,
          accessPointId: r.access_point_id,
          personType: r.person_type,
          personId: r.person_id,
          method: r.method,
          decision: r.decision,
          denialReason: r.denial_reason,
          affiliationId: r.affiliation_id,
          movementId: r.movement_id,
          requestId: r.request_id,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  // Access points CRUD
  app.get("/api/access/points", requirePermission("membership.access.validate"), async (_req, res, next) => {
    try {
      const pool = await getPool();
      const [rows]: any = await pool.query("SELECT * FROM access_points WHERE status = 'active' ORDER BY branch, name");
      res.json({
        accessPoints: rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          branch: r.branch,
          zone: r.zone,
          direction: r.direction,
          accessMethods: typeof r.access_methods === "string" ? JSON.parse(r.access_methods) : r.access_methods,
          cooldownSeconds: Number(r.cooldown_seconds || 60),
          status: r.status,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/access/points", requirePermission("platform.audit.read"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await getPool();
      const id = createId("ap");
      const name = String(req.body.name || "").trim();
      const branch = String(req.body.branch || "").trim();
      if (!name || !branch) return res.status(400).json({ error: "name and branch are required" });
      await pool.query(
        `INSERT INTO access_points (id, name, branch, zone, direction, access_methods, cooldown_seconds)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, name, branch, req.body.zone || null, req.body.direction || "entry", JSON.stringify(req.body.accessMethods || ["qr", "manual"]), Number(req.body.cooldownSeconds || 60)],
      );
      res.status(201).json({ accessPoint: { id, name, branch } });
    } catch (error) {
      next(error);
    }
  });
}
