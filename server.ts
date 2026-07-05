import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import mysql from "mysql2/promise";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import cron from "node-cron";
import { exec } from "child_process";
import fs from "fs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { registerApplicationRouteModules } from "./server/modules";
import { ensureUserManagementTables, registerUserManagementRoutes } from "./server/userManagement";
import { createMutationOriginGuard } from "./server/originGuard";
import { registerPasswordResetRoutes } from "./server/passwordReset";
import { type AuthenticatedRequest, hasPermission, normalizeAppRole, requirePermission } from "./server/rbac";
import { createApiPerformanceMiddleware } from "./server/performance";
import { appLogger, createApiStructuredLogMiddleware, createUserActionAuditMiddleware } from "./server/observability";
import {
  createApiAuditMiddleware,
  createApiCacheMiddleware,
  requestContext,
  securityHeaders,
} from "./server/platformSecurity";
import {
  SESSION_COOKIE_NAME,
  adminSetupTokenFromRequest,
  canUseEnvironmentBootstrapLogin,
  clearSessionCookie,
  getSessionCookieOptions,
  isAdminSetupEnabled,
  resolveJwtSecret,
  resolveOAuthRedirectUri,
  shouldExposeApiDocs,
} from "./server/securityHardening";

import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

type DatabaseConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  waitForConnections: boolean;
  connectionLimit: number;
  queueLimit: number;
  connectTimeout: number;
  enableKeepAlive: boolean;
  keepAliveInitialDelay: number;
};

const JWT_SECRET = resolveJwtSecret();

function envFirst(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function getDatabaseConfig(): DatabaseConfig {
  return {
    host: envFirst("DATABASE_HOSTNAME", "DB_HOST"),
    port: Number(envFirst("DATABASE_PORT", "DB_PORT") || 3306),
    user: envFirst("DATABASE_USER_NAME", "DB_USER"),
    password: envFirst("DATABASE_PASSWORD", "DB_PASSWORD"),
    database: envFirst("DATABASE_NAME", "DB_NAME"),
    waitForConnections: true,
    connectionLimit: Number(envFirst("DATABASE_CONNECTION_LIMIT", "DB_CONNECTION_LIMIT") || 10),
    queueLimit: 0,
    connectTimeout: Number(envFirst("DATABASE_CONNECT_TIMEOUT_MS", "DB_CONNECT_TIMEOUT_MS") || 10000),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };
}

function getMissingDatabaseConfig(config: DatabaseConfig) {
  return [
    ["DATABASE_HOSTNAME or DB_HOST", config.host],
    ["DATABASE_USER_NAME or DB_USER", config.user],
    ["DATABASE_PASSWORD or DB_PASSWORD", config.password],
    ["DATABASE_NAME or DB_NAME", config.database],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

function formatDatabaseError(error: unknown) {
  const err = error as any;
  const code = err?.code ? `${err.code}` : "UNKNOWN";
  const message = err?.message ? `${err.message}` : String(error);
  return `${code}: ${message}`;
}

function isRecoverableDatabaseConnectionError(error: unknown) {
  const code = (error as any)?.code;
  return [
    "PROTOCOL_CONNECTION_LOST",
    "ECONNRESET",
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    "EPIPE",
  ].includes(code);
}

async function createVerifiedDatabasePool(config: DatabaseConfig) {
  let createdPool: mysql.Pool | null = null;
  try {
    createdPool = mysql.createPool(config);
    await createdPool.query("SELECT 1");
    return { pool: createdPool, error: null as string | null };
  } catch (error) {
    if (createdPool) {
      await createdPool.end().catch(() => undefined);
    }
    return { pool: null, error: formatDatabaseError(error) };
  }
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function timingSafeTextCompare(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifyPassword(password: string, storedPassword: string) {
  if (!password || !storedPassword) return false;

  if (storedPassword.startsWith("scrypt$")) {
    const [, salt, expectedHash] = storedPassword.split("$");
    if (!salt || !expectedHash) return false;
    const actualHash = crypto.scryptSync(password, salt, 64).toString("hex");
    return timingSafeTextCompare(actualHash, expectedHash);
  }

  // Temporary compatibility with pre-implementation plaintext values.
  // Successful login upgrades the stored value to a scrypt hash.
  return timingSafeTextCompare(password, storedPassword);
}

function isLegacyPlaintextPassword(storedPassword: string) {
  return Boolean(storedPassword && !storedPassword.startsWith("scrypt$"));
}

function shellQuote(value: string) {
  return "'" + value.replace(/'/g, "'\"'\"'") + "'";
}


async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // Trust the reverse proxy (Cloud Run / NGINX)
  app.set("trust proxy", 1);

  app.use(requestContext());
  app.use(securityHeaders());
  app.use(createApiPerformanceMiddleware({ slowResponseMs: Number(process.env.SLOW_RESPONSE_LOG_MS || 1500) }));
  app.use(createApiStructuredLogMiddleware());

  // Rate Limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
    standardHeaders: true,
    legacyHeaders: false
  });

  // Apply rate limiter to /api routes
  app.use("/api/", apiLimiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication attempts. Please try again later." },
  });

  // Middleware
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // Database Connection
  const dbConfig = getDatabaseConfig();
  const missingDbConfig = getMissingDatabaseConfig(dbConfig);

  let pool: mysql.Pool | null = null;
  let dbConnectionError: string | null = null;
  let lastDbConnectAttemptAt = 0;

  async function connectToDatabase(reason: "startup" | "reconnect" = "startup") {
    if (missingDbConfig.length > 0) {
      dbConnectionError = `Missing database environment variables: ${missingDbConfig.join(", ")}`;
      console.warn(
        `MySQL is not configured. Missing: ${missingDbConfig.join(", ")}. ` +
          "API routes that require the database will return 503 until these variables are set.",
      );
      return;
    }

    lastDbConnectAttemptAt = Date.now();
    const result = await createVerifiedDatabasePool(dbConfig);
    pool = result.pool;
    dbConnectionError = result.error;

    if (pool) {
      console.log(
        `Connected to MySQL Database: ${dbConfig.database} at ${dbConfig.host}:${dbConfig.port} (${reason})`,
      );
    } else {
      console.error(`Failed to connect to MySQL (${reason}): ${dbConnectionError}`);
    }
  }

  await connectToDatabase("startup");
  
  // Ensure tables exist on boot
  if (pool) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          action VARCHAR(255) NOT NULL,
          details TEXT,
          performed_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS members (
          id VARCHAR(255) PRIMARY KEY,
          first_name VARCHAR(100),
          last_name VARCHAR(100),
          email VARCHAR(255),
          phone VARCHAR(50),
          status VARCHAR(50) DEFAULT 'active',
          join_date DATETIME,
          plan VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          data JSON
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS staff (
          id VARCHAR(255) PRIMARY KEY,
          first_name VARCHAR(100),
          last_name VARCHAR(100),
          email VARCHAR(255),
          role VARCHAR(100),
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          data JSON
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS hr (
          id VARCHAR(255) PRIMARY KEY,
          employee_id VARCHAR(255),
          type VARCHAR(100),
          amount DECIMAL(10,2),
          date DATETIME,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          data JSON
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS accounting (
          id VARCHAR(255) PRIMARY KEY,
          transaction_type VARCHAR(50),
          amount DECIMAL(10,2),
          date DATETIME,
          category VARCHAR(100),
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          data JSON
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(255) PRIMARY KEY,
          email VARCHAR(255),
          role VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          data JSON
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS classes (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255),
          instructor_id VARCHAR(255),
          start_time DATETIME,
          end_time DATETIME,
          capacity INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          data JSON
        )
      `);
    } catch (e) {
      console.error("Setup error", e);
    }
  }

  // Phase 6 structured security audit logging. Mounted before routes so auth, password-reset,
  // and protected API requests receive request IDs and security_audit_events entries.
  app.use(createApiAuditMiddleware(() => pool));

  // Swagger configuration
  const swaggerOptions = {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Gym Management API",
        version: "1.0.0",
        description: "API documentation for the gym management system",
      },
      servers: [
        {
          url: `http://localhost:${PORT}`,
        },
      ],
    },
    apis: ["server.ts", "./server.ts", "server/**/*.ts", "./server/**/*.ts"],
  };
  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  if (shouldExposeApiDocs()) {
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  } else {
    app.use("/api-docs", (_req, res) => res.status(404).json({ error: "API documentation is not exposed in this environment" }));
  }

  let healthHistory: boolean[] = [];
  let poorHealthStartTime = 0;

  // DB Monitoring and reconnect
  setInterval(async () => {
    if (missingDbConfig.length > 0) return;

    if (!pool) {
      if (Date.now() - lastDbConnectAttemptAt > 30000) {
        await connectToDatabase("reconnect");
      }
      return;
    }

    let isSuccess = false;
    try {
      await pool.query("SELECT 1");
      isSuccess = true;
      dbConnectionError = null;
    } catch (error) {
      dbConnectionError = formatDatabaseError(error);
      console.error("Database connection check failed!", dbConnectionError);
      if (isRecoverableDatabaseConnectionError(error)) {
        const failedPool = pool;
        pool = null;
        await failedPool.end().catch(() => undefined);
      }
    }

    healthHistory.push(isSuccess);
    if (healthHistory.length > 10) {
      healthHistory.shift();
    }

    const successCount = healthHistory.filter((h) => h).length;
    const healthRatio = healthHistory.length > 0 ? successCount / healthHistory.length : 1;

    if (healthRatio < 0.5) {
      if (poorHealthStartTime === 0) poorHealthStartTime = Date.now();
    } else {
      poorHealthStartTime = 0;
    }
  }, 10000); // Check every 10 seconds

  // Automated DB Backup (Runs every day at 00:00)
  cron.schedule("0 0 * * *", () => {
    const backupDir = path.join(process.cwd(), "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);

    if (missingDbConfig.length > 0) {
      console.warn("Backup skipped because database configuration is incomplete.");
      return;
    }

    const dumpCmd = `mysqldump -h ${shellQuote(dbConfig.host)} -P ${shellQuote(String(dbConfig.port))} -u ${shellQuote(dbConfig.user)} ${shellQuote(dbConfig.database)} > ${shellQuote(backupFile)}`;

    exec(dumpCmd, { env: { ...process.env, MYSQL_PWD: dbConfig.password } }, (error, stdout, stderr) => {
      if (error) {
        console.error("Backup failed:");
        console.error(error.message);
      } else {
        console.log(`Database backup successful: ${backupFile}`);
        // Clean up backups older than 30 days
        try {
          const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
          fs.readdirSync(backupDir).forEach((file) => {
            if (file.endsWith(".sql")) {
              const filePath = path.join(backupDir, file);
              const stats = fs.statSync(filePath);
              if (stats.mtimeMs < thirtyDaysAgo) {
                fs.unlinkSync(filePath);
                console.log(`Deleted backup older than 30 days: ${file}`);
              }
            }
          });
        } catch (cleanupError) {
          console.error("Failed to clean up old backups:", cleanupError);
        }
      }
    });
  });

  /**
   * @swagger
   * /api/health:
   *   get:
   *     summary: Check API health
   *     responses:
   *       200:
   *         description: Status ok
   */
  app.get("/api/health", (req, res) => {
    res.json({
      status: pool ? "ok" : missingDbConfig.length > 0 ? "degraded" : "starting",
      dbConfigured: missingDbConfig.length === 0,
      dbConnected: Boolean(pool),
      environment: process.env.NODE_ENV || "development",
      requestId: (req as any).requestId || null,
    });
  });

  async function resolveSessionUserFromToken(decodedUser: any) {
    const uid = String(decodedUser?.uid || "");
    const fallbackRole = normalizeAppRole(decodedUser?.role);
    if (!uid || !fallbackRole) {
      return { errorStatus: 403, error: "Session role is invalid" as const };
    }

    if (pool && /^\d+$/.test(uid)) {
      try {
        const [rows]: any = await pool.query(
          "SELECT id, email, role, status, employee_id FROM admin_users WHERE id = ? LIMIT 1",
          [Number(uid)],
        );
        if (rows.length > 0) {
          const status = String(rows[0].status || "active").toLowerCase();
          if (status !== "active") {
            return { errorStatus: 403, error: "This account is not active. Please contact an administrator." as const };
          }
          const latestRole = normalizeAppRole(rows[0].role);
          if (!latestRole) return { errorStatus: 403, error: "Session role is invalid" as const };
          return {
            user: {
              uid: String(rows[0].id || uid),
              email: String(rows[0].email || decodedUser?.email || ""),
              role: latestRole,
              employeeId: rows[0].employee_id || null,
            },
          };
        }
      } catch (error) {
        console.error("Failed to refresh session role from admin_users", error);
      }
    }

    return {
      user: {
        uid,
        email: String(decodedUser?.email || ""),
        role: fallbackRole,
        employeeId: decodedUser?.employeeId || null,
      },
    };
  }

  // --- Authentication API ---
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      const normalizedEmail = email?.trim().toLowerCase();

      if (!normalizedEmail || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const adminEmail = (process.env.VITE_SUPER_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL || "")
        .trim()
        .toLowerCase();
      const adminPassword = process.env.VITE_SUPER_ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || "";

      let user: { uid: string; email: string; role: string; employeeId?: string | null } | null = null;

      if (pool) {
        await ensureUserManagementTables(pool);

        const [rows]: any = await pool.query(
          "SELECT * FROM admin_users WHERE LOWER(email) = ? OR LOWER(COALESCE(username, '')) = ? LIMIT 1",
          [normalizedEmail, normalizedEmail],
        );

        if (rows.length > 0 && verifyPassword(password, rows[0].password_hash)) {
          const status = String(rows[0].status || "active").toLowerCase();
          if (status !== "active") {
            return res.status(403).json({ error: "This account is not active. Please contact an administrator." });
          }

          if (isLegacyPlaintextPassword(rows[0].password_hash)) {
            await pool.query("UPDATE admin_users SET password_hash = ?, password_changed_at = COALESCE(password_changed_at, NOW()) WHERE id = ?", [
              hashPassword(password),
              rows[0].id,
            ]);
          }

          await pool.query("UPDATE admin_users SET last_login_at = NOW() WHERE id = ?", [rows[0].id]);

          const normalizedRole = normalizeAppRole(rows[0].role) || "staff";
          user = {
            uid: rows[0].id.toString(),
            email: rows[0].email,
            role: normalizedRole,
            employeeId: rows[0].employee_id || null,
          };
        }
      }

      // Bootstrap fallback for first local setup only. Prefer /api/admin-setup to persist the user in MySQL.
      if (!user && canUseEnvironmentBootstrapLogin() && adminEmail && adminPassword && normalizedEmail === adminEmail && verifyPassword(password, adminPassword)) {
        user = { uid: "super-admin-bootstrap", email: adminEmail, role: "super_admin", employeeId: null };
      }

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign(user, JWT_SECRET, { expiresIn: "8h" });

      res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

      res.json({ message: "Login successful", user });
    } catch (e: any) {
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    clearSessionCookie(res);
    res.json({ message: "Logout successful" });
  });

  app.get("/api/auth/me", (req, res) => {
    const token = req.cookies[SESSION_COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "No session" });
    
    jwt.verify(token, JWT_SECRET, async (err: any, user: any) => {
      if (err) return res.status(403).json({ error: "Invalid session" });
      const resolved = await resolveSessionUserFromToken(user);
      if (resolved.error) return res.status(resolved.errorStatus || 403).json({ error: resolved.error });
      res.json({ user: resolved.user, exp: user.exp });
    });
  });

  app.post("/api/auth/refresh", (req, res) => {
    const token = req.cookies[SESSION_COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "No session" });
    
    jwt.verify(token, JWT_SECRET, async (err: any, user: any) => {
      if (err) return res.status(403).json({ error: "Invalid session" });
      const resolved = await resolveSessionUserFromToken(user);
      if (resolved.error) return res.status(resolved.errorStatus || 403).json({ error: resolved.error });
      const userData = resolved.user;
      const newToken = jwt.sign(userData, JWT_SECRET, { expiresIn: '8h' });
      
      res.cookie(SESSION_COOKIE_NAME, newToken, getSessionCookieOptions());
      
      res.json({ message: "Session refreshed", user: userData });
    });
  });

  app.get("/api/auth/google/url", (req, res) => {
    const redirectUri = resolveOAuthRedirectUri(req.query.redirect_uri);
    const params = new URLSearchParams({
      client_id: process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || 'mock_client_id_for_preview',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'email profile',
      access_type: 'offline',
      prompt: 'consent'
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send("No code provided.");
    }
    
    try {
      let email = "google-user@example.com";
      let name = "Google User";
      let uid = `google-${Date.now()}`;
      
      const clientId = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      if (clientId && clientSecret && clientId !== 'mock_client_id_for_preview') {
         // Real OAuth Exchange
         // You would typically use fetch here to POST to https://oauth2.googleapis.com/token
         // and then GET https://www.googleapis.com/oauth2/v2/userinfo
         // For brevity, this placeholder is retained for local development until the exchange is wired.
      } else {
         if (process.env.NODE_ENV === "production") {
           return res.status(503).send("Google OAuth is not configured.");
         }
         // Mock behavior is restricted to non-production preview environments.
         email = "mock-google-" + Math.floor(Math.random()*1000) + "@domain.com";
      }

      if (pool) {
         // Check if user exists in admin_users (canonical table since migration 023)
         const [rows]: any = await pool.query("SELECT * FROM admin_users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))", [email]);
         let userRec = rows.length > 0 ? rows[0] : null;
         
         if (!userRec) {
            // Create a locked admin_users stub — requires password reset before login
            await pool.query(
              "INSERT INTO admin_users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)",
              [name || email, email, `$locked$${require('crypto').createHash('sha256').update(uid).digest('hex')}`, 'client', 'active']
            );
            const [newRows]: any = await pool.query("SELECT * FROM admin_users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))", [email]);
            userRec = newRows[0] || { id: null, email, role: 'client' };
         }
         uid = String(userRec.id || uid);
         
         const userSession = { uid, email, role: normalizeAppRole(userRec.role) || "client" };
         const token = jwt.sign(userSession, JWT_SECRET, { expiresIn: '8h' });
         
         res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
      }

      const oauthTargetOrigin = process.env.APP_ORIGIN || process.env.PUBLIC_APP_ORIGIN || process.env.VITE_APP_ORIGIN || "";

      // Return a popup closer html
      res.send(`
        <html>
          <body>
            <script>
              const targetOrigin = ${JSON.stringify(oauthTargetOrigin)} || window.location.origin;
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, targetOrigin);
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (e: any) {
      res.status(500).send("OAuth authentication failed.");
    }
  });

  const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many password reset attempts. Please try again later." },
  });

  registerPasswordResetRoutes(app, {
    getPool: () => pool,
    originGuard: createMutationOriginGuard(),
    requestLimiter: passwordResetLimiter,
    confirmLimiter: authLimiter,
    tokenTtlMinutes: Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 30),
  });

  // Auth Middleware for protected routes
  const authenticateJWT = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    const apiPath = (req.originalUrl || req.url || "").split("?")[0];
    if (apiPath.startsWith("/api/auth/") || apiPath === "/api/health" || apiPath === "/api/admin-setup") {
       return next();
    }
    const token = req.cookies[SESSION_COOKIE_NAME];
    
    if (token) {
      jwt.verify(token, JWT_SECRET, async (err: any, user: any) => {
        if (err) {
          return res.status(403).json({ error: "Session expired or invalid" });
        }

        const resolved = await resolveSessionUserFromToken(user);
        if (resolved.error) {
          return res.status(resolved.errorStatus || 403).json({ error: resolved.error });
        }

        (req as any).user = resolved.user;
        next();
      });
    } else {
      res.status(401).json({ error: "Authentication required" });
    }
  };

  app.use("/api", authenticateJWT);
  app.use(createUserActionAuditMiddleware(() => pool));
  app.use("/api", createMutationOriginGuard());

  const apiCache = createApiCacheMiddleware({ ttlMs: Number(process.env.API_CACHE_TTL_MS || 30000), maxEntries: 200 });
  app.use("/api", apiCache);

  // --- Phase 4 centralized route module registration ---
  registerApplicationRouteModules(app, () => pool, { apiCache });
  registerUserManagementRoutes(app, () => pool);

  /**
   * @swagger
   * /api/admin-setup:
   *   get:
   *     summary: Setup super admin user from environment variables
   *     responses:
   *       200:
   *         description: Admin user setup output
   *       400:
   *         description: Admin credentials missing
   *       500:
   *         description: Database error
   */
  app.get("/api/admin-setup", async (req, res) => {
    if (!isAdminSetupEnabled()) {
      return res.status(404).json({ error: "Admin setup is not enabled in this environment." });
    }

    const adminEmail =
      process.env.VITE_SUPER_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL;
    const adminPassword =
      process.env.VITE_SUPER_ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      return res.status(400).json({
        error: "Super admin credentials not configured in environment.",
      });
    }

    const configuredSetupToken = process.env.ADMIN_SETUP_TOKEN || "";
    const providedSetupToken = adminSetupTokenFromRequest({
      headerToken: req.headers["x-admin-setup-token"],
      queryToken: req.query.setupToken,
    });
    if (process.env.NODE_ENV === "production" && !configuredSetupToken) {
      return res.status(403).json({ error: "ADMIN_SETUP_TOKEN must be configured before production admin setup." });
    }
    if (configuredSetupToken && providedSetupToken.token !== configuredSetupToken) {
      return res.status(403).json({ error: "Invalid admin setup token." });
    }

    try {
      if (pool) {
        await ensureUserManagementTables(pool);

        // Check if admin exists
        const normalizedAdminEmail = adminEmail.trim().toLowerCase();
        const [rows]: any = await pool.query(
          "SELECT * FROM admin_users WHERE LOWER(email) = ?",
          [normalizedAdminEmail],
        );
        if (rows.length === 0) {
          const defaultUsername = normalizedAdminEmail.split("@")[0] || "superadmin";
          await pool.query(
            "INSERT INTO admin_users (name, email, username, password_hash, role, status, password_changed_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
            ["Super Admin", normalizedAdminEmail, defaultUsername, hashPassword(adminPassword), "super_admin", "active"],
          );
          return res.json({
            message: "Super admin user setup successfully in MySQL database.",
          });
        } else {
          if (isLegacyPlaintextPassword(rows[0].password_hash)) {
            await pool.query("UPDATE admin_users SET password_hash = ?, password_changed_at = COALESCE(password_changed_at, NOW()), status = COALESCE(status, 'active') WHERE email = ?", [
              hashPassword(adminPassword),
              adminEmail,
            ]);
            return res.json({
              message: "Super admin user already existed and password storage was upgraded.",
            });
          }

          return res.json({
            message: "Super admin user already exists in MySQL database.",
          });
        }
      } else {
        return res.status(500).json({ error: "Database connection failed." });
      }
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  /**
   * @swagger
   * /api/db-health:
   *   get:
   *     summary: Check database connection health
   *     responses:
   *       200:
   *         description: DB Status ok
   *       500:
   *         description: Database error
   */
  app.get("/api/db-health", async (req: AuthenticatedRequest, res) => {
    const canSeeDetails = hasPermission(req, "platform.health.detail");
    if (!pool) {
      return res.status(503).json({
        status: "error",
        message: "Database is unavailable",
        ...(canSeeDetails ? { configured: missingDbConfig.length === 0, lastError: dbConnectionError, requestId: req.requestId || null } : {}),
      });
    }
    try {
      if (poorHealthStartTime > 0) {
        const downtimeSecs = Math.floor((Date.now() - poorHealthStartTime) / 1000);
        const isCritical = downtimeSecs > 60;
        const successCount = healthHistory.filter(h => h).length;
        const healthPct = Math.round((successCount / (healthHistory.length || 1)) * 100);
        
        if (isCritical) {
          return res.status(503).json({ 
            status: "error", 
            message: "Database health is degraded",
            ...(canSeeDetails ? { downtimeSecs, isCritical, healthPct, requestId: req.requestId || null } : {}),
          });
        }
      }
      return res.json({ status: "healthy", ...(canSeeDetails ? { dbConfigured: missingDbConfig.length === 0, requestId: req.requestId || null } : {}) });
    } catch (e: any) {
      return res.status(500).json({ status: "error", message: canSeeDetails ? e.message : "Database health check failed" });
    }
  });

  /**
   * @swagger
   * /api/trigger-backup:
   *   post:
   *     summary: Manually trigger database backup
   *     responses:
   *       200:
   *         description: Backup triggered
   */
  app.post("/api/trigger-backup", requirePermission("platform.backups.manage"), (req, res) => {
    const backupDir = path.join(process.cwd(), "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(backupDir, `backup-manual-${timestamp}.sql`);

    if (missingDbConfig.length > 0) {
      return res.status(503).json({
        status: "error",
        message: "Database configuration is incomplete. Backup cannot run.",
      });
    }

    const dumpCmd = `mysqldump -h ${shellQuote(dbConfig.host)} -P ${shellQuote(String(dbConfig.port))} -u ${shellQuote(dbConfig.user)} ${shellQuote(dbConfig.database)} > ${shellQuote(backupFile)}`;

    exec(dumpCmd, { env: { ...process.env, MYSQL_PWD: dbConfig.password } }, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ status: "error", message: error.message });
      } else {
        return res.json({ status: "success", file: backupFile, message: "Backup completed successfully" });
      }
    });
  });

  /**
   * @swagger
   * /api/backups:
   *   get:
   *     summary: List existing backups
   *     responses:
   *       200:
   *         description: List of backups
   */
  app.get("/api/backups", requirePermission("platform.backups.manage"), (req, res) => {
    const backupDir = path.join(process.cwd(), "backups");
    if (!fs.existsSync(backupDir)) {
      return res.json({ backups: [] });
    }
    const files = fs.readdirSync(backupDir).filter(f => Boolean(normalizeBackupName(f))).map(name => {
      const stats = fs.statSync(path.join(backupDir, name));
      return {
        name,
        size: stats.size,
        createdAt: stats.birthtime,
      };
    });
    return res.json({ backups: files });
  });


  function normalizeBackupName(input: unknown) {
    const base = path.basename(String(input || ""));
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,180}\.sql$/.test(base) || base.includes("..") || base.startsWith(".")) return "";
    return base;
  }

  function resolveBackupPath(backupDir: string, input: unknown) {
    const fileName = normalizeBackupName(input);
    if (!fileName) return null;
    const resolvedDir = path.resolve(backupDir);
    const resolvedFile = path.resolve(resolvedDir, fileName);
    if (!resolvedFile.startsWith(`${resolvedDir}${path.sep}`)) return null;
    return { fileName, filePath: resolvedFile };
  }

  /**
   * @swagger
   * /api/backups/download/:name:
   *   get:
   *     summary: Download a backup file
   */
  app.get("/api/backups/download/:name", requirePermission("platform.backups.manage"), (req, res) => {
    const backupDir = path.join(process.cwd(), "backups");
    const backup = resolveBackupPath(backupDir, req.params.name);

    if (!backup || !fs.existsSync(backup.filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    
    res.download(backup.filePath, backup.fileName);
  });

  /**
   * @swagger
   * /api/backups/delete:
   *   post:
   *     summary: Delete multiple backup files
   */
  app.post("/api/backups/delete", requirePermission("platform.backups.manage"), (req, res) => {
    const { files } = req.body;
    if (!Array.isArray(files)) {
      return res.status(400).json({ error: "Files array is required" });
    }

    const backupDir = path.join(process.cwd(), "backups");
    const deleted: string[] = [];
    const errors: string[] = [];

    for (const candidate of files) {
      const backup = resolveBackupPath(backupDir, candidate);
      if (!backup) {
        errors.push(String(candidate));
        continue;
      }
      try {
        if (fs.existsSync(backup.filePath)) {
          fs.unlinkSync(backup.filePath);
          deleted.push(backup.fileName);
        }
      } catch (e: any) {
        errors.push(backup.fileName);
      }
    }

    res.json({ status: "success", deleted, errors });
  });

  /**
   * @swagger
   * /api/audit-logs:
   *   get:
   *     summary: Get recent audit logs
   *     responses:
   *       200:
   *         description: List of audit logs
   */
  app.get("/api/audit-logs", requirePermission("platform.audit.read"), async (req, res, next) => {
    try {
      if (!pool) return res.status(500).json({ error: "Database not connected" });
      
      // Ensure the table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          action VARCHAR(255) NOT NULL,
          details TEXT,
          performed_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const [rows] = await pool.query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100");
      res.json({ logs: rows });
    } catch (error) {
      next(error);
    }
  });

  // Prevent unknown API URLs from falling through to the Vite/SPA index.html.
  // Without this, missing PDF endpoints can return the React HTML shell instead of JSON.
  app.use("/api", (req, res) => {
    res.status(404).json({
      error: "API endpoint not found",
      path: req.originalUrl,
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global Error Handling Middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const dbConnectionErrorDetected = isRecoverableDatabaseConnectionError(err);
    if (dbConnectionErrorDetected) {
      dbConnectionError = formatDatabaseError(err);
      if (pool) {
        const failedPool = pool;
        pool = null;
        failedPool.end().catch(() => undefined);
      }
      appLogger.error("Database connection error handled", {
        requestId: (req as any).requestId || null,
        path: req.originalUrl || req.url,
        error: dbConnectionError,
      });
    } else {
      appLogger.error("Global error handler caught", {
        requestId: (req as any).requestId || null,
        path: req.originalUrl || req.url,
        error: { name: err?.name, message: err?.message, code: err?.code },
      });
    }

    const status = err.status || (dbConnectionErrorDetected ? 503 : 500);
    const publicMessage = status >= 500 && process.env.NODE_ENV === "production"
      ? "Internal Server Error"
      : err.message || "Internal Server Error";
    res.status(status).json({
      error: {
        message: publicMessage,
        status,
        requestId: (req as any).requestId || null,
        dbConnected: Boolean(pool),
      }
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
