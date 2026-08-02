import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { __securityHardeningForTests } from "../server/securityHardening";

const originalEnv = { ...process.env };

function withEnv(env: NodeJS.ProcessEnv, run: () => void) {
  process.env = { ...originalEnv };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    process.env = { ...originalEnv };
  }
}

test("Phase 7 rejects weak production JWT secrets", () => {
  withEnv({ NODE_ENV: "production", JWT_SECRET: "change-me-secret" }, () => {
    assert.equal(__securityHardeningForTests.isStrongJwtSecret("change-me-secret"), false);
    assert.throws(() => __securityHardeningForTests.resolveJwtSecret(), /JWT_SECRET/);
  });

  withEnv({ NODE_ENV: "production", JWT_SECRET: "8b9d0fa6a25d4a498e72dd0ac9be72ee6b4c" }, () => {
    assert.equal(__securityHardeningForTests.resolveJwtSecret(), "8b9d0fa6a25d4a498e72dd0ac9be72ee6b4c");
  });
});

test("Phase 7 production session cookies use strict secure options", () => {
  withEnv({ NODE_ENV: "production", SESSION_COOKIE_SECURE: undefined }, () => {
    const options = __securityHardeningForTests.getSessionCookieOptions();
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, "strict");
    assert.equal(options.path, "/");
  });
});

test("Phase 7 disables risky bootstrap and admin setup defaults in production", () => {
  withEnv({ NODE_ENV: "production", ADMIN_SETUP_ENABLED: "false", ALLOW_ENV_BOOTSTRAP_LOGIN: "false" }, () => {
    assert.equal(__securityHardeningForTests.isAdminSetupEnabled(), false);
    assert.equal(__securityHardeningForTests.canUseEnvironmentBootstrapLogin(), false);
  });

  withEnv({ NODE_ENV: "production", ADMIN_SETUP_ENABLED: "true", ALLOW_ENV_BOOTSTRAP_LOGIN: "true" }, () => {
    assert.equal(__securityHardeningForTests.isAdminSetupEnabled(), true);
    assert.equal(__securityHardeningForTests.canUseEnvironmentBootstrapLogin(), true);
  });
});

test("Phase 7 production admin setup token is not accepted from query string", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    const fromQuery = __securityHardeningForTests.adminSetupTokenFromRequest({ queryToken: "secret" });
    assert.equal(fromQuery.token, "");
    assert.equal(fromQuery.source, "none");

    const fromHeader = __securityHardeningForTests.adminSetupTokenFromRequest({ headerToken: "secret" });
    assert.equal(fromHeader.token, "secret");
    assert.equal(fromHeader.source, "header");
  });
});

test("Phase 7 Google OAuth redirect URI is constrained to configured app origins", () => {
  withEnv({ NODE_ENV: "production", APP_ORIGIN: "https://gym.example", GOOGLE_OAUTH_REDIRECT_URI: "https://gym.example/api/auth/google/callback" }, () => {
    assert.equal(
      __securityHardeningForTests.resolveOAuthRedirectUri("https://attacker.example/api/auth/google/callback"),
      "https://gym.example/api/auth/google/callback",
    );
    assert.equal(
      __securityHardeningForTests.resolveOAuthRedirectUri("https://gym.example/api/auth/google/callback"),
      "https://gym.example/api/auth/google/callback",
    );
  });
});

test("Phase 7 API docs are hidden by default in production", () => {
  withEnv({ NODE_ENV: "production", ENABLE_API_DOCS_IN_PRODUCTION: "false" }, () => {
    assert.equal(__securityHardeningForTests.shouldExposeApiDocs(), false);
  });
  withEnv({ NODE_ENV: "development" }, () => {
    assert.equal(__securityHardeningForTests.shouldExposeApiDocs(), true);
  });
});

test("Phase 7 server uses centralized security hardening helpers", () => {
  const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
  assert.match(server, /resolveJwtSecret\(\)/);
  assert.match(server, /getSessionCookieOptions\(\)/);
  assert.match(server, /canUseEnvironmentBootstrapLogin\(\)/);
  assert.match(server, /isAdminSetupEnabled\(\)/);
  assert.match(server, /shouldExposeApiDocs\(\)/);
  assert.match(server, /resolveOAuthRedirectUri\(req\.query\.redirect_uri\)/);
});
