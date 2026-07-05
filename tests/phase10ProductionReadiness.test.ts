import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { __productionReadinessForTests } from "../server/productionReadiness";
import { buildSmokeChecks } from "../scripts/deploy-utils.mjs";

test("Phase 10 production readiness summary blocks critical deployment gaps", () => {
  const result = __productionReadinessForTests.buildProductionReadinessSummary({
    nodeEnv: "production",
    packageName: "react-example",
    packageVersion: "0.0.0",
    uptimeSeconds: 10,
    dbConfigured: true,
    dbConnected: false,
    apiDocsExposed: false,
    compatibilityRecordsApiEnabled: false,
    supportedLocales: ["en", "fr", "ar"],
    routeMatrixCount: 40,
    moduleCount: 12,
    cacheablePrefixCount: 20,
    cacheEntries: 0,
    openApiArtifactExists: true,
  });

  assert.equal(result.summary.posture, "block");
  assert.ok(result.checks.some((check) => check.id === "database-connected" && check.ok === false && check.severity === "critical"));
});

test("Phase 10 production readiness endpoint is registered and permissioned", () => {
  const serverModuleRegistry = fs.readFileSync(path.join(process.cwd(), "server/modules.ts"), "utf8");
  const routePermissions = fs.readFileSync(path.join(process.cwd(), "server/routePermissions.ts"), "utf8");
  const readinessServer = fs.readFileSync(path.join(process.cwd(), "server/productionReadiness.ts"), "utf8");

  assert.match(serverModuleRegistry, /registerProductionReadinessRoutes/);
  assert.match(serverModuleRegistry, /production-readiness/);
  assert.match(readinessServer, /\/api\/platform\/production-readiness/);
  assert.match(readinessServer, /platform\.health\.detail/);
  assert.match(routePermissions, /\/api\/platform\/production-readiness/);
  assert.match(routePermissions, /platform\.health\.detail/);
});

test("Phase 10 API-first export and evidence scripts are registered", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  const openApiScript = fs.readFileSync(path.join(process.cwd(), "scripts/openapi-export.mjs"), "utf8");
  const evidenceScript = fs.readFileSync(path.join(process.cwd(), "scripts/production-readiness-report.mjs"), "utf8");

  assert.equal(packageJson.scripts["api:export"], "node scripts/openapi-export.mjs");
  assert.equal(packageJson.scripts["ops:production-readiness"], "node scripts/production-readiness-report.mjs");
  assert.match(packageJson.scripts["ops:release-readiness"], /api:export/);
  assert.match(packageJson.scripts["ops:release-readiness"], /ops:production-readiness/);
  assert.match(openApiScript, /swaggerJsdoc/);
  assert.match(openApiScript, /docs\/openapi\.json/);
  assert.match(evidenceScript, /production-readiness-evidence\.json/);
});

test("Phase 10 smoke checks include production readiness when requested", () => {
  const checks = buildSmokeChecks({ baseUrl: "https://gym.example", includeReadiness: true, includeDb: true });
  assert.ok(checks.some((check) => check.id === "production-readiness" && check.url === "https://gym.example/api/platform/production-readiness"));
  assert.ok(checks.some((check) => check.id === "deployment-readiness"));
});

test("Phase 10 documentation names release readiness commands", () => {
  const doc = fs.readFileSync(path.join(process.cwd(), "docs/PHASE10_CLOUD_API_PRODUCTION_EXCELLENCE.md"), "utf8");
  const delivery = fs.readFileSync(path.join(process.cwd(), "docs/DELIVERY_58_PHASE_10_CLOUD_API_PRODUCTION_EXCELLENCE.md"), "utf8");

  assert.match(doc, /npm run api:export/);
  assert.match(doc, /npm run ops:production-readiness/);
  assert.match(doc, /npm run ops:release-readiness/);
  assert.match(delivery, /Phase 10/);
});
