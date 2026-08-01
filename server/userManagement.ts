import type { Express } from "express";
import crypto from "crypto";
import {
  APP_ROLES,
  getAllowedRoles,
  getDefaultAllowedRoles,
  getPermissionKeys,
  normalizeAppRole,
  requirePermission,
  setRolePermissionOverrides,
  updateRolePermissionOverride,
  type AppRole,
  type AuthenticatedRequest,
  type RolePermissionOverride,
} from "./rbac";
import { writeOperationalAudit } from "./observability";

type QueryablePool = Parameters<typeof writeOperationalAudit>[0];

type AdminUserRow = {
  id: number;
  name?: string | null;
  email: string;
  username?: string | null;
  role: string;
  status?: string | null;
  employee_id?: string | null;
  employee_code?: string | null;
  employee_first_name?: string | null;
  employee_last_name?: string | null;
  employee_email?: string | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  last_login_at?: string | Date | null;
  password_changed_at?: string | Date | null;
};

export const ASSIGNABLE_USER_ROLES = [
  "admin",
  "manager",
  "warehouse_manager",
  "accounting",
  "cashier",
  "reception",
  "trainer",
  "hr",
  "support",
] as const satisfies readonly AppRole[];

export const USER_STATUSES = ["active", "suspended", "inactive"] as const;

const USER_SELECT_COLUMNS = `
  au.id, au.name, au.email, au.username, au.role, au.status, au.employee_id,
  e.employee_code, e.first_name AS employee_first_name, e.last_name AS employee_last_name, e.email AS employee_email,
  au.created_at, au.updated_at, au.last_login_at, au.password_changed_at
`;

export type LinkedEmployeeUserInput = {
  employeeId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  username: string;
  password: string;
  role: unknown;
  status?: unknown;
};

function normalizeEmployeeId(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function sanitizeUser(row: AdminUserRow) {
  const normalizedRole = normalizeAppRole(row.role) || "staff";
  const employeeName = [row.employee_first_name, row.employee_last_name].filter(Boolean).join(" ").trim();
  return {
    id: String(row.id),
    name: row.name || "",
    email: row.email,
    username: row.username || "",
    role: normalizedRole,
    status: row.status || "active",
    employeeId: row.employee_id || "",
    employeeName,
    employeeCode: row.employee_code || "",
    employeeEmail: row.employee_email || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    lastLoginAt: row.last_login_at || null,
    passwordChangedAt: row.password_changed_at || null,
  };
}

export function normalizeStatus(status: unknown) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  return USER_STATUSES.includes(normalized as any) ? normalized : "active";
}

export function normalizeUsername(username: unknown) {
  const normalized = typeof username === "string" ? username.trim().toLowerCase() : "";
  return normalized || null;
}

export function validatePasswordComplexity(password: string) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[!@#$%^&*()[\]{}\\|;:'",.<>/?_=\-+`~]/.test(password)
  );
}

export function getActor(req: AuthenticatedRequest) {
  return req.user?.email || req.user?.uid || "system";
}

export function ensureAssignableRole(role: unknown): AppRole | null {
  const normalized = normalizeAppRole(role);
  if (!normalized) return null;
  return ASSIGNABLE_USER_ROLES.includes(normalized as any) ? normalized : null;
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
    if (code !== "ER_DUP_FIELDNAME" && code !== "ER_DUP_KEYNAME") throw error;
  }
}

async function ensureIndex(pool: QueryablePool, indexName: string, sql: string) {
  try {
    await pool.query(sql);
  } catch (error) {
    const code = (error as any)?.code;
    if (code !== "ER_DUP_KEYNAME") throw error;
  }
}

async function ensureUniqueIndexOnColumn(pool: QueryablePool, table: string, column: string, indexName: string) {
  const [rows]: any = await pool.query(
    `SELECT COUNT(DISTINCT INDEX_NAME) AS count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND NON_UNIQUE = 0`,
    [table, column],
  );
  const exists = Array.isArray(rows) && Number(rows[0]?.count || 0) > 0;
  if (exists) return;
  await ensureIndex(pool, indexName, `CREATE UNIQUE INDEX ${indexName} ON ${table} (${column})`);
}

export async function ensureUserManagementTables(pool: QueryablePool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(100) NULL,
      employee_id VARCHAR(64) NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'admin',
      status VARCHAR(50) DEFAULT 'active',
      reset_phone VARCHAR(32) NULL,
      reset_delivery_channel VARCHAR(32) NULL,
      last_login_at DATETIME NULL,
      password_changed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_admin_users_employee_id (employee_id),
      INDEX idx_admin_users_role (role),
      INDEX idx_admin_users_status (status)
    )
  `);

  await addColumnIfMissing(pool, "admin_users", "name", "VARCHAR(255) NULL");
  await addColumnIfMissing(pool, "admin_users", "username", "VARCHAR(100) NULL");
  await addColumnIfMissing(pool, "admin_users", "employee_id", "VARCHAR(64) NULL");
  await addColumnIfMissing(pool, "admin_users", "status", "VARCHAR(50) DEFAULT 'active'");
  await addColumnIfMissing(pool, "admin_users", "reset_phone", "VARCHAR(32) NULL");
  await addColumnIfMissing(pool, "admin_users", "reset_delivery_channel", "VARCHAR(32) NULL");
  await addColumnIfMissing(pool, "admin_users", "last_login_at", "DATETIME NULL");
  await addColumnIfMissing(pool, "admin_users", "password_changed_at", "DATETIME NULL");

  await ensureUniqueIndexOnColumn(pool, "admin_users", "username", "idx_admin_users_username");
  await ensureUniqueIndexOnColumn(pool, "admin_users", "employee_id", "uq_admin_users_employee_id");
  await ensureIndex(pool, "idx_admin_users_role", "CREATE INDEX idx_admin_users_role ON admin_users (role)");
  await ensureIndex(pool, "idx_admin_users_status", "CREATE INDEX idx_admin_users_status ON admin_users (status)");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS role_permission_overrides (
      role VARCHAR(50) NOT NULL,
      permission_key VARCHAR(100) NOT NULL,
      allowed TINYINT(1) NOT NULL,
      updated_by VARCHAR(255) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (role, permission_key),
      INDEX idx_role_permission_overrides_permission (permission_key)
    )
  `);
}

export async function refreshRolePermissionOverrides(pool: QueryablePool | null) {
  if (!pool) return;
  await ensureUserManagementTables(pool);
  const [rows]: any = await pool.query("SELECT role, permission_key AS permission, allowed FROM role_permission_overrides");
  const overrides: RolePermissionOverride[] = [];
  for (const row of rows || []) {
    const role = normalizeAppRole(row.role);
    if (!role) continue;
    overrides.push({ role, permission: String(row.permission), allowed: Boolean(Number(row.allowed)) });
  }
  setRolePermissionOverrides(overrides);
}

async function auditUserMaintenance(pool: QueryablePool, req: AuthenticatedRequest, action: string, details: Record<string, unknown>) {
  await writeOperationalAudit(pool, {
    action,
    details,
    performedBy: getActor(req),
  }).catch((error) => console.error("User maintenance audit logging failed", error));
}

async function employeeLinkExists(pool: QueryablePool, employeeId: string) {
  const [rows]: any = await pool.query("SELECT id FROM employees WHERE id = ? LIMIT 1", [employeeId]);
  return Array.isArray(rows) && rows.length > 0;
}

async function assertEmployeeLinkAvailable(pool: QueryablePool, employeeId: string | null, currentUserId?: number) {
  if (!employeeId) return;
  if (!(await employeeLinkExists(pool, employeeId))) {
    const error = new Error("Selected employee was not found.");
    (error as any).status = 400;
    throw error;
  }
  const params: unknown[] = currentUserId ? [employeeId, currentUserId] : [employeeId];
  const [rows]: any = await pool.query(
    currentUserId
      ? "SELECT id FROM admin_users WHERE employee_id = ? AND id <> ? LIMIT 1"
      : "SELECT id FROM admin_users WHERE employee_id = ? LIMIT 1",
    params,
  );
  if (rows.length) {
    const error = new Error("This employee is already linked to another user account.");
    (error as any).status = 409;
    throw error;
  }
}

async function selectSanitizedUserById(pool: QueryablePool, id: number) {
  const [rows]: any = await pool.query(
    `SELECT ${USER_SELECT_COLUMNS}
     FROM admin_users au
     LEFT JOIN employees e ON e.id = au.employee_id
     WHERE au.id = ? LIMIT 1`,
    [id],
  );
  return rows.length ? sanitizeUser(rows[0]) : null;
}

export async function createLinkedAdminUserForEmployee(pool: QueryablePool, req: AuthenticatedRequest, input: LinkedEmployeeUserInput) {
  await ensureUserManagementTables(pool);

  const employeeId = normalizeEmployeeId(input.employeeId);
  const firstName = String(input.firstName || "").trim();
  const lastName = String(input.lastName || "").trim();
  const name = `${firstName} ${lastName}`.trim();
  const email = String(input.email || "").trim().toLowerCase();
  const username = normalizeUsername(input.username);
  const password = String(input.password || "");
  const role = ensureAssignableRole(input.role);
  const status = normalizeStatus(input.status);

  if (!employeeId || !name || !email || !username || !password || !role) {
    const error = new Error("Employee user account requires employee link, name, email, username, password and role.");
    (error as any).status = 400;
    throw error;
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    const error = new Error("A valid email is required for the employee user account.");
    (error as any).status = 400;
    throw error;
  }
  if (!validatePasswordComplexity(password)) {
    const error = new Error("Password must be 8-128 characters and include lowercase, uppercase, number and special character.");
    (error as any).status = 400;
    throw error;
  }

  await assertEmployeeLinkAvailable(pool, employeeId);

  const [duplicates]: any = await pool.query(
    "SELECT id FROM admin_users WHERE LOWER(email) = ? OR LOWER(COALESCE(username, '')) = ? LIMIT 1",
    [email, username],
  );
  if (duplicates.length) {
    const error = new Error("A user with this email or username already exists.");
    (error as any).status = 409;
    throw error;
  }

  const [result]: any = await pool.query(
    `INSERT INTO admin_users (name, email, username, employee_id, password_hash, role, status, password_changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [name, email, username, employeeId, hashPassword(password), role, status],
  );
  const created = await selectSanitizedUserById(pool, result.insertId);
  await auditUserMaintenance(pool, req, "EMPLOYEE_USER_ACCOUNT_CREATE", { employeeId, targetUserId: created?.id, created });
  return created;
}

export function registerUserManagementRoutes(app: Express, getPool: () => QueryablePool | null) {
  void refreshRolePermissionOverrides(getPool()).catch((error) => console.error("Failed to load role permission overrides", error));

  app.get("/api/settings/roles", requirePermission("user_maintenance.read"), (_req: AuthenticatedRequest, res) => {
    res.json({
      roles: ASSIGNABLE_USER_ROLES,
      appRoles: APP_ROLES,
      statuses: USER_STATUSES,
      passwordPolicy: {
        minLength: 8,
        maxLength: 128,
        requiresLowercase: true,
        requiresUppercase: true,
        requiresNumber: true,
        requiresSpecialCharacter: true,
      },
    });
  });

  app.get("/api/settings/users", requirePermission("user_maintenance.read"), async (req: AuthenticatedRequest, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    try {
      await ensureUserManagementTables(pool);
      const search = String(req.query.search || "").trim().toLowerCase();
      const role = normalizeAppRole(req.query.role);
      const status = normalizeStatus(req.query.status || "active");
      const includeAllStatuses = String(req.query.status || "all") === "all";

      const filters: string[] = [];
      const params: unknown[] = [];

      if (search) {
        filters.push("(LOWER(au.name) LIKE ? OR LOWER(au.email) LIKE ? OR LOWER(COALESCE(au.username, '')) LIKE ? OR LOWER(COALESCE(e.first_name, '')) LIKE ? OR LOWER(COALESCE(e.last_name, '')) LIKE ? OR LOWER(COALESCE(e.employee_code, '')) LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (role) {
        filters.push("au.role = ?");
        params.push(role);
      }
      if (!includeAllStatuses) {
        filters.push("COALESCE(au.status, 'active') = ?");
        params.push(status);
      }

      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const [rows]: any = await pool.query(
        `SELECT ${USER_SELECT_COLUMNS}
         FROM admin_users au
         LEFT JOIN employees e ON e.id = au.employee_id
         ${where} ORDER BY au.updated_at DESC, au.created_at DESC LIMIT 500`,
        params,
      );

      res.json({ users: (rows || []).map(sanitizeUser) });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to load users" });
    }
  });


  app.get("/api/settings/user-link-employees", requirePermission("user_maintenance.read"), async (_req: AuthenticatedRequest, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    try {
      await ensureUserManagementTables(pool);
      const [rows]: any = await pool.query(
        `SELECT e.id, e.employee_code AS employeeCode, e.first_name AS firstName, e.last_name AS lastName, e.email,
                e.department, e.job_title AS jobTitle, e.employment_status AS employmentStatus,
                au.id AS linkedUserId, au.email AS linkedUserEmail, au.username AS linkedUsername
         FROM employees e
         LEFT JOIN admin_users au ON au.employee_id = e.id
         ORDER BY e.first_name, e.last_name
         LIMIT 1000`,
      );
      res.json({ employees: rows || [] });
    } catch (error: any) {
      res.status(error?.status || 500).json({ error: error.message || "Failed to load employee links" });
    }
  });

  app.post("/api/settings/users", requirePermission("user_maintenance.write"), async (req: AuthenticatedRequest, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    try {
      await ensureUserManagementTables(pool);
      const name = String(req.body?.name || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const username = normalizeUsername(req.body?.username);
      const password = String(req.body?.password || "");
      const role = ensureAssignableRole(req.body?.role);
      const status = normalizeStatus(req.body?.status);
      const employeeId = normalizeEmployeeId(req.body?.employeeId);

      if (!name || !email || !username || !password || !role) {
        return res.status(400).json({ error: "Name, email, username, password and role are required." });
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "A valid email is required." });
      if (!validatePasswordComplexity(password)) {
        return res.status(400).json({ error: "Password must be 8-128 characters and include lowercase, uppercase, number and special character." });
      }

      await assertEmployeeLinkAvailable(pool, employeeId);

      const [duplicates]: any = await pool.query(
        "SELECT id FROM admin_users WHERE LOWER(email) = ? OR LOWER(COALESCE(username, '')) = ? LIMIT 1",
        [email, username],
      );
      if (duplicates.length) return res.status(409).json({ error: "A user with this email or username already exists." });

      const [result]: any = await pool.query(
        `INSERT INTO admin_users (name, email, username, employee_id, password_hash, role, status, password_changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [name, email, username, employeeId, hashPassword(password), role, status],
      );

      const created = await selectSanitizedUserById(pool, result.insertId);
      if (!created) return res.status(500).json({ error: "Created user could not be reloaded." });
      await auditUserMaintenance(pool, req, "USER_MAINTENANCE_CREATE", { targetUserId: created.id, created });
      res.status(201).json({ user: created });
    } catch (error: any) {
      res.status(error?.status || 500).json({ error: error.message || "Failed to create user" });
    }
  });

  app.put("/api/settings/users/:id", requirePermission("user_maintenance.write"), async (req: AuthenticatedRequest, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    try {
      await ensureUserManagementTables(pool);
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid user id" });

      const existing = await selectSanitizedUserById(pool, id);
      if (!existing) return res.status(404).json({ error: "User not found" });

      const actorRole = normalizeAppRole(req.user?.role);
      if (existing.role === "super_admin" && actorRole !== "super_admin") {
        return res.status(403).json({ error: "Only a super admin can modify a super admin account." });
      }

      const name = String(req.body?.name ?? existing.name).trim();
      const email = String(req.body?.email ?? existing.email).trim().toLowerCase();
      const username = normalizeUsername(req.body?.username ?? existing.username);
      const role = ensureAssignableRole(req.body?.role ?? existing.role) || (existing.role === "super_admin" ? "super_admin" : null);
      const status = normalizeStatus(req.body?.status ?? existing.status);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const employeeId = req.body?.employeeId === undefined ? normalizeEmployeeId(existing.employeeId) : normalizeEmployeeId(req.body?.employeeId);

      if (!name || !email || !username || !role) return res.status(400).json({ error: "Name, email, username and role are required." });
      if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "A valid email is required." });
      if (password && !validatePasswordComplexity(password)) {
        return res.status(400).json({ error: "Password must be 8-128 characters and include lowercase, uppercase, number and special character." });
      }
      if (String(req.user?.uid || "") === String(id) && status !== "active") {
        return res.status(400).json({ error: "You cannot suspend or deactivate your own account." });
      }

      await assertEmployeeLinkAvailable(pool, employeeId, id);

      const [duplicates]: any = await pool.query(
        "SELECT id FROM admin_users WHERE id <> ? AND (LOWER(email) = ? OR LOWER(COALESCE(username, '')) = ?) LIMIT 1",
        [id, email, username],
      );
      if (duplicates.length) return res.status(409).json({ error: "Another user already uses this email or username." });

      const fields = ["name = ?", "email = ?", "username = ?", "employee_id = ?", "role = ?", "status = ?"];
      const params: unknown[] = [name, email, username, employeeId, role, status];
      const changedCredentials = Boolean(password);
      if (password) {
        fields.push("password_hash = ?", "password_changed_at = NOW()");
        params.push(hashPassword(password));
      }
      params.push(id);

      await pool.query(`UPDATE admin_users SET ${fields.join(", ")} WHERE id = ?`, params);
      const updated = await selectSanitizedUserById(pool, id);
      if (!updated) return res.status(404).json({ error: "User not found after update" });
      await auditUserMaintenance(pool, req, "USER_MAINTENANCE_UPDATE", {
        targetUserId: updated.id,
        before: existing,
        after: updated,
        passwordReset: changedCredentials,
      });
      res.json({ user: updated });
    } catch (error: any) {
      res.status(error?.status || 500).json({ error: error.message || "Failed to update user" });
    }
  });

  app.delete("/api/settings/users/:id", requirePermission("user_maintenance.write"), async (req: AuthenticatedRequest, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    try {
      await ensureUserManagementTables(pool);
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid user id" });
      if (String(req.user?.uid || "") === String(id)) return res.status(400).json({ error: "You cannot delete your own account." });

      const existing = await selectSanitizedUserById(pool, id);
      if (!existing) return res.status(404).json({ error: "User not found" });

      const actorRole = normalizeAppRole(req.user?.role);
      if (existing.role === "super_admin") return res.status(403).json({ error: "Super admin accounts cannot be deleted from user maintenance." });
      if (existing.status === "active") return res.status(400).json({ error: "Only suspended or inactive users can be deleted. Suspend the account first." });
      if (actorRole !== "super_admin" && existing.role === "admin") return res.status(403).json({ error: "Only a super admin can delete an admin account." });

      await pool.query("DELETE FROM admin_users WHERE id = ?", [id]);
      await auditUserMaintenance(pool, req, "USER_MAINTENANCE_DELETE", { targetUserId: existing.id, deleted: existing });
      res.json({ deleted: true, user: existing });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to delete user" });
    }
  });

  app.get("/api/settings/role-permissions", requirePermission("role_permissions.read"), async (_req: AuthenticatedRequest, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    try {
      await refreshRolePermissionOverrides(pool);
      const [rows]: any = await pool.query("SELECT role, permission_key AS permission, allowed, updated_by, updated_at FROM role_permission_overrides ORDER BY permission_key, role");
      const permissions = getPermissionKeys().map((permission) => ({
        permission,
        defaultRoles: getDefaultAllowedRoles(permission),
        allowedRoles: getAllowedRoles(permission),
      }));
      res.json({ roles: APP_ROLES, permissions, overrides: rows || [] });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to load role permissions" });
    }
  });

  app.put("/api/settings/role-permissions/:role/:permission", requirePermission("role_permissions.write"), async (req: AuthenticatedRequest, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    try {
      await ensureUserManagementTables(pool);
      const role = normalizeAppRole(req.params.role);
      const permission = String(req.params.permission || "");
      if (!role) return res.status(400).json({ error: "Invalid role" });
      if (!getPermissionKeys().includes(permission)) return res.status(400).json({ error: "Invalid permission" });

      const allowedValue = req.body?.allowed;
      if (allowedValue === null) {
        await pool.query("DELETE FROM role_permission_overrides WHERE role = ? AND permission_key = ?", [role, permission]);
        updateRolePermissionOverride(role, permission, null);
      } else if (typeof allowedValue === "boolean") {
        await pool.query(
          `INSERT INTO role_permission_overrides (role, permission_key, allowed, updated_by)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
          [role, permission, allowedValue ? 1 : 0, getActor(req)],
        );
        updateRolePermissionOverride(role, permission, allowedValue);
      } else {
        return res.status(400).json({ error: "allowed must be true, false, or null." });
      }

      await auditUserMaintenance(pool, req, "ROLE_PERMISSION_UPDATE", { role, permission, allowed: allowedValue });
      res.json({ permission, role, allowedRoles: getAllowedRoles(permission), defaultRoles: getDefaultAllowedRoles(permission) });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to update role permission" });
    }
  });
}
