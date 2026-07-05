import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { __observabilityForTests } from "../server/observability";

test("Phase 6 redacts sensitive fields before logs and audit details are written", () => {
  const redacted = __observabilityForTests.redactSensitive({
    email: "admin@example.com",
    password: "secret-password",
    nested: {
      resetToken: "reset-token",
      apiKey: "api-key",
      safe: "visible",
    },
  }) as any;

  assert.equal(redacted.email, "admin@example.com");
  assert.equal(redacted.password, "[REDACTED]");
  assert.equal(redacted.nested.resetToken, "[REDACTED]");
  assert.equal(redacted.nested.apiKey, "[REDACTED]");
  assert.equal(redacted.nested.safe, "visible");
});

test("Phase 6 user action audit has explicit success and failure action names", () => {
  assert.equal(__observabilityForTests.buildAction("POST", 201), "USER_ACTION_POST_SUCCESS");
  assert.equal(__observabilityForTests.buildAction("DELETE", 403), "USER_ACTION_DELETE_FAILED");
});

test("Phase 6 skips noisy audit endpoints but preserves operational mutations", () => {
  assert.equal(__observabilityForTests.shouldSkipAudit("/api/platform/audit-logs", ["/api/platform/audit-logs"]), true);
  assert.equal(__observabilityForTests.shouldSkipAudit("/api/warehouse/products", ["/api/platform/audit-logs"]), false);
});

test("Phase 6 replaces legacy generic API audit middleware with structured observability hooks", () => {
  const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
  assert.doesNotMatch(server, /API Request Logger Middleware/);
  assert.match(server, /createApiStructuredLogMiddleware\(\)/);
  assert.match(server, /app\.use\(createUserActionAuditMiddleware\(\(\) => pool\)\)/);
  assert.match(server, /app\.use\(createApiAuditMiddleware\(\(\) => pool\)\)/);
});

test("Phase 6 platform observability summary endpoint is registered", () => {
  const platformSecurity = fs.readFileSync(path.join(process.cwd(), "server", "platformSecurity.ts"), "utf8");
  assert.match(platformSecurity, /\/api\/platform\/observability\/summary/);
  assert.match(platformSecurity, /totalUserActions/);
  assert.match(platformSecurity, /security_audit_events/);
  assert.match(platformSecurity, /audit_logs/);
});

test("Phase 6 package scripts include observability tests", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  assert.match(pkg.scripts.test, /tests\/phase6Observability\.test\.ts/);
  assert.match(pkg.scripts["test:ci"], /tests\/phase6Observability\.test\.ts/);
});


test("Phase 11B expected unauthenticated probes are logged as info, not warnings", () => {
  assert.equal(__observabilityForTests.isExpectedUnauthenticatedProbe("GET", "/api/auth/me", 401), true);
  assert.equal(__observabilityForTests.isExpectedUnauthenticatedProbe("GET", "/api/engagement/notifications", 401), true);
  assert.equal(__observabilityForTests.requestLogLevel("GET", "/api/auth/me", 401), "info");
  assert.equal(__observabilityForTests.requestLogLevel("GET", "/api/engagement/notifications", 401), "info");
  assert.equal(__observabilityForTests.requestLogLevel("POST", "/api/finance/transactions", 401), "warn");
});
