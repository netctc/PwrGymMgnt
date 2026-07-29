import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "mysql2/promise";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

type PoolProvider = () => Pool | null;

type AuthenticatedRequest = Request & {
  user?: {
    uid?: string;
    email?: string;
    role?: string;
  };
};

type ReportRow = Record<string, unknown>;

type ReportTable = {
  title: string;
  columns: string[];
  rows: ReportRow[];
  maxRows?: number;
};

type ReportData = {
  section: string;
  title: string;
  subtitle: string;
  generatedAt: Date;
  summary: Array<{ label: string; value: string | number }>;
  tables: ReportTable[];
};

type SectionDefinition = {
  id: string;
  label: string;
  description: string;
  roles: string[];
};

type ReportFilterType = "date" | "select" | "text" | "number";

type ReportFilterDefinition = {
  id: string;
  label: string;
  type: ReportFilterType;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
};

type ScreenReportDefinition = {
  id: string;
  sectionId: string;
  label: string;
  description: string;
  screen: string;
  roles: string[];
  title: string;
  subtitle: string;
  tableTitle: string;
  columns: string[];
  baseSql: string;
  orderBy: string;
  dateColumn?: string;
  filters: ReportFilterDefinition[];
  exactFilters?: Record<string, string>;
  likeFilters?: Record<string, string[]>;
  numericFilters?: Record<string, string>;
  limit?: number;
};

type ParsedReportFilters = {
  fromDate: string;
  toDate: string;
  values: Record<string, string>;
};

const REPORT_SECTIONS: SectionDefinition[] = [
  {
    id: "all",
    label: "All Sections Summary",
    description: "Executive PDF summary across members, staff, payroll, accounting, classes, PT, support and audit.",
    roles: ["super_admin", "admin"],
  },
  {
    id: "members",
    label: "Members",
    description: "Member status, subscriptions, validity, invoices and QR/access readiness.",
    roles: ["super_admin", "admin", "manager", "reception", "cashier", "accounting"],
  },
  {
    id: "staff",
    label: "Staff",
    description: "Staff users, roles, categories, employee profiles and status.",
    roles: ["super_admin", "admin", "manager", "hr"],
  },
  {
    id: "payroll",
    label: "Payroll",
    description: "Payroll runs, payroll items, approvals, payments and attendance summary.",
    roles: ["super_admin", "admin", "manager", "hr", "accounting"],
  },
  {
    id: "accounting",
    label: "Accounting & Finance",
    description: "Income, expenses, loans, rentals, budgets and finance totals.",
    roles: ["super_admin", "admin", "manager", "accounting"],
  },
  {
    id: "classes",
    label: "Scheduled Classes",
    description: "Group classes, rooms, trainers, capacity and bookings.",
    roles: ["super_admin", "admin", "manager", "reception", "cashier", "trainer"],
  },
  {
    id: "private-pt",
    label: "Private PT",
    description: "Private training sessions, members, trainers, rooms and time slots.",
    roles: ["super_admin", "admin", "manager", "reception", "cashier", "trainer"],
  },
  {
    id: "plans-subscriptions",
    label: "Plans, Subscriptions & Invoices",
    description: "Plan catalog, active/expired subscriptions and invoice collection status.",
    roles: ["super_admin", "admin", "manager", "reception", "cashier", "accounting"],
  },
  {
    id: "support",
    label: "Support & Notifications",
    description: "Support tickets, notification volume and customer/contact follow-up.",
    roles: ["super_admin", "admin", "manager", "support", "reception", "cashier"],
  },
  {
    id: "security",
    label: "Security & Audit",
    description: "Audit log and security events for administration review.",
    roles: ["super_admin", "admin"],
  },
];


const COMMON_DATE_FILTERS: ReportFilterDefinition[] = [
  { id: "from", label: "From", type: "date" },
  { id: "to", label: "To", type: "date" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "scheduled", label: "Scheduled" },
  { value: "cancelled", label: "Cancelled" },
  { value: "booked", label: "Booked" },
  { value: "paid", label: "Paid" },
  { value: "issued", label: "Issued" },
  { value: "overdue", label: "Overdue" },
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "posted", label: "Posted" },
  { value: "pending", label: "Pending" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "reception", label: "Reception" },
  { value: "trainer", label: "Trainer" },
  { value: "accounting", label: "Accounting" },
  { value: "hr", label: "HR" },
  { value: "support", label: "Support" },
  { value: "warehouse_manager", label: "Warehouse Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "client", label: "Client" },
];

const SCREEN_REPORTS: ScreenReportDefinition[] = [
  {
    id: "members-directory",
    sectionId: "members",
    label: "Members Directory",
    screen: "Members",
    description: "Filtered member list with current plan, subscription state and open invoice exposure.",
    roles: ["super_admin", "admin", "manager", "reception", "cashier", "accounting"],
    title: "Members Directory Report",
    subtitle: "Member records filtered by date, status, member and search text",
    tableTitle: "Members",
    columns: ["ID", "Name", "Email", "Phone", "Status", "Plan", "Expiry", "Join Date", "Subscription", "Subscription Status", "Payment Status", "Open Invoices"],
    baseSql: `SELECT
       m.id,
       CONCAT_WS(' ', m.first_name, m.last_name) AS name,
       m.email,
       m.phone,
       CASE
         WHEN LOWER(TRIM(m.status)) = 'active'
          AND current_subscription.valid_until IS NOT NULL
          AND DATE(current_subscription.valid_until) < CURDATE()
         THEN 'expired'
         ELSE m.status
       END AS effective_status,
       COALESCE(m.plan, '') AS plan,
       current_subscription.valid_until AS expiry,
       DATE(m.join_date) AS join_date,
       current_subscription.subscription_plan,
       current_subscription.subscription_status,
       current_invoice.payment_status,
       (SELECT COUNT(*) FROM invoices inv WHERE inv.member_id = m.id AND inv.status IN ('issued','overdue','unpaid')) AS open_invoices
     FROM members m
     LEFT JOIN (
       SELECT ranked.member_id, ranked.plan_name AS subscription_plan, ranked.status AS subscription_status, ranked.end_date AS valid_until
       FROM (
         SELECT ms.member_id, ms.plan_name, ms.status, ms.end_date, ROW_NUMBER() OVER (PARTITION BY ms.member_id ORDER BY ms.end_date DESC, ms.updated_at DESC) AS rn
         FROM member_subscriptions ms
       ) ranked
       WHERE ranked.rn = 1
     ) current_subscription ON current_subscription.member_id = m.id
     LEFT JOIN (
       SELECT ranked.member_id, ranked.status AS payment_status
       FROM (
         SELECT i.member_id, i.status, ROW_NUMBER() OVER (PARTITION BY i.member_id ORDER BY i.created_at DESC) AS rn
         FROM invoices i
       ) ranked
       WHERE ranked.rn = 1
     ) current_invoice ON current_invoice.member_id = m.id`,
    orderBy: "ORDER BY m.created_at DESC, m.last_name ASC",
    dateColumn: "m.join_date",
    filters: [...COMMON_DATE_FILTERS, { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS }, { id: "currentPlan", label: "Current Plan", type: "text", placeholder: "Plan name" }, { id: "subscriptionStatus", label: "Subscription Status", type: "select", options: STATUS_OPTIONS }, { id: "paymentStatus", label: "Payment Status", type: "select", options: STATUS_OPTIONS }, { id: "memberId", label: "Member ID", type: "text", placeholder: "Exact member ID" }, { id: "q", label: "Search", type: "text", placeholder: "Name, email or phone" }],
    exactFilters: { status: "CASE WHEN LOWER(TRIM(m.status)) = 'active' AND current_subscription.valid_until IS NOT NULL AND DATE(current_subscription.valid_until) < CURDATE() THEN 'expired' ELSE m.status END", subscriptionStatus: "current_subscription.subscription_status", paymentStatus: "current_invoice.payment_status", memberId: "m.id" },
    likeFilters: { currentPlan: ["current_subscription.subscription_plan", "m.plan"], q: ["m.first_name", "m.last_name", "m.email", "m.phone", "m.plan"] },
  },
  {
    id: "subscriptions-validity",
    sectionId: "plans-subscriptions",
    label: "Subscription Validity",
    screen: "Plans / Members",
    description: "Membership subscriptions by validity range, status, member and plan.",
    roles: ["super_admin", "admin", "manager", "reception", "cashier", "accounting"],
    title: "Subscription Validity Report",
    subtitle: "Subscriptions filtered by end date, status, member and plan search",
    tableTitle: "Subscriptions",
    columns: ["ID", "Member", "Member ID", "Plan", "Status", "Start", "End", "Price", "Currency"],
    baseSql: `SELECT ms.id, CONCAT_WS(' ', m.first_name, m.last_name) AS member_name, ms.member_id, ms.plan_name, ms.status, ms.start_date, ms.end_date, ms.price, ms.currency
     FROM member_subscriptions ms
     LEFT JOIN members m ON m.id = ms.member_id`,
    orderBy: "ORDER BY ms.end_date DESC, ms.status ASC",
    dateColumn: "ms.end_date",
    filters: [...COMMON_DATE_FILTERS, { id: "status", label: "Subscription Status", type: "select", options: STATUS_OPTIONS }, { id: "memberId", label: "Member ID", type: "text" }, { id: "q", label: "Search", type: "text", placeholder: "Member or plan" }],
    exactFilters: { status: "ms.status", memberId: "ms.member_id" },
    likeFilters: { q: ["m.first_name", "m.last_name", "ms.plan_name"] },
  },
  {
    id: "invoices-collection",
    sectionId: "plans-subscriptions",
    label: "Invoices & Collection",
    screen: "Plans / Accounting",
    description: "Invoice collection status with member filter and due/creation dates.",
    roles: ["super_admin", "admin", "manager", "reception", "cashier", "accounting"],
    title: "Invoices & Collection Report",
    subtitle: "Invoices filtered by creation date, status, member and search text",
    tableTitle: "Invoices",
    columns: ["Invoice", "Member", "Member ID", "Status", "Subtotal", "Tax", "Total", "Currency", "Due", "Paid At", "Created"],
    baseSql: `SELECT i.invoice_number, CONCAT_WS(' ', m.first_name, m.last_name) AS member_name, i.member_id, i.status, i.subtotal, i.tax_amount, i.total, i.currency, i.due_date, i.paid_at, i.created_at
     FROM invoices i
     LEFT JOIN members m ON m.id = i.member_id`,
    orderBy: "ORDER BY i.created_at DESC",
    dateColumn: "i.created_at",
    filters: [...COMMON_DATE_FILTERS, { id: "status", label: "Invoice Status", type: "select", options: STATUS_OPTIONS }, { id: "memberId", label: "Member ID", type: "text" }, { id: "q", label: "Search", type: "text", placeholder: "Invoice or member" }],
    exactFilters: { status: "i.status", memberId: "i.member_id" },
    likeFilters: { q: ["i.invoice_number", "m.first_name", "m.last_name", "m.email"] },
  },
  {
    id: "staff-users",
    sectionId: "staff",
    label: "Staff Users",
    screen: "Staff",
    description: "Staff accounts by role, status, date and text search.",
    roles: ["super_admin", "admin", "manager", "hr"],
    title: "Staff Users Report",
    subtitle: "Staff users filtered by creation date, role, status and search text",
    tableTitle: "Staff Users",
    columns: ["ID", "Name", "Email", "Role", "Status", "Department", "Job Title", "Created"],
    baseSql: `SELECT e.id, CONCAT_WS(' ', e.first_name, e.last_name) AS name, e.email,
     COALESCE(au.role, e.job_title, 'staff') AS role,
     e.employment_status AS status,
     e.department,
     e.job_title,
     e.created_at
     FROM employees e
     LEFT JOIN admin_users au ON LOWER(TRIM(au.email)) = LOWER(TRIM(e.email))`,
    orderBy: "ORDER BY e.department ASC, e.created_at DESC",
    dateColumn: "e.created_at",
    filters: [...COMMON_DATE_FILTERS, { id: "role", label: "Role", type: "select", options: ROLE_OPTIONS }, { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS }, { id: "q", label: "Search", type: "text", placeholder: "Name, email or department" }],
    exactFilters: { role: "au.role", status: "e.employment_status" },
    likeFilters: { q: ["e.first_name", "e.last_name", "e.email", "e.department", "e.job_title"] },
  },
  {
    id: "employee-profiles",
    sectionId: "staff",
    label: "Employee Profiles",
    screen: "Human Resources",
    description: "HR employee master data by employment status, department and search.",
    roles: ["super_admin", "admin", "manager", "hr"],
    title: "Employee Profiles Report",
    subtitle: "Employees filtered by hiring date, status, department and search text",
    tableTitle: "Employees",
    columns: ["ID", "Code", "Name", "Email", "Department", "Job Title", "Status", "Contract", "Base Salary", "Hire Date"],
    baseSql: `SELECT id, employee_code, CONCAT_WS(' ', first_name, last_name) AS name, email, department, job_title, employment_status, contract_type, base_salary, hire_date
     FROM employees e`,
    orderBy: "ORDER BY e.department ASC, name ASC",
    dateColumn: "e.hire_date",
    filters: [...COMMON_DATE_FILTERS, { id: "status", label: "Employment Status", type: "select", options: STATUS_OPTIONS }, { id: "department", label: "Department", type: "text" }, { id: "employeeId", label: "Employee ID", type: "text" }, { id: "q", label: "Search", type: "text", placeholder: "Name, email, job title" }],
    exactFilters: { status: "e.employment_status", department: "e.department", employeeId: "e.id" },
    likeFilters: { q: ["e.first_name", "e.last_name", "e.email", "e.job_title", "e.employee_code"] },
  },
  {
    id: "payroll-runs",
    sectionId: "payroll",
    label: "Payroll Runs",
    screen: "Human Resources / Payroll",
    description: "Payroll runs by month/date range, status and approval/payment state.",
    roles: ["super_admin", "admin", "manager", "hr", "accounting"],
    title: "Payroll Runs Report",
    subtitle: "Payroll runs filtered by run month/date and status",
    tableTitle: "Payroll Runs",
    columns: ["ID", "Month", "Status", "Employees", "Base", "Allowances", "Bonuses", "Deductions", "Net Pay", "Approved By", "Paid At", "Created"],
    baseSql: `SELECT id, run_month, status, employee_count, total_base, total_allowances, total_bonuses, total_deductions, total_net_pay, approved_by, paid_at, created_at
     FROM payroll_runs pr`,
    orderBy: "ORDER BY pr.run_month DESC, pr.created_at DESC",
    dateColumn: "pr.run_month",
    filters: [...COMMON_DATE_FILTERS, { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS }],
    exactFilters: { status: "pr.status" },
  },
  {
    id: "payroll-items",
    sectionId: "payroll",
    label: "Payroll Items",
    screen: "Human Resources / Payroll",
    description: "Employee payroll details by run month, item status and employee.",
    roles: ["super_admin", "admin", "manager", "hr", "accounting"],
    title: "Payroll Items Report",
    subtitle: "Payroll items filtered by run month/date, employee and status",
    tableTitle: "Payroll Items",
    columns: ["Run", "Employee", "Employee ID", "Department", "Base", "Allowances", "Bonus", "Deductions", "Attendance Deduction", "Net Pay", "Status"],
    baseSql: `SELECT pi.payroll_run_id, pi.employee_name, pi.employee_id, pi.department, pi.base_salary, pi.allowances, pi.bonus, pi.deductions, pi.attendance_deduction, pi.net_pay, pi.status
     FROM payroll_items pi
     JOIN payroll_runs pr ON pr.id = pi.payroll_run_id`,
    orderBy: "ORDER BY pr.run_month DESC, pi.employee_name ASC",
    dateColumn: "pr.run_month",
    filters: [...COMMON_DATE_FILTERS, { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS }, { id: "employeeId", label: "Employee ID", type: "text" }, { id: "department", label: "Department", type: "text" }, { id: "q", label: "Search", type: "text", placeholder: "Employee or department" }],
    exactFilters: { status: "pi.status", employeeId: "pi.employee_id", department: "pi.department" },
    likeFilters: { q: ["pi.employee_name", "pi.department"] },
  },
  {
    id: "finance-transactions",
    sectionId: "accounting",
    label: "Finance Transactions",
    screen: "Accounting",
    description: "Income and expense transactions by date, status, type, category and source.",
    roles: ["super_admin", "admin", "manager", "accounting"],
    title: "Finance Transactions Report",
    subtitle: "Transactions filtered by accounting date, status, type, category and search text",
    tableTitle: "Transactions",
    columns: ["ID", "Type", "Category", "Amount", "Date", "Source", "Reference Type", "Reference ID", "Status", "Description"],
    baseSql: `SELECT id, type, category, amount, transaction_date, source, reference_type, reference_id, status, description
     FROM finance_transactions ft`,
    orderBy: "ORDER BY ft.transaction_date DESC, ft.created_at DESC",
    dateColumn: "ft.transaction_date",
    filters: [...COMMON_DATE_FILTERS, { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS }, { id: "type", label: "Type", type: "select", options: [{ value: "income", label: "Income" }, { value: "expense", label: "Expense" }] }, { id: "category", label: "Category", type: "text" }, { id: "source", label: "Source", type: "text" }, { id: "q", label: "Search", type: "text", placeholder: "Description or reference" }],
    exactFilters: { status: "ft.status", type: "ft.type", category: "ft.category", source: "ft.source" },
    likeFilters: { q: ["ft.description", "ft.reference_type", "ft.reference_id", "ft.category"] },
  },
  {
    id: "class-sessions",
    sectionId: "classes",
    label: "Group Class Sessions",
    screen: "Classes",
    description: "Class schedule by date, trainer, status, room and search text.",
    roles: ["super_admin", "admin", "manager", "reception", "cashier", "trainer"],
    title: "Group Class Sessions Report",
    subtitle: "Class sessions filtered by date, status, trainer, room and search text",
    tableTitle: "Group Classes",
    columns: ["ID", "Title", "Trainer", "Trainer ID", "Room", "Type", "Level", "Branch", "Capacity", "Start", "End", "Status"],
    baseSql: `SELECT cs.id, cs.title, COALESCE(NULLIF(cs.trainer_name, ''), cs.trainer_id, 'Unassigned') AS trainer, cs.trainer_id, cs.room, cs.class_type, cs.level, cs.branch, cs.capacity, cs.start_time, cs.end_time, cs.status
     FROM class_sessions cs`,
    orderBy: "ORDER BY cs.start_time ASC, cs.room ASC",
    dateColumn: "cs.start_time",
    filters: [...COMMON_DATE_FILTERS, { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS }, { id: "trainerId", label: "Trainer ID", type: "text" }, { id: "room", label: "Room", type: "text" }, { id: "q", label: "Search", type: "text", placeholder: "Class, trainer, type" }],
    exactFilters: { status: "cs.status", trainerId: "cs.trainer_id", room: "cs.room" },
    likeFilters: { q: ["cs.title", "cs.trainer_name", "cs.class_type", "cs.level", "cs.branch"] },
  },
  {
    id: "class-bookings",
    sectionId: "classes",
    label: "Class Bookings",
    screen: "Classes",
    description: "Class bookings by booked date, status, trainer and member.",
    roles: ["super_admin", "admin", "manager", "reception", "cashier", "trainer"],
    title: "Class Bookings Report",
    subtitle: "Bookings filtered by booked date, status, member, trainer and search text",
    tableTitle: "Class Bookings",
    columns: ["ID", "Class", "Trainer", "Member", "Member ID", "Status", "Booked At", "Cancelled At"],
    baseSql: `SELECT cb.id, cs.title AS class_title, COALESCE(NULLIF(cs.trainer_name, ''), cs.trainer_id, 'Unassigned') AS trainer, cb.member_name, cb.member_id, cb.status, cb.booked_at, cb.cancelled_at
     FROM class_bookings cb
     LEFT JOIN class_sessions cs ON cs.id = cb.class_id`,
    orderBy: "ORDER BY cb.booked_at DESC",
    dateColumn: "cb.booked_at",
    filters: [...COMMON_DATE_FILTERS, { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS }, { id: "memberId", label: "Member ID", type: "text" }, { id: "trainerId", label: "Trainer ID", type: "text" }, { id: "q", label: "Search", type: "text", placeholder: "Class or member" }],
    exactFilters: { status: "cb.status", memberId: "cb.member_id", trainerId: "cs.trainer_id" },
    likeFilters: { q: ["cs.title", "cb.member_name", "cs.trainer_name"] },
  },
  {
    id: "private-pt-sessions",
    sectionId: "private-pt",
    label: "Private PT Sessions",
    screen: "Private Classes",
    description: "Private training sessions by date, status, trainer, member and room.",
    roles: ["super_admin", "admin", "manager", "reception", "cashier", "trainer"],
    title: "Private PT Sessions Report",
    subtitle: "Private sessions filtered by date, status, trainer, member and room",
    tableTitle: "Private PT Sessions",
    columns: ["ID", "Series", "Member", "Member ID", "Trainer", "Trainer ID", "Room", "Start", "End", "Status", "Level", "Branch", "Notes"],
    baseSql: `SELECT ps.id, ps.series_id, ps.member_name, ps.member_id, ps.trainer_name, ps.trainer_id, ps.room, ps.start_time, ps.end_time, ps.status, ps.level, ps.branch, ps.notes
     FROM private_sessions ps`,
    orderBy: "ORDER BY ps.start_time ASC, ps.trainer_name ASC, ps.member_name ASC",
    dateColumn: "ps.start_time",
    filters: [...COMMON_DATE_FILTERS, { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS }, { id: "trainerId", label: "Trainer ID", type: "text" }, { id: "memberId", label: "Member ID", type: "text" }, { id: "room", label: "Room", type: "text" }, { id: "q", label: "Search", type: "text", placeholder: "Member, trainer or notes" }],
    exactFilters: { status: "ps.status", trainerId: "ps.trainer_id", memberId: "ps.member_id", room: "ps.room" },
    likeFilters: { q: ["ps.member_name", "ps.trainer_name", "ps.notes", "ps.level", "ps.branch"] },
  },
  {
    id: "consumed-sessions",
    sectionId: "plans-subscriptions",
    label: "Consumed Sessions",
    screen: "Subscriptions / Reports",
    description: "Immutable session-consumption ledger by member, period, plan and trainer, ready to print or download as PDF.",
    roles: ["super_admin", "admin", "manager", "reception", "cashier", "accounting", "trainer"],
    title: "Consumed Sessions Report",
    subtitle: "Consumed sessions filtered by movement date, member, plan and search text",
    tableTitle: "Consumed Sessions",
    columns: ["Movement", "Member", "Member ID", "Plan", "Trainer", "Quantity", "Session Date & Time", "Source", "Reference"],
    baseSql: `SELECT
       sm.id AS movement_id,
       CONCAT_WS(' ', m.first_name, m.last_name) AS member_name,
       m.id AS member_id,
       COALESCE(NULLIF(pv.name, ''), s.plan_id, 'Unknown plan') AS plan_name,
       COALESCE(
         NULLIF(ps.trainer_name, ''),
         NULLIF(cs.trainer_name, ''),
         NULLIF(JSON_UNQUOTE(JSON_EXTRACT(sm.data, '$.trainerName')), ''),
         'Not recorded'
       ) AS trainer_name,
       ABS(sm.quantity) AS quantity,
       COALESCE(ps.start_time, cs.start_time, sm.created_at) AS session_datetime,
       CASE
         WHEN ps.id IS NOT NULL THEN 'Private PT'
         WHEN cs.id IS NOT NULL THEN 'Group class'
         WHEN sm.reference_type = 'access_attempt' THEN 'Access control'
         ELSE COALESCE(NULLIF(sm.reference_type, ''), 'Manual')
       END AS source,
       COALESCE(NULLIF(sm.reference_id, ''), sm.reason, '') AS reference
     FROM session_movements sm
     JOIN affiliations a
       ON a.id = sm.affiliation_id
      AND sm.direction = '-'
      AND sm.movement_type IN ('consumption', 'adjustment_negative')
     JOIN members m ON m.id = a.member_id
     JOIN subscriptions s ON s.id = a.subscription_id
     JOIN plan_versions pv ON pv.id = a.plan_version_id
     LEFT JOIN private_sessions ps
       ON sm.reference_id = ps.id
      AND sm.reference_type IN ('private_session', 'private_pt', 'private_class')
     LEFT JOIN class_bookings cb
       ON sm.reference_id = cb.id
      AND sm.reference_type IN ('class_booking', 'booking')
     LEFT JOIN class_sessions cs ON cs.id = cb.class_id`,
    orderBy: "ORDER BY sm.created_at DESC, m.last_name ASC, m.first_name ASC",
    dateColumn: "sm.created_at",
    filters: [
      ...COMMON_DATE_FILTERS,
      { id: "member", label: "Member", type: "text", placeholder: "Member name" },
      { id: "plan", label: "Plan", type: "text", placeholder: "Plan name" },
      { id: "trainer", label: "Trainer", type: "text", placeholder: "Trainer name" },
      { id: "memberId", label: "Member ID", type: "text", placeholder: "Exact member ID" },
      { id: "planId", label: "Plan ID", type: "text", placeholder: "Exact plan ID" },
      { id: "q", label: "Search", type: "text", placeholder: "Reason or source" },
    ],
    exactFilters: { memberId: "m.id", planId: "s.plan_id" },
    likeFilters: {
      member: ["m.first_name", "m.last_name"],
      plan: ["pv.name"],
      trainer: ["ps.trainer_name", "cs.trainer_name", "JSON_UNQUOTE(JSON_EXTRACT(sm.data, '$.trainerName'))"],
      q: ["sm.id", "sm.reference_id", "sm.reason"],
    },
  },
  {
    id: "support-tickets",
    sectionId: "support",
    label: "Support Tickets",
    screen: "Support",
    description: "Support ticket workflow by date, status, priority, category and search.",
    roles: ["super_admin", "admin", "manager", "support", "reception", "cashier"],
    title: "Support Tickets Report",
    subtitle: "Support tickets filtered by created date, status, priority, type and search text",
    tableTitle: "Support Tickets",
    columns: ["ID", "Ticket", "Requester", "Email", "Phone", "Type", "Priority", "Subject", "Status", "Assigned To", "Created", "Resolved At"],
    baseSql: `SELECT st.id, st.ticket_number, st.requester_name, st.requester_email, st.requester_phone, st.inquiry_type, st.priority, st.subject, st.status, st.assigned_to, st.created_at, st.resolved_at
     FROM support_tickets st`,
    orderBy: "ORDER BY st.created_at DESC",
    dateColumn: "st.created_at",
    filters: [...COMMON_DATE_FILTERS, { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS }, { id: "priority", label: "Priority", type: "select", options: [{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }] }, { id: "type", label: "Type", type: "text" }, { id: "q", label: "Search", type: "text", placeholder: "Subject, requester, email" }],
    exactFilters: { status: "st.status", priority: "st.priority", type: "st.inquiry_type" },
    likeFilters: { q: ["st.subject", "st.requester_name", "st.requester_email", "st.description", "st.ticket_number"] },
  },
  {
    id: "notifications",
    sectionId: "support",
    label: "Notifications",
    screen: "Support / Settings",
    description: "Notifications by date, channel, type and recipient role/user.",
    roles: ["super_admin", "admin", "manager", "support", "reception", "cashier"],
    title: "Notifications Report",
    subtitle: "Notifications filtered by date, channel, type, recipient and search text",
    tableTitle: "Notifications",
    columns: ["ID", "Recipient", "Role", "Title", "Channel", "Type", "Read At", "Expires At", "Created"],
    baseSql: `SELECT n.id, n.user_id AS recipient_user_id, n.role, n.title, n.channel, n.type, n.read_at, n.expires_at, n.created_at
     FROM notifications n`,
    orderBy: "ORDER BY n.created_at DESC",
    dateColumn: "n.created_at",
    filters: [...COMMON_DATE_FILTERS, { id: "channel", label: "Channel", type: "text" }, { id: "type", label: "Type", type: "text" }, { id: "role", label: "Role", type: "select", options: ROLE_OPTIONS }, { id: "q", label: "Search", type: "text", placeholder: "Title or body" }],
    exactFilters: { channel: "n.channel", type: "n.type", role: "n.role" },
    likeFilters: { q: ["n.title", "n.body", "n.user_id"] },
  },
  {
    id: "security-audit",
    sectionId: "security",
    label: "Security Audit Events",
    screen: "Settings / Security",
    description: "Audit events by date, severity, status code, actor and path.",
    roles: ["super_admin", "admin"],
    title: "Security Audit Events Report",
    subtitle: "Security audit events filtered by created date, severity, status code and search text",
    tableTitle: "Security Audit Events",
    columns: ["Request ID", "Actor", "Role", "Module", "Action", "Method", "Path", "Status", "Duration", "Severity", "Created"],
    baseSql: `SELECT request_id, actor_email, actor_role, module, action, method, path, status_code, duration_ms, severity, created_at
     FROM security_audit_events sae`,
    orderBy: "ORDER BY sae.created_at DESC",
    dateColumn: "sae.created_at",
    filters: [...COMMON_DATE_FILTERS, { id: "severity", label: "Severity", type: "select", options: [{ value: "info", label: "Info" }, { value: "warning", label: "Warning" }, { value: "error", label: "Error" }, { value: "critical", label: "Critical" }] }, { id: "statusCode", label: "HTTP Status", type: "number" }, { id: "q", label: "Search", type: "text", placeholder: "Actor, path, module" }],
    exactFilters: { severity: "sae.severity" },
    numericFilters: { statusCode: "sae.status_code" },
    likeFilters: { q: ["sae.actor_email", "sae.path", "sae.module", "sae.action", "sae.request_id"] },
  },
];

function requirePool(poolProvider: PoolProvider) {
  const pool = poolProvider();
  if (!pool) {
    const error = new Error("Database not connected");
    (error as any).status = 503;
    throw error;
  }
  return pool;
}

function getSection(id: string) {
  return REPORT_SECTIONS.find((section) => section.id === id);
}

function canAccessReport(section: SectionDefinition, role: string) {
  return section.roles.includes(role) || (role === "admin" && !section.roles.includes("admin"));
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function normalizeDate(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString().slice(0, 10);
}

function formatDate(value: unknown) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getUTCFullYear()}`;
}

function formatDateTime(value: unknown) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${d}/${m}/${date.getUTCFullYear()} ${h}:${min}`;
}

function formatMoney(value: unknown) {
  const numeric = Number(value || 0);
  return `$${numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function valueToString(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function queryRows(pool: Pool, sql: string, params: unknown[] = []) {
  const [rows] = await pool.query(sql, params);
  return rows as ReportRow[];
}

async function queryScalar(pool: Pool, sql: string, params: unknown[] = []) {
  const rows = await queryRows(pool, sql, params);
  const first = rows[0] || {};
  const value = Object.values(first)[0];
  return Number(value || 0);
}

async function tableColumnExists(pool: Pool, tableName: string, columnName: string) {
  const rows = await queryRows(
    pool,
    `SELECT 1 AS found
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function ensureTableColumn(pool: Pool, tableName: string, columnName: string, definition: string) {
  if (!/^[A-Za-z0-9_]+$/.test(tableName) || !/^[A-Za-z0-9_]+$/.test(columnName)) {
    throw new Error("Invalid schema compatibility request");
  }

  if (!(await tableColumnExists(pool, tableName, columnName))) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

async function ensureScheduledClassesReportSchema(pool: Pool) {
  await ensureTableColumn(pool, "class_bookings", "member_name", "VARCHAR(180) NULL");
  await ensureTableColumn(pool, "class_bookings", "cancelled_at", "DATETIME NULL");
}

function limitRows(rows: ReportRow[], maxRows = 60) {
  return rows.slice(0, maxRows);
}

function isTechnicalIdentifierLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  return (
    normalized === "id" ||
    normalized.endsWith(" id") ||
    ["movement", "reference", "run", "series", "recipient"].includes(normalized)
  );
}

function withoutTechnicalIdentifiers(columns: string[]) {
  return columns.filter((column) => !isTechnicalIdentifierLabel(column));
}

function buildTable(title: string, columns: string[], rows: ReportRow[], maxRows = 60): ReportTable {
  return { title, columns: withoutTechnicalIdentifiers(columns), rows: limitRows(rows, maxRows), maxRows };
}

async function buildMembersReport(pool: Pool): Promise<ReportData> {
  const rows = await queryRows(
    pool,
    `SELECT
       m.id,
       CONCAT_WS(' ', m.first_name, m.last_name) AS name,
       m.email,
       m.phone,
       m.status,
       COALESCE(m.plan, '') AS plan,
       DATE(m.join_date) AS join_date,
       (SELECT ms.plan_name FROM member_subscriptions ms WHERE ms.member_id = m.id ORDER BY ms.end_date DESC LIMIT 1) AS subscription_plan,
       (SELECT ms.status FROM member_subscriptions ms WHERE ms.member_id = m.id ORDER BY ms.end_date DESC LIMIT 1) AS subscription_status,
       (SELECT ms.end_date FROM member_subscriptions ms WHERE ms.member_id = m.id ORDER BY ms.end_date DESC LIMIT 1) AS valid_until,
       (SELECT COUNT(*) FROM invoices inv WHERE inv.member_id = m.id AND inv.status IN ('issued','overdue','unpaid')) AS open_invoices
     FROM members m
     ORDER BY m.created_at DESC, m.last_name ASC
     LIMIT 500`,
  );
  const byStatus = await queryRows(pool, "SELECT status, COUNT(*) AS total FROM members GROUP BY status ORDER BY total DESC");
  const total = await queryScalar(pool, "SELECT COUNT(*) AS total FROM members");
  const active = await queryScalar(pool, "SELECT COUNT(*) AS total FROM members WHERE status = 'active'");
  const expired = await queryScalar(
    pool,
    "SELECT COUNT(*) AS total FROM member_subscriptions WHERE end_date < CURRENT_DATE OR status IN ('expired','cancelled')",
  );
  const openInvoices = await queryScalar(pool, "SELECT COUNT(*) AS total FROM invoices WHERE status IN ('issued','overdue','unpaid')");
  return {
    section: "members",
    title: "Members Report",
    subtitle: "Member lifecycle, validity, subscriptions and invoice exposure",
    generatedAt: new Date(),
    summary: [
      { label: "Total members", value: total },
      { label: "Active members", value: active },
      { label: "Expired/cancelled subscriptions", value: expired },
      { label: "Open invoices", value: openInvoices },
    ],
    tables: [
      buildTable("Members by Status", ["Status", "Total"], byStatus, 20),
      buildTable("Latest Members", ["ID", "Name", "Email", "Phone", "Status", "Plan", "Subscription", "Valid Until", "Open Invoices"], rows),
    ],
  };
}

async function buildStaffReport(pool: Pool): Promise<ReportData> {
  // Canonical source: employees + admin_users (staff table migrated in 023)
  const staff = await queryRows(
    pool,
    `SELECT
       e.id,
       CONCAT_WS(' ', e.first_name, e.last_name) AS name,
       e.email,
       COALESCE(au.role, e.job_title, 'staff') AS role,
       e.employment_status AS status,
       e.department,
       e.job_title,
       e.created_at
     FROM employees e
     LEFT JOIN admin_users au ON LOWER(TRIM(au.email)) = LOWER(TRIM(e.email))
     ORDER BY e.department ASC, e.created_at DESC
     LIMIT 500`,
  );
  const employees = await queryRows(
    pool,
    `SELECT id, employee_code, CONCAT_WS(' ', first_name, last_name) AS name, email, department, job_title, employment_status, contract_type, base_salary
     FROM employees
     ORDER BY department ASC, name ASC
     LIMIT 500`,
  );
  const roles = await queryRows(pool, "SELECT job_title AS role, employment_status AS status, COUNT(*) AS total FROM employees GROUP BY job_title, employment_status ORDER BY job_title ASC");
  const totalStaff = await queryScalar(pool, "SELECT COUNT(*) AS total FROM employees");
  const totalEmployees = totalStaff;
  const activeStaff = await queryScalar(pool, "SELECT COUNT(*) AS total FROM employees WHERE employment_status = 'active'");
  return {
    section: "staff",
    title: "Staff & Employees Report",
    subtitle: "Employee profiles, roles and HR data",
    generatedAt: new Date(),
    summary: [
      { label: "Total employees", value: totalStaff },
      { label: "Active employees", value: activeStaff },
      { label: "Employee profiles", value: totalEmployees },
    ],
    tables: [
      buildTable("Employees by Role and Status", ["Role", "Status", "Total"], roles, 50),
      buildTable("Staff / Employees", ["ID", "Name", "Email", "Role", "Status", "Department", "Job Title", "Created"], staff),
      buildTable("Employee Profiles", ["ID", "Code", "Name", "Email", "Department", "Job Title", "Status", "Contract", "Base Salary"], employees),
    ],
  };
}

async function buildPayrollReport(pool: Pool): Promise<ReportData> {
  const runs = await queryRows(
    pool,
    `SELECT id, run_month, status, employee_count, total_base, total_allowances, total_bonuses, total_deductions, total_net_pay, approved_by, paid_at, created_at
     FROM payroll_runs
     ORDER BY run_month DESC
     LIMIT 120`,
  );
  const items = await queryRows(
    pool,
    `SELECT pi.payroll_run_id, pi.employee_name, pi.department, pi.base_salary, pi.allowances, pi.bonus, pi.deductions, pi.attendance_deduction, pi.net_pay, pi.status
     FROM payroll_items pi
     JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
     ORDER BY pr.run_month DESC, pi.employee_name ASC
     LIMIT 500`,
  );
  const attendance = await queryRows(
    pool,
    `SELECT status, COUNT(*) AS total, COALESCE(SUM(hours_worked),0) AS hours
     FROM employee_attendance
     GROUP BY status
     ORDER BY total DESC`,
  );
  const totalNet = await queryScalar(pool, "SELECT COALESCE(SUM(total_net_pay),0) AS total FROM payroll_runs");
  const draftRuns = await queryScalar(pool, "SELECT COUNT(*) AS total FROM payroll_runs WHERE status = 'draft'");
  const approvedRuns = await queryScalar(pool, "SELECT COUNT(*) AS total FROM payroll_runs WHERE status IN ('approved','paid')");
  return {
    section: "payroll",
    title: "Payroll Report",
    subtitle: "Payroll runs, employee net pay, approvals, paid status and attendance basis",
    generatedAt: new Date(),
    summary: [
      { label: "Total payroll net", value: formatMoney(totalNet) },
      { label: "Draft payroll runs", value: draftRuns },
      { label: "Approved/paid runs", value: approvedRuns },
    ],
    tables: [
      buildTable("Payroll Runs", ["ID", "Month", "Status", "Employees", "Base", "Allowances", "Bonuses", "Deductions", "Net Pay", "Approved By", "Paid At"], runs),
      buildTable("Payroll Items", ["Run", "Employee", "Department", "Base", "Allowances", "Bonus", "Deductions", "Attendance Deduction", "Net Pay", "Status"], items),
      buildTable("Attendance Summary", ["Status", "Entries", "Hours"], attendance, 30),
    ],
  };
}

async function buildAccountingReport(pool: Pool, fromDate: string, toDate: string): Promise<ReportData> {
  const transactions = await queryRows(
    pool,
    `SELECT id, type, category, amount, transaction_date, source, reference_type, reference_id, status, description
     FROM finance_transactions
     WHERE transaction_date BETWEEN ? AND ?
     ORDER BY transaction_date DESC, created_at DESC
     LIMIT 500`,
    [fromDate, toDate],
  );
  const byCategory = await queryRows(
    pool,
    `SELECT type, category, COUNT(*) AS entries, COALESCE(SUM(amount),0) AS total
     FROM finance_transactions
     WHERE transaction_date BETWEEN ? AND ?
     GROUP BY type, category
     ORDER BY type ASC, total DESC`,
    [fromDate, toDate],
  );
  const loans = await queryRows(pool, "SELECT lender_name, principal_amount, interest_rate, monthly_payment, status, start_date, end_date FROM finance_loans ORDER BY status ASC, lender_name ASC LIMIT 200");
  const rentals = await queryRows(pool, "SELECT name, monthly_cost, due_day, status, start_date, end_date FROM finance_rentals ORDER BY status ASC, name ASC LIMIT 200");
  const income = await queryScalar(pool, "SELECT COALESCE(SUM(amount),0) AS total FROM finance_transactions WHERE type = 'income' AND status = 'posted' AND transaction_date BETWEEN ? AND ?", [fromDate, toDate]);
  const expense = await queryScalar(pool, "SELECT COALESCE(SUM(amount),0) AS total FROM finance_transactions WHERE type = 'expense' AND status = 'posted' AND transaction_date BETWEEN ? AND ?", [fromDate, toDate]);
  const pending = await queryScalar(pool, "SELECT COUNT(*) AS total FROM finance_transactions WHERE status NOT IN ('posted','approved') AND transaction_date BETWEEN ? AND ?", [fromDate, toDate]);
  return {
    section: "accounting",
    title: "Accounting & Finance Report",
    subtitle: `Finance activity from ${fromDate} to ${toDate}`,
    generatedAt: new Date(),
    summary: [
      { label: "Posted income", value: formatMoney(income) },
      { label: "Posted expenses", value: formatMoney(expense) },
      { label: "Net result", value: formatMoney(income - expense) },
      { label: "Pending transactions", value: pending },
    ],
    tables: [
      buildTable("Category Breakdown", ["Type", "Category", "Entries", "Total"], byCategory, 80),
      buildTable("Transactions", ["ID", "Type", "Category", "Amount", "Date", "Source", "Reference Type", "Reference ID", "Status", "Description"], transactions),
      buildTable("Loans", ["Lender", "Principal", "Interest", "Monthly Payment", "Status", "Start", "End"], loans, 50),
      buildTable("Rentals", ["Name", "Monthly Cost", "Due Day", "Status", "Start", "End"], rentals, 50),
    ],
  };
}

async function buildClassesReport(pool: Pool): Promise<ReportData> {
  await ensureScheduledClassesReportSchema(pool);

  const classes = await queryRows(
    pool,
    `SELECT
       cs.id,
       cs.title,
       cs.trainer_name,
       cs.room,
       cs.class_type,
       cs.level,
       cs.capacity,
       COALESCE(b.active_bookings, 0) AS enrolled_count,
       cs.start_time,
       cs.end_time,
       cs.status,
       COALESCE(b.active_bookings, 0) AS booking_rows
     FROM class_sessions cs
     LEFT JOIN (
       SELECT class_id, COUNT(*) AS active_bookings
       FROM class_bookings
       WHERE status = 'booked'
       GROUP BY class_id
     ) b ON b.class_id = cs.id
     ORDER BY cs.start_time ASC
     LIMIT 500`,
  );
  const bookings = await queryRows(
    pool,
    `SELECT cb.id, cs.title AS class_title, cb.member_name, cb.member_id, cb.status, cb.booked_at
     FROM class_bookings cb
     LEFT JOIN class_sessions cs ON cs.id = cb.class_id
     ORDER BY cb.booked_at DESC
     LIMIT 500`,
  );
  const byRoom = await queryRows(
    pool,
    `SELECT
       cs.room,
       COUNT(*) AS sessions,
       COALESCE(SUM(COALESCE(b.active_bookings, 0)), 0) AS enrolled
     FROM class_sessions cs
     LEFT JOIN (
       SELECT class_id, COUNT(*) AS active_bookings
       FROM class_bookings
       WHERE status = 'booked'
       GROUP BY class_id
     ) b ON b.class_id = cs.id
     GROUP BY cs.room
     ORDER BY sessions DESC`,
  );
  const scheduled = await queryScalar(pool, "SELECT COUNT(*) AS total FROM class_sessions WHERE status = 'scheduled'");
  const booked = await queryScalar(pool, "SELECT COUNT(*) AS total FROM class_bookings WHERE status = 'booked'");
  return {
    section: "classes",
    title: "Scheduled Group Classes Report",
    subtitle: "Group class timetable, trainers, room reservations, capacity and member bookings",
    generatedAt: new Date(),
    summary: [
      { label: "Scheduled classes", value: scheduled },
      { label: "Active bookings", value: booked },
    ],
    tables: [
      buildTable("Classes by Room", ["Room", "Sessions", "Enrolled"], byRoom, 40),
      buildTable("Group Classes", ["ID", "Title", "Trainer", "Room", "Type", "Level", "Capacity", "Enrolled", "Start", "End", "Status", "Bookings"], classes),
      buildTable("Class Bookings", ["ID", "Class", "Member", "Member ID", "Status", "Booked At"], bookings),
    ],
  };
}

async function buildPrivatePtReport(pool: Pool): Promise<ReportData> {
  const sessions = await queryRows(
    pool,
    `SELECT id, series_id, member_name, trainer_name, room, start_time, end_time, status, level, branch, notes
     FROM private_sessions
     ORDER BY start_time ASC
     LIMIT 500`,
  );
  const byTrainer = await queryRows(
    pool,
    "SELECT trainer_name, COUNT(*) AS sessions, SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled FROM private_sessions GROUP BY trainer_name ORDER BY sessions DESC",
  );
  const byRoom = await queryRows(pool, "SELECT room, COUNT(*) AS sessions FROM private_sessions GROUP BY room ORDER BY sessions DESC");
  const scheduled = await queryScalar(pool, "SELECT COUNT(*) AS total FROM private_sessions WHERE status = 'scheduled'");
  const cancelled = await queryScalar(pool, "SELECT COUNT(*) AS total FROM private_sessions WHERE status = 'cancelled'");
  return {
    section: "private-pt",
    title: "Private PT Schedule Report",
    subtitle: "Private training reservations by member, trainer, room and time slot",
    generatedAt: new Date(),
    summary: [
      { label: "Scheduled PT sessions", value: scheduled },
      { label: "Cancelled PT sessions", value: cancelled },
    ],
    tables: [
      buildTable("PT Sessions by Trainer", ["Trainer", "Sessions", "Scheduled"], byTrainer, 40),
      buildTable("PT Sessions by Room", ["Room", "Sessions"], byRoom, 40),
      buildTable("Private Sessions", ["ID", "Series", "Member", "Trainer", "Room", "Start", "End", "Status", "Level", "Branch", "Notes"], sessions),
    ],
  };
}



async function buildSingleClassPrintReport(pool: Pool, classId: string): Promise<ReportData> {
  await ensureScheduledClassesReportSchema(pool);

  const classRows = await queryRows(
    pool,
    `SELECT
       cs.id,
       cs.title AS class_name,
       COALESCE(NULLIF(cs.trainer_name, ''), cs.trainer_id, 'Unassigned') AS trainer,
       cs.trainer_id,
       cs.room,
       cs.class_type AS type,
       cs.level,
       cs.branch,
       cs.capacity,
       cs.start_time,
       cs.end_time,
       cs.status,
       COALESCE(b.active_bookings, 0) AS enrolled_count,
       GREATEST(COALESCE(cs.capacity, 0) - COALESCE(b.active_bookings, 0), 0) AS free_spots
     FROM class_sessions cs
     LEFT JOIN (
       SELECT class_id, COUNT(*) AS active_bookings
       FROM class_bookings
       WHERE status = 'booked'
       GROUP BY class_id
     ) b ON b.class_id = cs.id
     WHERE cs.id = ?
     LIMIT 1`,
    [classId],
  );

  if (classRows.length === 0) {
    const error = new Error("Class session not found");
    (error as any).status = 404;
    throw error;
  }

  const classInfo = classRows[0];
  const enrolledMembers = await queryRows(
    pool,
    `SELECT
       cb.id AS booking_id,
       COALESCE(NULLIF(cb.member_name, ''), NULLIF(CONCAT_WS(' ', m.first_name, m.last_name), ''), cb.member_id) AS member,
       cb.member_id,
       COALESCE(m.email, '') AS email,
       COALESCE(m.phone, '') AS phone,
       COALESCE(m.status, '') AS member_status,
       cb.status AS booking_status,
       cb.booked_at
     FROM class_bookings cb
     LEFT JOIN members m ON m.id = cb.member_id
     WHERE cb.class_id = ? AND cb.status = 'booked'
     ORDER BY member ASC, cb.booked_at ASC
     LIMIT 1000`,
    [classId],
  );

  const bookingHistory = await queryRows(
    pool,
    `SELECT
       cb.id AS booking_id,
       COALESCE(NULLIF(cb.member_name, ''), NULLIF(CONCAT_WS(' ', m.first_name, m.last_name), ''), cb.member_id) AS member,
       cb.member_id,
       cb.status AS booking_status,
       cb.booked_at,
       cb.cancelled_at
     FROM class_bookings cb
     LEFT JOIN members m ON m.id = cb.member_id
     WHERE cb.class_id = ?
     ORDER BY cb.booked_at ASC
     LIMIT 1000`,
    [classId],
  );

  const sessionDate = formatDate(classInfo.start_time);
  const start = formatDateTime(classInfo.start_time);
  const end = formatDateTime(classInfo.end_time);

  return {
    section: "single-class",
    title: "Class Session Attendance Printout",
    subtitle: `${valueToString(classInfo.class_name)} - ${sessionDate}`,
    generatedAt: new Date(),
    summary: [
      { label: "Class", value: valueToString(classInfo.class_name) },
      { label: "Trainer", value: valueToString(classInfo.trainer) },
      { label: "Room", value: valueToString(classInfo.room) },
      { label: "Start", value: start },
      { label: "End", value: end },
      { label: "Capacity", value: Number(classInfo.capacity || 0) },
      { label: "Enrolled members", value: enrolledMembers.length },
      { label: "Free spots", value: Number(classInfo.free_spots || 0) },
    ],
    tables: [
      buildTable("Class Details", ["ID", "Class Name", "Trainer", "Room", "Type", "Level", "Branch", "Capacity", "Enrolled Count", "Free Spots", "Start Time", "End Time", "Status"], [classInfo], 1),
      buildTable("Enrolled Members / Miembros inscritos", ["Booking ID", "Member", "Member ID", "Email", "Phone", "Member Status", "Booking Status", "Booked At"], enrolledMembers, 1000),
      buildTable("Booking History", ["Booking ID", "Member", "Member ID", "Booking Status", "Booked At", "Cancelled At"], bookingHistory, 1000),
    ],
  };
}

async function buildScheduledClassesPrintReport(pool: Pool, fromDate: string, toDate: string, trainerId?: string, status = "scheduled"): Promise<ReportData> {
  await ensureScheduledClassesReportSchema(pool);

  const where = ["DATE(cs.start_time) BETWEEN ? AND ?"];
  const params: unknown[] = [fromDate, toDate];
  if (status && status !== "all") {
    where.push("cs.status = ?");
    params.push(status);
  }
  if (trainerId) {
    where.push("cs.trainer_id = ?");
    params.push(trainerId);
  }
  const whereSql = where.join(" AND ");

  const classes = await queryRows(
    pool,
    `SELECT
       DATE(cs.start_time) AS session_date,
       TIME(cs.start_time) AS start_time,
       TIME(cs.end_time) AS end_time,
       cs.title AS class_name,
       COALESCE(NULLIF(cs.trainer_name, ''), cs.trainer_id, 'Unassigned') AS trainer,
       cs.room,
       cs.class_type AS type,
       cs.level,
       cs.branch,
       cs.capacity,
       COALESCE(b.active_bookings, 0) AS enrolled_count,
       GREATEST(COALESCE(cs.capacity, 0) - COALESCE(b.active_bookings, 0), 0) AS free_spots,
       COALESCE(b.active_bookings, 0) AS active_bookings
     FROM class_sessions cs
     LEFT JOIN (
       SELECT class_id, COUNT(*) AS active_bookings
       FROM class_bookings
       WHERE status = 'booked'
       GROUP BY class_id
     ) b ON b.class_id = cs.id
     WHERE ${whereSql}
     ORDER BY cs.start_time ASC, trainer ASC, cs.room ASC
     LIMIT 1000`,
    params,
  );

  const bookings = await queryRows(
    pool,
    `SELECT
       DATE(cs.start_time) AS session_date,
       TIME(cs.start_time) AS start_time,
       cs.title AS class_name,
       COALESCE(NULLIF(cs.trainer_name, ''), cs.trainer_id, 'Unassigned') AS trainer,
       cs.room,
       cb.member_name AS member,
       cb.member_id,
       cb.status,
       cb.booked_at
     FROM class_bookings cb
     JOIN class_sessions cs ON cs.id = cb.class_id
     WHERE ${whereSql} AND cb.status = 'booked'
     ORDER BY cs.start_time ASC, cb.member_name ASC
     LIMIT 1000`,
    params,
  );

  const byTrainer = await queryRows(
    pool,
    `SELECT
       COALESCE(NULLIF(cs.trainer_name, ''), cs.trainer_id, 'Unassigned') AS trainer,
       COUNT(*) AS sessions,
       COALESCE(SUM(COALESCE(b.active_bookings, 0)), 0) AS enrolled,
       COUNT(DISTINCT cs.room) AS rooms
     FROM class_sessions cs
     LEFT JOIN (
       SELECT class_id, COUNT(*) AS active_bookings
       FROM class_bookings
       WHERE status = 'booked'
       GROUP BY class_id
     ) b ON b.class_id = cs.id
     WHERE ${whereSql}
     GROUP BY COALESCE(NULLIF(cs.trainer_name, ''), cs.trainer_id, 'Unassigned')
     ORDER BY sessions DESC, trainer ASC`,
    params,
  );

  const scheduled = classes.length;
  const activeBookings = bookings.length;
  const roomsUsed = new Set(classes.map((row) => String(row.room || '')).filter(Boolean)).size;
  const trainerLabel = trainerId ? String(classes[0]?.trainer || trainerId) : 'All trainers';

  return {
    section: 'scheduled-classes',
    title: 'Scheduled Group Classes Printout',
    subtitle: `Scheduled group classes from ${fromDate} to ${toDate} for ${trainerLabel}`,
    generatedAt: new Date(),
    summary: [
      { label: 'Trainer filter', value: trainerLabel },
      { label: 'Period', value: `${fromDate} to ${toDate}` },
      { label: 'Status filter', value: status || 'all' },
      { label: 'Matching classes', value: scheduled },
      { label: 'Active bookings', value: activeBookings },
      { label: 'Rooms used', value: roomsUsed },
    ],
    tables: [
      buildTable('Schedule by Trainer', ['Trainer', 'Sessions', 'Enrolled', 'Rooms'], byTrainer, 100),
      buildTable('Scheduled Group Classes', ['Session Date', 'Start Time', 'End Time', 'Class Name', 'Trainer', 'Room', 'Type', 'Level', 'Branch', 'Capacity', 'Enrolled Count', 'Free Spots', 'Active Bookings'], classes, 1000),
      buildTable('Booked Members', ['Session Date', 'Start Time', 'Class Name', 'Trainer', 'Room', 'Member', 'Member ID', 'Status', 'Booked At'], bookings, 1000),
    ],
  };
}

async function buildScheduledPrivatePtPrintReport(pool: Pool, fromDate: string, toDate: string, trainerId?: string, status = "scheduled"): Promise<ReportData> {
  const where = ["DATE(ps.start_time) BETWEEN ? AND ?"];
  const params: unknown[] = [fromDate, toDate];
  if (status && status !== "all") {
    where.push("ps.status = ?");
    params.push(status);
  }
  if (trainerId) {
    where.push("ps.trainer_id = ?");
    params.push(trainerId);
  }
  const whereSql = where.join(" AND ");

  const sessions = await queryRows(
    pool,
    `SELECT
       DATE(ps.start_time) AS session_date,
       TIME(ps.start_time) AS start_time,
       TIME(ps.end_time) AS end_time,
       COALESCE(NULLIF(ps.trainer_name, ''), ps.trainer_id, 'Unassigned') AS trainer,
       COALESCE(NULLIF(ps.member_name, ''), ps.member_id) AS member,
       ps.room,
       ps.level,
       ps.branch,
       ps.series_id,
       ps.notes,
       ps.status
     FROM private_sessions ps
     WHERE ${whereSql}
     ORDER BY ps.start_time ASC, trainer ASC, member ASC
     LIMIT 1000`,
    params,
  );

  const byTrainer = await queryRows(
    pool,
    `SELECT
       COALESCE(NULLIF(ps.trainer_name, ''), ps.trainer_id, 'Unassigned') AS trainer,
       COUNT(*) AS sessions,
       COUNT(DISTINCT ps.member_id) AS members,
       COUNT(DISTINCT ps.room) AS rooms
     FROM private_sessions ps
     WHERE ${whereSql}
     GROUP BY COALESCE(NULLIF(ps.trainer_name, ''), ps.trainer_id, 'Unassigned')
     ORDER BY sessions DESC, trainer ASC`,
    params,
  );

  const byRoom = await queryRows(
    pool,
    `SELECT ps.room, COUNT(*) AS sessions, COUNT(DISTINCT ps.trainer_id) AS trainers, COUNT(DISTINCT ps.member_id) AS members
     FROM private_sessions ps
     WHERE ${whereSql}
     GROUP BY ps.room
     ORDER BY sessions DESC, ps.room ASC`,
    params,
  );

  const trainerLabel = trainerId ? String(sessions[0]?.trainer || trainerId) : 'All trainers';
  const roomsUsed = new Set(sessions.map((row) => String(row.room || '')).filter(Boolean)).size;
  const membersScheduled = new Set(sessions.map((row) => String(row.member || '')).filter(Boolean)).size;

  return {
    section: 'scheduled-private-pt',
    title: 'Scheduled Private PT Sessions Printout',
    subtitle: `Scheduled private/PT sessions from ${fromDate} to ${toDate} for ${trainerLabel}`,
    generatedAt: new Date(),
    summary: [
      { label: 'Trainer filter', value: trainerLabel },
      { label: 'Period', value: `${fromDate} to ${toDate}` },
      { label: 'Status filter', value: status || 'all' },
      { label: 'Matching PT sessions', value: sessions.length },
      { label: 'Members scheduled', value: membersScheduled },
      { label: 'Rooms used', value: roomsUsed },
    ],
    tables: [
      buildTable('Schedule by Trainer', ['Trainer', 'Sessions', 'Members', 'Rooms'], byTrainer, 100),
      buildTable('Schedule by Room', ['Room', 'Sessions', 'Trainers', 'Members'], byRoom, 100),
      buildTable('Scheduled Private/PT Sessions', ['Session Date', 'Start Time', 'End Time', 'Trainer', 'Member', 'Room', 'Level', 'Branch', 'Series ID', 'Notes', 'Status'], sessions, 1000),
    ],
  };
}

async function buildPlansSubscriptionsReport(pool: Pool): Promise<ReportData> {
  const plans = await queryRows(pool, "SELECT id, name, duration_days, price, currency, status, created_at FROM subscription_plans ORDER BY status ASC, price ASC LIMIT 200");
  const subscriptions = await queryRows(
    pool,
    `SELECT ms.id, CONCAT_WS(' ', m.first_name, m.last_name) AS member_name, ms.plan_name, ms.status, ms.start_date, ms.end_date, ms.price, ms.currency
     FROM member_subscriptions ms
     LEFT JOIN members m ON m.id = ms.member_id
     ORDER BY ms.end_date DESC
     LIMIT 500`,
  );
  const invoices = await queryRows(
    pool,
    `SELECT
       i.invoice_number,
       CONCAT_WS(' ', m.first_name, m.last_name) AS member_name,
       i.status,
       i.subtotal,
       i.tax_amount,
       i.total,
       i.currency,
       i.due_date,
       i.paid_at,
       i.created_at
     FROM invoices i
     LEFT JOIN members m ON m.id = i.member_id
     ORDER BY i.created_at DESC
     LIMIT 500`,
  );
  const activeSubs = await queryScalar(pool, "SELECT COUNT(*) AS total FROM member_subscriptions WHERE status = 'active' AND end_date >= CURRENT_DATE");
  const expiredSubs = await queryScalar(pool, "SELECT COUNT(*) AS total FROM member_subscriptions WHERE status <> 'active' OR end_date < CURRENT_DATE");
  const invoiceTotal = await queryScalar(pool, "SELECT COALESCE(SUM(total),0) AS total FROM invoices");
  const paidTotal = await queryScalar(pool, "SELECT COALESCE(SUM(total),0) AS total FROM invoices WHERE status = 'paid'");
  return {
    section: "plans-subscriptions",
    title: "Plans, Subscriptions & Invoices Report",
    subtitle: "Commercial plan catalog, member validity and collection status",
    generatedAt: new Date(),
    summary: [
      { label: "Active subscriptions", value: activeSubs },
      { label: "Expired/inactive subscriptions", value: expiredSubs },
      { label: "Invoice total", value: formatMoney(invoiceTotal) },
      { label: "Paid invoice total", value: formatMoney(paidTotal) },
    ],
    tables: [
      buildTable("Subscription Plans", ["ID", "Name", "Days", "Price", "Currency", "Status", "Created"], plans, 100),
      buildTable("Member Subscriptions", ["ID", "Member", "Plan", "Status", "Start", "End", "Price", "Currency"], subscriptions),
      buildTable("Invoices", ["Invoice", "Member", "Status", "Subtotal", "Tax", "Total", "Currency", "Due", "Paid At", "Created"], invoices),
    ],
  };
}

async function buildSupportReport(pool: Pool): Promise<ReportData> {
  const tickets = await queryRows(
    pool,
    `SELECT
       st.id,
       st.subject,
       st.requester_name,
       st.requester_email,
       st.inquiry_type AS category,
       st.priority,
       st.status,
       st.assigned_to,
       st.created_at,
       st.updated_at
     FROM support_tickets st
     ORDER BY st.created_at DESC
     LIMIT 500`,
  );
  const notifications = await queryRows(
    pool,
    `SELECT
       n.id,
       COALESCE(n.user_id, n.role, 'all') AS recipient_user_id,
       n.title,
       n.channel,
       n.type AS priority,
       n.read_at,
       n.created_at
     FROM notifications n
     ORDER BY n.created_at DESC
     LIMIT 500`,
  );
  const ticketStatus = await queryRows(pool, "SELECT status, COUNT(*) AS total FROM support_tickets GROUP BY status ORDER BY total DESC");
  const openTickets = await queryScalar(pool, "SELECT COUNT(*) AS total FROM support_tickets WHERE status NOT IN ('closed','resolved')");
  const unreadNotifications = await queryScalar(pool, "SELECT COUNT(*) AS total FROM notifications WHERE read_at IS NULL");
  return {
    section: "support",
    title: "Support & Notifications Report",
    subtitle: "Support workflow and user notification activity",
    generatedAt: new Date(),
    summary: [
      { label: "Open tickets", value: openTickets },
      { label: "Unread notifications", value: unreadNotifications },
    ],
    tables: [
      buildTable("Tickets by Status", ["Status", "Total"], ticketStatus, 20),
      buildTable("Support Tickets", ["ID", "Subject", "Requester", "Email", "Category", "Priority", "Status", "Assigned To", "Created", "Updated"], tickets),
      buildTable("Notifications", ["ID", "Recipient", "Title", "Channel", "Priority", "Read At", "Created"], notifications),
    ],
  };
}

async function buildSecurityReport(pool: Pool): Promise<ReportData> {
  const audit = await queryRows(
    pool,
    `SELECT request_id, actor_email, actor_role, module, action, method, path, status_code, duration_ms, severity, created_at
     FROM security_audit_events
     ORDER BY created_at DESC
     LIMIT 500`,
  );
  const events = await queryRows(
    pool,
    `SELECT event_type, actor_email, ip_address, severity, details, created_at
     FROM security_events
     ORDER BY created_at DESC
     LIMIT 500`,
  );
  const severity = await queryRows(pool, "SELECT severity, COUNT(*) AS total FROM security_audit_events GROUP BY severity ORDER BY total DESC");
  const totalAudit = await queryScalar(pool, "SELECT COUNT(*) AS total FROM security_audit_events");
  const securityEvents = await queryScalar(pool, "SELECT COUNT(*) AS total FROM security_events");
  return {
    section: "security",
    title: "Security & Audit Report",
    subtitle: "Audit trails, security events and operational traceability",
    generatedAt: new Date(),
    summary: [
      { label: "Audit events", value: totalAudit },
      { label: "Security events", value: securityEvents },
    ],
    tables: [
      buildTable("Audit Events by Severity", ["Severity", "Total"], severity, 20),
      buildTable("Latest Audit Events", ["Request ID", "Actor", "Role", "Module", "Action", "Method", "Path", "Status", "Duration", "Severity", "Created"], audit),
      buildTable("Security Events", ["Type", "Actor", "IP", "Severity", "Details", "Created"], events),
    ],
  };
}

async function buildAllSectionsReport(pool: Pool, fromDate: string, toDate: string): Promise<ReportData> {
  const memberTotal = await queryScalar(pool, "SELECT COUNT(*) AS total FROM members");
  const activeMembers = await queryScalar(pool, "SELECT COUNT(*) AS total FROM members WHERE status = 'active'");
  // Canonical source: employees (staff migrated in 023)
  const staffTotal = await queryScalar(pool, "SELECT COUNT(*) AS total FROM employees");
  const employeeTotal = staffTotal;
  const classTotal = await queryScalar(pool, "SELECT COUNT(*) AS total FROM class_sessions");
  const ptTotal = await queryScalar(pool, "SELECT COUNT(*) AS total FROM private_sessions");
  const activeBookings = await queryScalar(pool, "SELECT COUNT(*) AS total FROM class_bookings WHERE status = 'booked'");
  const payrollNet = await queryScalar(pool, "SELECT COALESCE(SUM(total_net_pay),0) AS total FROM payroll_runs");
  const income = await queryScalar(pool, "SELECT COALESCE(SUM(amount),0) AS total FROM finance_transactions WHERE type = 'income' AND status = 'posted' AND transaction_date BETWEEN ? AND ?", [fromDate, toDate]);
  const expense = await queryScalar(pool, "SELECT COALESCE(SUM(amount),0) AS total FROM finance_transactions WHERE type = 'expense' AND status = 'posted' AND transaction_date BETWEEN ? AND ?", [fromDate, toDate]);
  const openTickets = await queryScalar(pool, "SELECT COUNT(*) AS total FROM support_tickets WHERE status NOT IN ('closed','resolved')");
  const openInvoices = await queryScalar(pool, "SELECT COUNT(*) AS total FROM invoices WHERE status IN ('issued','overdue','unpaid')");

  const statusRows = await queryRows(
    pool,
    `SELECT 'Members' AS section, status COLLATE utf8mb4_unicode_ci AS metric, COUNT(*) AS total FROM members GROUP BY status
     UNION ALL
     SELECT 'Employees' AS section, employment_status COLLATE utf8mb4_unicode_ci AS metric, COUNT(*) AS total FROM employees GROUP BY employment_status
     UNION ALL
     SELECT 'Invoices' AS section, status COLLATE utf8mb4_unicode_ci AS metric, COUNT(*) AS total FROM invoices GROUP BY status
     UNION ALL
     SELECT 'Classes' AS section, status COLLATE utf8mb4_unicode_ci AS metric, COUNT(*) AS total FROM class_sessions GROUP BY status
     UNION ALL
     SELECT 'Private PT' AS section, status COLLATE utf8mb4_unicode_ci AS metric, COUNT(*) AS total FROM private_sessions GROUP BY status
     ORDER BY section, total DESC`,
  );

  const upcoming = await queryRows(
    pool,
    `SELECT 'Group Class' AS type, title COLLATE utf8mb4_unicode_ci AS name, trainer_name COLLATE utf8mb4_unicode_ci AS trainer_name, room COLLATE utf8mb4_unicode_ci AS room, start_time, status COLLATE utf8mb4_unicode_ci AS status FROM class_sessions WHERE start_time >= NOW()
     UNION ALL
     SELECT 'Private PT' AS type, CONCAT('PT - ', COALESCE(member_name, member_id)) COLLATE utf8mb4_unicode_ci AS name, trainer_name COLLATE utf8mb4_unicode_ci AS trainer_name, room COLLATE utf8mb4_unicode_ci AS room, start_time, status COLLATE utf8mb4_unicode_ci AS status FROM private_sessions WHERE start_time >= NOW()
     ORDER BY start_time ASC
     LIMIT 80`,
  );

  return {
    section: "all",
    title: "PowerGym All Sections Report",
    subtitle: `Consolidated system snapshot from ${fromDate} to ${toDate}`,
    generatedAt: new Date(),
    summary: [
      { label: "Members", value: memberTotal },
      { label: "Active members", value: activeMembers },
      { label: "Total employees", value: staffTotal },
      { label: "Employee profiles", value: employeeTotal },
      { label: "Group classes", value: classTotal },
      { label: "Private PT sessions", value: ptTotal },
      { label: "Active class bookings", value: activeBookings },
      { label: "Open invoices", value: openInvoices },
      { label: "Payroll net total", value: formatMoney(payrollNet) },
      { label: "Period income", value: formatMoney(income) },
      { label: "Period expenses", value: formatMoney(expense) },
      { label: "Period net", value: formatMoney(income - expense) },
      { label: "Open support tickets", value: openTickets },
    ],
    tables: [
      buildTable("Operational Status Summary", ["Section", "Metric", "Total"], statusRows, 80),
      buildTable("Upcoming Schedule Snapshot", ["Type", "Name", "Trainer", "Room", "Start", "Status"], upcoming, 80),
    ],
  };
}


function httpError(message: string, status = 400) {
  const error = new Error(message);
  (error as any).status = status;
  return error;
}

function findScreenReport(id: string) {
  return SCREEN_REPORTS.find((report) => report.id === id);
}

function canAccessScreenReport(report: ScreenReportDefinition, role: string) {
  return report.roles.includes(role) || (role === "admin" && !report.roles.includes("admin"));
}

function sanitizeTextFilter(value: unknown, maxLength = 120) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "all") return "";
  return normalized.slice(0, maxLength);
}

function sanitizeNumericFilter(value: unknown) {
  const text = sanitizeTextFilter(value, 16);
  if (!text) return "";
  if (!/^\d{1,6}$/.test(text)) throw httpError("Invalid numeric report filter", 400);
  return text;
}

function parseScreenReportFilters(query: Request["query"]): ParsedReportFilters {
  const fromDate = normalizeDate(query.from, monthStart());
  const toDate = normalizeDate(query.to, todayDate());
  const fromTime = new Date(`${fromDate}T00:00:00.000Z`).getTime();
  const toTime = new Date(`${toDate}T00:00:00.000Z`).getTime();
  if (fromTime > toTime) throw httpError("Report 'from' date cannot be after 'to' date", 400);
  const rangeDays = Math.round((toTime - fromTime) / 86400000) + 1;
  if (rangeDays > 366) throw httpError("Report date range is limited to 366 days", 400);

  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(query)) {
    if (key === "from" || key === "to") continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    values[key] = sanitizeTextFilter(value);
  }
  return { fromDate, toDate, values };
}

function addScreenReportWhere(definition: ScreenReportDefinition, filters: ParsedReportFilters) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (definition.dateColumn) {
    where.push(`DATE(${definition.dateColumn}) BETWEEN ? AND ?`);
    params.push(filters.fromDate, filters.toDate);
  }

  for (const [filterId, column] of Object.entries(definition.exactFilters || {})) {
    const value = sanitizeTextFilter(filters.values[filterId]);
    if (value) {
      where.push(`${column} = ?`);
      params.push(value);
    }
  }

  for (const [filterId, column] of Object.entries(definition.numericFilters || {})) {
    const value = sanitizeNumericFilter(filters.values[filterId]);
    if (value) {
      where.push(`${column} = ?`);
      params.push(Number(value));
    }
  }

  for (const [filterId, columns] of Object.entries(definition.likeFilters || {})) {
    const value = sanitizeTextFilter(filters.values[filterId], 80);
    if (value) {
      where.push(`(${columns.map((column) => `${column} LIKE ?`).join(" OR ")})`);
      params.push(...columns.map(() => `%${value}%`));
    }
  }

  const whereSql = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
  return { whereSql, params };
}

function appliedFilterSummary(definition: ScreenReportDefinition, filters: ParsedReportFilters) {
  const rows: Array<{ label: string; value: string | number }> = [
    { label: "From", value: filters.fromDate },
    { label: "To", value: filters.toDate },
  ];

  for (const filter of definition.filters) {
    if (filter.id === "from" || filter.id === "to") continue;
    if (isTechnicalIdentifierLabel(filter.label)) continue;
    const value = sanitizeTextFilter(filters.values[filter.id]);
    if (!value) continue;
    const optionLabel = filter.options?.find((option) => option.value === value)?.label;
    rows.push({ label: filter.label, value: optionLabel || value });
  }

  return rows;
}

function screenReportFilename(reportId: string) {
  return `powergym-${reportId}-${todayDate()}.pdf`;
}

async function buildScreenReport(pool: Pool, definition: ScreenReportDefinition, filters: ParsedReportFilters): Promise<ReportData> {
  const { whereSql, params } = addScreenReportWhere(definition, filters);
  const limit = Math.min(Math.max(definition.limit || 1000, 1), 2000);
  const rows = await queryRows(
    pool,
    `${definition.baseSql}${whereSql} ${definition.orderBy} LIMIT ${limit}`,
    params,
  );

  const totalRows = await queryScalar(pool, `SELECT COUNT(*) AS total FROM (${definition.baseSql}${whereSql}) report_count`, params);
  const filteredOut = Math.max(totalRows - rows.length, 0);
  const filterSummary = appliedFilterSummary(definition, filters);

  return {
    section: definition.sectionId,
    title: definition.title,
    subtitle: `${definition.subtitle}. Screen: ${definition.screen}.`,
    generatedAt: new Date(),
    summary: [
      { label: "Screen", value: definition.screen },
      { label: "Report", value: definition.label },
      { label: "Matching rows", value: totalRows },
      { label: "Rows included in PDF", value: rows.length },
      { label: "Rows omitted by PDF limit", value: filteredOut },
      ...filterSummary,
    ],
    tables: [buildTable(definition.tableTitle, definition.columns, rows, limit)],
  };
}

export const __reportsForTests = {
  REPORT_SECTIONS,
  SCREEN_REPORTS,
  getSection,
  canAccessReport,
  findScreenReport,
  canAccessScreenReport,
  normalizeDate,
  sanitizeTextFilter,
  parseScreenReportFilters,
  addScreenReportWhere,
  appliedFilterSummary,
  screenReportFilename,
  buildScreenReport,
  isTechnicalIdentifierLabel,
  withoutTechnicalIdentifiers,
};

async function buildReportData(pool: Pool, sectionId: string, fromDate: string, toDate: string): Promise<ReportData> {
  switch (sectionId) {
    case "all":
      return buildAllSectionsReport(pool, fromDate, toDate);
    case "members":
      return buildMembersReport(pool);
    case "staff":
      return buildStaffReport(pool);
    case "payroll":
      return buildPayrollReport(pool);
    case "accounting":
      return buildAccountingReport(pool, fromDate, toDate);
    case "classes":
      return buildClassesReport(pool);
    case "private-pt":
      return buildPrivatePtReport(pool);
    case "plans-subscriptions":
      return buildPlansSubscriptionsReport(pool);
    case "support":
      return buildSupportReport(pool);
    case "security":
      return buildSecurityReport(pool);
    default:
      throw new Error(`Unknown report section: ${sectionId}`);
  }
}

function reportFilename(section: string) {
  return `powergym-${section}-report-${todayDate()}.pdf`;
}

function addFooter(doc: jsPDF, pageNumber: number, pageCount: number) {
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`PowerGym Management - Page ${pageNumber} of ${pageCount}`, 14, 290);
}

function renderReportPdf(report: ReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(33, 37, 41);
  doc.text(report.title, 14, cursorY);
  cursorY += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(85, 85, 85);
  doc.text(report.subtitle, 14, cursorY);
  cursorY += 6;
  doc.text(`Generated: ${formatDateTime(report.generatedAt)} | Section: ${report.section}`, 14, cursorY);
  cursorY += 10;

  doc.setDrawColor(107, 251, 83);
  doc.setLineWidth(0.8);
  doc.line(14, cursorY, pageWidth - 14, cursorY);
  cursorY += 8;

  const summaryBody = report.summary.map((item) => [item.label, valueToString(item.value)]);
  autoTable(doc, {
    startY: cursorY,
    head: [["Metric", "Value"]],
    body: summaryBody,
    styles: { fontSize: 9, cellPadding: 2.4, overflow: "linebreak" },
    headStyles: { fillColor: [43, 43, 43], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    margin: { left: 14, right: 14 },
  });
  cursorY = ((doc as any).lastAutoTable?.finalY || cursorY) + 8;

  for (const table of report.tables) {
    if (cursorY > 245) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(33, 37, 41);
    doc.text(table.title, 14, cursorY);
    cursorY += 5;

    const body = table.rows.map((row) => table.columns.map((column) => {
      const key = column
        .toLowerCase()
        .replace(/[^a-z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, "");
      const snakeKey = column.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const directKey = Object.keys(row).find((candidate) => {
        const normalized = candidate.toLowerCase();
        const compactCandidate = normalized.replace(/_/g, "");
        const compactSnake = snakeKey.replace(/_/g, "");
        return (
          normalized === snakeKey ||
          normalized === key.toLowerCase() ||
          compactCandidate === compactSnake ||
          normalized.startsWith(`${snakeKey}_`) ||
          normalized.endsWith(`_${snakeKey}`) ||
          normalized.includes(`_${snakeKey}_`)
        );
      });
      const value = directKey ? row[directKey] : row[column];
      if (/amount|salary|pay|cost|price|tax|total|income|expense|principal|payment|base|allowance|bonus|deduction/i.test(column)) {
        return formatMoney(value);
      }
      if (/date|created|updated|start|end|paid/i.test(column)) {
        return /time|created|updated|paid/i.test(column) ? formatDateTime(value) : formatDate(value);
      }
      return valueToString(value);
    }));

    autoTable(doc, {
      startY: cursorY,
      head: [table.columns],
      body,
      styles: { fontSize: 7.5, cellPadding: 1.7, overflow: "linebreak" },
      headStyles: { fillColor: [43, 43, 43], textColor: [255, 255, 255], fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      margin: { left: 8, right: 8 },
      didDrawPage: () => undefined,
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY) + 8;
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    addFooter(doc, i, pageCount);
  }

  return Buffer.from(doc.output("arraybuffer"));
}

export function registerReportsRoutes(app: Express, poolProvider: PoolProvider) {
  const auditPdfDownload = async (
    pool: Pool,
    req: AuthenticatedRequest,
    reportId: string,
    filters: Record<string, unknown>,
  ) => {
    await pool.query(
      `INSERT INTO audit_logs (action, details, performed_by)
       VALUES ('report_pdf_downloaded', ?, ?)`,
      [
        JSON.stringify({ reportId, filters }),
        req.user?.email || req.user?.uid || "system",
      ],
    );
  };
  app.get("/api/reports/sections", (req: AuthenticatedRequest, res: Response) => {
    const role = req.user?.role || "";
    const sections = REPORT_SECTIONS.filter((section) => canAccessReport(section, role)).map(({ id, label, description }) => ({ id, label, description }));
    res.json({ sections });
  });

  app.get("/api/reports/screen-catalog", (req: AuthenticatedRequest, res: Response) => {
    const role = req.user?.role || "";
    const reports = SCREEN_REPORTS
      .filter((report) => canAccessScreenReport(report, role))
      .map(({ id, sectionId, label, description, screen, filters }) => ({
        id,
        sectionId,
        label,
        description,
        screen,
        filters: filters.filter((filter) => !isTechnicalIdentifierLabel(filter.label)),
      }));
    res.json({ reports });
  });

  app.get("/api/reports/screen/:reportId.pdf", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reportId = String(req.params.reportId || "").trim();
      const definition = findScreenReport(reportId);
      if (!definition) return res.status(404).json({ error: "Screen report not found" });

      const role = req.user?.role || "";
      if (!canAccessScreenReport(definition, role)) {
        return res.status(403).json({ error: "Report permission required" });
      }

      const pool = requirePool(poolProvider);
      const filters = parseScreenReportFilters(req.query);
      const report = await buildScreenReport(pool, definition, filters);
      const buffer = renderReportPdf(report);
      await auditPdfDownload(pool, req, reportId, filters);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${screenReportFilename(reportId)}"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  });

  const normalizeTrainerId = (value: unknown) => {
    const trainerId = typeof value === "string" ? value.trim() : "";
    return trainerId && trainerId !== "all" ? trainerId : undefined;
  };

  const sendSingleClassSessionPdf = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const section = getSection("classes");
      if (!section) return res.status(404).json({ error: "Report section not found" });
      const role = req.user?.role || "";
      if (!canAccessReport(section, role)) return res.status(403).json({ error: "Report permission required" });

      const classId = String(req.params.classId || req.query.classId || "").trim();
      if (!classId || classId === "undefined" || classId === "null") {
        return res.status(400).json({ error: "Class session ID is required" });
      }

      const pool = requirePool(poolProvider);
      const report = await buildSingleClassPrintReport(pool, classId);
      const buffer = renderReportPdf(report);
      await auditPdfDownload(pool, req, "class-session", { classId });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="powergym-class-session-${classId}-${todayDate()}.pdf"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  };

  // Query-string endpoint avoids SPA/development fallback issues with nested paths.
  // Path aliases are kept for backwards compatibility with Delivery 25 clients.
  app.get("/api/reports/class-session.pdf", sendSingleClassSessionPdf);
  app.get("/api/reports/class-session/:classId.pdf", sendSingleClassSessionPdf);
  app.get("/api/reports/class-session/:classId", sendSingleClassSessionPdf);
  app.get("/api/reports/classes/:classId/session.pdf", sendSingleClassSessionPdf);

  app.get("/api/reports/scheduled-classes.pdf", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const section = getSection("classes");
      if (!section) return res.status(404).json({ error: "Report section not found" });
      const role = req.user?.role || "";
      if (!canAccessReport(section, role)) return res.status(403).json({ error: "Report permission required" });

      const pool = requirePool(poolProvider);
      const fromDate = normalizeDate(req.query.from, monthStart());
      const toDate = normalizeDate(req.query.to, todayDate());
      const trainerId = normalizeTrainerId(req.query.trainerId);
      const status = sanitizeTextFilter(req.query.status, 32) || "scheduled";
      const report = await buildScheduledClassesPrintReport(pool, fromDate, toDate, trainerId, status);
      const buffer = renderReportPdf(report);
      await auditPdfDownload(pool, req, "scheduled-classes", {
        fromDate,
        toDate,
        trainerId: trainerId || null,
        status,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="powergym-scheduled-classes-${todayDate()}.pdf"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/reports/scheduled-private-pt.pdf", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const section = getSection("private-pt");
      if (!section) return res.status(404).json({ error: "Report section not found" });
      const role = req.user?.role || "";
      if (!canAccessReport(section, role)) return res.status(403).json({ error: "Report permission required" });

      const pool = requirePool(poolProvider);
      const fromDate = normalizeDate(req.query.from, monthStart());
      const toDate = normalizeDate(req.query.to, todayDate());
      const trainerId = normalizeTrainerId(req.query.trainerId);
      const status = sanitizeTextFilter(req.query.status, 32) || "scheduled";
      const report = await buildScheduledPrivatePtPrintReport(pool, fromDate, toDate, trainerId, status);
      const buffer = renderReportPdf(report);
      await auditPdfDownload(pool, req, "scheduled-private-pt", {
        fromDate,
        toDate,
        trainerId: trainerId || null,
        status,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="powergym-scheduled-private-pt-${todayDate()}.pdf"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/reports/:section.pdf", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sectionId = String(req.params.section || "");
      const section = getSection(sectionId);
      if (!section) return res.status(404).json({ error: "Report section not found" });

      const role = req.user?.role || "";
      if (!canAccessReport(section, role)) {
        return res.status(403).json({ error: "Report permission required" });
      }

      const pool = requirePool(poolProvider);
      const fromDate = normalizeDate(req.query.from, monthStart());
      const toDate = normalizeDate(req.query.to, todayDate());
      const report = await buildReportData(pool, sectionId, fromDate, toDate);
      const buffer = renderReportPdf(report);
      await auditPdfDownload(pool, req, sectionId, { fromDate, toDate });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${reportFilename(sectionId)}"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  });
}
