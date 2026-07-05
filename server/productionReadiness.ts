import type { Express, Request, Response, NextFunction } from "express";
import type { Pool } from "mysql2/promise";
import fs from "fs";
import path from "path";
import { PERFORMANCE_CACHEABLE_PREFIXES } from "./performance";
import { API_ROUTE_PERMISSION_MATRIX } from "./routePermissions";
import { hasPermission } from "./rbac";

export type ProductionReadinessSeverity = "critical" | "warning" | "info";
export type ProductionReadinessStatus = "pass" | "warn" | "block";

export type ProductionReadinessCheck = {
  id: string;
  ok: boolean;
  severity: ProductionReadinessSeverity;
  message: string;
  recommendation?: string;
};

export type ProductionReadinessSummaryInput = {
  nodeEnv: string;
  packageName: string;
  packageVersion: string;
  uptimeSeconds: number;
  dbConfigured: boolean;
  dbConnected: boolean;
  apiDocsExposed: boolean;
  compatibilityRecordsApiEnabled: boolean;
  supportedLocales: readonly string[];
  routeMatrixCount: number;
  moduleCount: number;
  cacheablePrefixCount: number;
  cacheEntries: number;
  openApiArtifactExists: boolean;
};

function boolEnv(value: unknown, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function readPackageMetadata() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    return {
      packageName: String(packageJson.name || "powergym"),
      packageVersion: String(packageJson.version || "0.0.0"),
    };
  } catch {
    return { packageName: "powergym", packageVersion: "0.0.0" };
  }
}

function summarizePosture(checks: ProductionReadinessCheck[]) {
  const criticalFailed = checks.filter((check) => !check.ok && check.severity === "critical").length;
  const warningFailed = checks.filter((check) => !check.ok && check.severity === "warning").length;
  const failed = checks.filter((check) => !check.ok).length;
  const posture: ProductionReadinessStatus = criticalFailed > 0 ? "block" : warningFailed > 0 ? "warn" : "pass";
  return {
    posture,
    total: checks.length,
    failed,
    criticalFailed,
    warningFailed,
  };
}

export function buildProductionReadinessSummary(input: ProductionReadinessSummaryInput) {
  const production = input.nodeEnv === "production";
  const checks: ProductionReadinessCheck[] = [];
  const add = (id: string, ok: boolean, severity: ProductionReadinessSeverity, message: string, recommendation?: string) => {
    checks.push({ id, ok, severity, message, recommendation });
  };

  add(
    "runtime-environment",
    Boolean(input.nodeEnv),
    "critical",
    `Runtime environment is ${input.nodeEnv || "not set"}.`,
    "Set NODE_ENV explicitly for every deployment target.",
  );
  add(
    "database-configured",
    input.dbConfigured,
    "critical",
    input.dbConfigured ? "Database configuration is present." : "Database configuration is incomplete.",
    "Set DATABASE_HOSTNAME, DATABASE_USER_NAME, DATABASE_PASSWORD and DATABASE_NAME.",
  );
  add(
    "database-connected",
    input.dbConnected,
    "critical",
    input.dbConnected ? "Database connection is available." : "Database connection is not available.",
    "Run npm run db:diagnose, verify network access, credentials and MySQL availability.",
  );
  add(
    "api-docs-production-exposure",
    !production || !input.apiDocsExposed,
    "warning",
    production && input.apiDocsExposed ? "Interactive API docs are exposed in production." : "Interactive API docs exposure is controlled.",
    "Keep ENABLE_API_DOCS_IN_PRODUCTION=false unless documentation is protected by an additional access layer.",
  );
  add(
    "compat-records-api-production",
    !production || !input.compatibilityRecordsApiEnabled,
    "warning",
    production && input.compatibilityRecordsApiEnabled ? "Deprecated /api/records compatibility API is enabled in production." : "Deprecated compatibility API is not exposed by default in production.",
    "Continue migrating remaining clients to typed APIs and keep ENABLE_COMPAT_RECORDS_API=false in production.",
  );
  add(
    "route-permission-matrix",
    input.routeMatrixCount >= 20,
    "critical",
    `${input.routeMatrixCount} protected route-permission entries are registered.`,
    "Keep server/routePermissions.ts updated when adding or changing protected endpoints.",
  );
  add(
    "module-registry",
    input.moduleCount >= 10,
    "critical",
    `${input.moduleCount} application route modules are registered.`,
    "Register new backend modules through server/modules.ts rather than directly in server.ts.",
  );
  add(
    "api-cache-coverage",
    input.cacheablePrefixCount >= 15,
    "info",
    `${input.cacheablePrefixCount} read-heavy API prefixes are cache-aware; current in-memory entries: ${input.cacheEntries}.`,
    "Review cache prefixes after each new read-heavy endpoint and keep cache actor-aware.",
  );
  add(
    "localization-foundation",
    input.supportedLocales.includes("en") && input.supportedLocales.includes("fr") && input.supportedLocales.includes("ar"),
    "info",
    `Supported locales: ${input.supportedLocales.join(", ") || "none"}.`,
    "Use the Phase 8 translation utilities for all new UI strings.",
  );
  add(
    "openapi-artifact",
    input.openApiArtifactExists,
    "warning",
    input.openApiArtifactExists ? "OpenAPI artifact exists for API-first consumers." : "OpenAPI artifact has not been exported yet.",
    "Run npm run api:export before release and publish docs/openapi.json with the release evidence.",
  );

  return {
    generatedAt: new Date().toISOString(),
    application: {
      name: input.packageName,
      version: input.packageVersion,
      uptimeSeconds: input.uptimeSeconds,
      environment: input.nodeEnv,
    },
    summary: summarizePosture(checks),
    checks,
    modules: [],
    api: {
      routeMatrixCount: input.routeMatrixCount,
      cacheablePrefixCount: input.cacheablePrefixCount,
      supportedLocales: input.supportedLocales,
    },
  };
}

function getSupportedLocalesFromSource() {
  const configPath = path.join(process.cwd(), "src", "i18n", "config.ts");
  try {
    const source = fs.readFileSync(configPath, "utf8");
    const matches = Array.from(source.matchAll(/code:\s*["']([^"']+)["']/g)).map((match) => match[1]);
    return matches.length ? matches : ["en"];
  } catch {
    return ["en"];
  }
}

function ensureProductionObserver(req: Request, res: Response, next: NextFunction) {
  if (!hasPermission(req as any, "platform.health.detail")) {
    return res.status(403).json({ error: "Platform health detail permission required" });
  }
  return next();
}

export function registerProductionReadinessRoutes(
  app: Express,
  poolProvider: () => Pool | null,
  cacheControl?: { stats: () => { entries?: number } },
  options?: { getModuleSummary?: () => Array<Record<string, unknown>> },
) {
  app.get("/api/platform/production-readiness", ensureProductionObserver, async (_req, res) => {
    const packageMetadata = readPackageMetadata();
    const production = process.env.NODE_ENV === "production";
    const compatibilityEnabled = boolEnv(process.env.ENABLE_COMPAT_RECORDS_API) && !boolEnv(process.env.DISABLE_COMPAT_RECORDS_API);
    const apiDocsExposed = production ? boolEnv(process.env.ENABLE_API_DOCS_IN_PRODUCTION) : true;
    const dbConnected = Boolean(poolProvider());
    const dbConfigured = Boolean(
      (process.env.DATABASE_HOSTNAME || process.env.DB_HOST)
      && (process.env.DATABASE_USER_NAME || process.env.DB_USER)
      && (process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD)
      && (process.env.DATABASE_NAME || process.env.DB_NAME),
    );
    const cacheEntries = Number(cacheControl?.stats?.().entries || 0);
    const supportedLocales = getSupportedLocalesFromSource();
    const openApiArtifactExists = fs.existsSync(path.join(process.cwd(), "docs", "openapi.json"));
    const moduleSummary = options?.getModuleSummary?.() || [];

    const payload = buildProductionReadinessSummary({
      ...packageMetadata,
      nodeEnv: process.env.NODE_ENV || "development",
      uptimeSeconds: Math.round(process.uptime()),
      dbConfigured,
      dbConnected,
      apiDocsExposed,
      compatibilityRecordsApiEnabled: compatibilityEnabled,
      supportedLocales,
      routeMatrixCount: API_ROUTE_PERMISSION_MATRIX.length,
      moduleCount: moduleSummary.length,
      cacheablePrefixCount: PERFORMANCE_CACHEABLE_PREFIXES.length,
      cacheEntries,
      openApiArtifactExists,
    });
    res.json({ ...payload, modules: moduleSummary });
  });
}

export const __productionReadinessForTests = {
  buildProductionReadinessSummary,
};
