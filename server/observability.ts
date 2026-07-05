import type { NextFunction, Request, Response } from "express";
import type { Pool } from "mysql2/promise";

type QueryablePool = Pick<Pool, "query">;
type PoolProvider = () => QueryablePool | null;
type LogLevel = "debug" | "info" | "warn" | "error";

type AuthenticatedRequest = Request & {
  user?: {
    uid?: string;
    email?: string;
    role?: string;
  };
  requestId?: string;
  cacheHit?: boolean;
};

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY_PATTERN = /(password|passcode|token|secret|authorization|cookie|set-cookie|api[_-]?key|private[_-]?key|credential|reset|otp|session)/i;
const USER_ACTION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DEFAULT_AUDIT_SKIPPED_PREFIXES = [
  "/api/health",
  "/api/platform/audit-logs",
  "/api/platform/security/overview.csv",
  "/api/platform/reports/operations-summary.csv",
];

function normalizeLogLevel(value: unknown): LogLevel {
  const raw = String(value || "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "info";
}

function configuredLogLevel() {
  return normalizeLogLevel(process.env.LOG_LEVEL || "info");
}

function shouldLog(level: LogLevel) {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[configuredLogLevel()];
}

function getClientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function pathWithoutQuery(req: Request) {
  return (req.originalUrl || req.url || req.path || "").split("?")[0];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[MaxDepth]";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactSensitive(item, depth + 1));
  if (!isPlainObject(value)) return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = redactSensitive(child, depth + 1);
    }
  }
  return output;
}

export function createStructuredLogger(component: string) {
  function emit(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
    if (!shouldLog(level)) return;
    const event = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      ...(redactSensitive(metadata || {}) as Record<string, unknown>),
    };
    const line = JSON.stringify(event);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  return {
    debug: (message: string, metadata?: Record<string, unknown>) => emit("debug", message, metadata),
    info: (message: string, metadata?: Record<string, unknown>) => emit("info", message, metadata),
    warn: (message: string, metadata?: Record<string, unknown>) => emit("warn", message, metadata),
    error: (message: string, metadata?: Record<string, unknown>) => emit("error", message, metadata),
  };
}

export const appLogger = createStructuredLogger("app");

export async function ensureOperationalAuditTable(pool: QueryablePool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      action VARCHAR(255) NOT NULL,
      details TEXT,
      performed_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_logs_action (action),
      INDEX idx_audit_logs_created_at (created_at),
      INDEX idx_audit_logs_performed_by (performed_by)
    )
  `);
}

export async function writeOperationalAudit(
  pool: QueryablePool,
  event: { action: string; details?: Record<string, unknown>; performedBy?: string | null },
) {
  await ensureOperationalAuditTable(pool);
  await pool.query("INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)", [
    String(event.action || "AUDIT_EVENT").slice(0, 255),
    JSON.stringify(redactSensitive(event.details || {})),
    String(event.performedBy || "system").slice(0, 255),
  ]);
}

function shouldSkipAudit(pathname: string, skippedPrefixes: readonly string[]) {
  return skippedPrefixes.some((prefix) => pathname.startsWith(prefix));
}

function buildAction(method: string, statusCode: number) {
  const outcome = statusCode >= 400 ? "FAILED" : "SUCCESS";
  return `USER_ACTION_${method}_${outcome}`;
}

function isExpectedUnauthenticatedProbe(method: string, pathname: string, statusCode: number) {
  if (method !== "GET" || statusCode !== 401) return false;
  return pathname === "/api/auth/me" || pathname === "/api/engagement/notifications";
}

function requestLogLevel(method: string, pathname: string, statusCode: number): LogLevel {
  if (statusCode >= 500) return "error";
  if (isExpectedUnauthenticatedProbe(method, pathname, statusCode)) return "info";
  if (statusCode >= 400) return "warn";
  return "info";
}

export function createUserActionAuditMiddleware(
  poolProvider: PoolProvider,
  options?: { skippedPrefixes?: readonly string[] },
) {
  const skippedPrefixes = options?.skippedPrefixes || DEFAULT_AUDIT_SKIPPED_PREFIXES;
  let schemaReady: Promise<void> | null = null;

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api")) return next();
    if (!USER_ACTION_METHODS.has(req.method)) return next();

    const pathname = pathWithoutQuery(req);
    if (shouldSkipAudit(pathname, skippedPrefixes)) return next();

    const startedAt = Date.now();
    res.on("finish", () => {
      const pool = poolProvider();
      if (!pool) return;
      const durationMs = Date.now() - startedAt;
      const user = req.user || {};
      const performedBy = user.email || user.uid || user.role || "anonymous";
      const action = buildAction(req.method, res.statusCode || 0);

      schemaReady = schemaReady || ensureOperationalAuditTable(pool);
      schemaReady
        .then(() => writeOperationalAudit(pool, {
          action,
          performedBy,
          details: {
            source: "phase6_user_action_audit",
            requestId: req.requestId || null,
            method: req.method,
            path: pathname,
            statusCode: res.statusCode || 0,
            durationMs,
            actorRole: user.role || null,
            ipAddress: getClientIp(req),
            userAgent: req.headers["user-agent"] || null,
          },
        }))
        .catch((error) => {
          appLogger.warn("User action audit write failed", {
            requestId: req.requestId || null,
            method: req.method,
            path: pathname,
            error: { name: (error as any)?.name, message: (error as any)?.message, code: (error as any)?.code },
          });
        });
    });

    return next();
  };
}

export function createApiStructuredLogMiddleware(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? process.env.LOG_API_REQUESTS !== "false";

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!enabled || !req.path.startsWith("/api")) return next();
    const startedAt = Date.now();
    const pathname = pathWithoutQuery(req);

    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const statusCode = res.statusCode || 0;
      const level = requestLogLevel(req.method, pathname, statusCode);
      appLogger[level]("API request completed", {
        requestId: req.requestId || null,
        method: req.method,
        path: pathname,
        statusCode,
        durationMs,
        cacheHit: Boolean(req.cacheHit),
        actorRole: req.user?.role || null,
      });
    });

    return next();
  };
}

export const __observabilityForTests = {
  buildAction,
  isExpectedUnauthenticatedProbe,
  redactSensitive,
  requestLogLevel,
  shouldSkipAudit,
};
