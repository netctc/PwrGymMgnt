import type { Express, Request, Response, NextFunction } from "express";
import type { Pool } from "mysql2/promise";
import { hasPermission } from "./rbac";
import { activeMembersWithoutCurrentSubscriptionSql } from "./membershipEligibility";

type PoolProvider = () => Pool | null;

type AuthenticatedRequest = Request & {
  user?: {
    uid?: string;
    email?: string;
    role?: string;
  };
};

type IntegritySeverity = "critical" | "warning" | "info";

type IntegrityCheck = {
  id: string;
  module: string;
  title: string;
  severity: IntegritySeverity;
  description: string;
  recommendation: string;
  sql: string;
  sampleSql: string;
};

type RepairDefinition = {
  id: string;
  title: string;
  description: string;
  recommendation: string;
  countSql: string;
  applySql: string;
};

type IntegrityFinding = {
  id: string;
  module: string;
  title: string;
  severity: IntegritySeverity;
  description: string;
  recommendation: string;
  count: number;
  status: "pass" | "fail";
};

const MAX_SAMPLE_LIMIT = 100;

function requirePool(poolProvider: PoolProvider) {
  const pool = poolProvider();
  if (!pool) {
    const error = new Error("Database not connected");
    (error as any).status = 503;
    throw error;
  }
  return pool;
}

function requireDataIntegrityPermission(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!hasPermission(req as any, "platform.data.integrity")) {
    return res.status(403).json({ error: "Data integrity permission required" });
  }
  return next();
}

function normalizeLimit(value: unknown, fallback = 25, max = MAX_SAMPLE_LIMIT) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function toCount(row: unknown) {
  const value = (row as any)?.count ?? (row as any)?.issue_count ?? 0;
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function severityWeight(severity: IntegritySeverity) {
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}

export const DATA_INTEGRITY_CHECKS: IntegrityCheck[] = [
  {
    id: "member-subscriptions-missing-member",
    module: "membership",
    title: "Member subscriptions without member",
    severity: "critical",
    description: "A normalized subscription points to a member ID that no longer exists.",
    recommendation: "Restore the member, migrate the subscription to the correct member, or archive the orphan subscription after business review.",
    sql: `SELECT COUNT(*) AS count
      FROM member_subscriptions ms
      LEFT JOIN members m ON m.id = ms.member_id
      WHERE m.id IS NULL`,
    sampleSql: `SELECT ms.id, ms.member_id, ms.plan_name, ms.status, ms.start_date, ms.end_date
      FROM member_subscriptions ms
      LEFT JOIN members m ON m.id = ms.member_id
      WHERE m.id IS NULL
      ORDER BY ms.created_at DESC
      LIMIT ?`,
  },
  {
    id: "active-members-without-current-subscription",
    module: "membership",
    title: "Active members without current subscription",
    severity: "warning",
    description: "A member is marked active, but no active future-dated subscription was found in the member_subscriptions table.",
    recommendation: "Create/renew the member subscription, correct casing/status values, or mark the member inactive if access should be blocked.",
    sql: activeMembersWithoutCurrentSubscriptionSql("COUNT(*) AS count"),
    sampleSql: activeMembersWithoutCurrentSubscriptionSql(
      "m.id, m.email, m.status, m.plan, m.join_date",
      "ORDER BY m.join_date ASC LIMIT ?",
    ),
  },
  {
    id: "duplicate-active-member-emails",
    module: "membership",
    title: "Duplicate active member emails",
    severity: "warning",
    description: "More than one active member shares the same email address, which can confuse delivery, search, and audit workflows.",
    recommendation: "Merge duplicate profiles or correct the email addresses before enabling identity-sensitive automations.",
    sql: `SELECT COUNT(*) AS count FROM (
        SELECT LOWER(email) AS normalized_email
        FROM members
        WHERE email IS NOT NULL AND email <> '' AND LOWER(COALESCE(status, '')) = 'active'
        GROUP BY LOWER(email)
        HAVING COUNT(*) > 1
      ) duplicates`,
    sampleSql: `SELECT LOWER(email) AS email, COUNT(*) AS duplicate_count,
        GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') AS member_ids
      FROM members
      WHERE email IS NOT NULL AND email <> '' AND LOWER(COALESCE(status, '')) = 'active'
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
      LIMIT ?`,
  },
  {
    id: "invoices-missing-member",
    module: "finance",
    title: "Invoices without member",
    severity: "critical",
    description: "An invoice references a member that does not exist, making collection and reports unreliable.",
    recommendation: "Relink the invoice to the correct member or archive it after confirming it is historical/test data.",
    sql: `SELECT COUNT(*) AS count
      FROM invoices i
      LEFT JOIN members m ON m.id = i.member_id
      WHERE m.id IS NULL`,
    sampleSql: `SELECT i.id, i.invoice_number, i.member_id, i.status, i.total, i.due_date, i.created_at
      FROM invoices i
      LEFT JOIN members m ON m.id = i.member_id
      WHERE m.id IS NULL
      ORDER BY i.created_at DESC
      LIMIT ?`,
  },
  {
    id: "invoices-missing-subscription",
    module: "finance",
    title: "Invoices linked to missing subscriptions",
    severity: "warning",
    description: "An invoice has a subscription_id, but the referenced subscription is missing.",
    recommendation: "Relink the invoice, clear subscription_id if it is a manual invoice, or migrate legacy subscription history.",
    sql: `SELECT COUNT(*) AS count
      FROM invoices i
      LEFT JOIN member_subscriptions ms ON ms.id = i.subscription_id
      WHERE i.subscription_id IS NOT NULL AND i.subscription_id <> '' AND ms.id IS NULL`,
    sampleSql: `SELECT i.id, i.invoice_number, i.member_id, i.subscription_id, i.status, i.total
      FROM invoices i
      LEFT JOIN member_subscriptions ms ON ms.id = i.subscription_id
      WHERE i.subscription_id IS NOT NULL AND i.subscription_id <> '' AND ms.id IS NULL
      ORDER BY i.created_at DESC
      LIMIT ?`,
  },
  {
    id: "active-access-tokens-expired",
    module: "membership",
    title: "Expired access tokens still active",
    severity: "warning",
    description: "An access token is still marked active even though its expiry is in the past.",
    recommendation: "Run the safe repair to mark expired tokens as expired and preserve the audit trail.",
    sql: `SELECT COUNT(*) AS count
      FROM access_tokens
      WHERE LOWER(COALESCE(status, '')) = 'active'
        AND revoked_at IS NULL
        AND expires_at IS NOT NULL
        AND expires_at < NOW()`,
    sampleSql: `SELECT id, member_id, status, expires_at, created_at
      FROM access_tokens
      WHERE LOWER(COALESCE(status, '')) = 'active'
        AND revoked_at IS NULL
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
      ORDER BY expires_at ASC
      LIMIT ?`,
  },
  {
    id: "class-bookings-missing-member",
    module: "scheduling",
    title: "Class bookings without member",
    severity: "critical",
    description: "A class booking references a member that does not exist.",
    recommendation: "Restore the member record or cancel/archive the orphan booking before running attendance or capacity reports.",
    sql: `SELECT COUNT(*) AS count
      FROM class_bookings cb
      LEFT JOIN members m ON m.id = cb.member_id
      WHERE m.id IS NULL`,
    sampleSql: `SELECT cb.id, cb.class_id, cb.member_id, cb.member_name, cb.status, cb.booked_at
      FROM class_bookings cb
      LEFT JOIN members m ON m.id = cb.member_id
      WHERE m.id IS NULL
      ORDER BY cb.booked_at DESC
      LIMIT ?`,
  },
  {
    id: "class-bookings-missing-class",
    module: "scheduling",
    title: "Class bookings without class session",
    severity: "critical",
    description: "A booking references a class session that does not exist.",
    recommendation: "Restore the class session or cancel/archive the orphan booking.",
    sql: `SELECT COUNT(*) AS count
      FROM class_bookings cb
      LEFT JOIN class_sessions cs ON cs.id = cb.class_id
      WHERE cs.id IS NULL`,
    sampleSql: `SELECT cb.id, cb.class_id, cb.member_id, cb.member_name, cb.status, cb.booked_at
      FROM class_bookings cb
      LEFT JOIN class_sessions cs ON cs.id = cb.class_id
      WHERE cs.id IS NULL
      ORDER BY cb.booked_at DESC
      LIMIT ?`,
  },
  {
    id: "private-sessions-missing-member",
    module: "scheduling",
    title: "Private PT sessions without member",
    severity: "critical",
    description: "A private session references a member that does not exist.",
    recommendation: "Relink the private session or cancel/archive it after operational review.",
    sql: `SELECT COUNT(*) AS count
      FROM private_sessions ps
      LEFT JOIN members m ON m.id = ps.member_id
      WHERE m.id IS NULL`,
    sampleSql: `SELECT ps.id, ps.member_id, ps.member_name, ps.trainer_id, ps.start_time, ps.status
      FROM private_sessions ps
      LEFT JOIN members m ON m.id = ps.member_id
      WHERE m.id IS NULL
      ORDER BY ps.start_time DESC
      LIMIT ?`,
  },
  {
    id: "attendance-missing-employee",
    module: "hr",
    title: "Attendance without employee",
    severity: "critical",
    description: "Attendance rows reference an employee that does not exist.",
    recommendation: "Restore the employee, relink attendance, or archive orphan attendance after payroll review.",
    sql: `SELECT COUNT(*) AS count
      FROM employee_attendance ea
      LEFT JOIN employees e ON e.id = ea.employee_id
      WHERE e.id IS NULL`,
    sampleSql: `SELECT ea.id, ea.employee_id, ea.employee_name, ea.work_date, ea.status, ea.hours_worked
      FROM employee_attendance ea
      LEFT JOIN employees e ON e.id = ea.employee_id
      WHERE e.id IS NULL
      ORDER BY ea.work_date DESC
      LIMIT ?`,
  },
  {
    id: "payroll-items-missing-run",
    module: "hr",
    title: "Payroll items without payroll run",
    severity: "critical",
    description: "A payroll item references a payroll run that does not exist.",
    recommendation: "Restore the payroll run or remove/rebuild the orphan payroll item before payout reconciliation.",
    sql: `SELECT COUNT(*) AS count
      FROM payroll_items pi
      LEFT JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
      WHERE pr.id IS NULL`,
    sampleSql: `SELECT pi.id, pi.payroll_run_id, pi.employee_id, pi.employee_name, pi.status, pi.net_pay
      FROM payroll_items pi
      LEFT JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
      WHERE pr.id IS NULL
      ORDER BY pi.employee_name ASC
      LIMIT ?`,
  },
  {
    id: "payroll-items-missing-employee",
    module: "hr",
    title: "Payroll items without employee",
    severity: "critical",
    description: "A payroll item references an employee that does not exist.",
    recommendation: "Restore the employee record or rebuild payroll after HR review.",
    sql: `SELECT COUNT(*) AS count
      FROM payroll_items pi
      LEFT JOIN employees e ON e.id = pi.employee_id
      WHERE e.id IS NULL`,
    sampleSql: `SELECT pi.id, pi.payroll_run_id, pi.employee_id, pi.employee_name, pi.status, pi.net_pay
      FROM payroll_items pi
      LEFT JOIN employees e ON e.id = pi.employee_id
      WHERE e.id IS NULL
      ORDER BY pi.employee_name ASC
      LIMIT ?`,
  },
  {
    id: "finance-transactions-invalid-type",
    module: "finance",
    title: "Finance transactions with invalid type",
    severity: "warning",
    description: "A finance transaction has a type outside the supported operational set.",
    recommendation: "Normalize transaction types to income, expense, transfer, loan, rental, or payroll before reporting.",
    sql: `SELECT COUNT(*) AS count
      FROM finance_transactions
      WHERE LOWER(COALESCE(type, '')) NOT IN ('income', 'expense', 'transfer', 'loan', 'rental', 'payroll')`,
    sampleSql: `SELECT id, type, category, amount, transaction_date, status, source
      FROM finance_transactions
      WHERE LOWER(COALESCE(type, '')) NOT IN ('income', 'expense', 'transfer', 'loan', 'rental', 'payroll')
      ORDER BY transaction_date DESC
      LIMIT ?`,
  },
  {
    id: "finance-transactions-negative-amount",
    module: "finance",
    title: "Finance transactions with negative amount",
    severity: "warning",
    description: "Negative amounts can distort dashboards unless they are intentionally modeled as refunds/adjustments.",
    recommendation: "Review negative transactions and convert them to explicit refund/adjustment categories where appropriate.",
    sql: `SELECT COUNT(*) AS count
      FROM finance_transactions
      WHERE amount < 0`,
    sampleSql: `SELECT id, type, category, amount, transaction_date, status, source
      FROM finance_transactions
      WHERE amount < 0
      ORDER BY transaction_date DESC
      LIMIT ?`,
  },
  {
    id: "password-reset-expired-unclosed",
    module: "security",
    title: "Expired password reset tokens not closed",
    severity: "warning",
    description: "A password reset token is expired but has not been marked used or revoked.",
    recommendation: "Run the safe repair to revoke expired password reset tokens.",
    sql: `SELECT COUNT(*) AS count
      FROM password_reset_tokens
      WHERE expires_at < NOW()
        AND used_at IS NULL
        AND revoked_at IS NULL`,
    sampleSql: `SELECT id, user_id, email, delivery_channel, delivery_status, expires_at, created_at
      FROM password_reset_tokens
      WHERE expires_at < NOW()
        AND used_at IS NULL
        AND revoked_at IS NULL
      ORDER BY expires_at ASC
      LIMIT ?`,
  },
];

export const DATA_REPAIRS: RepairDefinition[] = [
  {
    id: "expire-access-tokens",
    title: "Mark expired access tokens as expired",
    description: "Updates active QR/e-card access tokens whose expiry is already in the past.",
    recommendation: "Safe to run after reviewing samples. Does not delete tokens.",
    countSql: `SELECT COUNT(*) AS count
      FROM access_tokens
      WHERE LOWER(COALESCE(status, '')) = 'active'
        AND revoked_at IS NULL
        AND expires_at IS NOT NULL
        AND expires_at < NOW()`,
    applySql: `UPDATE access_tokens
      SET status = 'expired', revoked_at = COALESCE(revoked_at, NOW())
      WHERE LOWER(COALESCE(status, '')) = 'active'
        AND revoked_at IS NULL
        AND expires_at IS NOT NULL
        AND expires_at < NOW()`,
  },
  {
    id: "revoke-expired-password-reset-tokens",
    title: "Revoke expired password reset tokens",
    description: "Marks expired, unused password reset tokens as revoked.",
    recommendation: "Safe to run periodically. Does not expose or delete token hashes.",
    countSql: `SELECT COUNT(*) AS count
      FROM password_reset_tokens
      WHERE expires_at < NOW()
        AND used_at IS NULL
        AND revoked_at IS NULL`,
    applySql: `UPDATE password_reset_tokens
      SET revoked_at = NOW(), delivery_status = COALESCE(delivery_status, 'expired')
      WHERE expires_at < NOW()
        AND used_at IS NULL
        AND revoked_at IS NULL`,
  },
];

export async function runIntegrityChecks(pool: Pick<Pool, "query">) {
  const findings: IntegrityFinding[] = [];

  for (const check of DATA_INTEGRITY_CHECKS) {
    const [rows]: any = await pool.query(check.sql);
    const count = toCount(rows?.[0]);
    findings.push({
      id: check.id,
      module: check.module,
      title: check.title,
      severity: check.severity,
      description: check.description,
      recommendation: check.recommendation,
      count,
      status: count > 0 ? "fail" : "pass",
    });
  }

  return findings;
}

export function summarizeIntegrityFindings(findings: IntegrityFinding[]) {
  const summary = {
    totalChecks: findings.length,
    passing: findings.filter((finding) => finding.status === "pass").length,
    failing: findings.filter((finding) => finding.status === "fail").length,
    critical: findings.filter((finding) => finding.status === "fail" && finding.severity === "critical").length,
    warning: findings.filter((finding) => finding.status === "fail" && finding.severity === "warning").length,
    affectedRows: findings.reduce((total, finding) => total + finding.count, 0),
    posture: "healthy" as "healthy" | "review" | "critical",
  };

  if (summary.critical > 0) summary.posture = "critical";
  else if (summary.warning > 0) summary.posture = "review";

  return summary;
}

export function sortFindings(findings: IntegrityFinding[]) {
  return [...findings].sort((a, b) => {
    const severityDiff = severityWeight(b.severity) - severityWeight(a.severity);
    if (severityDiff !== 0) return severityDiff;
    return b.count - a.count;
  });
}

function toCsv(rows: unknown[][]) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? "");
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\n");
}

export async function getRepairPlan(pool: Pick<Pool, "query">, repairId: string) {
  const repair = DATA_REPAIRS.find((item) => item.id === repairId);
  if (!repair) return null;
  const [rows]: any = await pool.query(repair.countSql);
  return {
    id: repair.id,
    title: repair.title,
    description: repair.description,
    recommendation: repair.recommendation,
    affectedRows: toCount(rows?.[0]),
  };
}

export async function applyRepair(pool: Pick<Pool, "query">, repairId: string) {
  const repair = DATA_REPAIRS.find((item) => item.id === repairId);
  if (!repair) return null;
  const before = await getRepairPlan(pool, repairId);
  const [result]: any = await pool.query(repair.applySql);
  return {
    ...before,
    applied: true,
    changedRows: Number(result?.affectedRows ?? before?.affectedRows ?? 0),
  };
}

export function registerDataIntegrityRoutes(app: Express, poolProvider: PoolProvider) {
  app.get("/api/platform/data-integrity/overview", requireDataIntegrityPermission, async (_req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const findings = sortFindings(await runIntegrityChecks(pool));
      res.json({
        generatedAt: new Date().toISOString(),
        summary: summarizeIntegrityFindings(findings),
        findings,
        repairs: DATA_REPAIRS.map(({ applySql: _applySql, countSql: _countSql, ...repair }) => repair),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/platform/data-integrity/checks", requireDataIntegrityPermission, (_req, res) => {
    res.json({
      checks: DATA_INTEGRITY_CHECKS.map(({ sql: _sql, sampleSql: _sampleSql, ...check }) => check),
    });
  });

  app.get("/api/platform/data-integrity/checks/:checkId/samples", requireDataIntegrityPermission, async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const check = DATA_INTEGRITY_CHECKS.find((item) => item.id === req.params.checkId);
      if (!check) return res.status(404).json({ error: "Unknown data integrity check" });
      const limit = normalizeLimit(req.query.limit, 25, MAX_SAMPLE_LIMIT);
      const [rows] = await pool.query(check.sampleSql, [limit]);
      res.json({ checkId: check.id, limit, samples: rows });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/platform/data-integrity/repairs/:repairId", requireDataIntegrityPermission, async (req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const dryRun = req.query.apply !== "true" && req.body?.apply !== true;
      const repair = dryRun
        ? await getRepairPlan(pool, req.params.repairId)
        : await applyRepair(pool, req.params.repairId);
      if (!repair) return res.status(404).json({ error: "Unknown data repair" });
      res.json({ dryRun, repair });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/platform/data-integrity/overview.csv", requireDataIntegrityPermission, async (_req, res, next) => {
    try {
      const pool = requirePool(poolProvider);
      const findings = sortFindings(await runIntegrityChecks(pool));
      const summary = summarizeIntegrityFindings(findings);
      const csv = toCsv([
        ["section", "metric", "value", "module", "severity", "recommendation"],
        ["summary", "posture", summary.posture, "", "", ""],
        ["summary", "failing", summary.failing, "", "", ""],
        ["summary", "critical", summary.critical, "", "", ""],
        ["summary", "warning", summary.warning, "", "", ""],
        ...findings.map((finding) => [
          "finding",
          finding.title,
          finding.count,
          finding.module,
          finding.severity,
          finding.recommendation,
        ]),
      ]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="data-integrity-overview.csv"');
      res.send(csv);
    } catch (error) {
      next(error);
    }
  });
}

export const __dataIntegrityForTests = {
  DATA_INTEGRITY_CHECKS,
  DATA_REPAIRS,
  runIntegrityChecks,
  summarizeIntegrityFindings,
  sortFindings,
  getRepairPlan,
  applyRepair,
};
