import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { validateBody } from "./validation";
import {
  createDeliveryRequestId,
  hasSuccessfulPasswordResetDelivery,
  sendPasswordResetDelivery,
  type PasswordResetDeliveryResult,
} from "./passwordResetDelivery";

type QueryablePool = {
  query: (sql: string, params?: unknown[]) => Promise<any>;
};

export type PasswordResetRouteOptions = {
  getPool: () => QueryablePool | null;
  originGuard?: RequestHandler;
  requestLimiter?: RequestHandler;
  confirmLimiter?: RequestHandler;
  tokenTtlMinutes?: number;
};

const TOKEN_BYTES = 32;
const DEFAULT_TOKEN_TTL_MINUTES = 30;
const GENERIC_REQUEST_MESSAGE = "If an account exists for that email, password reset instructions have been generated.";
const GENERIC_CONFIRM_ERROR = "Invalid or expired reset token.";

const emailSchema = z.string().trim().toLowerCase().email().max(255);
const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[!@#$%^&*()[\]{}\\|;:'\",.<>/?_=\-+`~]/, "Password must contain at least one special character");

const requestResetSchema = z.object({
  email: emailSchema,
});

const confirmResetSchema = z.object({
  token: z.string().trim().min(32).max(256),
  newPassword: passwordSchema,
});

function getTokenPepper() {
  const pepper = process.env.PASSWORD_RESET_TOKEN_PEPPER || process.env.JWT_SECRET;
  if (!pepper && process.env.NODE_ENV === "production") {
    throw new Error("PASSWORD_RESET_TOKEN_PEPPER or JWT_SECRET must be configured in production.");
  }
  return pepper || "dev-only-password-reset-pepper-change-me";
}

function formatMysqlDateTime(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function getClientIp(req: Request) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim();
  return (forwardedFor || req.ip || req.socket.remoteAddress || "").slice(0, 64);
}

function getUserAgent(req: Request) {
  return String(req.headers["user-agent"] || "").slice(0, 255);
}

export function normalizeResetEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateResetPasswordComplexity(password: string) {
  return passwordSchema.safeParse(password).success;
}

export function generatePasswordResetToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashPasswordResetToken(token: string) {
  return crypto.createHmac("sha256", getTokenPepper()).update(token).digest("hex");
}

export function hashPasswordForReset(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

async function addColumnIfMissing(pool: QueryablePool, table: string, column: string, definition: string) {
  const [rows]: any = await pool.query(
    "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column],
  );
  const exists = Array.isArray(rows) && Number(rows[0]?.count || 0) > 0;
  if (exists) return;

  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    const code = (error as any)?.code;
    if (code !== "ER_DUP_FIELDNAME" && code !== "ER_DUP_KEYNAME") {
      throw error;
    }
  }
}

export async function ensurePasswordResetTables(pool: QueryablePool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id VARCHAR(64) PRIMARY KEY,
      user_id INT NOT NULL,
      email VARCHAR(255) NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      revoked_at DATETIME NULL,
      requested_ip VARCHAR(64) NULL,
      requested_user_agent VARCHAR(255) NULL,
      delivery_request_id VARCHAR(64) NULL,
      delivery_channel VARCHAR(32) NULL,
      delivery_status VARCHAR(32) NULL,
      delivery_provider VARCHAR(64) NULL,
      delivery_last_error VARCHAR(512) NULL,
      delivered_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_password_reset_email (email),
      INDEX idx_password_reset_user (user_id),
      INDEX idx_password_reset_token_hash (token_hash),
      INDEX idx_password_reset_expires (expires_at),
      INDEX idx_password_reset_status (used_at, revoked_at),
      INDEX idx_password_reset_delivery_status (delivery_status),
      INDEX idx_password_reset_delivery_request (delivery_request_id)
    )
  `);

  await addColumnIfMissing(pool, "password_reset_tokens", "delivery_request_id", "VARCHAR(64) NULL");
  await addColumnIfMissing(pool, "password_reset_tokens", "delivery_channel", "VARCHAR(32) NULL");
  await addColumnIfMissing(pool, "password_reset_tokens", "delivery_status", "VARCHAR(32) NULL");
  await addColumnIfMissing(pool, "password_reset_tokens", "delivery_provider", "VARCHAR(64) NULL");
  await addColumnIfMissing(pool, "password_reset_tokens", "delivery_last_error", "VARCHAR(512) NULL");
  await addColumnIfMissing(pool, "password_reset_tokens", "delivered_at", "DATETIME NULL");

  await addColumnIfMissing(pool, "admin_users", "reset_phone", "VARCHAR(32) NULL");
  await addColumnIfMissing(pool, "admin_users", "reset_delivery_channel", "VARCHAR(32) NULL");

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

async function auditPasswordReset(pool: QueryablePool, action: string, details: Record<string, unknown>, performedBy = "auth-system") {
  try {
    await pool.query("INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)", [
      action,
      JSON.stringify(details),
      performedBy,
    ]);
  } catch (error) {
    console.error("Password reset audit logging failed", error);
  }
}


async function recordPasswordResetDelivery(pool: QueryablePool, resetTokenId: string, results: PasswordResetDeliveryResult[]) {
  const primary = results.find((result) => result.status === "sent") || results[0];
  if (!primary) return;

  try {
    await pool.query(
      `UPDATE password_reset_tokens
       SET delivery_channel = ?,
           delivery_status = ?,
           delivery_provider = ?,
           delivery_last_error = ?,
           delivered_at = CASE WHEN ? = 'sent' THEN UTC_TIMESTAMP() ELSE delivered_at END
       WHERE id = ?`,
      [
        primary.channel,
        primary.status,
        primary.provider,
        primary.message ? primary.message.slice(0, 512) : null,
        primary.status,
        resetTokenId,
      ],
    );
  } catch (error) {
    console.error("Password reset delivery status update failed", error);
  }
}

function getResetDeliveryPreview(rawToken: string, email: string) {
  if (process.env.NODE_ENV === "production" || process.env.PASSWORD_RESET_EXPOSE_DEV_TOKEN === "false") {
    return null;
  }

  return {
    email,
    token: rawToken,
    note: "Development preview only. In production, deliver this token through email/SMS and never return it in the API response.",
  };
}

async function requestPasswordReset(req: Request, res: Response, next: NextFunction, options: PasswordResetRouteOptions) {
  try {
    const pool = options.getPool();
    if (!pool) return res.status(503).json({ error: "Database not connected" });

    await ensurePasswordResetTables(pool);

    const email = normalizeResetEmail((req.body as { email: string }).email);
    const [rows]: any = await pool.query("SELECT id, email, role, reset_phone, reset_delivery_channel FROM admin_users WHERE LOWER(email) = ? LIMIT 1", [email]);

    if (!Array.isArray(rows) || rows.length === 0) {
      await auditPasswordReset(pool, "PASSWORD_RESET_REQUEST_NO_ACCOUNT", {
        email,
        ip: getClientIp(req),
        requestId: (req as any).requestId || null,
      });
      return res.json({ message: GENERIC_REQUEST_MESSAGE });
    }

    const user = rows[0];
    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const tokenTtlMinutes = Math.max(5, Math.min(options.tokenTtlMinutes || DEFAULT_TOKEN_TTL_MINUTES, 120));
    const expiresAt = new Date(Date.now() + tokenTtlMinutes * 60 * 1000);

    await pool.query(
      "UPDATE password_reset_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL",
      [user.id],
    );

    const resetTokenId = crypto.randomUUID();
    const deliveryRequestId = createDeliveryRequestId(email, tokenHash);

    await pool.query(
      `INSERT INTO password_reset_tokens (
        id, user_id, email, token_hash, expires_at, requested_ip, requested_user_agent, delivery_request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [resetTokenId, user.id, email, tokenHash, formatMysqlDateTime(expiresAt), getClientIp(req), getUserAgent(req), deliveryRequestId],
    );

    await auditPasswordReset(pool, "PASSWORD_RESET_REQUESTED", {
      email,
      userId: String(user.id),
      expiresAt: expiresAt.toISOString(),
      ip: getClientIp(req),
      deliveryRequestId,
      requestId: (req as any).requestId || null,
    });

    const deliveryResults = await sendPasswordResetDelivery({
      email,
      phone: user.reset_phone,
      token,
      expiresInMinutes: tokenTtlMinutes,
      requestedIp: getClientIp(req),
      userAgent: getUserAgent(req),
      preferredChannel: user.reset_delivery_channel,
    });
    await recordPasswordResetDelivery(pool, resetTokenId, deliveryResults);

    await auditPasswordReset(pool, "PASSWORD_RESET_DELIVERY_ATTEMPTED", {
      email,
      userId: String(user.id),
      resetTokenId,
      deliveryRequestId,
      delivered: hasSuccessfulPasswordResetDelivery(deliveryResults),
      results: deliveryResults.map(({ channel, provider, status, destination, providerMessageId, message }) => ({
        channel,
        provider,
        status,
        destination,
        providerMessageId: providerMessageId || null,
        message: message || null,
      })),
      requestId: (req as any).requestId || null,
    });

    const response: Record<string, unknown> = {
      message: GENERIC_REQUEST_MESSAGE,
      expiresInMinutes: tokenTtlMinutes,
    };

    if (process.env.NODE_ENV !== "production") {
      response.delivery = deliveryResults;
    }

    const deliveryPreview = getResetDeliveryPreview(token, email);
    if (deliveryPreview) response.deliveryPreview = deliveryPreview;

    return res.json(response);
  } catch (error) {
    return next(error);
  }
}

async function confirmPasswordReset(req: Request, res: Response, next: NextFunction, options: PasswordResetRouteOptions) {
  try {
    const pool = options.getPool();
    if (!pool) return res.status(503).json({ error: "Database not connected" });

    await ensurePasswordResetTables(pool);

    const { token, newPassword } = req.body as { token: string; newPassword: string };
    const tokenHash = hashPasswordResetToken(token);
    const [rows]: any = await pool.query(
      `SELECT id, user_id, email, expires_at, used_at, revoked_at
       FROM password_reset_tokens
       WHERE token_hash = ?
       LIMIT 1`,
      [tokenHash],
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: GENERIC_CONFIRM_ERROR });
    }

    const resetRecord = rows[0];
    const expiresAt = new Date(resetRecord.expires_at).getTime();
    const isExpired = Number.isFinite(expiresAt) && expiresAt <= Date.now();
    if (resetRecord.used_at || resetRecord.revoked_at || isExpired) {
      await auditPasswordReset(pool, "PASSWORD_RESET_REJECTED", {
        resetTokenId: resetRecord.id,
        email: resetRecord.email,
        reason: resetRecord.used_at ? "used" : resetRecord.revoked_at ? "revoked" : "expired",
        requestId: (req as any).requestId || null,
      });
      return res.status(400).json({ error: GENERIC_CONFIRM_ERROR });
    }

    const [userRows]: any = await pool.query("SELECT id, email FROM admin_users WHERE id = ? LIMIT 1", [resetRecord.user_id]);
    if (!Array.isArray(userRows) || userRows.length === 0) {
      await pool.query("UPDATE password_reset_tokens SET revoked_at = UTC_TIMESTAMP() WHERE id = ?", [resetRecord.id]);
      return res.status(400).json({ error: GENERIC_CONFIRM_ERROR });
    }

    const passwordHash = hashPasswordForReset(newPassword);
    await pool.query("UPDATE admin_users SET password_hash = ? WHERE id = ?", [passwordHash, resetRecord.user_id]);
    await pool.query("UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?", [resetRecord.id]);
    await pool.query(
      "UPDATE password_reset_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND id <> ? AND used_at IS NULL AND revoked_at IS NULL",
      [resetRecord.user_id, resetRecord.id],
    );

    await auditPasswordReset(pool, "PASSWORD_RESET_COMPLETED", {
      email: resetRecord.email,
      userId: String(resetRecord.user_id),
      resetTokenId: resetRecord.id,
      ip: getClientIp(req),
      requestId: (req as any).requestId || null,
    });

    return res.json({ message: "Password updated successfully. You can now sign in." });
  } catch (error) {
    return next(error);
  }
}

function chainHandlers(...handlers: RequestHandler[]) {
  return handlers.filter(Boolean);
}

export function registerPasswordResetRoutes(app: Express, options: PasswordResetRouteOptions) {
  const originGuard = options.originGuard || ((_req, _res, next) => next());
  const requestLimiter = options.requestLimiter || ((_req, _res, next) => next());
  const confirmLimiter = options.confirmLimiter || requestLimiter;

  app.post(
    "/api/auth/password-reset/request",
    ...chainHandlers(originGuard, requestLimiter, validateBody(requestResetSchema)),
    (req, res, next) => requestPasswordReset(req, res, next, options),
  );

  app.post(
    "/api/auth/password-reset/confirm",
    ...chainHandlers(originGuard, confirmLimiter, validateBody(confirmResetSchema)),
    (req, res, next) => confirmPasswordReset(req, res, next, options),
  );

  app.post("/api/auth/reset-password", originGuard, (_req, res) => {
    return res.status(410).json({
      error: "Legacy direct password reset is disabled. Use /api/auth/password-reset/request and /api/auth/password-reset/confirm.",
    });
  });
}
