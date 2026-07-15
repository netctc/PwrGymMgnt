/**
 * Biometric Profiles — Facial recognition enrollment, consent, and profile management.
 *
 * This module handles:
 * - Biometric consent recording and withdrawal
 * - Profile enrollment (member or employee)
 * - Profile revocation and deletion scheduling
 * - Metadata queries (no templates exposed via API)
 * - Integration point for external biometric service
 *
 * IMPORTANT: Actual biometric templates are NOT stored in this database.
 * The `template_reference` field is an opaque pointer to the isolated biometric service.
 * No embeddings, images, or raw biometric data are stored or returned via this API.
 */

import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import type { Pool } from "mysql2/promise";
import { requirePermission } from "./rbac";
import { isFeatureEnabled } from "./featureFlags";

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

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// --- Schema ---

async function ensureBiometricTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS biometric_consents (
      id               VARCHAR(64)  PRIMARY KEY,
      person_type      VARCHAR(32)  NOT NULL,
      person_id        VARCHAR(255) NOT NULL,
      consent_type     VARCHAR(64)  NOT NULL DEFAULT 'facial_recognition',
      granted          TINYINT(1)   NOT NULL DEFAULT 0,
      granted_at       DATETIME     NULL,
      withdrawn_at     DATETIME     NULL,
      legal_basis      VARCHAR(120) NULL,
      purpose          TEXT         NULL,
      recorded_by      VARCHAR(255) NOT NULL,
      ip_address       VARCHAR(128) NULL,
      created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_bio_consents_person (person_type, person_id),
      INDEX idx_bio_consents_type   (consent_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS biometric_profiles (
      id                   VARCHAR(64)  PRIMARY KEY,
      person_type          VARCHAR(32)  NOT NULL,
      person_id            VARCHAR(255) NOT NULL,
      status               VARCHAR(32)  NOT NULL DEFAULT 'pending',
      template_reference   VARCHAR(255) NOT NULL,
      quality_score        DECIMAL(5,2) NULL,
      enrolled_at          DATETIME     NOT NULL,
      enrolled_by          VARCHAR(255) NOT NULL,
      enrolled_at_branch   VARCHAR(120) NULL,
      revoked_at           DATETIME     NULL,
      revoked_by           VARCHAR(255) NULL,
      revocation_reason    VARCHAR(255) NULL,
      last_recognition_at  DATETIME     NULL,
      version              INT          NOT NULL DEFAULT 1,
      created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_bio_profiles_person (person_type, person_id),
      INDEX idx_bio_profiles_status (status),
      INDEX idx_bio_profiles_reference (template_reference)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS biometric_deletion_jobs (
      id                VARCHAR(64)  PRIMARY KEY,
      profile_id        VARCHAR(64)  NOT NULL,
      person_type       VARCHAR(32)  NOT NULL,
      person_id         VARCHAR(255) NOT NULL,
      reason            VARCHAR(255) NOT NULL,
      status            VARCHAR(32)  NOT NULL DEFAULT 'pending',
      requested_by      VARCHAR(255) NOT NULL,
      requested_at      DATETIME     NOT NULL,
      completed_at      DATETIME     NULL,
      created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_bio_deletion_status (status),
      INDEX idx_bio_deletion_profile (profile_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// --- API Routes ---

export function registerBiometricRoutes(app: Express, poolProvider: PoolProvider) {
  let schemaReady: Promise<void> | null = null;

  async function getPool() {
    const pool = requirePool(poolProvider);
    if (!schemaReady) {
      schemaReady = ensureBiometricTables(pool).catch(() => { schemaReady = null; });
    }
    await schemaReady;
    return pool;
  }

  // --- Consent Management ---

  app.post("/api/biometrics/consents", requirePermission("biometrics.enroll"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await getPool();
      const enabled = await isFeatureEnabled(pool, "ENABLE_FACIAL_ACCESS");
      if (!enabled) return res.status(404).json({ error: "Facial access is not enabled" });

      const personType = normalizeString(req.body.personType);
      const personId = normalizeString(req.body.personId);
      if (!personType || !personId) return res.status(400).json({ error: "personType and personId are required" });
      if (!["member", "employee"].includes(personType)) return res.status(400).json({ error: "personType must be member or employee" });

      const id = createId("consent");
      const granted = Boolean(req.body.granted);
      await pool.query(
        `INSERT INTO biometric_consents (id, person_type, person_id, consent_type, granted, granted_at, legal_basis, purpose, recorded_by, ip_address)
         VALUES (?, ?, ?, 'facial_recognition', ?, ?, ?, ?, ?, ?)`,
        [id, personType, personId, granted ? 1 : 0, granted ? new Date() : null, normalizeString(req.body.legalBasis) || null, normalizeString(req.body.purpose) || "Facial recognition for gym access", req.user?.email || "system", req.ip || null],
      );

      // If consent is withdrawn, revoke active profiles and schedule deletion
      if (!granted) {
        const [profiles]: any = await pool.query(
          "SELECT id FROM biometric_profiles WHERE person_type = ? AND person_id = ? AND status = 'active'",
          [personType, personId],
        );
        for (const profile of profiles) {
          await pool.query(
            "UPDATE biometric_profiles SET status = 'revoked', revoked_at = NOW(), revoked_by = ?, revocation_reason = 'Consent withdrawn' WHERE id = ?",
            [req.user?.email || "system", profile.id],
          );
          await pool.query(
            "INSERT INTO biometric_deletion_jobs (id, profile_id, person_type, person_id, reason, status, requested_by, requested_at) VALUES (?, ?, ?, ?, 'Consent withdrawn', 'pending', ?, NOW())",
            [createId("del"), profile.id, personType, personId, req.user?.email || "system"],
          );
        }
        await pool.query(
          "UPDATE biometric_consents SET withdrawn_at = NOW() WHERE person_type = ? AND person_id = ? AND consent_type = 'facial_recognition' AND granted = 1 AND withdrawn_at IS NULL AND id <> ?",
          [personType, personId, id],
        );
      }

      res.status(201).json({ consent: { id, personType, personId, granted, consentType: "facial_recognition" } });
    } catch (error) { next(error); }
  });

  app.get("/api/biometrics/consents", requirePermission("biometrics.read_metadata"), async (req, res, next) => {
    try {
      const pool = await getPool();
      const personId = normalizeString(req.query.personId);
      if (!personId) return res.status(400).json({ error: "personId is required" });
      const [rows]: any = await pool.query(
        "SELECT id, person_type, person_id, consent_type, granted, granted_at, withdrawn_at, legal_basis, purpose, recorded_by, created_at FROM biometric_consents WHERE person_id = ? ORDER BY created_at DESC",
        [personId],
      );
      res.json({
        consents: rows.map((r: any) => ({
          id: r.id, personType: r.person_type, personId: r.person_id, consentType: r.consent_type,
          granted: Boolean(r.granted), grantedAt: r.granted_at ? new Date(r.granted_at).toISOString() : null,
          withdrawnAt: r.withdrawn_at ? new Date(r.withdrawn_at).toISOString() : null,
          legalBasis: r.legal_basis, purpose: r.purpose, recordedBy: r.recorded_by,
        })),
      });
    } catch (error) { next(error); }
  });

  // --- Profile Management ---

  app.post("/api/biometrics/profiles", requirePermission("biometrics.enroll"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await getPool();
      const enabled = await isFeatureEnabled(pool, "ENABLE_FACIAL_ACCESS");
      if (!enabled) return res.status(404).json({ error: "Facial access is not enabled" });

      const personType = normalizeString(req.body.personType);
      const personId = normalizeString(req.body.personId);
      const templateReference = normalizeString(req.body.templateReference);
      if (!personType || !personId || !templateReference) {
        return res.status(400).json({ error: "personType, personId, and templateReference are required" });
      }

      // Verify consent exists and is active
      const [consents]: any = await pool.query(
        "SELECT id FROM biometric_consents WHERE person_type = ? AND person_id = ? AND consent_type = 'facial_recognition' AND granted = 1 AND withdrawn_at IS NULL ORDER BY created_at DESC LIMIT 1",
        [personType, personId],
      );
      if (consents.length === 0) {
        return res.status(400).json({ error: "Active biometric consent is required before enrollment", code: "BIOMETRIC_CONSENT_REQUIRED" });
      }

      // Check for existing active profile (one active profile per person)
      const [existing]: any = await pool.query(
        "SELECT id FROM biometric_profiles WHERE person_type = ? AND person_id = ? AND status = 'active' LIMIT 1",
        [personType, personId],
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: "Person already has an active biometric profile. Revoke first to re-enroll." });
      }

      const id = createId("bio");
      const qualityScore = req.body.qualityScore ? Number(req.body.qualityScore) : null;
      await pool.query(
        `INSERT INTO biometric_profiles (id, person_type, person_id, status, template_reference, quality_score, enrolled_at, enrolled_by, enrolled_at_branch)
         VALUES (?, ?, ?, 'active', ?, ?, NOW(), ?, ?)`,
        [id, personType, personId, templateReference, qualityScore, req.user?.email || "system", normalizeString(req.body.branch) || null],
      );

      res.status(201).json({
        profile: { id, personType, personId, status: "active", qualityScore, enrolledBy: req.user?.email },
      });
    } catch (error) { next(error); }
  });

  app.get("/api/biometrics/profiles", requirePermission("biometrics.read_metadata"), async (req, res, next) => {
    try {
      const pool = await getPool();
      const personId = normalizeString(req.query.personId);
      const status = normalizeString(req.query.status);
      const where: string[] = [];
      const params: any[] = [];
      if (personId) { where.push("person_id = ?"); params.push(personId); }
      if (status) { where.push("status = ?"); params.push(status); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const [rows]: any = await pool.query(
        `SELECT id, person_type, person_id, status, quality_score, enrolled_at, enrolled_by, enrolled_at_branch, revoked_at, revoked_by, revocation_reason, last_recognition_at, version, created_at
         FROM biometric_profiles ${clause} ORDER BY created_at DESC LIMIT 100`,
        params,
      );
      // NOTE: template_reference is NEVER exposed via API
      res.json({
        profiles: rows.map((r: any) => ({
          id: r.id, personType: r.person_type, personId: r.person_id, status: r.status,
          qualityScore: r.quality_score ? Number(r.quality_score) : null,
          enrolledAt: r.enrolled_at ? new Date(r.enrolled_at).toISOString() : null,
          enrolledBy: r.enrolled_by, enrolledAtBranch: r.enrolled_at_branch,
          revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
          revokedBy: r.revoked_by, revocationReason: r.revocation_reason,
          lastRecognitionAt: r.last_recognition_at ? new Date(r.last_recognition_at).toISOString() : null,
          version: Number(r.version || 1),
        })),
      });
    } catch (error) { next(error); }
  });

  // Revoke a profile
  app.post("/api/biometrics/profiles/:id/revoke", requirePermission("biometrics.revoke"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await getPool();
      const profileId = req.params.id;
      const reason = normalizeString(req.body.reason) || "Administrative revocation";

      const [rows]: any = await pool.query("SELECT * FROM biometric_profiles WHERE id = ? AND status = 'active' LIMIT 1", [profileId]);
      if (rows.length === 0) return res.status(404).json({ error: "Active profile not found" });

      await pool.query(
        "UPDATE biometric_profiles SET status = 'revoked', revoked_at = NOW(), revoked_by = ?, revocation_reason = ?, version = version + 1 WHERE id = ?",
        [req.user?.email || "system", reason, profileId],
      );

      // Schedule deletion
      await pool.query(
        "INSERT INTO biometric_deletion_jobs (id, profile_id, person_type, person_id, reason, status, requested_by, requested_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, NOW())",
        [createId("del"), profileId, rows[0].person_type, rows[0].person_id, reason, req.user?.email || "system"],
      );

      res.json({ ok: true, profileId, status: "revoked", reason });
    } catch (error) { next(error); }
  });

  // Request deletion (GDPR/privacy right)
  app.post("/api/biometrics/profiles/:id/delete", requirePermission("biometrics.delete"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await getPool();
      const profileId = req.params.id;

      const [rows]: any = await pool.query("SELECT * FROM biometric_profiles WHERE id = ? LIMIT 1", [profileId]);
      if (rows.length === 0) return res.status(404).json({ error: "Profile not found" });

      // Revoke if still active
      if (rows[0].status === "active") {
        await pool.query(
          "UPDATE biometric_profiles SET status = 'revoked', revoked_at = NOW(), revoked_by = ?, revocation_reason = 'Deletion requested', version = version + 1 WHERE id = ?",
          [req.user?.email || "system", profileId],
        );
      }

      // Schedule deletion job
      const jobId = createId("del");
      await pool.query(
        "INSERT INTO biometric_deletion_jobs (id, profile_id, person_type, person_id, reason, status, requested_by, requested_at) VALUES (?, ?, ?, ?, 'Data subject deletion request', 'pending', ?, NOW())",
        [jobId, profileId, rows[0].person_type, rows[0].person_id, req.user?.email || "system"],
      );

      res.json({ ok: true, profileId, deletionJobId: jobId, status: "deletion_scheduled" });
    } catch (error) { next(error); }
  });

  // Deletion jobs status (admin)
  app.get("/api/biometrics/deletion-jobs", requirePermission("biometrics.delete"), async (_req, res, next) => {
    try {
      const pool = await getPool();
      const [rows]: any = await pool.query(
        "SELECT * FROM biometric_deletion_jobs ORDER BY requested_at DESC LIMIT 100"
      );
      res.json({
        jobs: rows.map((r: any) => ({
          id: r.id, profileId: r.profile_id, personType: r.person_type, personId: r.person_id,
          reason: r.reason, status: r.status, requestedBy: r.requested_by,
          requestedAt: r.requested_at ? new Date(r.requested_at).toISOString() : null,
          completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
        })),
      });
    } catch (error) { next(error); }
  });
}
