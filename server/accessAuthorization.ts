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
import { createMovement, getBalanceForUpdate, checkIdempotencyKey, storeIdempotencyKey } from "./sessionLedger";

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
  serviceType?: string;
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
};

const COOLDOWN_SECONDS = 60; // Anti-replay: same person, same access point within 60s

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
): Promise<{ affiliationId: string; subscriptionId: string; planName: string; cycleId: string | null; sessionsUnlimited: boolean } | null> {
  // Priority 1: Explicitly requested affiliation
  if (requestedAffiliationId) {
    const [rows]: any = await pool.query(
      `SELECT a.id, a.subscription_id, pv.name AS plan_name, pv.sessions_unlimited,
              (SELECT id FROM subscription_cycles WHERE subscription_id = a.subscription_id AND status = 'active' ORDER BY cycle_number DESC LIMIT 1) AS cycle_id
       FROM affiliations a
       JOIN plan_versions pv ON pv.id = a.plan_version_id
       WHERE a.id = ? AND a.member_id = ? AND a.status = 'active' AND a.end_date >= CURDATE()
       LIMIT 1`,
      [requestedAffiliationId, memberId],
    );
    if (rows.length > 0) return { affiliationId: rows[0].id, subscriptionId: rows[0].subscription_id, planName: rows[0].plan_name, cycleId: rows[0].cycle_id, sessionsUnlimited: Boolean(rows[0].sessions_unlimited) };
  }

  // Priority 2-5: Active affiliations ordered by priority
  const [rows]: any = await pool.query(
    `SELECT a.id, a.subscription_id, a.is_primary, a.consumption_priority, a.end_date,
            pv.name AS plan_name, pv.sessions_unlimited,
            (SELECT id FROM subscription_cycles WHERE subscription_id = a.subscription_id AND status = 'active' ORDER BY cycle_number DESC LIMIT 1) AS cycle_id
     FROM affiliations a
     JOIN plan_versions pv ON pv.id = a.plan_version_id
     JOIN subscriptions s ON s.id = a.subscription_id AND s.status = 'active'
     WHERE a.member_id = ? AND a.status = 'active' AND a.end_date >= CURDATE()
     ORDER BY a.is_primary DESC, a.end_date ASC, a.consumption_priority ASC
     LIMIT 5`,
    [memberId],
  );

  if (rows.length === 0) return null;

  // For limited plans, prefer the one with soonest expiry (use sessions before they expire)
  return {
    affiliationId: rows[0].id,
    subscriptionId: rows[0].subscription_id,
    planName: rows[0].plan_name,
    cycleId: rows[0].cycle_id,
    sessionsUnlimited: Boolean(rows[0].sessions_unlimited),
  };
}

async function checkCooldown(pool: Pool, personId: string, accessPointId: string | undefined): Promise<boolean> {
  if (!accessPointId) return false;
  const [rows]: any = await pool.query(
    `SELECT id FROM access_attempts
     WHERE person_id = ? AND access_point_id = ? AND decision = 'authorized'
       AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
     LIMIT 1`,
    [personId, accessPointId, COOLDOWN_SECONDS],
  );
  return rows.length > 0;
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

  // Step 3: Anti-replay check
  const cooldownActive = await checkCooldown(pool, identity.personId, req.accessPointId);
  if (cooldownActive) {
    const decision = buildDenied(attemptId, requestId, "COOLDOWN_ACTIVE", identity.personType, identity.personId, identity.personName);
    await recordAttempt(pool, attemptId, req, decision);
    return decision;
  }

  // Step 4: Check if session ledger is enabled
  const ledgerEnabled = await isFeatureEnabled(pool, "ENABLE_SESSION_LEDGER");

  // Step 5: Select affiliation
  const affiliation = await selectAffiliation(pool, identity.personId, req.affiliationId);
  if (!affiliation) {
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

  // Step 6: Consume session if ledger active and plan is limited
  let movementId: string | null = null;
  let sessionsRemaining: number | null = null;

  if (ledgerEnabled && !affiliation.sessionsUnlimited && affiliation.cycleId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const contextType = "affiliation"; // For now, individual balance
      const balance = await getBalanceForUpdate(connection, contextType, affiliation.affiliationId, affiliation.cycleId);

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

  // Step 7: Build authorized decision
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
        serviceType: req.body.serviceType || null,
        idempotencyKey: req.headers["idempotency-key"] as string || req.body.idempotencyKey || null,
        requestId: (req as any).requestId || createId("req"),
      };

      const decision = await authorizeAccess(pool, accessReq);
      const status = decision.authorized ? 200 : 403;
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
