import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function getAllowedOrigins(req: Request) {
  const configured = [
    process.env.APP_ORIGIN,
    process.env.PUBLIC_APP_ORIGIN,
    process.env.VITE_APP_ORIGIN,
    ...(process.env.ALLOWED_ORIGINS || "").split(","),
  ]
    .map((value) => normalizeOrigin(String(value || "").trim()))
    .filter(Boolean);

  const host = req.headers.host;
  if (host) {
    configured.push(`http://${host}`);
    configured.push(`https://${host}`);
  }

  return new Set(configured);
}

function getRequestOrigin(req: Request) {
  const origin = String(req.headers.origin || "").trim();
  if (origin) return normalizeOrigin(origin);

  const referer = String(req.headers.referer || "").trim();
  if (referer) return normalizeOrigin(referer);

  return "";
}

export function createMutationOriginGuard() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const requestOrigin = getRequestOrigin(req);
    const allowedOrigins = getAllowedOrigins(req);

    if (!requestOrigin) {
      if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ error: "Origin header is required for mutating requests" });
      }
      return next();
    }

    if (!allowedOrigins.has(requestOrigin)) {
      return res.status(403).json({ error: "Request origin is not allowed" });
    }

    return next();
  };
}
