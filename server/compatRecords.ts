import type { Request, Response, NextFunction } from "express";

export const COMPAT_RECORDS_DEFAULT_LIMIT = 100;
export const COMPAT_RECORDS_MAX_LIMIT = 500;

export type CompatibilityRecordsPagination = {
  limit: number;
  offset: number;
};

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstQueryValue(value[0]);
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function parsePositiveInteger(value: unknown, fallback: number) {
  const raw = firstQueryValue(value);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parseCompatibilityRecordsPagination(query: Request["query"]): CompatibilityRecordsPagination {
  const requestedLimit = parsePositiveInteger(query.limit, COMPAT_RECORDS_DEFAULT_LIMIT);
  const page = parsePositiveInteger(query.page, 0);
  const explicitOffset = firstQueryValue(query.offset) !== undefined;
  const offset = explicitOffset
    ? parsePositiveInteger(query.offset, 0)
    : page > 1
      ? (page - 1) * Math.min(requestedLimit, COMPAT_RECORDS_MAX_LIMIT)
      : 0;

  return {
    limit: Math.min(Math.max(requestedLimit, 1), COMPAT_RECORDS_MAX_LIMIT),
    offset,
  };
}

export function isCompatibilityRecordsApiEnabled(env: NodeJS.ProcessEnv = process.env) {
  const explicitDisable = String(env.DISABLE_COMPAT_RECORDS_API || "").toLowerCase() === "true";
  if (explicitDisable) return false;

  const explicitEnable = String(env.ENABLE_COMPAT_RECORDS_API || "").toLowerCase() === "true";
  if (env.NODE_ENV === "production") return explicitEnable;

  return true;
}

export function compatibilityRecordsDeprecationHeaders() {
  return {
    Deprecation: "true",
    Warning: '299 - "Deprecated compatibility records API; migrate to typed domain APIs."',
    "X-Compatibility-Api": "deprecated",
  };
}

export function requireCompatibilityRecordsApiEnabled(req: Request, res: Response, next: NextFunction) {
  if (!isCompatibilityRecordsApiEnabled()) {
    return res.status(410).json({
      error: "Compatibility records API is disabled",
      remediation: "Use typed, permission-scoped domain APIs or set ENABLE_COMPAT_RECORDS_API=true temporarily during migration.",
    });
  }

  return next();
}
