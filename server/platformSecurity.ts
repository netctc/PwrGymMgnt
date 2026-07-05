import type { Express, NextFunction, Request, Response } from "express";
import { PERFORMANCE_CACHEABLE_PREFIXES, isCacheableApiPath, normalizeApiCacheUrl, normalizeApiPath } from "./performance";
import { ensureOperationalAuditTable } from "./observability";
import type { Pool } from "mysql2/promise";
import crypto from "crypto";
import { hasPermission } from "./rbac";

type PoolProvider = () => Pool | null;

type AuthenticatedRequest = Request & {
  user?: {
    uid?: string;
    email?: string;
    role?: string;
  };
  requestId?: string;
  cacheHit?: boolean;
};

const PLATFORM_ADMIN_ROLES = new Set(["super_admin", "admin", "manager"]);

function requirePool(poolProvider: PoolProvider) {
  const pool = poolProvider();
  if (!pool) {
    const error = new Error("Database not connected");
    (error as any).status = 503;
    throw error;
  }
  return pool;
}

function requirePlatformAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!hasPermission(req as any, "platform.security.observe")) {
    return res.status(403).json({ error: "Platform security observer permission required" });
  }
  return next();
}

function normalizeLimit(value: unknown, fallback = 100, max = 500) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function parseJsonField(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

function toJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function getClientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function makeRequestId() {
  return `req_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function ensurePlatformSecurityTables(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_audit_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      request_id VARCHAR(80) NULL,
      actor_id VARCHAR(255) NULL,
      actor_email VARCHAR(255) NULL,
      actor_role VARCHAR(80) NULL,
      method VARCHAR(16) NOT NULL,
      path VARCHAR(512) NOT NULL,
      module VARCHAR(80) NOT NULL DEFAULT 'core',
      action VARCHAR(80) NOT NULL DEFAULT 'request',
      status_code INT NOT NULL DEFAULT 0,
      duration_ms INT NOT NULL DEFAULT 0,
      ip_address VARCHAR(128) NULL,
      user_agent TEXT NULL,
      severity VARCHAR(32) NOT NULL DEFAULT 'info',
      metadata JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_security_audit_created (created_at),
      INDEX idx_security_audit_actor (actor_email),
      INDEX idx_security_audit_module (module),
      INDEX idx_security_audit_status (status_code),
      INDEX idx_security_audit_request (request_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_type VARCHAR(100) NOT NULL,
      severity VARCHAR(32) NOT NULL DEFAULT 'info',
      actor_email VARCHAR(255) NULL,
      ip_address VARCHAR(128) NULL,
      details TEXT NULL,
      metadata JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_security_events_created (created_at),
      INDEX idx_security_events_type (event_type),
      INDEX idx_security_events_severity (severity)
    )
  `);
}

export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Download-Options", "noopen");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    if (req.path.startsWith("/api")) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
    }

    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
  };
}

export function requestContext() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const requestId = normalizeString(req.headers["x-request-id"]) || makeRequestId();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  };
}

function inferModule(pathname: string) {
  if (pathname.includes("/membership")) return "membership";
  if (pathname.includes("/scheduling")) return "scheduling";
  if (pathname.includes("/hr")) return "hr_payroll";
  if (pathname.includes("/finance")) return "finance";
  if (pathname.includes("/auth")) return "auth";
  if (pathname.includes("/backups") || pathname.includes("backup")) return "maintenance";
  if (pathname.includes("/platform") || pathname.includes("audit")) return "platform";
  return "core";
}

function inferAction(method: string, statusCode: number) {
  if (statusCode >= 500) return "server_error";
  if (statusCode === 401 || statusCode === 403) return "access_denied";
  if (method === "GET") return "read";
  if (method === "POST") return "create";
  if (method === "PUT" || method === "PATCH") return "update";
  if (method === "DELETE") return "delete";
  return "request";
}

function inferSeverity(statusCode: number, durationMs: number) {
  if (statusCode >= 500) return "error";
  if (statusCode === 401 || statusCode === 403) return "warning";
  if (durationMs > 3000) return "warning";
  return "info";
}

export function createApiAuditMiddleware(poolProvider: PoolProvider) {
  let schemaReady: Promise<void> | null = null;

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api") || req.path === "/api/health") {
      return next();
    }

    const startedAt = Date.now();
    const originalPath = req.originalUrl || req.path;

    res.on("finish", () => {
      const pool = poolProvider();
      if (!pool) return;

      const durationMs = Date.now() - startedAt;
      const statusCode = res.statusCode || 0;
      const moduleName = inferModule(originalPath);
      const action = inferAction(req.method, statusCode);
      const severity = inferSeverity(statusCode, durationMs);
      const user = req.user || {};
      const values = [
        req.requestId || null,
        user.uid || null,
        user.email || null,
        user.role || null,
        req.method,
        originalPath.slice(0, 512),
        moduleName,
        action,
        statusCode,
        durationMs,
        getClientIp(req),
        req.headers["user-agent"] || null,
        severity,
        toJson({ query: req.query, cacheHit: Boolean(req.cacheHit) }),
      ];
      const insertAuditEvent = () => pool.query(
        `INSERT INTO security_audit_events (
          request_id, actor_id, actor_email, actor_role, method, path, module, action,
          status_code, duration_ms, ip_address, user_agent, severity, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values,
      );

      schemaReady = schemaReady || ensurePlatformSecurityTables(pool);
      schemaReady
        .then(insertAuditEvent)
        .catch((error) => {
          const code = typeof error === "object" && error ? (error as any).code : "";
          if (code === "PROTOCOL_CONNECTION_LOST" || (error as any)?.fatal) {
            schemaReady = null;
            ensurePlatformSecurityTables(pool)
              .then(() => insertAuditEvent())
              .catch((retryError) => console.error("Advanced audit logging failed", retryError));
            return;
          }
          console.error("Advanced audit logging failed", error);
        });
    });

    return next();
  };
}

export function createApiCacheMiddleware(options?: { ttlMs?: number; maxEntries?: number; cacheablePrefixes?: readonly string[] }) {
  const ttlMs = options?.ttlMs ?? 30_000;
  const maxEntries = options?.maxEntries ?? 100;
  const cache = new Map<string, { statusCode: number; body: unknown; expiresAt: number; createdAt: number }>();
  const cacheablePrefixes = options?.cacheablePrefixes ?? PERFORMANCE_CACHEABLE_PREFIXES;

  function makeCacheKey(req: AuthenticatedRequest) {
    const role = req.user?.role || "anonymous";
    const actor = req.user?.uid || req.user?.email || role;
    return `${role}:${actor}:${req.method}:${normalizeApiCacheUrl(req.originalUrl || req.url || req.path)}`;
  }

  function clearExpired() {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (entry.expiresAt <= now) cache.delete(key);
    }
    while (cache.size > maxEntries) {
      const firstKey = cache.keys().next().value;
      if (!firstKey) break;
      cache.delete(firstKey);
    }
  }

  const middleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const cachePath = normalizeApiPath(req.originalUrl || req.url || req.path);
    if (!cachePath.startsWith("/api")) return next();

    if (req.method !== "GET") {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        cache.clear();
      }
      return next();
    }

    if (!isCacheableApiPath(cachePath, cacheablePrefixes)) {
      return next();
    }

    clearExpired();
    const key = makeCacheKey(req);
    const entry = cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      req.cacheHit = true;
      res.setHeader("X-Cache", "HIT");
      return res.status(entry.statusCode).json(entry.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, {
          statusCode: res.statusCode,
          body,
          createdAt: Date.now(),
          expiresAt: Date.now() + ttlMs,
        });
      }
      res.setHeader("X-Cache", "MISS");
      return originalJson(body);
    };

    return next();
  };

  (middleware as any).clear = () => cache.clear();
  (middleware as any).stats = () => {
    clearExpired();
    return {
      entries: cache.size,
      ttlMs,
      maxEntries,
      keys: Array.from(cache.keys()).slice(0, 25),
    };
  };

  return middleware as typeof middleware & { clear: () => void; stats: () => any };
}


type DateRange = { from: string; to: string; maxDays: number; truncated: boolean };
type SecurityKpis = {
  totalRequests: number;
  warnings: number;
  serverErrors: number;
  accessDenials: number;
  avgDurationMs: number;
  maxDurationMs: number;
};
type PasswordResetSecuritySummary = {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  completed: number;
  revoked: number;
  expired: number;
};
type OperationalAlert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  count?: number;
  recommendation: string;
};

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function normalizeDateRange(fromValue: unknown, toValue: unknown, options?: { fallbackDays?: number; maxDays?: number }): DateRange {
  const fallbackDays = options?.fallbackDays ?? 7;
  const maxDays = options?.maxDays ?? 90;
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getTime() - fallbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let from = normalizeDate(fromValue) || defaultFrom;
  let to = normalizeDate(toValue) || defaultTo;
  let fromDate = new Date(`${from}T00:00:00.000Z`);
  let toDate = new Date(`${to}T00:00:00.000Z`);

  if (fromDate.getTime() > toDate.getTime()) {
    [from, to] = [to, from];
    [fromDate, toDate] = [toDate, fromDate];
  }

  let truncated = false;
  const maxTo = addDays(fromDate, maxDays);
  if (toDate.getTime() > maxTo.getTime()) {
    toDate = maxTo;
    to = toDate.toISOString().slice(0, 10);
    truncated = true;
  }

  return { from, to, maxDays, truncated };
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstRow<T extends Record<string, unknown>>(rows: any, fallback: T): T {
  return Array.isArray(rows) && rows[0] ? { ...fallback, ...rows[0] } as T : fallback;
}

function maskEmailForAudit(email: unknown) {
  const raw = String(email || "").trim();
  if (!raw.includes("@")) return raw ? "***" : "";
  const [name, domain] = raw.split("@");
  if (name.length <= 2) return `${name[0] || "*"}***@${domain}`;
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

function buildSecurityAlerts(input: {
  kpis: SecurityKpis;
  resetSummary: PasswordResetSecuritySummary;
  topDenied: Array<Record<string, unknown>>;
  topSlow: Array<Record<string, unknown>>;
}): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  const denied = input.kpis.accessDenials;
  const serverErrors = input.kpis.serverErrors;
  const deliveryFailures = input.resetSummary.failed;
  const maxDurationMs = input.kpis.maxDurationMs;

  if (serverErrors >= 5) {
    alerts.push({
      id: "server-error-spike",
      severity: "critical",
      title: "Server error spike detected",
      message: `${serverErrors} API requests returned 5xx errors in the selected range.`,
      count: serverErrors,
      recommendation: "Review recent deployments, backend logs, database connectivity, and failed endpoints immediately.",
    });
  } else if (serverErrors > 0) {
    alerts.push({
      id: "server-errors-present",
      severity: "warning",
      title: "Server errors present",
      message: `${serverErrors} API requests returned 5xx errors in the selected range.`,
      count: serverErrors,
      recommendation: "Inspect affected routes and correlate them with audit request IDs.",
    });
  }

  if (denied >= 20) {
    alerts.push({
      id: "access-denial-spike",
      severity: "critical",
      title: "High volume of denied access",
      message: `${denied} requests were rejected with 401/403 responses.`,
      count: denied,
      recommendation: "Review top denied paths and actors; confirm whether this is misconfiguration or unauthorized activity.",
    });
  } else if (denied >= 5) {
    alerts.push({
      id: "access-denials-present",
      severity: "warning",
      title: "Access denials require review",
      message: `${denied} requests were rejected with 401/403 responses.`,
      count: denied,
      recommendation: "Check RBAC assignments and unusual users/IPs before expanding permissions.",
    });
  }

  if (deliveryFailures >= 3) {
    alerts.push({
      id: "password-reset-delivery-failures",
      severity: "critical",
      title: "Password reset delivery failures",
      message: `${deliveryFailures} password reset deliveries failed.`,
      count: deliveryFailures,
      recommendation: "Verify SendGrid/Twilio/webhook credentials, provider status, and destination formatting.",
    });
  } else if (deliveryFailures > 0) {
    alerts.push({
      id: "password-reset-delivery-warning",
      severity: "warning",
      title: "Some reset deliveries failed",
      message: `${deliveryFailures} password reset delivery attempt failed.`,
      count: deliveryFailures,
      recommendation: "Open delivery history and inspect provider errors before users retry repeatedly.",
    });
  }

  if (maxDurationMs >= 5000 || input.topSlow.length >= 5) {
    alerts.push({
      id: "slow-api-requests",
      severity: maxDurationMs >= 10000 ? "critical" : "warning",
      title: "Slow API responses detected",
      message: `Maximum API duration was ${maxDurationMs}ms in the selected range.`,
      count: maxDurationMs,
      recommendation: "Review slow endpoints, database indexes, and report/PDF generation routes.",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "security-posture-ok",
      severity: "info",
      title: "No immediate security alerts",
      message: "No high-risk access, delivery, server-error, or latency patterns were detected in the selected range.",
      recommendation: "Continue monitoring and keep CI/audit checks enabled.",
    });
  }

  return alerts;
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function toCsv(rows: unknown[][]) {
  return rows.map((cells) => cells.map(csvEscape).join(",")).join("\n");
}

async function buildSecurityOverview(pool: Pool, range: DateRange) {
  const dateParams = [`${range.from} 00:00:00`, `${range.to} 23:59:59`];

  const [kpiRows]: any = await pool.query(
    `SELECT
      COUNT(*) AS totalRequests,
      COALESCE(SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END), 0) AS warnings,
      COALESCE(SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END), 0) AS serverErrors,
      COALESCE(SUM(CASE WHEN status_code IN (401, 403) THEN 1 ELSE 0 END), 0) AS accessDenials,
      COALESCE(ROUND(AVG(duration_ms), 0), 0) AS avgDurationMs,
      COALESCE(MAX(duration_ms), 0) AS maxDurationMs
     FROM security_audit_events
     WHERE created_at BETWEEN ? AND ?`,
    dateParams,
  );

  const rawKpis = firstRow(kpiRows, {
    totalRequests: 0,
    warnings: 0,
    serverErrors: 0,
    accessDenials: 0,
    avgDurationMs: 0,
    maxDurationMs: 0,
  });
  const kpis: SecurityKpis = {
    totalRequests: toNumber(rawKpis.totalRequests),
    warnings: toNumber(rawKpis.warnings),
    serverErrors: toNumber(rawKpis.serverErrors),
    accessDenials: toNumber(rawKpis.accessDenials),
    avgDurationMs: toNumber(rawKpis.avgDurationMs),
    maxDurationMs: toNumber(rawKpis.maxDurationMs),
  };

  const [bySeverity]: any = await pool.query(
    `SELECT severity, COUNT(*) AS total
     FROM security_audit_events
     WHERE created_at BETWEEN ? AND ?
     GROUP BY severity
     ORDER BY total DESC`,
    dateParams,
  );

  const [byModule]: any = await pool.query(
    `SELECT module, COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN severity IN ('warning', 'error') THEN 1 ELSE 0 END), 0) AS issues,
      COALESCE(ROUND(AVG(duration_ms), 0), 0) AS avgDurationMs
     FROM security_audit_events
     WHERE created_at BETWEEN ? AND ?
     GROUP BY module
     ORDER BY total DESC`,
    dateParams,
  );

  const [topDenied]: any = await pool.query(
    `SELECT path, COALESCE(actor_email, actor_role, 'anonymous') AS actor, COUNT(*) AS deniedCount
     FROM security_audit_events
     WHERE created_at BETWEEN ? AND ? AND status_code IN (401, 403)
     GROUP BY path, actor
     ORDER BY deniedCount DESC
     LIMIT 10`,
    dateParams,
  );

  const [topSlow]: any = await pool.query(
    `SELECT method, path, status_code AS statusCode, duration_ms AS durationMs, created_at AS createdAt
     FROM security_audit_events
     WHERE created_at BETWEEN ? AND ?
     ORDER BY duration_ms DESC
     LIMIT 10`,
    dateParams,
  );

  const [topActors]: any = await pool.query(
    `SELECT COALESCE(actor_email, actor_role, 'anonymous') AS actor,
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status_code IN (401, 403) THEN 1 ELSE 0 END), 0) AS denied,
      COALESCE(SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END), 0) AS errors
     FROM security_audit_events
     WHERE created_at BETWEEN ? AND ?
     GROUP BY actor
     ORDER BY denied DESC, errors DESC, total DESC
     LIMIT 10`,
    dateParams,
  );

  const [resetRows]: any = await pool.query(
    `SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN delivery_status = 'sent' THEN 1 ELSE 0 END), 0) AS sent,
      COALESCE(SUM(CASE WHEN delivery_status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
      COALESCE(SUM(CASE WHEN delivery_status = 'skipped' THEN 1 ELSE 0 END), 0) AS skipped,
      COALESCE(SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS completed,
      COALESCE(SUM(CASE WHEN revoked_at IS NOT NULL AND used_at IS NULL THEN 1 ELSE 0 END), 0) AS revoked,
      COALESCE(SUM(CASE WHEN expires_at < NOW() AND used_at IS NULL AND revoked_at IS NULL THEN 1 ELSE 0 END), 0) AS expired
     FROM password_reset_tokens
     WHERE created_at BETWEEN ? AND ?`,
    dateParams,
  ).catch(() => [[{}]] as any);
  const rawResetSummary = firstRow(resetRows, {
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    completed: 0,
    revoked: 0,
    expired: 0,
  });
  const resetSummary: PasswordResetSecuritySummary = {
    total: toNumber(rawResetSummary.total),
    sent: toNumber(rawResetSummary.sent),
    failed: toNumber(rawResetSummary.failed),
    skipped: toNumber(rawResetSummary.skipped),
    completed: toNumber(rawResetSummary.completed),
    revoked: toNumber(rawResetSummary.revoked),
    expired: toNumber(rawResetSummary.expired),
  };

  const [deliveryByStatus]: any = await pool.query(
    `SELECT COALESCE(delivery_channel, 'unknown') AS channel,
      COALESCE(delivery_status, 'unknown') AS status,
      COUNT(*) AS total
     FROM password_reset_tokens
     WHERE created_at BETWEEN ? AND ?
     GROUP BY channel, status
     ORDER BY total DESC`,
    dateParams,
  ).catch(() => [[]] as any);

  const alerts = buildSecurityAlerts({ kpis, resetSummary, topDenied, topSlow });

  return {
    range,
    kpis,
    resetSummary,
    bySeverity,
    byModule,
    topDenied,
    topSlow,
    topActors: (topActors || []).map((row: any) => ({ ...row, actor: maskEmailForAudit(row.actor) })),
    deliveryByStatus,
    alerts,
    generatedAt: new Date().toISOString(),
  };
}

export const __platformSecurityForTests = {
  buildSecurityAlerts,
  inferAction,
  inferModule,
  inferSeverity,
  maskEmailForAudit,
  normalizeDateRange,
};

export function registerPlatformSecurityRoutes(
  app: Express,
  poolProvider: PoolProvider,
  cacheControl?: { clear: () => void; stats: () => any },
) {
  let schemaReady: Promise<void> | null = null;

  async function ready() {
    const pool = requirePool(poolProvider);
    schemaReady = schemaReady || ensurePlatformSecurityTables(pool);
    await schemaReady;
    return pool;
  }

  app.get("/api/platform/audit-logs", requirePlatformAdmin, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await ready();
      const limit = normalizeLimit(req.query.limit, 100, 500);
      const moduleName = normalizeString(req.query.module);
      const severity = normalizeString(req.query.severity);
      const actor = normalizeString(req.query.actor).toLowerCase();
      const from = normalizeDate(req.query.from);
      const to = normalizeDate(req.query.to);

      const where: string[] = [];
      const params: unknown[] = [];

      if (moduleName) {
        where.push("module = ?");
        params.push(moduleName);
      }
      if (severity) {
        where.push("severity = ?");
        params.push(severity);
      }
      if (actor) {
        where.push("LOWER(COALESCE(actor_email, '')) LIKE ?");
        params.push(`%${actor}%`);
      }
      if (from) {
        where.push("created_at >= ?");
        params.push(`${from} 00:00:00`);
      }
      if (to) {
        where.push("created_at <= ?");
        params.push(`${to} 23:59:59`);
      }

      const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const [rows] = await pool.query(
        `SELECT * FROM security_audit_events ${whereClause} ORDER BY created_at DESC LIMIT ${limit}`,
        params,
      );
      res.json({ logs: rows });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/platform/security-events", requirePlatformAdmin, async (req, res, next) => {
    try {
      const pool = await ready();
      const limit = normalizeLimit(req.query.limit, 100, 500);
      const [rows] = await pool.query(
        `SELECT * FROM security_events ORDER BY created_at DESC LIMIT ${limit}`,
      );
      res.json({ events: rows });
    } catch (error) {
      next(error);
    }
  });



  app.get("/api/platform/observability/summary", requirePlatformAdmin, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await ready();
      await ensureOperationalAuditTable(pool);
      const range = normalizeDateRange(req.query.from, req.query.to, { fallbackDays: 7, maxDays: 90 });
      const dateParams = [`${range.from} 00:00:00`, `${range.to} 23:59:59`];

      const [requestRows]: any = await pool.query(
        `SELECT
          COUNT(*) AS totalRequests,
          COALESCE(SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END), 0) AS serverErrors,
          COALESCE(SUM(CASE WHEN status_code IN (401, 403) THEN 1 ELSE 0 END), 0) AS accessDenials,
          COALESCE(ROUND(AVG(duration_ms), 0), 0) AS avgDurationMs,
          COALESCE(MAX(duration_ms), 0) AS maxDurationMs
         FROM security_audit_events
         WHERE created_at BETWEEN ? AND ?`,
        dateParams,
      );

      const [actionRows]: any = await pool.query(
        `SELECT COUNT(*) AS totalUserActions
         FROM audit_logs
         WHERE created_at BETWEEN ? AND ?`,
        dateParams,
      );

      const [topActions]: any = await pool.query(
        `SELECT action, COUNT(*) AS total
         FROM audit_logs
         WHERE created_at BETWEEN ? AND ?
         GROUP BY action
         ORDER BY total DESC
         LIMIT 10`,
        dateParams,
      );

      const requestKpis = firstRow(requestRows, {
        totalRequests: 0,
        serverErrors: 0,
        accessDenials: 0,
        avgDurationMs: 0,
        maxDurationMs: 0,
      });
      const actionKpis = firstRow(actionRows, { totalUserActions: 0 });

      res.json({
        range,
        requestLogging: {
          totalRequests: toNumber(requestKpis.totalRequests),
          serverErrors: toNumber(requestKpis.serverErrors),
          accessDenials: toNumber(requestKpis.accessDenials),
          avgDurationMs: toNumber(requestKpis.avgDurationMs),
          maxDurationMs: toNumber(requestKpis.maxDurationMs),
        },
        userActionAudit: {
          totalUserActions: toNumber(actionKpis.totalUserActions),
          topActions,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/platform/security/overview", requirePlatformAdmin, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await ready();
      const range = normalizeDateRange(req.query.from, req.query.to, { fallbackDays: 7, maxDays: 90 });
      res.json(await buildSecurityOverview(pool, range));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/platform/security/alerts", requirePlatformAdmin, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await ready();
      const range = normalizeDateRange(req.query.from, req.query.to, { fallbackDays: 7, maxDays: 90 });
      const overview = await buildSecurityOverview(pool, range);
      res.json({ range: overview.range, alerts: overview.alerts, generatedAt: overview.generatedAt });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/platform/security/password-reset-deliveries", requirePlatformAdmin, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await ready();
      const range = normalizeDateRange(req.query.from, req.query.to, { fallbackDays: 7, maxDays: 90 });
      const limit = normalizeLimit(req.query.limit, 50, 250);
      const status = normalizeString(req.query.status).toLowerCase();
      const channel = normalizeString(req.query.channel).toLowerCase();
      const email = normalizeString(req.query.email).toLowerCase();

      const where = ["created_at BETWEEN ? AND ?"];
      const params: unknown[] = [`${range.from} 00:00:00`, `${range.to} 23:59:59`];

      if (status && status !== "all") {
        where.push("delivery_status = ?");
        params.push(status);
      }
      if (channel && channel !== "all") {
        where.push("delivery_channel = ?");
        params.push(channel);
      }
      if (email) {
        where.push("LOWER(email) LIKE ?");
        params.push(`%${email}%`);
      }

      const [rows]: any = await pool.query(
        `SELECT id, user_id AS userId, email, delivery_request_id AS deliveryRequestId,
          delivery_channel AS deliveryChannel, delivery_status AS deliveryStatus,
          delivery_provider AS deliveryProvider, delivery_last_error AS deliveryLastError,
          delivered_at AS deliveredAt, expires_at AS expiresAt, used_at AS usedAt,
          revoked_at AS revokedAt, created_at AS createdAt
         FROM password_reset_tokens
         WHERE ${where.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT ${limit}`,
        params,
      );

      res.json({
        range,
        deliveries: (rows || []).map((row: any) => ({
          id: row.id,
          userId: row.userId,
          email: maskEmailForAudit(row.email),
          deliveryRequestId: row.deliveryRequestId,
          deliveryChannel: row.deliveryChannel,
          deliveryStatus: row.deliveryStatus,
          deliveryProvider: row.deliveryProvider,
          deliveryLastError: row.deliveryLastError ? String(row.deliveryLastError).slice(0, 240) : null,
          deliveredAt: row.deliveredAt,
          expiresAt: row.expiresAt,
          usedAt: row.usedAt,
          revokedAt: row.revokedAt,
          createdAt: row.createdAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/platform/security/overview.csv", requirePlatformAdmin, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = await ready();
      const range = normalizeDateRange(req.query.from, req.query.to, { fallbackDays: 7, maxDays: 90 });
      const overview = await buildSecurityOverview(pool, range);
      const csv = toCsv([
        ["section", "metric", "value", "severity", "recommendation"],
        ["range", "from", overview.range.from, "", ""],
        ["range", "to", overview.range.to, "", overview.range.truncated ? `Range limited to ${overview.range.maxDays} days` : ""],
        ["kpi", "totalRequests", overview.kpis.totalRequests, "", ""],
        ["kpi", "warnings", overview.kpis.warnings, "", ""],
        ["kpi", "serverErrors", overview.kpis.serverErrors, "", ""],
        ["kpi", "accessDenials", overview.kpis.accessDenials, "", ""],
        ["kpi", "avgDurationMs", overview.kpis.avgDurationMs, "", ""],
        ["passwordReset", "total", overview.resetSummary.total, "", ""],
        ["passwordReset", "failed", overview.resetSummary.failed, "", ""],
        ["passwordReset", "completed", overview.resetSummary.completed, "", ""],
        ...overview.alerts.map((alert) => ["alert", alert.title, alert.count ?? "", alert.severity, alert.recommendation]),
      ]);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="security-overview-${range.from}-to-${range.to}.csv"`);
      res.send(csv);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/platform/performance/cache", requirePlatformAdmin, async (_req, res) => {
    res.json({ cache: cacheControl?.stats ? cacheControl.stats() : null });
  });

  app.delete("/api/platform/performance/cache", requirePlatformAdmin, async (_req, res) => {
    cacheControl?.clear?.();
    res.json({ message: "API cache cleared" });
  });

  app.get("/api/platform/reports/operations-summary", requirePlatformAdmin, async (req, res, next) => {
    try {
      const pool = await ready();
      const from = normalizeDate(req.query.from) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const to = normalizeDate(req.query.to) || new Date().toISOString().slice(0, 10);

      const dateParams = [`${from} 00:00:00`, `${to} 23:59:59`];

      const [auditByModule]: any = await pool.query(
        `SELECT module, COUNT(*) AS total, SUM(CASE WHEN severity IN ('warning', 'error') THEN 1 ELSE 0 END) AS issues,
                ROUND(AVG(duration_ms), 0) AS avg_duration_ms
         FROM security_audit_events
         WHERE created_at BETWEEN ? AND ?
         GROUP BY module
         ORDER BY total DESC`,
        dateParams,
      );

      const [topDenied]: any = await pool.query(
        `SELECT path, COUNT(*) AS denied_count
         FROM security_audit_events
         WHERE created_at BETWEEN ? AND ? AND status_code IN (401, 403)
         GROUP BY path
         ORDER BY denied_count DESC
         LIMIT 10`,
        dateParams,
      );

      const [financeRows]: any = await pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses
         FROM finance_transactions
         WHERE transaction_date BETWEEN ? AND ? AND status <> 'void'`,
        [from, to],
      ).catch(() => [[{ income: 0, expenses: 0 }]] as any);

      const [membershipRows]: any = await pool.query(
        `SELECT COUNT(*) AS active_members
         FROM members
         WHERE status = 'active'`,
      ).catch(() => [[{ active_members: 0 }]] as any);

      const [subscriptionRows]: any = await pool.query(
        `SELECT COUNT(*) AS active_subscriptions
         FROM member_subscriptions
         WHERE status = 'active' AND end_date >= CURRENT_DATE()`,
      ).catch(() => [[{ active_subscriptions: 0 }]] as any);

      const income = Number(financeRows?.[0]?.income || 0);
      const expenses = Number(financeRows?.[0]?.expenses || 0);

      res.json({
        range: { from, to },
        kpis: {
          income,
          expenses,
          net: income - expenses,
          activeMembers: Number(membershipRows?.[0]?.active_members || 0),
          activeSubscriptions: Number(subscriptionRows?.[0]?.active_subscriptions || 0),
        },
        auditByModule,
        topDenied,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/platform/reports/operations-summary.csv", requirePlatformAdmin, async (req, res, next) => {
    try {
      const pool = await ready();
      const from = normalizeDate(req.query.from) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const to = normalizeDate(req.query.to) || new Date().toISOString().slice(0, 10);

      const [rows]: any = await pool.query(
        `SELECT module, action, severity, status_code, COUNT(*) AS total, ROUND(AVG(duration_ms), 0) AS avg_duration_ms
         FROM security_audit_events
         WHERE created_at BETWEEN ? AND ?
         GROUP BY module, action, severity, status_code
         ORDER BY module, total DESC`,
        [`${from} 00:00:00`, `${to} 23:59:59`],
      );

      const csvRows = [
        ["module", "action", "severity", "status_code", "total", "avg_duration_ms"],
        ...rows.map((row: any) => [
          row.module,
          row.action,
          row.severity,
          String(row.status_code),
          String(row.total),
          String(row.avg_duration_ms ?? 0),
        ]),
      ];

      const csv = csvRows
        .map((cells) => cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="operations-summary-${from}-to-${to}.csv"`);
      res.send(csv);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/platform/system/health", requirePlatformAdmin, async (_req, res, next) => {
    try {
      const pool = await ready();
      const startedAt = Date.now();
      await pool.query("SELECT 1");
      const dbLatencyMs = Date.now() - startedAt;
      const memory = process.memoryUsage();

      res.json({
        status: "ok",
        dbLatencyMs,
        uptimeSeconds: Math.round(process.uptime()),
        memory: {
          rssMb: Math.round(memory.rss / 1024 / 1024),
          heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
        },
        cache: cacheControl?.stats ? cacheControl.stats() : null,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });
}
