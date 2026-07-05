import crypto from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import { requirePermission } from "./rbac";

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

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function booleanToTinyInt(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value ? 1 : 0;
  if (typeof value === "string") {
    const normalized = value.toLowerCase().trim();
    if (["true", "1", "yes", "active"].includes(normalized)) return 1;
    if (["false", "0", "no", "inactive"].includes(normalized)) return 0;
  }
  return fallback ? 1 : 0;
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

function mapTransaction(row: any) {
  const data = parseJsonField(row.data);
  return {
    id: row.id,
    type: row.type || "expense",
    category: row.category || "General",
    amount: Number(row.amount || 0),
    date: rowDateToYmd(row.transaction_date),
    source: row.source || "",
    referenceType: row.reference_type || "manual",
    referenceId: row.reference_id || "",
    description: row.description || "",
    status: row.status || "posted",
    attachmentUrl: row.attachment_url || "",
    createdBy: row.created_by || "",
    approvedBy: row.approved_by || "",
    createdAt: rowDateToIso(row.created_at),
    updatedAt: rowDateToIso(row.updated_at),
    data,
  };
}

function mapLoan(row: any) {
  const data = parseJsonField(row.data);
  return {
    id: row.id,
    lenderName: row.lender_name || "",
    principalAmount: Number(row.principal_amount || 0),
    interestRate: Number(row.interest_rate || 0),
    monthlyPayment: Number(row.monthly_payment || 0),
    startDate: rowDateToYmd(row.start_date),
    endDate: rowDateToYmd(row.end_date),
    status: row.status || "active",
    notes: row.notes || "",
    createdAt: rowDateToIso(row.created_at),
    updatedAt: rowDateToIso(row.updated_at),
    data,
  };
}

function mapRental(row: any) {
  const data = parseJsonField(row.data);
  return {
    id: row.id,
    name: row.name || "",
    monthlyCost: Number(row.monthly_cost || 0),
    dueDay: Number(row.due_day || 1),
    startDate: rowDateToYmd(row.start_date),
    endDate: rowDateToYmd(row.end_date),
    landlordInfo: row.landlord_info || "",
    status: row.status || "active",
    notes: row.notes || "",
    createdAt: rowDateToIso(row.created_at),
    updatedAt: rowDateToIso(row.updated_at),
    data,
  };
}

function mapBudget(row: any) {
  return {
    id: row.id,
    category: row.category || "General",
    month: row.budget_month || "",
    monthlyTarget: Number(row.monthly_target || 0),
    actualAmount: Number(row.actual_amount || 0),
    variance: Number(row.monthly_target || 0) - Number(row.actual_amount || 0),
    createdAt: rowDateToIso(row.created_at),
    updatedAt: rowDateToIso(row.updated_at),
  };
}

async function ensureFinanceTablesNow(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS finance_transactions (
      id VARCHAR(64) PRIMARY KEY,
      type VARCHAR(32) NOT NULL,
      category VARCHAR(120) NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      transaction_date DATE NOT NULL,
      source VARCHAR(120) NULL,
      reference_type VARCHAR(64) NOT NULL DEFAULT 'manual',
      reference_id VARCHAR(64) NULL,
      description TEXT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'posted',
      attachment_url TEXT NULL,
      created_by VARCHAR(255) NULL,
      approved_by VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_finance_tx_date (transaction_date),
      INDEX idx_finance_tx_type (type),
      INDEX idx_finance_tx_category (category),
      INDEX idx_finance_tx_status (status),
      UNIQUE KEY uq_finance_reference (reference_type, reference_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS finance_loans (
      id VARCHAR(64) PRIMARY KEY,
      lender_name VARCHAR(180) NOT NULL,
      principal_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      interest_rate DECIMAL(6,3) NOT NULL DEFAULT 0,
      monthly_payment DECIMAL(12,2) NOT NULL DEFAULT 0,
      start_date DATE NULL,
      end_date DATE NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_finance_loans_status (status),
      INDEX idx_finance_loans_dates (start_date, end_date)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS finance_rentals (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      monthly_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      due_day INT NOT NULL DEFAULT 1,
      start_date DATE NULL,
      end_date DATE NULL,
      landlord_info TEXT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_finance_rentals_status (status),
      INDEX idx_finance_rentals_end_date (end_date)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS finance_budgets (
      id VARCHAR(64) PRIMARY KEY,
      category VARCHAR(120) NOT NULL,
      budget_month CHAR(7) NOT NULL,
      monthly_target DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_finance_budget_category_month (category, budget_month),
      INDEX idx_finance_budgets_month (budget_month)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS finance_recurring_entries (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      type VARCHAR(32) NOT NULL,
      category VARCHAR(120) NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      day_of_month INT NOT NULL DEFAULT 1,
      source VARCHAR(120) NULL,
      description TEXT NULL,
      last_processed_month CHAR(7) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NULL,
      INDEX idx_finance_recurring_active (is_active)
    )
  `);
}

let financeSchemaReady: Promise<void> | null = null;

async function ensureFinanceTables(pool: Pool) {
  if (!financeSchemaReady) {
    financeSchemaReady = ensureFinanceTablesNow(pool).catch((error) => {
      financeSchemaReady = null;
      throw error;
    });
  }
  await financeSchemaReady;
}

async function insertTransaction(pool: Pool, payload: Record<string, unknown>, userEmail: string | undefined) {
  const type = normalizeString(payload.type) || "expense";
  if (!["income", "expense", "transfer"].includes(type)) {
    const error = new Error("Transaction type must be income, expense, or transfer");
    (error as any).status = 400;
    throw error;
  }

  const category = normalizeString(payload.category) || "General";
  const amount = numberOrDefault(payload.amount, 0);
  if (amount <= 0) {
    const error = new Error("Amount must be greater than zero");
    (error as any).status = 400;
    throw error;
  }

  const date = normalizeDate(payload.date ?? payload.transactionDate) || new Date().toISOString().slice(0, 10);
  const id = normalizeString(payload.id) || createId("ftx");
  const referenceType = normalizeString(payload.referenceType) || "manual";
  const referenceId = normalizeString(payload.referenceId) || id;

  await pool.query(
    `INSERT INTO finance_transactions
      (id, type, category, amount, transaction_date, source, reference_type, reference_id, description, status, attachment_url, created_by, approved_by, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      type,
      category,
      amount,
      date,
      normalizeString(payload.source),
      referenceType,
      referenceId,
      normalizeString(payload.description),
      normalizeString(payload.status) || "posted",
      normalizeString(payload.attachmentUrl),
      userEmail || "system",
      normalizeString(payload.approvedBy),
      toMysqlJson(payload.data ?? {}),
    ],
  );

  const [rows]: any = await pool.query("SELECT * FROM finance_transactions WHERE id = ?", [id]);
  return mapTransaction(rows[0]);
}

export function registerFinanceRoutes(app: Express, poolProvider: PoolProvider) {
  const requireFinanceRead = requirePermission("finance.read");
  const requireFinanceWrite = requirePermission("finance.write");
  const requirePayrollPost = requirePermission("payroll.approve");

  app.use("/api/finance", requireFinanceRead);

  app.get("/api/finance/summary", async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);

      const from = normalizeDate(req.query.from) || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const to = normalizeDate(req.query.to) || new Date().toISOString().slice(0, 10);
      const params = [from, to];

      const [totalsRows]: any = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
           COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
           COUNT(*) AS transaction_count
         FROM finance_transactions
         WHERE transaction_date BETWEEN ? AND ? AND status IN ('posted', 'approved', 'paid')`,
        params,
      );

      const [categoryRows]: any = await pool.query(
        `SELECT category, type, COALESCE(SUM(amount), 0) AS total
         FROM finance_transactions
         WHERE transaction_date BETWEEN ? AND ? AND status IN ('posted', 'approved', 'paid')
         GROUP BY category, type
         ORDER BY total DESC`,
        params,
      );

      const [monthlyRows]: any = await pool.query(
        `SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS month,
           COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
           COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
         FROM finance_transactions
         WHERE transaction_date BETWEEN ? AND ? AND status IN ('posted', 'approved', 'paid')
         GROUP BY DATE_FORMAT(transaction_date, '%Y-%m')
         ORDER BY month ASC`,
        params,
      );

      const [loanRows]: any = await pool.query(
        "SELECT COALESCE(SUM(principal_amount), 0) AS active_loans, COUNT(*) AS active_loan_count FROM finance_loans WHERE status = 'active'",
      );
      const [rentalRows]: any = await pool.query(
        "SELECT COALESCE(SUM(monthly_cost), 0) AS monthly_rentals, COUNT(*) AS active_rental_count FROM finance_rentals WHERE status = 'active'",
      );

      const totals = totalsRows[0] || {};
      const totalIncome = Number(totals.total_income || 0);
      const totalExpense = Number(totals.total_expense || 0);

      res.json({
        from,
        to,
        totals: {
          income: totalIncome,
          expense: totalExpense,
          net: totalIncome - totalExpense,
          transactionCount: Number(totals.transaction_count || 0),
          activeLoans: Number(loanRows[0]?.active_loans || 0),
          activeLoanCount: Number(loanRows[0]?.active_loan_count || 0),
          monthlyRentals: Number(rentalRows[0]?.monthly_rentals || 0),
          activeRentalCount: Number(rentalRows[0]?.active_rental_count || 0),
        },
        byCategory: categoryRows.map((row: any) => ({
          category: row.category,
          type: row.type,
          total: Number(row.total || 0),
        })),
        byMonth: monthlyRows.map((row: any) => ({
          month: row.month,
          income: Number(row.income || 0),
          expense: Number(row.expense || 0),
          net: Number(row.income || 0) - Number(row.expense || 0),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/finance/transactions", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);

      const where: string[] = [];
      const params: unknown[] = [];
      const from = normalizeDate(req.query.from);
      const to = normalizeDate(req.query.to);
      const type = normalizeString(req.query.type);
      const category = normalizeString(req.query.category);
      const status = normalizeString(req.query.status);
      const minAmount = req.query.minAmount !== undefined ? Number(req.query.minAmount) : NaN;
      const maxAmount = req.query.maxAmount !== undefined ? Number(req.query.maxAmount) : NaN;
      const exactAmount = req.query.exactAmount !== undefined ? Number(req.query.exactAmount) : NaN;

      if (from) {
        where.push("transaction_date >= ?");
        params.push(from);
      }
      if (to) {
        where.push("transaction_date <= ?");
        params.push(to);
      }
      if (type && type !== "all") {
        where.push("type = ?");
        params.push(type);
      }
      if (category && category !== "all") {
        where.push("category = ?");
        params.push(category);
      }
      if (status && status !== "all") {
        where.push("status = ?");
        params.push(status);
      }
      if (Number.isFinite(exactAmount) && exactAmount >= 0) {
        where.push("amount = ?");
        params.push(exactAmount);
      } else {
        if (Number.isFinite(minAmount) && minAmount >= 0) {
          where.push("amount >= ?");
          params.push(minAmount);
        }
        if (Number.isFinite(maxAmount) && maxAmount >= 0) {
          where.push("amount <= ?");
          params.push(maxAmount);
        }
      }

      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const [rows]: any = await pool.query(
        `SELECT * FROM finance_transactions ${clause} ORDER BY transaction_date DESC, created_at DESC LIMIT 500`,
        params,
      );
      res.json({ transactions: rows.map(mapTransaction) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/finance/transactions", requireFinanceWrite, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      const transaction = await insertTransaction(pool, req.body || {}, req.user?.email);
      res.status(201).json({ transaction });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/finance/transactions/:id", requireFinanceWrite, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      const id = req.params.id;
      const currentStatus = normalizeString(req.body.status) || "posted";
      const type = normalizeString(req.body.type) || "expense";
      if (!["income", "expense", "transfer"].includes(type)) {
        return res.status(400).json({ error: "Transaction type must be income, expense, or transfer" });
      }
      await pool.query(
        `UPDATE finance_transactions
         SET type = ?, category = ?, amount = ?, transaction_date = ?, source = ?, description = ?, status = ?, attachment_url = ?, data = ?
         WHERE id = ?`,
        [
          type,
          normalizeString(req.body.category) || "General",
          numberOrDefault(req.body.amount, 0),
          normalizeDate(req.body.date) || new Date().toISOString().slice(0, 10),
          normalizeString(req.body.source),
          normalizeString(req.body.description),
          currentStatus,
          normalizeString(req.body.attachmentUrl),
          toMysqlJson(req.body.data ?? {}),
          id,
        ],
      );
      const [rows]: any = await pool.query("SELECT * FROM finance_transactions WHERE id = ?", [id]);
      if (!rows.length) return res.status(404).json({ error: "Transaction not found" });
      res.json({ transaction: mapTransaction(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/finance/transactions/:id/approve", requireFinanceWrite, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      await pool.query("UPDATE finance_transactions SET status = 'approved', approved_by = ? WHERE id = ?", [req.user?.email || "system", req.params.id]);
      const [rows]: any = await pool.query("SELECT * FROM finance_transactions WHERE id = ?", [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "Transaction not found" });
      res.json({ transaction: mapTransaction(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/finance/transactions/:id", requireFinanceWrite, async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      await pool.query("DELETE FROM finance_transactions WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/finance/loans", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      const [rows]: any = await pool.query("SELECT * FROM finance_loans ORDER BY created_at DESC");
      res.json({ loans: rows.map(mapLoan) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/finance/loans", requireFinanceWrite, async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      const id = createId("loan");
      await pool.query(
        `INSERT INTO finance_loans (id, lender_name, principal_amount, interest_rate, monthly_payment, start_date, end_date, status, notes, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          normalizeString(req.body.lenderName) || "Loan",
          numberOrDefault(req.body.principalAmount, 0),
          numberOrDefault(req.body.interestRate, 0),
          numberOrDefault(req.body.monthlyPayment, 0),
          normalizeDate(req.body.startDate),
          normalizeDate(req.body.endDate),
          normalizeString(req.body.status) || "active",
          normalizeString(req.body.notes),
          toMysqlJson(req.body.data ?? {}),
        ],
      );
      const [rows]: any = await pool.query("SELECT * FROM finance_loans WHERE id = ?", [id]);
      res.status(201).json({ loan: mapLoan(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/finance/loans/:id", requireFinanceWrite, async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      await pool.query(
        `UPDATE finance_loans SET lender_name = ?, principal_amount = ?, interest_rate = ?, monthly_payment = ?, start_date = ?, end_date = ?, status = ?, notes = ?, data = ? WHERE id = ?`,
        [
          normalizeString(req.body.lenderName) || "Loan",
          numberOrDefault(req.body.principalAmount, 0),
          numberOrDefault(req.body.interestRate, 0),
          numberOrDefault(req.body.monthlyPayment, 0),
          normalizeDate(req.body.startDate),
          normalizeDate(req.body.endDate),
          normalizeString(req.body.status) || "active",
          normalizeString(req.body.notes),
          toMysqlJson(req.body.data ?? {}),
          req.params.id,
        ],
      );
      const [rows]: any = await pool.query("SELECT * FROM finance_loans WHERE id = ?", [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "Loan not found" });
      res.json({ loan: mapLoan(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/finance/rentals", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      const [rows]: any = await pool.query("SELECT * FROM finance_rentals ORDER BY created_at DESC");
      res.json({ rentals: rows.map(mapRental) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/finance/rentals", requireFinanceWrite, async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      const id = createId("rent");
      await pool.query(
        `INSERT INTO finance_rentals (id, name, monthly_cost, due_day, start_date, end_date, landlord_info, status, notes, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          normalizeString(req.body.name) || "Rental",
          numberOrDefault(req.body.monthlyCost, 0),
          integerOrDefault(req.body.dueDay, 1),
          normalizeDate(req.body.startDate),
          normalizeDate(req.body.endDate),
          normalizeString(req.body.landlordInfo),
          normalizeString(req.body.status) || "active",
          normalizeString(req.body.notes),
          toMysqlJson(req.body.data ?? {}),
        ],
      );
      const [rows]: any = await pool.query("SELECT * FROM finance_rentals WHERE id = ?", [id]);
      res.status(201).json({ rental: mapRental(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/finance/rentals/:id", requireFinanceWrite, async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      await pool.query(
        `UPDATE finance_rentals SET name = ?, monthly_cost = ?, due_day = ?, start_date = ?, end_date = ?, landlord_info = ?, status = ?, notes = ?, data = ? WHERE id = ?`,
        [
          normalizeString(req.body.name) || "Rental",
          numberOrDefault(req.body.monthlyCost, 0),
          integerOrDefault(req.body.dueDay, 1),
          normalizeDate(req.body.startDate),
          normalizeDate(req.body.endDate),
          normalizeString(req.body.landlordInfo),
          normalizeString(req.body.status) || "active",
          normalizeString(req.body.notes),
          toMysqlJson(req.body.data ?? {}),
          req.params.id,
        ],
      );
      const [rows]: any = await pool.query("SELECT * FROM finance_rentals WHERE id = ?", [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "Rental not found" });
      res.json({ rental: mapRental(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/finance/budgets", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      const month = normalizeString(req.query.month) || new Date().toISOString().slice(0, 7);
      const [rows]: any = await pool.query(
        `SELECT b.*, COALESCE(SUM(t.amount), 0) AS actual_amount
         FROM finance_budgets b
         LEFT JOIN finance_transactions t
           ON t.category = b.category
          AND t.type = 'expense'
          AND DATE_FORMAT(t.transaction_date, '%Y-%m') = b.budget_month
          AND t.status IN ('posted', 'approved', 'paid')
         WHERE b.budget_month = ?
         GROUP BY b.id
         ORDER BY b.category ASC`,
        [month],
      );
      res.json({ budgets: rows.map(mapBudget) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/finance/budgets", requireFinanceWrite, async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      const category = normalizeString(req.body.category) || "General";
      const month = normalizeString(req.body.month) || new Date().toISOString().slice(0, 7);
      const monthlyTarget = numberOrDefault(req.body.monthlyTarget, 0);
      const id = createId("bdg");
      await pool.query(
        `INSERT INTO finance_budgets (id, category, budget_month, monthly_target)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE monthly_target = VALUES(monthly_target), updated_at = CURRENT_TIMESTAMP`,
        [id, category, month, monthlyTarget],
      );
      const [rows]: any = await pool.query(
        "SELECT *, 0 AS actual_amount FROM finance_budgets WHERE category = ? AND budget_month = ?",
        [category, month],
      );
      res.status(201).json({ budget: mapBudget(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/finance/payroll-runs/:id/post", requirePayrollPost, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      const payrollRunId = req.params.id;
      const [existing]: any = await pool.query(
        "SELECT * FROM finance_transactions WHERE reference_type = 'payroll_run' AND reference_id = ? LIMIT 1",
        [payrollRunId],
      );
      if (existing.length > 0) {
        return res.json({ transaction: mapTransaction(existing[0]), alreadyPosted: true });
      }

      const [runs]: any = await pool.query("SELECT * FROM payroll_runs WHERE id = ? LIMIT 1", [payrollRunId]);
      if (!runs.length) return res.status(404).json({ error: "Payroll run not found" });
      const run = runs[0];
      if (!["approved", "paid"].includes(run.status)) {
        return res.status(400).json({ error: "Payroll run must be approved or paid before posting to accounting" });
      }

      const transaction = await insertTransaction(
        pool,
        {
          type: "expense",
          category: "Payroll",
          amount: Number(run.total_net_pay || 0),
          date: req.body.date || new Date().toISOString().slice(0, 10),
          source: "HR Payroll",
          referenceType: "payroll_run",
          referenceId: payrollRunId,
          description: `Payroll for ${run.run_month}`,
          status: run.status === "paid" ? "paid" : "approved",
          data: { payrollRunId, runMonth: run.run_month, employeeCount: run.employee_count },
        },
        req.user?.email,
      );

      res.status(201).json({ transaction, alreadyPosted: false });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/finance/payroll-postings", async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      const [rows]: any = await pool.query(
        "SELECT * FROM finance_transactions WHERE reference_type = 'payroll_run' ORDER BY transaction_date DESC, created_at DESC",
      );
      res.json({ transactions: rows.map(mapTransaction) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/finance/recurring/process", requireFinanceWrite, async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      await ensureFinanceTables(pool);
      const today = new Date();
      const currentMonth = normalizeString(req.body.month) || today.toISOString().slice(0, 7);
      const currentDay = integerOrDefault(req.body.dayOfMonth, today.getUTCDate());
      const [rows]: any = await pool.query(
        "SELECT * FROM finance_recurring_entries WHERE is_active = 1 AND (last_processed_month IS NULL OR last_processed_month < ?)",
        [currentMonth],
      );
      const processed: any[] = [];
      for (const row of rows) {
        if (Number(row.day_of_month) > currentDay) continue;
        const tx = await insertTransaction(
          pool,
          {
            type: row.type,
            category: row.category,
            amount: Number(row.amount || 0),
            date: `${currentMonth}-${String(Math.min(Number(row.day_of_month), 28)).padStart(2, "0")}`,
            source: row.source,
            referenceType: "recurring_entry",
            referenceId: `${row.id}_${currentMonth}`,
            description: row.description || `[Auto] ${row.name}`,
            status: "posted",
            data: { recurringEntryId: row.id, processedMonth: currentMonth },
          },
          req.user?.email,
        ).catch((err) => {
          if (String(err?.message || "").includes("Duplicate")) return null;
          throw err;
        });
        await pool.query("UPDATE finance_recurring_entries SET last_processed_month = ? WHERE id = ?", [currentMonth, row.id]);
        if (tx) processed.push(tx);
      }
      res.json({ processedCount: processed.length, transactions: processed });
    } catch (error) {
      next(error);
    }
  });
}
