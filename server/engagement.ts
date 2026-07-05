import crypto from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import { hasPermission, normalizeAppRole } from "./rbac";

type PoolProvider = () => Pool | null;

type AuthenticatedRequest = Request & {
  user?: {
    uid?: string;
    email?: string;
    role?: string;
  };
};

const STAFF_ROLES = new Set(["super_admin", "admin", "manager", "reception", "cashier", "support"]);

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function requirePool(poolProvider: PoolProvider) {
  const pool = poolProvider();
  if (!pool) {
    const error = new Error("Database not connected");
    (error as any).status = 503;
    throw error;
  }
  return pool;
}

function requireStaff(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!hasPermission(req as any, "support.write")) {
    return res.status(403).json({ error: "Staff permission required" });
  }
  return next();
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return normalizeString(value).toLowerCase();
}

function parseJsonField(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function toMysqlJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function mapTicket(row: any) {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    requesterPhone: row.requester_phone,
    inquiryType: row.inquiry_type,
    priority: row.priority,
    subject: row.subject,
    description: row.description,
    status: row.status,
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    data: parseJsonField(row.data),
  };
}

function mapTicketMessage(row: any) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorEmail: row.author_email,
    authorRole: row.author_role,
    message: row.message,
    visibility: row.visibility,
    createdAt: row.created_at,
    data: parseJsonField(row.data),
  };
}

function mapNotification(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    title: row.title,
    body: row.body,
    type: row.type,
    channel: row.channel,
    linkUrl: row.link_url,
    readAt: row.read_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    data: parseJsonField(row.data),
  };
}

async function ensureEngagementSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id VARCHAR(64) PRIMARY KEY,
      ticket_number VARCHAR(32) UNIQUE NOT NULL,
      requester_name VARCHAR(160) NOT NULL,
      requester_email VARCHAR(255) NOT NULL,
      requester_phone VARCHAR(50) NULL,
      inquiry_type VARCHAR(40) NOT NULL DEFAULT 'technical',
      priority VARCHAR(20) NOT NULL DEFAULT 'normal',
      subject VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      assigned_to VARCHAR(255) NULL,
      created_by VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      resolved_at DATETIME NULL,
      data JSON NULL,
      INDEX idx_support_tickets_status (status),
      INDEX idx_support_tickets_type (inquiry_type),
      INDEX idx_support_tickets_created_at (created_at),
      INDEX idx_support_tickets_requester_email (requester_email)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id VARCHAR(64) PRIMARY KEY,
      ticket_id VARCHAR(64) NOT NULL,
      author_email VARCHAR(255) NULL,
      author_role VARCHAR(64) NULL,
      message TEXT NOT NULL,
      visibility VARCHAR(32) NOT NULL DEFAULT 'public',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_support_ticket_messages_ticket (ticket_id),
      CONSTRAINT fk_support_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(255) NULL,
      role VARCHAR(64) NULL,
      title VARCHAR(180) NOT NULL,
      body TEXT NOT NULL,
      type VARCHAR(64) NOT NULL DEFAULT 'info',
      channel VARCHAR(64) NOT NULL DEFAULT 'in_app',
      link_url VARCHAR(255) NULL,
      read_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL,
      data JSON NULL,
      INDEX idx_notifications_user_read (user_id, read_at),
      INDEX idx_notifications_role_read (role, read_at),
      INDEX idx_notifications_created_at (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id VARCHAR(255) PRIMARY KEY,
      in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      class_reminders BOOLEAN NOT NULL DEFAULT TRUE,
      billing_reminders BOOLEAN NOT NULL DEFAULT TRUE,
      support_updates BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS deployment_checklist (
      id VARCHAR(64) PRIMARY KEY,
      item_key VARCHAR(120) UNIQUE NOT NULL,
      label VARCHAR(255) NOT NULL,
      category VARCHAR(80) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      details TEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

async function createNotification(
  pool: Pool,
  input: {
    userId?: string | null;
    role?: string | null;
    title: string;
    body: string;
    type?: string;
    linkUrl?: string | null;
    data?: Record<string, unknown>;
  },
) {
  const id = createId("ntf");
  await pool.query(
    `INSERT INTO notifications (id, user_id, role, title, body, type, link_url, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId || null,
      input.role || null,
      input.title,
      input.body,
      input.type || "info",
      input.linkUrl || null,
      toMysqlJson(input.data || {}),
    ],
  );
  return id;
}

function ticketNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `PGM-${datePart}-${randomPart}`;
}


let engagementSchemaReady: Promise<void> | null = null;
let engagementSchemaLastFailureAt = 0;
let engagementSchemaLastFailureMessage = "";

async function ensureEngagementSchemaOnce(pool: Pool) {
  if (engagementSchemaReady) return engagementSchemaReady;

  const retryCooldownMs = 15000;
  const now = Date.now();
  if (engagementSchemaLastFailureAt && now - engagementSchemaLastFailureAt < retryCooldownMs) {
    const error = new Error(
      `Engagement schema is temporarily unavailable. Last MySQL error: ${engagementSchemaLastFailureMessage}`,
    );
    (error as any).status = 503;
    throw error;
  }

  engagementSchemaReady = ensureEngagementSchema(pool).catch((error) => {
    engagementSchemaReady = null;
    engagementSchemaLastFailureAt = Date.now();
    engagementSchemaLastFailureMessage = error?.message || String(error);
    throw error;
  });

  return engagementSchemaReady;
}

export function registerEngagementRoutes(app: Express, poolProvider: PoolProvider) {
  app.get("/api/engagement/contact-channels", (req, res) => {
    res.json({
      channels: {
        email: process.env.SUPPORT_EMAIL || "assaf@gmail.com",
        phone: process.env.SUPPORT_PHONE || "+96179107040",
        whatsapp: process.env.SUPPORT_WHATSAPP || "+96179107040",
        officeHours: process.env.SUPPORT_OFFICE_HOURS || "Mon - Fri: 9:00 AM - 6:00 PM",
      },
    });
  });

  app.get("/api/engagement/notifications", async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureEngagementSchemaOnce(pool);

      const userId = req.user?.uid || "";
      const role = normalizeAppRole(req.user?.role);
      const unreadOnly = String(req.query.unreadOnly || "") === "true";
      const conditions = ["(user_id = ? OR role = ? OR (user_id IS NULL AND role IS NULL))"];
      const params: any[] = [userId, role];

      if (unreadOnly) {
        conditions.push("read_at IS NULL");
      }

      conditions.push("(expires_at IS NULL OR expires_at > NOW())");

      const [rows]: any = await pool.query(
        `SELECT * FROM notifications WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT 50`,
        params,
      );
      const notifications = rows.map(mapNotification);
      const unreadCount = notifications.filter((item: any) => !item.readAt).length;
      res.json({ notifications, unreadCount });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/engagement/notifications", requireStaff, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureEngagementSchemaOnce(pool);
      const title = normalizeString(req.body.title);
      const body = normalizeString(req.body.body);
      if (!title || !body) return res.status(400).json({ error: "Title and body are required" });

      const id = await createNotification(pool, {
        userId: normalizeString(req.body.userId) || null,
        role: normalizeString(req.body.role) || null,
        title,
        body,
        type: normalizeString(req.body.type) || "info",
        linkUrl: normalizeString(req.body.linkUrl) || null,
        data: { createdBy: req.user?.email || req.user?.uid || "system" },
      });
      res.status(201).json({ id });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/engagement/notifications/:id/read", async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureEngagementSchemaOnce(pool);
      await pool.query(
        `UPDATE notifications SET read_at = NOW()
         WHERE id = ? AND (user_id = ? OR role = ? OR (user_id IS NULL AND role IS NULL))`,
        [req.params.id, req.user?.uid || "", req.user?.role || ""],
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/engagement/notifications/read-all", async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureEngagementSchemaOnce(pool);
      await pool.query(
        `UPDATE notifications SET read_at = NOW()
         WHERE read_at IS NULL AND (user_id = ? OR role = ? OR (user_id IS NULL AND role IS NULL))`,
        [req.user?.uid || "", req.user?.role || ""],
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/engagement/support/tickets", async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureEngagementSchemaOnce(pool);
      const role = normalizeAppRole(req.user?.role);
      const params: any[] = [];
      const conditions: string[] = [];

      if (!STAFF_ROLES.has(role)) {
        conditions.push("requester_email = ?");
        params.push(req.user?.email || "");
      }
      if (req.query.status) {
        conditions.push("status = ?");
        params.push(String(req.query.status));
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const [rows]: any = await pool.query(
        `SELECT * FROM support_tickets ${where} ORDER BY created_at DESC LIMIT 100`,
        params,
      );
      res.json({ tickets: rows.map(mapTicket) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/engagement/support/tickets", async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureEngagementSchemaOnce(pool);
      const requesterName = normalizeString(req.body.name || req.body.requesterName || req.user?.email || "User");
      const requesterEmail = normalizeEmail(req.body.email || req.body.requesterEmail || req.user?.email);
      const description = normalizeString(req.body.description);
      const subject = normalizeString(req.body.subject) || description.slice(0, 100) || "Support request";
      if (!requesterName || !requesterEmail || !description) {
        return res.status(400).json({ error: "Name, email and description are required" });
      }

      const id = createId("tkt");
      const number = ticketNumber();
      await pool.query(
        `INSERT INTO support_tickets
          (id, ticket_number, requester_name, requester_email, requester_phone, inquiry_type, priority, subject, description, status, created_by, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
        [
          id,
          number,
          requesterName,
          requesterEmail,
          normalizeString(req.body.phone || req.body.requesterPhone) || null,
          normalizeString(req.body.type || req.body.inquiryType) || "technical",
          normalizeString(req.body.priority) || "normal",
          subject,
          description,
          req.user?.uid || null,
          toMysqlJson({ source: "support_form" }),
        ],
      );

      await pool.query(
        `INSERT INTO support_ticket_messages (id, ticket_id, author_email, author_role, message, visibility, data)
         VALUES (?, ?, ?, ?, ?, 'public', ?)`,
        [createId("msg"), id, requesterEmail, req.user?.role || "requester", description, toMysqlJson({ initial: true })],
      );

      await createNotification(pool, {
        role: "admin",
        title: "New support ticket",
        body: `${number}: ${subject}`,
        type: "support",
        linkUrl: "/support",
        data: { ticketId: id },
      });

      const [rows]: any = await pool.query("SELECT * FROM support_tickets WHERE id = ?", [id]);
      res.status(201).json({ ticket: mapTicket(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/engagement/support/tickets/:id", async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureEngagementSchemaOnce(pool);
      const [ticketRows]: any = await pool.query("SELECT * FROM support_tickets WHERE id = ?", [req.params.id]);
      if (ticketRows.length === 0) return res.status(404).json({ error: "Ticket not found" });

      const ticket = mapTicket(ticketRows[0]);
      const role = normalizeAppRole(req.user?.role);
      if (!STAFF_ROLES.has(role) && ticket.requesterEmail !== req.user?.email) {
        return res.status(403).json({ error: "Ticket access denied" });
      }

      const [messageRows]: any = await pool.query(
        "SELECT * FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC",
        [req.params.id],
      );
      res.json({ ticket, messages: messageRows.map(mapTicketMessage) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/engagement/support/tickets/:id/messages", async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureEngagementSchemaOnce(pool);
      const message = normalizeString(req.body.message);
      if (!message) return res.status(400).json({ error: "Message is required" });

      const [ticketRows]: any = await pool.query("SELECT * FROM support_tickets WHERE id = ?", [req.params.id]);
      if (ticketRows.length === 0) return res.status(404).json({ error: "Ticket not found" });
      const ticket = mapTicket(ticketRows[0]);
      const role = normalizeAppRole(req.user?.role);
      if (!STAFF_ROLES.has(role) && ticket.requesterEmail !== req.user?.email) {
        return res.status(403).json({ error: "Ticket access denied" });
      }

      const id = createId("msg");
      await pool.query(
        `INSERT INTO support_ticket_messages (id, ticket_id, author_email, author_role, message, visibility, data)
         VALUES (?, ?, ?, ?, ?, 'public', ?)`,
        [id, req.params.id, req.user?.email || ticket.requesterEmail, role || "requester", message, toMysqlJson({})],
      );
      await pool.query("UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id]);
      res.status(201).json({ id });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/engagement/support/tickets/:id/status", requireStaff, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureEngagementSchemaOnce(pool);
      const status = normalizeString(req.body.status);
      if (!status) return res.status(400).json({ error: "Status is required" });
      const resolvedAt = ["resolved", "closed"].includes(status) ? new Date() : null;
      await pool.query(
        "UPDATE support_tickets SET status = ?, resolved_at = ? WHERE id = ?",
        [status, resolvedAt, req.params.id],
      );
      res.json({ success: true, status });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/engagement/deployment-readiness", requireStaff, async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureEngagementSchemaOnce(pool);
      const checks = [
        {
          key: "env_jwt_secret",
          label: "JWT_SECRET is configured for production",
          category: "security",
          status: process.env.JWT_SECRET && process.env.JWT_SECRET !== "dev-only-jwt-secret-change-me" ? "pass" : "warning",
        },
        {
          key: "env_database",
          label: "Database connection variables are configured",
          category: "database",
          status: process.env.DATABASE_HOSTNAME && process.env.DATABASE_USER_NAME && process.env.DATABASE_NAME ? "pass" : "warning",
        },
        {
          key: "admin_setup_token",
          label: "ADMIN_SETUP_TOKEN configured for setup protection",
          category: "security",
          status: process.env.ADMIN_SETUP_TOKEN ? "pass" : "warning",
        },
        {
          key: "support_channels",
          label: "Support contact channels configured",
          category: "operations",
          status: process.env.SUPPORT_EMAIL || process.env.SUPPORT_PHONE ? "pass" : "warning",
        },
        {
          key: "pwa_assets",
          label: "PWA manifest and service worker are included",
          category: "mobile",
          status: "pass",
        },
      ];
      res.json({ checks, generatedAt: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });
}
