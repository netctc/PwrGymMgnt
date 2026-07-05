import crypto from "crypto";
import type { Express, NextFunction, Response } from "express";
import type { Pool } from "mysql2/promise";
import {
  compatibilityRecordsDeprecationHeaders,
  parseCompatibilityRecordsPagination,
  requireCompatibilityRecordsApiEnabled,
} from "./compatRecords";
import { type AuthenticatedRequest, hasPermission, normalizeAppRole } from "./rbac";

export type PoolProvider = () => Pool | null;

export const RECORD_TABLE_PERMISSIONS: Record<string, { read: string; write: string }> = Object.freeze({
  members: { read: "records.members.read", write: "records.members.write" },
  users: { read: "records.users.read", write: "records.users.write" },
  staff: { read: "records.staff.read", write: "records.staff.write" },
  classes: { read: "records.classes.read", write: "records.classes.write" },
  private_classes: { read: "records.private_classes.read", write: "records.private_classes.write" },
  shifts: { read: "records.shifts.read", write: "records.shifts.write" },
  hr_profiles: { read: "records.hr_profiles.read", write: "records.hr_profiles.write" },
  settings: { read: "records.settings.read", write: "records.settings.write" },
  audit_logs: { read: "records.audit_logs.read", write: "records.audit_logs.write" },
});

export function normalizeRecordTable(table: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(table)) throw Object.assign(new Error("Invalid table name"), { status: 400 });
  if (table === "auditLogs") return "audit_logs";
  return table;
}

export function getRecordPermission(table: string, action: "read" | "write") {
  const actualTable = normalizeRecordTable(table);
  const entry = RECORD_TABLE_PERMISSIONS[actualTable];
  if (!entry) {
    throw Object.assign(new Error("Collection is not allowed through the compatibility records API"), { status: 403 });
  }
  return entry[action];
}

export function requireRecordPermission(action: "read" | "write") {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const permission = getRecordPermission(req.params.table, action);
      if (!hasPermission(req, permission)) {
        return res.status(403).json({ error: "Permission denied", permission });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function assertSafeRecordPayload(data: any) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw Object.assign(new Error("Record body must be an object"), { status: 400 });
  }
  const json = JSON.stringify(data);
  if (json.length > 25000) {
    throw Object.assign(new Error("Record payload is too large"), { status: 413 });
  }
  return data;
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function readJsonPayload(row: any) {
  if (!row?.data) return {};
  if (typeof row.data === "object") return row.data;
  try {
    return JSON.parse(String(row.data));
  } catch {
    return {};
  }
}

function mergeRecordRow(row: any) {
  const data = readJsonPayload(row);
  return { ...data, ...row, data };
}

function compactString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function splitName(data: any) {
  const firstName = compactString(data.firstName || data.first_name || data.name?.split?.(" ")?.[0]);
  const lastName = compactString(data.lastName || data.last_name || data.name?.split?.(" ")?.slice?.(1)?.join?.(" "));
  return { firstName, lastName };
}

function isStaffRole(role: unknown) {
  const normalized = normalizeAppRole(role);
  return Boolean(normalized && normalized !== "client");
}

async function ensureDocTable(pool: Pool, table: string) {
  const actualTable = normalizeRecordTable(table);

  if (actualTable === "audit_logs") {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        action VARCHAR(255) NOT NULL,
        details TEXT,
        performed_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return;
  }

  if (actualTable === "users") {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255),
        role VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        data JSON,
        INDEX idx_users_email (email),
        INDEX idx_users_role (role)
      )
    `);
    return;
  }

  if (actualTable === "staff") {
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
        data JSON,
        INDEX idx_staff_email (email),
        INDEX idx_staff_role (role),
        INDEX idx_staff_status (status)
      )
    `);
    return;
  }

  if (actualTable === "members") {
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
        qr_code VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        data JSON,
        INDEX idx_members_status (status),
        INDEX idx_members_email (email),
        INDEX idx_members_phone (phone)
      )
    `);
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`${actualTable}\` (
      id VARCHAR(255) PRIMARY KEY,
      data JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

async function writeCompatibilityRecord(pool: Pool, table: string, id: string, data: any) {
  const actualTable = normalizeRecordTable(table);
  await ensureDocTable(pool, table);

  if (actualTable === "audit_logs") {
    await pool.query(
      "INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)",
      [
        compactString(data.action) || "audit",
        compactString(data.details || data.targetId),
        compactString(data.performedBy || data.performed_by) || "system",
      ],
    );
    return;
  }

  if (actualTable === "users") {
    const email = compactString(data.email).toLowerCase() || null;
    const role = compactString(data.role) || "client";
    await pool.query(
      `INSERT INTO users (id, email, role, data) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE email = VALUES(email), role = VALUES(role), data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
      [id, email, role, safeJson(data)],
    );

    if (isStaffRole(role)) {
      const { firstName, lastName } = splitName(data);
      await pool.query(
        `INSERT INTO staff (id, first_name, last_name, email, role, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), email = VALUES(email), role = VALUES(role), status = VALUES(status), data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
        [id, firstName || null, lastName || null, email, role, compactString(data.status) || "active", safeJson(data)],
      );
    }
    return;
  }

  if (actualTable === "staff") {
    const { firstName, lastName } = splitName(data);
    const email = compactString(data.email).toLowerCase() || null;
    const role = compactString(data.role) || "staff";
    await pool.query(
      `INSERT INTO staff (id, first_name, last_name, email, role, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), email = VALUES(email), role = VALUES(role), status = VALUES(status), data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
      [id, firstName || null, lastName || null, email, role, compactString(data.status) || "active", safeJson(data)],
    );
    return;
  }

  if (actualTable === "members") {
    const { firstName, lastName } = splitName(data);
    await pool.query(
      `INSERT INTO members (id, first_name, last_name, email, phone, status, join_date, plan, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), email = VALUES(email), phone = VALUES(phone), status = VALUES(status), join_date = VALUES(join_date), plan = VALUES(plan), data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
      [
        id,
        firstName || null,
        lastName || null,
        compactString(data.email).toLowerCase() || null,
        compactString(data.phone) || null,
        compactString(data.status) || "active",
        compactString(data.joinDate || data.join_date) || null,
        compactString(data.currentPlan || data.plan || data.subPlan) || null,
        safeJson(data),
      ],
    );
    return;
  }

  await pool.query(
    `INSERT INTO \`${actualTable}\` (id, data) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
    [id, safeJson(data)],
  );
}

function requirePool(poolProvider: PoolProvider) {
  const pool = poolProvider();
  if (!pool) throw Object.assign(new Error("DB not connected"), { status: 503 });
  return pool;
}

export function registerCompatibilityRecordRoutes(app: Express, poolProvider: PoolProvider) {
  app.get(
    "/api/records/:table",
    requireCompatibilityRecordsApiEnabled,
    requireRecordPermission("read"),
    async (req, res, next) => {
      try {
        const { table } = req.params;
        const { limit, offset } = parseCompatibilityRecordsPagination(req.query);
        const pool = requirePool(poolProvider);
        await ensureDocTable(pool, table);
        const actualTable = normalizeRecordTable(table);
        res.set(compatibilityRecordsDeprecationHeaders());
        res.set("X-Page-Limit", String(limit));
        res.set("X-Page-Offset", String(offset));

        if (actualTable === "audit_logs") {
          const [rows] = await pool.query(
            "SELECT id, action, details, performed_by AS performedBy, created_at AS createdAt FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",
            [limit, offset],
          );
          return res.json(rows);
        }

        const [rows]: any = await pool.query(`SELECT * FROM \`${actualTable}\` ORDER BY created_at DESC LIMIT ? OFFSET ?`, [limit, offset]);
        return res.json(rows.map(mergeRecordRow));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/records/:table",
    requireCompatibilityRecordsApiEnabled,
    requireRecordPermission("write"),
    async (req, res, next) => {
      try {
        const { table } = req.params;
        res.set(compatibilityRecordsDeprecationHeaders());
        const pool = requirePool(poolProvider);
        const data = assertSafeRecordPayload(req.body || {});
        const id = compactString(data.id) || crypto.randomUUID().replace(/-/g, "");
        await writeCompatibilityRecord(pool, table, id, { ...data, id });
        return res.status(201).json({ id, ...data });
      } catch (error) {
        next(error);
      }
    },
  );

  app.put(
    "/api/records/:table/:id",
    requireCompatibilityRecordsApiEnabled,
    requireRecordPermission("write"),
    async (req, res, next) => {
      try {
        const { table, id } = req.params;
        res.set(compatibilityRecordsDeprecationHeaders());
        const pool = requirePool(poolProvider);
        const data = { ...assertSafeRecordPayload(req.body || {}), id };
        await writeCompatibilityRecord(pool, table, id, data);
        return res.json({ id, ...data });
      } catch (error) {
        next(error);
      }
    },
  );

  app.delete(
    "/api/records/:table/:id",
    requireCompatibilityRecordsApiEnabled,
    requireRecordPermission("write"),
    async (req, res, next) => {
      try {
        const { table, id } = req.params;
        res.set(compatibilityRecordsDeprecationHeaders());
        const pool = requirePool(poolProvider);
        await ensureDocTable(pool, table);
        const actualTable = normalizeRecordTable(table);
        await pool.query(`DELETE FROM \`${actualTable}\` WHERE id = ?`, [id]);
        return res.json({ success: true });
      } catch (error) {
        next(error);
      }
    },
  );
}
