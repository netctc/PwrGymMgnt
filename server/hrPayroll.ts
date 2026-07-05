import crypto from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import { hasPermission, requirePermission } from "./rbac";
import { createLinkedAdminUserForEmployee, ensureUserManagementTables } from "./userManagement";
import { writeOperationalAudit } from "./observability";

type PoolProvider = () => Pool | null;

type AuthenticatedRequest = Request & {
  user?: {
    uid?: string;
    email?: string;
    role?: string;
  };
};

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

function requireHr(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!hasPermission(req as any, "hr.read")) {
    return res.status(403).json({ error: "HR permission required" });
  }
  return next();
}

function requirePayrollApproval(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!hasPermission(req as any, "payroll.approve")) {
    return res.status(403).json({ error: "Payroll approval permission required" });
  }
  return next();
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return normalizeString(value).toLowerCase();
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function normalizeDate(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerOrDefault(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMysqlJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function parseJsonField(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

function rowDateToIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function rowDateToYmd(value: unknown) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function toMysqlDateTime(value: Date) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function monthStart(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

function monthEndExclusive(month: string) {
  const start = monthStart(month);
  if (!start) return null;
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

function mapEmployee(row: any) {
  const data = parseJsonField(row.data);
  return {
    id: row.id,
    employeeCode: row.employee_code || "",
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    email: row.email || "",
    phone: row.phone || "",
    department: row.department || "General",
    jobTitle: row.job_title || "",
    employmentStatus: row.employment_status || "active",
    contractType: row.contract_type || "full-time",
    hireDate: rowDateToYmd(row.hire_date),
    baseSalary: Number(row.base_salary || 0),
    payFrequency: row.pay_frequency || "monthly",
    allowanceHousing: Number(row.allowance_housing || 0),
    allowanceTransport: Number(row.allowance_transport || 0),
    allowanceMedical: Number(row.allowance_medical || 0),
    deductionTax: Number(row.deduction_tax || 0),
    deductionInsurance: Number(row.deduction_insurance || 0),
    vacationDaysRemaining: Number(row.vacation_days_remaining || 0),
    createdAt: rowDateToIso(row.created_at),
    updatedAt: rowDateToIso(row.updated_at),
    linkedUserId: row.linked_user_id ? String(row.linked_user_id) : "",
    linkedUsername: row.linked_username || "",
    linkedUserRole: row.linked_user_role || "",
    linkedUserStatus: row.linked_user_status || "",
    data,
  };
}

function mapAttendance(row: any) {
  const data = parseJsonField(row.data);
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || "",
    workDate: rowDateToYmd(row.work_date),
    checkIn: row.check_in || "",
    checkOut: row.check_out || "",
    hoursWorked: Number(row.hours_worked || 0),
    status: row.status || "present",
    notes: row.notes || "",
    createdAt: rowDateToIso(row.created_at),
    data,
  };
}

function mapPayrollRun(row: any) {
  return {
    id: row.id,
    runMonth: row.run_month,
    status: row.status || "draft",
    employeeCount: Number(row.employee_count || 0),
    totalBase: Number(row.total_base || 0),
    totalAllowances: Number(row.total_allowances || 0),
    totalBonuses: Number(row.total_bonuses || 0),
    totalDeductions: Number(row.total_deductions || 0),
    totalNetPay: Number(row.total_net_pay || 0),
    createdBy: row.created_by || "",
    approvedBy: row.approved_by || "",
    paidAt: rowDateToIso(row.paid_at),
    createdAt: rowDateToIso(row.created_at),
    updatedAt: rowDateToIso(row.updated_at),
  };
}

function mapPayrollItem(row: any) {
  const data = parseJsonField(row.data);
  return {
    id: row.id,
    payrollRunId: row.payroll_run_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || "",
    department: row.department || "General",
    baseSalary: Number(row.base_salary || 0),
    allowances: Number(row.allowances || 0),
    bonus: Number(row.bonus || 0),
    deductions: Number(row.deductions || 0),
    attendanceDeduction: Number(row.attendance_deduction || 0),
    netPay: Number(row.net_pay || 0),
    status: row.status || "draft",
    paidAt: rowDateToIso(row.paid_at),
    data,
  };
}

async function ensureHrTablesNow(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id VARCHAR(64) PRIMARY KEY,
      employee_code VARCHAR(64) UNIQUE NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NULL,
      phone VARCHAR(50) NULL,
      department VARCHAR(120) NULL,
      job_title VARCHAR(120) NULL,
      employment_status VARCHAR(32) NOT NULL DEFAULT 'active',
      contract_type VARCHAR(80) NOT NULL DEFAULT 'full-time',
      hire_date DATE NULL,
      base_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
      pay_frequency VARCHAR(32) NOT NULL DEFAULT 'monthly',
      allowance_housing DECIMAL(12,2) NOT NULL DEFAULT 0,
      allowance_transport DECIMAL(12,2) NOT NULL DEFAULT 0,
      allowance_medical DECIMAL(12,2) NOT NULL DEFAULT 0,
      deduction_tax DECIMAL(12,2) NOT NULL DEFAULT 0,
      deduction_insurance DECIMAL(12,2) NOT NULL DEFAULT 0,
      vacation_days_remaining DECIMAL(6,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_employees_status (employment_status),
      INDEX idx_employees_department (department),
      INDEX idx_employees_email (email)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_attendance (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      employee_name VARCHAR(180) NULL,
      work_date DATE NOT NULL,
      check_in VARCHAR(16) NULL,
      check_out VARCHAR(16) NULL,
      hours_worked DECIMAL(6,2) NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'present',
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data JSON NULL,
      UNIQUE KEY uq_attendance_employee_date (employee_id, work_date),
      INDEX idx_attendance_date (work_date),
      INDEX idx_attendance_employee (employee_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_runs (
      id VARCHAR(64) PRIMARY KEY,
      run_month CHAR(7) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      employee_count INT NOT NULL DEFAULT 0,
      total_base DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_allowances DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_bonuses DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_net_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_by VARCHAR(255) NULL,
      approved_by VARCHAR(255) NULL,
      paid_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_payroll_run_month (run_month),
      INDEX idx_payroll_runs_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_items (
      id VARCHAR(64) PRIMARY KEY,
      payroll_run_id VARCHAR(64) NOT NULL,
      employee_id VARCHAR(64) NOT NULL,
      employee_name VARCHAR(180) NOT NULL,
      department VARCHAR(120) NULL,
      base_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
      allowances DECIMAL(12,2) NOT NULL DEFAULT 0,
      bonus DECIMAL(12,2) NOT NULL DEFAULT 0,
      deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
      attendance_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
      net_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      paid_at DATETIME NULL,
      data JSON NULL,
      INDEX idx_payroll_items_run (payroll_run_id),
      INDEX idx_payroll_items_employee (employee_id),
      CONSTRAINT fk_payroll_items_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_departments (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      code VARCHAR(10) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_hr_departments_name (name),
      UNIQUE KEY uq_hr_departments_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_job_titles (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      department_id VARCHAR(64) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_hr_job_titles_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Seed default departments if empty
  const [deptCount]: any = await pool.query("SELECT COUNT(*) AS c FROM hr_departments");
  if (Number(deptCount[0]?.c || 0) === 0) {
    await pool.query(`INSERT IGNORE INTO hr_departments (id, name, code) VALUES
      ('dept_gen', 'General', 'GEN'),
      ('dept_adm', 'Administration', 'ADM'),
      ('dept_fit', 'Fitness', 'FIT'),
      ('dept_sal', 'Sales', 'SAL'),
      ('dept_mnt', 'Maintenance', 'MNT'),
      ('dept_rec', 'Reception', 'REC')
    `);
  }
}

function employeeSelectSql(whereClause = "") {
  return `SELECT e.*, au.id AS linked_user_id, au.username AS linked_username, au.role AS linked_user_role, au.status AS linked_user_status
          FROM employees e
          LEFT JOIN admin_users au ON au.employee_id = e.id
          ${whereClause}`;
}

async function auditHrEmployeeUserAction(pool: Pool, req: AuthenticatedRequest, action: string, details: Record<string, unknown>) {
  await writeOperationalAudit(pool, {
    action,
    details,
    performedBy: req.user?.email || req.user?.uid || "system",
  }).catch((error) => console.error("HR user link audit logging failed", error));
}

async function calculateAttendanceDeduction(pool: Pool, employeeId: string, runMonth: string, dailyRate: number) {
  const start = monthStart(runMonth);
  const end = monthEndExclusive(runMonth);
  if (!start || !end) return 0;
  const [rows]: any = await pool.query(
    `SELECT status, COUNT(*) AS count FROM employee_attendance
     WHERE employee_id = ? AND work_date >= ? AND work_date < ?
     GROUP BY status`,
    [employeeId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)],
  );

  const absent = rows.find((row: any) => row.status === "absent")?.count || 0;
  const unpaidLeave = rows.find((row: any) => row.status === "unpaid_leave")?.count || 0;
  return Number(absent + unpaidLeave) * dailyRate;
}

function sanitizeEmployeePayload(body: any) {
  const firstName = normalizeString(body.firstName);
  const lastName = normalizeString(body.lastName);
  if (!firstName || !lastName) {
    const error = new Error("First name and last name are required");
    (error as any).status = 400;
    throw error;
  }

  return {
    employeeCode: normalizeString(body.employeeCode) || null,
    firstName,
    lastName,
    email: normalizeEmail(body.email) || null,
    phone: normalizeString(body.phone) || null,
    department: normalizeString(body.department) || "General",
    jobTitle: normalizeString(body.jobTitle) || null,
    employmentStatus: normalizeString(body.employmentStatus) || "active",
    contractType: normalizeString(body.contractType) || "full-time",
    hireDate: normalizeDate(body.hireDate),
    baseSalary: numberOrDefault(body.baseSalary, 0),
    payFrequency: normalizeString(body.payFrequency) || "monthly",
    allowanceHousing: numberOrDefault(body.allowanceHousing, 0),
    allowanceTransport: numberOrDefault(body.allowanceTransport, 0),
    allowanceMedical: numberOrDefault(body.allowanceMedical, 0),
    deductionTax: numberOrDefault(body.deductionTax, 0),
    deductionInsurance: numberOrDefault(body.deductionInsurance, 0),
    vacationDaysRemaining: numberOrDefault(body.vacationDaysRemaining, 0),
    data: body.data || {},
  };
}

function sanitizeEmployeeUserAccountPayload(body: any, payload: ReturnType<typeof sanitizeEmployeePayload>, employeeId: string) {
  const account = body?.userAccount || {};
  const username = normalizeString(account.username ?? body.username);
  const password = String(account.password ?? body.password ?? "");
  const role = normalizeString(account.role ?? body.role);
  const status = normalizeString(account.status ?? body.userStatus ?? "active") || "active";
  const email = normalizeEmail(account.email ?? body.userEmail ?? payload.email);
  return {
    employeeId,
    firstName: payload.firstName,
    lastName: payload.lastName,
    email,
    username,
    password,
    role,
    status,
  };
}

let hrSchemaReady: Promise<void> | null = null;

async function ensureHrTables(pool: Pool) {
  if (!hrSchemaReady) {
    hrSchemaReady = ensureHrTablesNow(pool).catch((error) => {
      hrSchemaReady = null;
      throw error;
    });
  }
  await hrSchemaReady;
}

function handleRouteError(res: Response, error: any) {
  const status = error?.status || 500;
  return res.status(status).json({ error: error?.message || "Unexpected server error" });
}

export function registerHrPayrollRoutes(app: Express, poolProvider: PoolProvider) {
  const requireHrWrite = requirePermission("hr.write");

  app.use("/api/hr", requireHr);

  app.get("/api/hr/employees", async (req, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      await ensureUserManagementTables(pool);
      const search = normalizeString(req.query.search).toLowerCase();
      const status = normalizeString(req.query.status);
      const values: any[] = [];
      const filters: string[] = [];

      if (search) {
        filters.push("(LOWER(e.first_name) LIKE ? OR LOWER(e.last_name) LIKE ? OR LOWER(e.email) LIKE ? OR LOWER(e.employee_code) LIKE ?)");
        const like = `%${search}%`;
        values.push(like, like, like, like);
      }
      if (status && status !== "all") {
        filters.push("e.employment_status = ?");
        values.push(status);
      }

      const [rows]: any = await pool.query(
        `${employeeSelectSql(filters.length ? `WHERE ${filters.join(" AND ")}` : "")} ORDER BY e.created_at DESC`,
        values,
      );
      res.json({ employees: rows.map(mapEmployee) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post("/api/hr/employees", requireHrWrite, async (req: AuthenticatedRequest, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      await ensureUserManagementTables(pool);
      const payload = sanitizeEmployeePayload(req.body || {});
      const id = createId("emp");
      const shouldCreateUserAccount = normalizeBoolean((req.body || {}).createUserAccount);
      let createdUser: any = null;
      await pool.query(
        `INSERT INTO employees (
          id, employee_code, first_name, last_name, email, phone, department, job_title,
          employment_status, contract_type, hire_date, base_salary, pay_frequency,
          allowance_housing, allowance_transport, allowance_medical, deduction_tax,
          deduction_insurance, vacation_days_remaining, data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          payload.employeeCode,
          payload.firstName,
          payload.lastName,
          payload.email,
          payload.phone,
          payload.department,
          payload.jobTitle,
          payload.employmentStatus,
          payload.contractType,
          payload.hireDate,
          payload.baseSalary,
          payload.payFrequency,
          payload.allowanceHousing,
          payload.allowanceTransport,
          payload.allowanceMedical,
          payload.deductionTax,
          payload.deductionInsurance,
          payload.vacationDaysRemaining,
          toMysqlJson(payload.data),
        ],
      );
      if (shouldCreateUserAccount) {
        try {
          createdUser = await createLinkedAdminUserForEmployee(pool, req, sanitizeEmployeeUserAccountPayload(req.body || {}, payload, id));
          await auditHrEmployeeUserAction(pool, req, "HR_EMPLOYEE_LINKED_USER_CREATE", { employeeId: id, userId: createdUser?.id, role: createdUser?.role });
        } catch (error) {
          await pool.query("DELETE FROM employees WHERE id = ?", [id]).catch(() => undefined);
          throw error;
        }
      }
      const [rows]: any = await pool.query(`${employeeSelectSql("WHERE e.id = ?")}`, [id]);
      res.status(201).json({ employee: mapEmployee(rows[0]), user: createdUser });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.put("/api/hr/employees/:id", requireHrWrite, async (req: AuthenticatedRequest, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      await ensureUserManagementTables(pool);
      const payload = sanitizeEmployeePayload(req.body || {});
      const shouldCreateUserAccount = normalizeBoolean((req.body || {}).createUserAccount);
      let createdUser: any = null;

      await pool.query(
        `UPDATE employees SET
          employee_code = ?, first_name = ?, last_name = ?, email = ?, phone = ?, department = ?, job_title = ?,
          employment_status = ?, contract_type = ?, hire_date = ?, base_salary = ?, pay_frequency = ?,
          allowance_housing = ?, allowance_transport = ?, allowance_medical = ?, deduction_tax = ?,
          deduction_insurance = ?, vacation_days_remaining = ?, data = ?
         WHERE id = ?`,
        [
          payload.employeeCode,
          payload.firstName,
          payload.lastName,
          payload.email,
          payload.phone,
          payload.department,
          payload.jobTitle,
          payload.employmentStatus,
          payload.contractType,
          payload.hireDate,
          payload.baseSalary,
          payload.payFrequency,
          payload.allowanceHousing,
          payload.allowanceTransport,
          payload.allowanceMedical,
          payload.deductionTax,
          payload.deductionInsurance,
          payload.vacationDaysRemaining,
          toMysqlJson(payload.data),
          req.params.id,
        ],
      );

      const [existingRows]: any = await pool.query("SELECT id FROM employees WHERE id = ? LIMIT 1", [req.params.id]);
      if (existingRows.length === 0) return res.status(404).json({ error: "Employee not found" });

      if (shouldCreateUserAccount) {
        createdUser = await createLinkedAdminUserForEmployee(pool, req, sanitizeEmployeeUserAccountPayload(req.body || {}, payload, req.params.id));
        await auditHrEmployeeUserAction(pool, req, "HR_EMPLOYEE_LINKED_USER_CREATE_FROM_EDIT", { employeeId: req.params.id, userId: createdUser?.id, role: createdUser?.role });
      }

      const [rows]: any = await pool.query(`${employeeSelectSql("WHERE e.id = ?")}`, [req.params.id]);
      res.json({ employee: mapEmployee(rows[0]), user: createdUser });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get("/api/hr/attendance", async (req, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const employeeId = normalizeString(req.query.employeeId);
      const from = normalizeDate(req.query.from) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const to = normalizeDate(req.query.to) || new Date().toISOString().slice(0, 10);
      const values: any[] = [from, to];
      const filters = ["work_date >= ?", "work_date <= ?"];
      if (employeeId) {
        filters.push("employee_id = ?");
        values.push(employeeId);
      }
      const [rows]: any = await pool.query(
        `SELECT * FROM employee_attendance WHERE ${filters.join(" AND ")} ORDER BY work_date DESC, created_at DESC`,
        values,
      );
      res.json({ attendance: rows.map(mapAttendance) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post("/api/hr/attendance", requireHrWrite, async (req, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const employeeId = normalizeString(req.body.employeeId);
      const workDate = normalizeDate(req.body.workDate);
      if (!employeeId || !workDate) return res.status(400).json({ error: "Employee and work date are required" });

      const [employeeRows]: any = await pool.query("SELECT * FROM employees WHERE id = ?", [employeeId]);
      if (employeeRows.length === 0) return res.status(404).json({ error: "Employee not found" });
      const employeeName = `${employeeRows[0].first_name} ${employeeRows[0].last_name}`.trim();
      const id = createId("att");
      const checkIn = normalizeString(req.body.checkIn);
      const checkOut = normalizeString(req.body.checkOut);
      const hoursWorked = numberOrDefault(req.body.hoursWorked, 0);
      const status = normalizeString(req.body.status) || "present";
      const notes = normalizeString(req.body.notes);

      await pool.query(
        `INSERT INTO employee_attendance (id, employee_id, employee_name, work_date, check_in, check_out, hours_worked, status, notes, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE employee_name = VALUES(employee_name), check_in = VALUES(check_in), check_out = VALUES(check_out),
         hours_worked = VALUES(hours_worked), status = VALUES(status), notes = VALUES(notes), data = VALUES(data)`,
        [id, employeeId, employeeName, workDate, checkIn || null, checkOut || null, hoursWorked, status, notes || null, toMysqlJson(req.body.data || {})],
      );

      const [rows]: any = await pool.query("SELECT * FROM employee_attendance WHERE employee_id = ? AND work_date = ?", [employeeId, workDate]);
      res.status(201).json({ attendance: mapAttendance(rows[0]) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get("/api/hr/payroll/runs", async (req, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const [rows]: any = await pool.query("SELECT * FROM payroll_runs ORDER BY run_month DESC, created_at DESC LIMIT 24");
      res.json({ payrollRuns: rows.map(mapPayrollRun) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post("/api/hr/payroll/runs", requireHrWrite, async (req: AuthenticatedRequest, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const runMonth = normalizeString(req.body.runMonth);
      if (!monthStart(runMonth)) return res.status(400).json({ error: "runMonth must be in YYYY-MM format" });
      const defaultBonus = numberOrDefault(req.body.defaultBonus, 0);
      const additionalDeduction = numberOrDefault(req.body.additionalDeduction, 0);

      const [existingRows]: any = await pool.query("SELECT id FROM payroll_runs WHERE run_month = ? LIMIT 1", [runMonth]);
      if (existingRows.length > 0 && !req.body.replaceExisting) {
        return res.status(409).json({ error: "Payroll run already exists for this month", payrollRunId: existingRows[0].id });
      }

      if (existingRows.length > 0 && req.body.replaceExisting) {
        await pool.query("DELETE FROM payroll_runs WHERE id = ?", [existingRows[0].id]);
      }

      const [employees]: any = await pool.query("SELECT * FROM employees WHERE employment_status = 'active' ORDER BY first_name, last_name");
      if (employees.length === 0) return res.status(400).json({ error: "No active employees found" });

      const runId = createId("payrun");
      const items: any[] = [];
      let totalBase = 0;
      let totalAllowances = 0;
      let totalBonuses = 0;
      let totalDeductions = 0;
      let totalNetPay = 0;

      for (const employee of employees) {
        const baseSalary = Number(employee.base_salary || 0);
        const allowances = Number(employee.allowance_housing || 0) + Number(employee.allowance_transport || 0) + Number(employee.allowance_medical || 0);
        const fixedDeductions = Number(employee.deduction_tax || 0) + Number(employee.deduction_insurance || 0) + additionalDeduction;
        const dailyRate = baseSalary / 30;
        const attendanceDeduction = await calculateAttendanceDeduction(pool, employee.id, runMonth, dailyRate);
        const deductions = fixedDeductions + attendanceDeduction;
        const bonus = defaultBonus;
        const netPay = baseSalary + allowances + bonus - deductions;
        const employeeName = `${employee.first_name} ${employee.last_name}`.trim();
        items.push([
          createId("payitem"),
          runId,
          employee.id,
          employeeName,
          employee.department || "General",
          baseSalary,
          allowances,
          bonus,
          deductions,
          attendanceDeduction,
          netPay,
          "draft",
          toMysqlJson({ payFrequency: employee.pay_frequency, generatedFrom: "Delivery 5 payroll engine" }),
        ]);
        totalBase += baseSalary;
        totalAllowances += allowances;
        totalBonuses += bonus;
        totalDeductions += deductions;
        totalNetPay += netPay;
      }

      await pool.query(
        `INSERT INTO payroll_runs (id, run_month, status, employee_count, total_base, total_allowances, total_bonuses, total_deductions, total_net_pay, created_by)
         VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
        [runId, runMonth, employees.length, totalBase, totalAllowances, totalBonuses, totalDeductions, totalNetPay, req.user?.email || "system"],
      );

      await pool.query(
        `INSERT INTO payroll_items (id, payroll_run_id, employee_id, employee_name, department, base_salary, allowances, bonus, deductions, attendance_deduction, net_pay, status, data)
         VALUES ?`,
        [items],
      );

      const [runRows]: any = await pool.query("SELECT * FROM payroll_runs WHERE id = ?", [runId]);
      const [itemRows]: any = await pool.query("SELECT * FROM payroll_items WHERE payroll_run_id = ? ORDER BY employee_name", [runId]);
      res.status(201).json({ payrollRun: mapPayrollRun(runRows[0]), items: itemRows.map(mapPayrollItem) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get("/api/hr/payroll/runs/:id", async (req, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const [runRows]: any = await pool.query("SELECT * FROM payroll_runs WHERE id = ?", [req.params.id]);
      if (runRows.length === 0) return res.status(404).json({ error: "Payroll run not found" });
      const [itemRows]: any = await pool.query("SELECT * FROM payroll_items WHERE payroll_run_id = ? ORDER BY employee_name", [req.params.id]);
      res.json({ payrollRun: mapPayrollRun(runRows[0]), items: itemRows.map(mapPayrollItem) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post("/api/hr/payroll/runs/:id/approve", requirePayrollApproval, async (req: AuthenticatedRequest, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      await pool.query("UPDATE payroll_runs SET status = 'approved', approved_by = ? WHERE id = ? AND status = 'draft'", [req.user?.email || "system", req.params.id]);
      await pool.query("UPDATE payroll_items SET status = 'approved' WHERE payroll_run_id = ? AND status = 'draft'", [req.params.id]);
      const [runRows]: any = await pool.query("SELECT * FROM payroll_runs WHERE id = ?", [req.params.id]);
      if (runRows.length === 0) return res.status(404).json({ error: "Payroll run not found" });
      res.json({ payrollRun: mapPayrollRun(runRows[0]) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post("/api/hr/payroll/runs/:id/mark-paid", requirePayrollApproval, async (req, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const paidAt = toMysqlDateTime(new Date());
      await pool.query("UPDATE payroll_runs SET status = 'paid', paid_at = ? WHERE id = ? AND status IN ('draft', 'approved')", [paidAt, req.params.id]);
      await pool.query("UPDATE payroll_items SET status = 'paid', paid_at = ? WHERE payroll_run_id = ? AND status IN ('draft', 'approved')", [paidAt, req.params.id]);
      const [runRows]: any = await pool.query("SELECT * FROM payroll_runs WHERE id = ?", [req.params.id]);
      if (runRows.length === 0) return res.status(404).json({ error: "Payroll run not found" });
      res.json({ payrollRun: mapPayrollRun(runRows[0]) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get("/api/hr/payroll/history", async (req, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const runMonth = normalizeString(req.query.month);
      const values: any[] = [];
      const filters: string[] = [];
      if (runMonth) {
        filters.push("pr.run_month = ?");
        values.push(runMonth);
      }
      const [rows]: any = await pool.query(
        `SELECT pi.*, pr.run_month FROM payroll_items pi
         JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
         ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
         ORDER BY pr.run_month DESC, pi.employee_name ASC LIMIT 500`,
        values,
      );
      res.json({ items: rows.map((row: any) => ({ ...mapPayrollItem(row), runMonth: row.run_month })) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  // --- Departments CRUD ---
  app.get("/api/hr/departments", async (_req, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const [rows]: any = await pool.query("SELECT * FROM hr_departments ORDER BY name ASC");
      res.json({ departments: rows.map((r: any) => ({ id: r.id, name: r.name, code: r.code, status: r.status })) });
    } catch (error) { handleRouteError(res, error); }
  });

  app.post("/api/hr/departments", requireHrWrite, async (req: AuthenticatedRequest, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const name = normalizeString(req.body.name);
      const code = normalizeString(req.body.code).toUpperCase().slice(0, 10);
      if (!name || !code) return res.status(400).json({ error: "Name and code are required" });
      const id = createId("dept");
      await pool.query("INSERT INTO hr_departments (id, name, code, status) VALUES (?, ?, ?, 'active')", [id, name, code]);
      res.status(201).json({ department: { id, name, code, status: "active" } });
    } catch (error) { handleRouteError(res, error); }
  });

  app.put("/api/hr/departments/:id", requireHrWrite, async (req: AuthenticatedRequest, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const name = normalizeString(req.body.name);
      const code = normalizeString(req.body.code).toUpperCase().slice(0, 10);
      const status = normalizeString(req.body.status) || "active";
      if (!name) return res.status(400).json({ error: "Name is required" });
      await pool.query("UPDATE hr_departments SET name = ?, code = ?, status = ? WHERE id = ?", [name, code, status, req.params.id]);
      res.json({ department: { id: req.params.id, name, code, status } });
    } catch (error) { handleRouteError(res, error); }
  });

  app.delete("/api/hr/departments/:id", requireHrWrite, async (req: AuthenticatedRequest, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      await pool.query("DELETE FROM hr_departments WHERE id = ?", [req.params.id]);
      res.json({ ok: true });
    } catch (error) { handleRouteError(res, error); }
  });

  // --- Job Titles CRUD ---
  app.get("/api/hr/job-titles", async (_req, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const [rows]: any = await pool.query("SELECT * FROM hr_job_titles ORDER BY name ASC");
      res.json({ jobTitles: rows.map((r: any) => ({ id: r.id, name: r.name, departmentId: r.department_id, status: r.status })) });
    } catch (error) { handleRouteError(res, error); }
  });

  app.post("/api/hr/job-titles", requireHrWrite, async (req: AuthenticatedRequest, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const name = normalizeString(req.body.name);
      if (!name) return res.status(400).json({ error: "Name is required" });
      const id = createId("jt");
      const departmentId = normalizeString(req.body.departmentId) || null;
      await pool.query("INSERT INTO hr_job_titles (id, name, department_id, status) VALUES (?, ?, ?, 'active')", [id, name, departmentId]);
      res.status(201).json({ jobTitle: { id, name, departmentId, status: "active" } });
    } catch (error) { handleRouteError(res, error); }
  });

  app.put("/api/hr/job-titles/:id", requireHrWrite, async (req: AuthenticatedRequest, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const name = normalizeString(req.body.name);
      const status = normalizeString(req.body.status) || "active";
      if (!name) return res.status(400).json({ error: "Name is required" });
      const departmentId = normalizeString(req.body.departmentId) || null;
      await pool.query("UPDATE hr_job_titles SET name = ?, department_id = ?, status = ? WHERE id = ?", [name, departmentId, status, req.params.id]);
      res.json({ jobTitle: { id: req.params.id, name, departmentId, status } });
    } catch (error) { handleRouteError(res, error); }
  });

  app.delete("/api/hr/job-titles/:id", requireHrWrite, async (req: AuthenticatedRequest, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      await pool.query("DELETE FROM hr_job_titles WHERE id = ?", [req.params.id]);
      res.json({ ok: true });
    } catch (error) { handleRouteError(res, error); }
  });

  // --- Employee Code Auto-Generation ---
  app.get("/api/hr/next-employee-code", async (req, res) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureHrTables(pool);
      const department = normalizeString(req.query.department);
      // Look up the department code
      let deptCode = "GEN";
      if (department) {
        const [deptRows]: any = await pool.query("SELECT code FROM hr_departments WHERE name = ? OR id = ? LIMIT 1", [department, department]);
        if (deptRows.length > 0) deptCode = deptRows[0].code;
      }
      const year = new Date().getFullYear();
      const prefix = `EMP-${year}-${deptCode}-`;
      const [rows]: any = await pool.query(
        "SELECT employee_code FROM employees WHERE employee_code LIKE ? ORDER BY employee_code DESC LIMIT 1",
        [`${prefix}%`],
      );
      let sequence = 1;
      if (rows.length > 0) {
        const lastCode = String(rows[0].employee_code || "");
        const lastSeq = Number.parseInt(lastCode.slice(prefix.length), 10);
        if (Number.isFinite(lastSeq)) sequence = lastSeq + 1;
      }
      const code = `${prefix}${String(sequence).padStart(3, "0")}`;
      res.json({ code });
    } catch (error) { handleRouteError(res, error); }
  });
}
