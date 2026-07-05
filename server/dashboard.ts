import type { Express, NextFunction, Response } from "express";
import type { Pool } from "mysql2/promise";
import { actionCenterResponseSchema, dashboardSummaryResponseSchema, trainerUtilizationResponseSchema } from "../shared/apiContracts";
import { timedQuery, TABLE_EXISTS_CACHE_TTL_MS } from "./performance";
import { hasPermission, type AuthenticatedRequest, requirePermission } from "./rbac";

type PoolProvider = () => Pool | null;
type DataRow = Record<string, any>;

const MAX_DASHBOARD_ROWS = Number(process.env.DASHBOARD_API_MAX_ROWS || 5000);
const STAFF_ROLES = new Set(["super_admin", "admin", "manager", "reception", "trainer", "accounting", "hr", "support", "warehouse_manager", "cashier", "staff"]);
const REQUIRED_ON_DUTY_ROLES = ["reception", "trainer"];
const tableExistenceCache = new Map<string, { exists: boolean; expiresAt: number }>();

function requirePool(poolProvider: PoolProvider) {
  const pool = poolProvider();
  if (!pool) {
    const error = new Error("Database not connected");
    (error as any).status = 503;
    throw error;
  }
  return pool;
}

function parseJsonField(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short" });
}

async function tableExists(pool: Pool, tableName: string) {
  const cached = tableExistenceCache.get(tableName);
  if (cached && cached.expiresAt > Date.now()) return cached.exists;

  const [rows]: any = await timedQuery(
    pool,
    `SELECT COUNT(*) AS count
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName],
    { label: "dashboard.table_exists", metadata: { tableName } },
  );
  const exists = Number(rows?.[0]?.count || 0) > 0;
  tableExistenceCache.set(tableName, { exists, expiresAt: Date.now() + TABLE_EXISTS_CACHE_TTL_MS });
  return exists;
}

async function selectRows(pool: Pool, tableName: string, columns = "*") {
  if (!/^[A-Za-z0-9_]+$/.test(tableName)) return [] as DataRow[];
  if (!(await tableExists(pool, tableName))) return [] as DataRow[];
  const [rows]: any = await timedQuery(pool, `SELECT ${columns} FROM \`${tableName}\` LIMIT ?`, [MAX_DASHBOARD_ROWS], { label: "dashboard.select_rows", metadata: { tableName } });
  return rows as DataRow[];
}

function rowPayload(row: DataRow) {
  const data = parseJsonField(row.data);
  return { ...data, ...row, data } as DataRow;
}

function mapMember(row: DataRow) {
  const payload = rowPayload(row);
  return {
    id: text(payload.id),
    status: lower(payload.status || "active"),
    plan: text(payload.currentPlan || payload.subPlan || payload.plan),
    expiry: toDate(payload.currentExpiry || payload.subTo || payload.expiry_date || payload.end_date),
    createdAt: payload.createdAt || payload.created_at,
  };
}

function mapClass(row: DataRow, source: "typed" | "compat") {
  const payload = rowPayload(row);
  const startTime = payload.startTime || payload.start_time;
  return {
    id: text(payload.id),
    trainerId: text(payload.trainerId || payload.instructorId || payload.trainer_id || payload.instructor_id),
    startTime: toDate(startTime),
    capacity: numberValue(payload.capacity, 0),
    enrolledCount: numberValue(payload.enrolledCount || payload.enrolled_count, 0),
    status: lower(payload.status || "scheduled"),
    source,
  };
}

function mapPrivateClass(row: DataRow, source: "typed" | "compat") {
  const payload = rowPayload(row);
  return {
    id: text(payload.id),
    trainerId: text(payload.trainerId || payload.trainer_id),
    startTime: toDate(payload.startTime || payload.start_time),
    status: lower(payload.status || "scheduled"),
    source,
  };
}

function mapShift(row: DataRow) {
  const payload = rowPayload(row);
  return {
    id: text(payload.id),
    userId: text(payload.userId || payload.user_id),
    startTime: toDate(payload.startTime || payload.start_time),
    endTime: toDate(payload.endTime || payload.end_time),
  };
}

function isToday(date: Date | null, todayStart = startOfLocalDay()) {
  if (!date) return false;
  return date >= todayStart && date < addDays(todayStart, 1);
}

function withinDays(date: Date | null, start: Date, days: number) {
  if (!date) return false;
  return date >= start && date < addDays(start, days);
}

async function loadUsers(pool: Pool) {
  // Canonical source: admin_users (typed, password-protected accounts)
  const rows = await selectRows(pool, "admin_users", "id, name, email, role, status, created_at, updated_at");
  return rows.map((row) => ({
    id: String(row.id),
    email: String(row.email || "").toLowerCase(),
    firstName: String(row.name || "").split(" ")[0] || "",
    lastName: String(row.name || "").split(" ").slice(1).join(" ") || "",
    role: String(row.role || "admin").toLowerCase(),
    department: "",
    createdAt: row.created_at,
  }));
}

async function loadMembers(pool: Pool) {
  const memberRows = await selectRows(pool, "members", "id, status, plan, created_at, updated_at, data");
  return memberRows.map(mapMember).filter((member) => member.status !== "archived");
}

async function loadTypedClassSessions(pool: Pool) {
  const rows = await selectRows(pool, "class_sessions", "id, trainer_id, start_time, capacity, status, data");
  return rows.map((row) => mapClass(row, "typed" as const));
}

async function loadClasses(pool: Pool) {
  // Canonical source: class_sessions only (legacy `classes` table migrated to class_sessions in 023)
  return loadTypedClassSessions(pool);
}

async function loadPrivateClasses(pool: Pool) {
  const typedRows = await selectRows(pool, "private_sessions", "id, trainer_id, start_time, status, data");
  const compatRows = await selectRows(pool, "private_classes", "id, data, created_at, updated_at");
  const seen = new Set<string>();
  return [
    ...typedRows.map((row) => mapPrivateClass(row, "typed" as const)),
    ...compatRows.map((row) => mapPrivateClass(row, "compat" as const)),
  ].filter((item) => {
    const key = item.id || `${item.trainerId}:${item.startTime?.toISOString() || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return item.status !== "canceled" && item.status !== "cancelled";
  });
}

async function loadShifts(pool: Pool) {
  const rows = await selectRows(pool, "shifts", "id, data, created_at, updated_at");
  return rows.map(mapShift);
}

async function loadHrProfiles(pool: Pool) {
  return selectRows(pool, "hr_profiles", "id, data, created_at, updated_at");
}

async function loadActiveSubscriptions(pool: Pool) {
  // Canonical source: member_subscriptions only (legacy `subscriptions` migrated in 023)
  const typedRows = await selectRows(pool, "member_subscriptions", "id, member_id, plan_name, status, end_date, data");
  const today = startOfLocalDay();
  return typedRows
    .map(rowPayload)
    .filter((row) => lower(row.status) === "active" && (!toDate(row.end_date || row.endDate) || toDate(row.end_date || row.endDate)! >= today));
}

async function buildDashboardSummary(pool: Pool) {
  const [members, users, classes, shifts, hrProfiles, activeSubscriptions] = await Promise.all([
    loadMembers(pool),
    loadUsers(pool),
    loadClasses(pool),
    loadShifts(pool),
    loadHrProfiles(pool),
    loadActiveSubscriptions(pool),
  ]);

  const today = startOfLocalDay();
  const todayClasses = classes.filter((item) => isToday(item.startTime, today));
  const totalCapacity = todayClasses.reduce((sum, item) => sum + Math.max(0, item.capacity), 0);
  const totalEnrolled = todayClasses.reduce((sum, item) => sum + Math.max(0, item.enrolledCount), 0);

  const weeklyMap = new Map<string, number>();
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(today, i);
    weeklyMap.set(date.toLocaleDateString("en-US", { weekday: "short" }), 0);
  }
  for (const item of classes) {
    if (withinDays(item.startTime, today, 7)) {
      const label = item.startTime!.toLocaleDateString("en-US", { weekday: "short" });
      weeklyMap.set(label, (weeklyMap.get(label) || 0) + 1);
    }
  }

  const last12Months = [] as { name: string; signups: number; yearMonth: string }[];
  for (let i = 11; i >= 0; i -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    last12Months.push({ name: monthLabel(date), signups: 0, yearMonth: monthKey(date) });
  }
  for (const member of members) {
    const created = toDate(member.createdAt);
    if (!created) continue;
    const target = last12Months.find((point) => point.yearMonth === monthKey(created));
    if (target) target.signups += 1;
  }

  const planCounts = new Map<string, number>();
  if (activeSubscriptions.length > 0) {
    for (const subscription of activeSubscriptions) {
      const name = text(subscription.planName || subscription.plan_name || subscription.data?.planName || "Active");
      planCounts.set(name || "Active", (planCounts.get(name || "Active") || 0) + 1);
    }
  } else {
    const now = today;
    for (const member of members) {
      if (member.expiry && member.expiry < now) continue;
      const name = member.plan || "Active";
      planCounts.set(name, (planCounts.get(name) || 0) + 1);
    }
  }

  const staffUsers = users.filter((user) => STAFF_ROLES.has(user.role));
  const activeShiftUserIds = new Set(
    shifts
      .filter((shift) => shift.startTime && shift.endTime && new Date() <= shift.endTime && new Date() >= shift.startTime)
      .map((shift) => shift.userId),
  );
  let understaffedDepts = 0;
  for (const role of REQUIRED_ON_DUTY_ROLES) {
    const staffInRole = staffUsers.filter((user) => user.role === role);
    const activeInRole = staffInRole.filter((user) => activeShiftUserIds.has(user.id));
    if (staffInRole.length > 0 && activeInRole.length < 1) understaffedDepts += 1;
  }

  const hrProfileIds = new Set(hrProfiles.map((row) => text(row.id)).filter(Boolean));
  const salaryByRole = new Map<string, number>();
  for (const profile of hrProfiles) {
    const payload = rowPayload(profile);
    const user = staffUsers.find((staff) => staff.id === text(profile.id));
    const role = user?.role || lower(payload.role || "staff");
    const baseSalary = numberValue(payload.baseSalary || payload.base_salary, 0);
    if (baseSalary > 0) salaryByRole.set(role, (salaryByRole.get(role) || 0) + baseSalary);
  }

  const response = {
    kpis: {
      totalMembers: members.length,
      activeSubscriptions: activeSubscriptions.length || Array.from(planCounts.values()).reduce((sum, value) => sum + value, 0),
      classesToday: todayClasses.length,
      occupancyRate: totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0,
    },
    weeklyClasses: Array.from(weeklyMap.entries()).map(([day, count]) => ({ day, classes: count })),
    membershipDistribution: Array.from(planCounts.entries()).map(([name, value]) => ({ name, value })).filter((item) => item.value > 0),
    signups: last12Months,
    hr: {
      activeStaffCount: activeShiftUserIds.size,
      understaffedDepts,
      pendingContracts: staffUsers.filter((user) => !hrProfileIds.has(user.id)).length,
      salaryDistribution: Array.from(salaryByRole.entries()).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      })).filter((item) => item.value > 0),
    },
    generatedAt: new Date().toISOString(),
  };

  return dashboardSummaryResponseSchema.parse(response);
}

async function buildTrainerUtilization(pool: Pool, periodDays: number) {
  const [users, classes, privateClasses] = await Promise.all([
    loadUsers(pool),
    loadClasses(pool),
    loadPrivateClasses(pool),
  ]);

  const since = startOfLocalDay(addDays(new Date(), -periodDays));
  const until = addDays(startOfLocalDay(), 1);
  const trainersMap = new Map<string, { id: string; name: string; totalClasses: number; privateClasses: number; groupClasses: number }>();

  for (const user of users.filter((item) => item.role === "trainer")) {
    trainersMap.set(user.id, {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`.trim() || user.email || user.id,
      totalClasses: 0,
      privateClasses: 0,
      groupClasses: 0,
    });
  }

  for (const item of classes) {
    if (!item.trainerId || !withinDays(item.startTime, since, periodDays + 1)) continue;
    const trainer = trainersMap.get(item.trainerId);
    if (!trainer) continue;
    trainer.groupClasses += 1;
    trainer.totalClasses += 1;
  }

  for (const item of privateClasses) {
    if (!item.trainerId || !item.startTime || item.startTime < since || item.startTime >= until) continue;
    const trainer = trainersMap.get(item.trainerId);
    if (!trainer) continue;
    trainer.privateClasses += 1;
    trainer.totalClasses += 1;
  }

  const response = {
    trainers: Array.from(trainersMap.values()).sort((a, b) => b.totalClasses - a.totalClasses),
    periodDays,
    generatedAt: new Date().toISOString(),
  };
  return trainerUtilizationResponseSchema.parse(response);
}


type ActionCenterItemDraft = {
  id: string;
  module: "membership" | "scheduling" | "hr" | "finance" | "warehouse" | "support" | "system";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  actionLabel: string;
  actionUrl: string;
  source: string;
  dueAt?: string | null;
  metric?: number;
};

function endOfLocalDay(date = new Date()) {
  const copy = startOfLocalDay(date);
  copy.setDate(copy.getDate() + 1);
  copy.setMilliseconds(copy.getMilliseconds() - 1);
  return copy;
}

function daysUntil(date: Date | null, now = startOfLocalDay()) {
  if (!date) return null;
  return Math.ceil((startOfLocalDay(date).getTime() - now.getTime()) / 86_400_000);
}

function severityRank(severity: ActionCenterItemDraft["severity"]) {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  return 2;
}

function addActionItem(items: ActionCenterItemDraft[], item: ActionCenterItemDraft) {
  if (items.some((existing) => existing.id === item.id)) return;
  items.push(item);
}

async function queryOptionalRows(pool: Pool, tableName: string, sql: string, values: unknown[] = []) {
  if (!/^[A-Za-z0-9_]+$/.test(tableName)) return [] as DataRow[];
  if (!(await tableExists(pool, tableName))) return [] as DataRow[];
  const [rows]: any = await timedQuery(pool, sql, values, { label: "action_center.query", metadata: { tableName } });
  return rows as DataRow[];
}

async function loadOpenSupportTicketStats(pool: Pool) {
  const rows = await queryOptionalRows(
    pool,
    "support_tickets",
    `SELECT
       COUNT(*) AS open_count,
       SUM(CASE WHEN priority IN ('high', 'urgent') THEN 1 ELSE 0 END) AS high_priority_count,
       SUM(CASE WHEN status IN ('open', 'pending') AND created_at < DATE_SUB(NOW(), INTERVAL 2 DAY) THEN 1 ELSE 0 END) AS aging_count
     FROM support_tickets
     WHERE status NOT IN ('resolved', 'closed', 'archived')`,
  );
  const row = rows[0] || {};
  return {
    openCount: numberValue(row.open_count, 0),
    highPriorityCount: numberValue(row.high_priority_count, 0),
    agingCount: numberValue(row.aging_count, 0),
  };
}

async function loadUnreadNotificationCount(pool: Pool, userId: string, role: string) {
  const rows = await queryOptionalRows(
    pool,
    "notifications",
    `SELECT COUNT(*) AS count
       FROM notifications
      WHERE read_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (user_id = ? OR role = ? OR (user_id IS NULL AND role IS NULL))`,
    [userId, role],
  );
  return numberValue(rows[0]?.count, 0);
}

async function loadWarehouseRiskStats(pool: Pool) {
  const [stockRows, expiryRows, purchaseRows] = await Promise.all([
    queryOptionalRows(
      pool,
      "warehouse_products",
      `SELECT COUNT(*) AS count
         FROM warehouse_products
        WHERE status <> 'archived'
          AND min_stock > 0
          AND stock_quantity <= min_stock`,
    ),
    queryOptionalRows(
      pool,
      "warehouse_products",
      `SELECT COUNT(*) AS count
         FROM warehouse_products
        WHERE status <> 'archived'
          AND expiry_date IS NOT NULL
          AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)`,
    ),
    queryOptionalRows(
      pool,
      "warehouse_purchase_orders",
      `SELECT COUNT(*) AS count
         FROM warehouse_purchase_orders
        WHERE status NOT IN ('received', 'cancelled', 'closed', 'archived')
          AND expected_date IS NOT NULL
          AND expected_date < CURDATE()`,
    ),
  ]);

  return {
    lowStockCount: numberValue(stockRows[0]?.count, 0),
    expiringStockCount: numberValue(expiryRows[0]?.count, 0),
    overduePurchaseOrders: numberValue(purchaseRows[0]?.count, 0),
  };
}

async function loadFinanceRiskStats(pool: Pool) {
  const rows = await queryOptionalRows(
    pool,
    "finance_transactions",
    `SELECT
       COUNT(*) AS pending_count,
       COALESCE(SUM(CASE WHEN type = 'expense' AND status IN ('pending', 'draft') THEN amount ELSE 0 END), 0) AS pending_expenses
     FROM finance_transactions
     WHERE status IN ('pending', 'draft')`,
  );
  const row = rows[0] || {};
  return {
    pendingCount: numberValue(row.pending_count, 0),
    pendingExpenses: numberValue(row.pending_expenses, 0),
  };
}

async function buildActionCenter(pool: Pool, req: AuthenticatedRequest) {
  const items: ActionCenterItemDraft[] = [];
  const role = req.user?.role || "";
  const userId = req.user?.uid || "";
  const now = startOfLocalDay();

  const [summary, members, unreadNotifications] = await Promise.all([
    buildDashboardSummary(pool),
    hasPermission(req, "membership.read") ? loadMembers(pool) : Promise.resolve([]),
    loadUnreadNotificationCount(pool, userId, role),
  ]);

  if (unreadNotifications > 0) {
    addActionItem(items, {
      id: "notifications.unread",
      module: "system",
      severity: unreadNotifications >= 10 ? "warning" : "info",
      title: `${unreadNotifications} unread notification${unreadNotifications === 1 ? "" : "s"}`,
      description: "Review operational notifications and mark completed items as read.",
      actionLabel: "Open notifications",
      actionUrl: "/support",
      source: "notifications",
      metric: unreadNotifications,
    });
  }

  if (hasPermission(req, "membership.read")) {
    const expiringMembers = members.filter((member) => {
      const days = daysUntil(member.expiry, now);
      return days !== null && days >= 0 && days <= 7;
    });
    const expiredMembers = members.filter((member) => {
      const days = daysUntil(member.expiry, now);
      return days !== null && days < 0;
    });

    if (expiredMembers.length > 0) {
      addActionItem(items, {
        id: "membership.expired",
        module: "membership",
        severity: "critical",
        title: `${expiredMembers.length} expired membership${expiredMembers.length === 1 ? "" : "s"}`,
        description: "Follow up on expired subscriptions to recover renewals and avoid access-control confusion.",
        actionLabel: "Review members",
        actionUrl: "/members?filter=expired",
        source: "members.expiry",
        metric: expiredMembers.length,
      });
    }

    if (expiringMembers.length > 0) {
      addActionItem(items, {
        id: "membership.expiring_7d",
        module: "membership",
        severity: "warning",
        title: `${expiringMembers.length} membership${expiringMembers.length === 1 ? "" : "s"} expiring within 7 days`,
        description: "Trigger renewal reminders before subscriptions expire.",
        actionLabel: "Review renewals",
        actionUrl: "/members?filter=expiring",
        source: "members.expiry",
        metric: expiringMembers.length,
      });
    }
  }

  if (hasPermission(req, "scheduling.read") && summary.kpis.classesToday > 0 && summary.kpis.occupancyRate < 35) {
    addActionItem(items, {
      id: "scheduling.low_occupancy_today",
      module: "scheduling",
      severity: "warning",
      title: "Low class occupancy today",
      description: `Today's class occupancy is ${summary.kpis.occupancyRate}%. Consider member outreach or schedule adjustments.`,
      actionLabel: "Open schedule",
      actionUrl: "/classes",
      source: "dashboard.occupancy",
      metric: summary.kpis.occupancyRate,
    });
  }

  if (hasPermission(req, "hr.read")) {
    if (summary.hr.understaffedDepts > 0) {
      addActionItem(items, {
        id: "hr.understaffed_departments",
        module: "hr",
        severity: "critical",
        title: `${summary.hr.understaffedDepts} understaffed department${summary.hr.understaffedDepts === 1 ? "" : "s"}`,
        description: "Shift coverage is below the required minimum for one or more operational roles.",
        actionLabel: "Review staff",
        actionUrl: "/staff",
        source: "shifts.coverage",
        metric: summary.hr.understaffedDepts,
      });
    }
    if (summary.hr.pendingContracts > 0) {
      addActionItem(items, {
        id: "hr.pending_contracts",
        module: "hr",
        severity: "warning",
        title: `${summary.hr.pendingContracts} pending HR profile${summary.hr.pendingContracts === 1 ? "" : "s"}`,
        description: "Complete missing staff HR profiles and contract metadata.",
        actionLabel: "Open HR",
        actionUrl: "/hr",
        source: "hr_profiles.coverage",
        metric: summary.hr.pendingContracts,
      });
    }
  }

  if (hasPermission(req, "finance.read")) {
    const finance = await loadFinanceRiskStats(pool);
    if (finance.pendingCount > 0) {
      addActionItem(items, {
        id: "finance.pending_transactions",
        module: "finance",
        severity: finance.pendingExpenses > 0 ? "warning" : "info",
        title: `${finance.pendingCount} pending finance transaction${finance.pendingCount === 1 ? "" : "s"}`,
        description: "Review draft or pending transactions before closing the accounting period.",
        actionLabel: "Open accounting",
        actionUrl: "/accounting",
        source: "finance_transactions.status",
        metric: finance.pendingCount,
      });
    }
  }

  if (hasPermission(req, "warehouse.read")) {
    const warehouse = await loadWarehouseRiskStats(pool);
    if (warehouse.lowStockCount > 0) {
      addActionItem(items, {
        id: "warehouse.low_stock",
        module: "warehouse",
        severity: "critical",
        title: `${warehouse.lowStockCount} low-stock product${warehouse.lowStockCount === 1 ? "" : "s"}`,
        description: "Restock products that are at or below their configured minimum stock level.",
        actionLabel: "Open warehouse",
        actionUrl: "/warehouse?tab=products&filter=low-stock",
        source: "warehouse_products.stock_quantity",
        metric: warehouse.lowStockCount,
      });
    }
    if (warehouse.expiringStockCount > 0) {
      addActionItem(items, {
        id: "warehouse.expiring_stock",
        module: "warehouse",
        severity: "warning",
        title: `${warehouse.expiringStockCount} product${warehouse.expiringStockCount === 1 ? "" : "s"} expiring within 30 days`,
        description: "Plan promotions, stock rotation, or supplier returns for soon-to-expire items.",
        actionLabel: "Review expiry",
        actionUrl: "/warehouse?tab=products&filter=expiring",
        source: "warehouse_products.expiry_date",
        dueAt: endOfLocalDay(addDays(now, 30)).toISOString(),
        metric: warehouse.expiringStockCount,
      });
    }
    if (warehouse.overduePurchaseOrders > 0) {
      addActionItem(items, {
        id: "warehouse.overdue_purchase_orders",
        module: "warehouse",
        severity: "warning",
        title: `${warehouse.overduePurchaseOrders} overdue purchase order${warehouse.overduePurchaseOrders === 1 ? "" : "s"}`,
        description: "Follow up with suppliers for purchase orders past their expected delivery date.",
        actionLabel: "Review purchase orders",
        actionUrl: "/warehouse?tab=purchase-orders",
        source: "warehouse_purchase_orders.expected_date",
        metric: warehouse.overduePurchaseOrders,
      });
    }
  }

  if (hasPermission(req, "support.read")) {
    const support = await loadOpenSupportTicketStats(pool);
    if (support.highPriorityCount > 0) {
      addActionItem(items, {
        id: "support.high_priority_tickets",
        module: "support",
        severity: "critical",
        title: `${support.highPriorityCount} high-priority support ticket${support.highPriorityCount === 1 ? "" : "s"}`,
        description: "High-priority support requests need immediate triage.",
        actionLabel: "Open support",
        actionUrl: "/support",
        source: "support_tickets.priority",
        metric: support.highPriorityCount,
      });
    } else if (support.agingCount > 0) {
      addActionItem(items, {
        id: "support.aging_tickets",
        module: "support",
        severity: "warning",
        title: `${support.agingCount} support ticket${support.agingCount === 1 ? "" : "s"} older than 2 days`,
        description: "Review aging support tickets before they breach internal response targets.",
        actionLabel: "Open support",
        actionUrl: "/support",
        source: "support_tickets.created_at",
        metric: support.agingCount,
      });
    }
  }

  if (items.length === 0) {
    addActionItem(items, {
      id: "system.no_action_required",
      module: "system",
      severity: "info",
      title: "No urgent operational actions",
      description: "Core membership, HR, warehouse, support and finance checks did not find urgent exceptions.",
      actionLabel: "View reports",
      actionUrl: "/reports",
      source: "action_center.summary",
      metric: 0,
    });
  }

  const sortedItems = items
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.module.localeCompare(b.module) || a.title.localeCompare(b.title))
    .slice(0, 12);

  const response = {
    summary: {
      total: sortedItems.length,
      critical: sortedItems.filter((item) => item.severity === "critical").length,
      warning: sortedItems.filter((item) => item.severity === "warning").length,
      info: sortedItems.filter((item) => item.severity === "info").length,
    },
    items: sortedItems,
    generatedAt: new Date().toISOString(),
  };

  return actionCenterResponseSchema.parse(response);
}

export function registerDashboardRoutes(app: Express, poolProvider: PoolProvider) {
  app.get("/api/dashboard/summary", requirePermission("dashboard.read"), async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = requirePool(poolProvider);
      const payload = await buildDashboardSummary(pool);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard/trainer-utilization", requirePermission("dashboard.read"), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = requirePool(poolProvider);
      const rawDays = Number.parseInt(String(req.query.days || "30"), 10);
      const periodDays = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 365) : 30;
      const payload = await buildTrainerUtilization(pool, periodDays);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard/action-center", requirePermission("dashboard.read"), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = requirePool(poolProvider);
      const payload = await buildActionCenter(pool, req);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

}
