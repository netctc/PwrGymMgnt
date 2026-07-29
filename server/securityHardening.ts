import type { Response } from "express";

const DEV_ONLY_JWT_SECRET = "dev-only-jwt-secret-change-me";

export const SESSION_COOKIE_NAME = "session_token";

function isTruthy(value: unknown) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function isProductionEnvironment() {
  return process.env.NODE_ENV === "production";
}

export function isStrongJwtSecret(secret: string) {
  const normalized = String(secret || "");
  if (normalized.length < 32) return false;
  if (normalized === DEV_ONLY_JWT_SECRET) return false;
  if (/change[-_ ]?me|default|secret|password/i.test(normalized)) return false;
  return true;
}

export function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET || "";
  if (isProductionEnvironment()) {
    if (!secret) {
      throw new Error("JWT_SECRET must be configured in production.");
    }
    if (!isStrongJwtSecret(secret)) {
      throw new Error("JWT_SECRET must be at least 32 characters and not use placeholder/default wording in production.");
    }
    return secret;
  }
  return secret || DEV_ONLY_JWT_SECRET;
}

export function canUseEnvironmentBootstrapLogin() {
  if (!isProductionEnvironment()) return true;
  return isTruthy(process.env.ALLOW_ENV_BOOTSTRAP_LOGIN);
}

export function isAdminSetupEnabled() {
  if (!isProductionEnvironment()) return true;
  return isTruthy(process.env.ADMIN_SETUP_ENABLED);
}

function useSecureSessionCookies() {
  if (process.env.SESSION_COOKIE_SECURE !== undefined) {
    return isTruthy(process.env.SESSION_COOKIE_SECURE);
  }
  return isProductionEnvironment();
}

export function getSessionCookieOptions(maxAgeMs = 8 * 60 * 60 * 1000) {
  return {
    httpOnly: true,
    secure: useSecureSessionCookies(),
    sameSite: isProductionEnvironment() ? "strict" as const : "lax" as const,
    maxAge: maxAgeMs,
    path: "/",
  };
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: useSecureSessionCookies(),
    sameSite: isProductionEnvironment() ? "strict" as const : "lax" as const,
    path: "/",
  });
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function configuredOrigins() {
  return [
    process.env.APP_ORIGIN,
    process.env.PUBLIC_APP_ORIGIN,
    process.env.VITE_APP_ORIGIN,
    ...(process.env.ALLOWED_ORIGINS || "").split(","),
  ]
    .map((origin) => normalizeOrigin(String(origin || "").trim()))
    .filter(Boolean);
}

export function isAllowedApplicationOrigin(origin: string) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (!isProductionEnvironment() && normalized.startsWith("http://localhost")) return true;
  return configuredOrigins().includes(normalized);
}

export function resolveOAuthRedirectUri(candidate: unknown) {
  const configuredBaseUrl = process.env.PUBLIC_APP_ORIGIN
    || process.env.API_PUBLIC_BASE_URL
    || process.env.DEPLOY_BASE_URL
    || `http://localhost:${process.env.PORT || 3000}`;
  const fallback = process.env.GOOGLE_OAUTH_REDIRECT_URI
    || `${String(configuredBaseUrl).replace(/\/+$/, "")}/api/auth/google/callback`;
  const raw = String(candidate || fallback).trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = new URL(fallback);
  }

  const isCallbackPath = parsed.pathname === "/api/auth/google/callback";
  const isAllowedOrigin = isAllowedApplicationOrigin(parsed.origin) || (!isProductionEnvironment() && parsed.hostname === "localhost");
  if (!isCallbackPath || !isAllowedOrigin) {
    const fallbackUrl = new URL(fallback);
    if (fallbackUrl.pathname === "/api/auth/google/callback") return fallbackUrl.toString();
    return fallbackUrl.toString();
  }

  return parsed.toString();
}

export function shouldExposeApiDocs() {
  if (!isProductionEnvironment()) return true;
  return isTruthy(process.env.ENABLE_API_DOCS_IN_PRODUCTION);
}

export function adminSetupTokenFromRequest(input: { headerToken?: unknown; queryToken?: unknown }) {
  const headerToken = String(input.headerToken || "");
  if (headerToken) return { token: headerToken, source: "header" as const };

  const queryToken = String(input.queryToken || "");
  if (queryToken && !isProductionEnvironment()) return { token: queryToken, source: "query" as const };

  return { token: "", source: "none" as const };
}

export const __securityHardeningForTests = {
  adminSetupTokenFromRequest,
  canUseEnvironmentBootstrapLogin,
  clearSessionCookie,
  getSessionCookieOptions,
  isAdminSetupEnabled,
  isAllowedApplicationOrigin,
  isProductionEnvironment,
  isStrongJwtSecret,
  resolveJwtSecret,
  resolveOAuthRedirectUri,
  shouldExposeApiDocs,
};
