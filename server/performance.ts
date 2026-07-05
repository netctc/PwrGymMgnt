import type { NextFunction, Request, Response } from "express";
import type { Pool } from "mysql2/promise";

export const DEFAULT_SLOW_QUERY_LOG_MS = Number(process.env.SLOW_QUERY_LOG_MS || 750);
export const DEFAULT_SLOW_RESPONSE_LOG_MS = Number(process.env.SLOW_RESPONSE_LOG_MS || 1500);
export const TABLE_EXISTS_CACHE_TTL_MS = Number(process.env.TABLE_EXISTS_CACHE_TTL_MS || 60_000);

export const PERFORMANCE_CACHEABLE_PREFIXES = Object.freeze([
  "/api/membership/plans",
  "/api/membership/members",
  "/api/scheduling/classes",
  "/api/scheduling/resources",
  "/api/scheduling/private-classes",
  "/api/hr/employees",
  "/api/hr/payroll/runs",
  "/api/finance/summary",
  "/api/finance/transactions",
  "/api/finance/loans",
  "/api/finance/rentals",
  "/api/finance/budgets",
  "/api/warehouse/products",
  "/api/warehouse/suppliers",
  "/api/warehouse/purchase-orders",
  "/api/warehouse/pos/sales",
  "/api/warehouse/summary",
  "/api/warehouse/categories",
  "/api/engagement/notifications",
  "/api/dashboard/summary",
  "/api/dashboard/trainer-utilization",
  "/api/dashboard/action-center",
  "/api/platform/reports/operations-summary",
]);

type TimedQueryOptions = {
  label?: string;
  warnMs?: number;
  metadata?: Record<string, unknown>;
};

function nowMs() {
  return Date.now();
}

export function normalizeDurationMs(startedAtMs: number) {
  return Math.max(0, nowMs() - startedAtMs);
}

export function compactSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().slice(0, 280);
}

export function stableSqlHash(sql: string) {
  let hash = 5381;
  const compact = compactSql(sql);
  for (let index = 0; index < compact.length; index += 1) {
    hash = ((hash << 5) + hash) ^ compact.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function shouldLogDuration(durationMs: number, thresholdMs: number) {
  return Number.isFinite(thresholdMs) && thresholdMs > 0 && durationMs >= thresholdMs;
}

function logSlowQuery(event: "slow_query" | "failed_query", sql: string, durationMs: number, options: TimedQueryOptions, error?: unknown) {
  const payload = {
    event,
    durationMs,
    thresholdMs: options.warnMs ?? DEFAULT_SLOW_QUERY_LOG_MS,
    label: options.label || "database.query",
    sqlHash: stableSqlHash(sql),
    sql: compactSql(sql),
    metadata: options.metadata || {},
    error: error instanceof Error ? error.message : undefined,
  };

  if (event === "failed_query") {
    console.error("[performance]", JSON.stringify(payload));
  } else {
    console.warn("[performance]", JSON.stringify(payload));
  }
}

export async function timedQuery<T = any>(pool: Pick<Pool, "query">, sql: string, values?: unknown[], options: TimedQueryOptions = {}) {
  const startedAt = nowMs();
  const warnMs = options.warnMs ?? DEFAULT_SLOW_QUERY_LOG_MS;
  try {
    const result = await pool.query(sql, values as any);
    const durationMs = normalizeDurationMs(startedAt);
    if (shouldLogDuration(durationMs, warnMs)) {
      logSlowQuery("slow_query", sql, durationMs, { ...options, warnMs });
    }
    return result as T;
  } catch (error) {
    const durationMs = normalizeDurationMs(startedAt);
    logSlowQuery("failed_query", sql, durationMs, { ...options, warnMs }, error);
    throw error;
  }
}

export function normalizeApiPath(pathOrUrl: string) {
  const withoutOrigin = String(pathOrUrl || "/").replace(/^https?:\/\/[^/]+/i, "");
  const pathOnly = (withoutOrigin.split("?")[0] || "/").trim() || "/";
  const normalized = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  return normalized.startsWith("/api") ? normalized : `/api${normalized}`;
}

export function normalizeApiCacheUrl(pathOrUrl: string) {
  const withoutOrigin = String(pathOrUrl || "/").replace(/^https?:\/\/[^/]+/i, "");
  const [pathPart, ...queryParts] = withoutOrigin.split("?");
  const path = normalizeApiPath(pathPart || "/");
  const query = queryParts.length ? `?${queryParts.join("?")}` : "";
  return `${path}${query}`;
}

export function isCacheableApiPath(path: string, prefixes: readonly string[] = PERFORMANCE_CACHEABLE_PREFIXES) {
  const normalized = normalizeApiPath(path);
  return prefixes.some((prefix) => normalized.startsWith(prefix));
}

export function createApiPerformanceMiddleware(options?: { slowResponseMs?: number }) {
  const slowResponseMs = options?.slowResponseMs ?? DEFAULT_SLOW_RESPONSE_LOG_MS;

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api")) return next();

    const startedAt = nowMs();
    const originalEnd = res.end.bind(res) as any;

    res.end = ((chunk?: any, encoding?: any, callback?: any) => {
      const durationMs = normalizeDurationMs(startedAt);
      if (!res.headersSent) {
        res.setHeader("X-Response-Time-Ms", String(durationMs));
      }

      if (shouldLogDuration(durationMs, slowResponseMs)) {
        console.warn("[performance]", JSON.stringify({
          event: "slow_response",
          method: req.method,
          path: req.originalUrl || req.url,
          statusCode: res.statusCode,
          durationMs,
          thresholdMs: slowResponseMs,
        }));
      }

      return originalEnd(chunk, encoding, callback);
    }) as any;

    return next();
  };
}
