import { PERMISSIONS, getAllowedRoles, type AppRole } from "./rbac";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";

export type RoutePermissionEntry = {
  method: ApiMethod;
  path: string;
  permission: string;
  note?: string;
};

export const API_ROUTE_PERMISSION_MATRIX: readonly RoutePermissionEntry[] = Object.freeze([
  { method: "GET", path: "/api/dashboard/summary", permission: "dashboard.read", note: "Typed Phase 3 dashboard aggregate endpoint." },
  { method: "GET", path: "/api/dashboard/trainer-utilization", permission: "dashboard.read", note: "Typed Phase 3 trainer utilization endpoint." },
  { method: "GET", path: "/api/dashboard/action-center", permission: "dashboard.read", note: "Phase 9 smart operational action center." },

  { method: "ALL", path: "/api/membership/*", permission: "membership.read", note: "Read baseline for plans, members, subscriptions, invoices and receipts." },
  { method: "POST", path: "/api/membership/plans", permission: "membership.write" },
  { method: "PUT", path: "/api/membership/plans/:id", permission: "membership.write" },
  { method: "POST", path: "/api/membership/members", permission: "membership.write" },
  { method: "PUT", path: "/api/membership/members/:id", permission: "membership.write" },
  { method: "DELETE", path: "/api/membership/members/:id", permission: "membership.write" },
  { method: "POST", path: "/api/membership/members/:id/subscriptions", permission: "membership.write" },
  { method: "POST", path: "/api/membership/invoices/:id/mark-paid", permission: "membership.write" },
  { method: "POST", path: "/api/membership/members/:id/access-token", permission: "membership.ecard.generate" },
  { method: "POST", path: "/api/membership/validate-access", permission: "membership.access.validate" },

  { method: "ALL", path: "/api/scheduling/*", permission: "scheduling.read", note: "Read baseline for resources, class sessions, bookings and private PT." },
  { method: "POST", path: "/api/scheduling/classes", permission: "scheduling.write" },
  { method: "PUT", path: "/api/scheduling/classes/:id", permission: "scheduling.write" },
  { method: "DELETE", path: "/api/scheduling/classes/:id", permission: "scheduling.write" },
  { method: "POST", path: "/api/scheduling/classes/:id/bookings", permission: "scheduling.write" },
  { method: "DELETE", path: "/api/scheduling/bookings/:id", permission: "scheduling.write" },
  { method: "POST", path: "/api/scheduling/private-classes", permission: "scheduling.write" },
  { method: "DELETE", path: "/api/scheduling/private-classes/:id", permission: "scheduling.write" },

  { method: "ALL", path: "/api/hr/*", permission: "hr.read", note: "Read baseline for employees, attendance and payroll history." },
  { method: "POST", path: "/api/hr/employees", permission: "hr.write" },
  { method: "PUT", path: "/api/hr/employees/:id", permission: "hr.write" },
  { method: "POST", path: "/api/hr/attendance", permission: "hr.write" },
  { method: "POST", path: "/api/hr/payroll/runs", permission: "hr.write" },
  { method: "POST", path: "/api/hr/payroll/runs/:id/approve", permission: "payroll.approve" },
  { method: "POST", path: "/api/hr/payroll/runs/:id/mark-paid", permission: "payroll.approve" },

  { method: "ALL", path: "/api/finance/*", permission: "finance.read", note: "Read baseline for summary, transactions, budgets, payroll postings and recurring jobs." },
  { method: "POST", path: "/api/finance/transactions", permission: "finance.write" },
  { method: "PUT", path: "/api/finance/transactions/:id", permission: "finance.write" },
  { method: "POST", path: "/api/finance/transactions/:id/approve", permission: "finance.write" },
  { method: "DELETE", path: "/api/finance/transactions/:id", permission: "finance.write" },
  { method: "POST", path: "/api/finance/loans", permission: "finance.write" },
  { method: "PUT", path: "/api/finance/loans/:id", permission: "finance.write" },
  { method: "POST", path: "/api/finance/rentals", permission: "finance.write" },
  { method: "PUT", path: "/api/finance/rentals/:id", permission: "finance.write" },
  { method: "POST", path: "/api/finance/budgets", permission: "finance.write" },
  { method: "POST", path: "/api/finance/payroll-runs/:id/post", permission: "payroll.approve" },
  { method: "POST", path: "/api/finance/recurring/process", permission: "finance.write" },

  { method: "ALL", path: "/api/warehouse/*", permission: "warehouse.read" },
  { method: "POST", path: "/api/warehouse/categories", permission: "warehouse.write" },
  { method: "PUT", path: "/api/warehouse/categories/:id", permission: "warehouse.write" },
  { method: "DELETE", path: "/api/warehouse/categories/:id", permission: "warehouse.write" },
  { method: "POST", path: "/api/warehouse/products", permission: "warehouse.write" },
  { method: "PUT", path: "/api/warehouse/products/:id", permission: "warehouse.write" },
  { method: "DELETE", path: "/api/warehouse/products/:id", permission: "warehouse.write" },
  { method: "POST", path: "/api/warehouse/suppliers", permission: "warehouse.purchase" },
  { method: "PUT", path: "/api/warehouse/suppliers/:id", permission: "warehouse.purchase" },
  { method: "POST", path: "/api/warehouse/stock-adjustments", permission: "warehouse.write" },
  { method: "POST", path: "/api/warehouse/purchase-orders", permission: "warehouse.purchase" },
  { method: "POST", path: "/api/warehouse/purchase-orders/:id/receive", permission: "warehouse.purchase" },
  { method: "POST", path: "/api/warehouse/purchase-orders/:id/status", permission: "warehouse.purchase" },
  { method: "GET", path: "/api/warehouse/pos/catalog", permission: "warehouse.pos" },
  { method: "POST", path: "/api/warehouse/pos/sales", permission: "warehouse.pos" },
  { method: "GET", path: "/api/warehouse/pos/sales", permission: "warehouse.pos" },
  { method: "GET", path: "/api/warehouse/reports/:reportId.:format", permission: "warehouse.reports" },

  { method: "GET", path: "/api/reports/*", permission: "reports.read", note: "Report sections also apply section-level role filtering." },
  { method: "ALL", path: "/api/engagement/support/tickets*", permission: "support.self", note: "Self-service ticket access is additionally restricted by requester ownership in the route handler." },
  { method: "POST", path: "/api/engagement/notifications", permission: "support.write" },
  { method: "PUT", path: "/api/engagement/support/tickets/:id/status", permission: "support.write" },
  { method: "GET", path: "/api/engagement/deployment-readiness", permission: "support.write" },

  { method: "GET", path: "/api/platform/production-readiness", permission: "platform.health.detail", note: "Phase 10 production readiness and release posture endpoint." },
  { method: "GET", path: "/api/platform/*", permission: "platform.security.observe" },
  { method: "ALL", path: "/api/platform/data-integrity/*", permission: "platform.data.integrity" },
  { method: "GET", path: "/api/settings/users", permission: "user_maintenance.read" },
  { method: "GET", path: "/api/settings/user-link-employees", permission: "user_maintenance.read" },
  { method: "POST", path: "/api/settings/users", permission: "user_maintenance.write" },
  { method: "PUT", path: "/api/settings/users/:id", permission: "user_maintenance.write" },
  { method: "DELETE", path: "/api/settings/users/:id", permission: "user_maintenance.write" },
  { method: "GET", path: "/api/settings/roles", permission: "user_maintenance.read" },
  { method: "GET", path: "/api/settings/role-permissions", permission: "role_permissions.read" },
  { method: "PUT", path: "/api/settings/role-permissions/:role/:permission", permission: "role_permissions.write" },
  { method: "ALL", path: "/api/platform/backups/restore/*", permission: "platform.backups.restore" },
  { method: "GET", path: "/api/audit-logs", permission: "platform.audit.read" },
  { method: "POST", path: "/api/trigger-backup", permission: "platform.backups.manage" },
  { method: "ALL", path: "/api/backups*", permission: "platform.backups.manage" },

  { method: "ALL", path: "/api/records/members*", permission: "records.members.read", note: "Write methods use records.members.write." },
  { method: "ALL", path: "/api/records/users*", permission: "records.users.read", note: "Write methods use records.users.write." },
  { method: "ALL", path: "/api/records/staff*", permission: "records.staff.read", note: "Write methods use records.staff.write." },
  { method: "ALL", path: "/api/records/classes*", permission: "records.classes.read", note: "Write methods use records.classes.write." },
  { method: "ALL", path: "/api/records/settings*", permission: "records.settings.read", note: "Write methods use records.settings.write." },
]);

export function getMatrixPermissions() {
  return [...new Set(API_ROUTE_PERMISSION_MATRIX.map((entry) => entry.permission))].sort();
}

export function getUnknownMatrixPermissions() {
  return getMatrixPermissions().filter((permission) => !PERMISSIONS[permission]);
}

export function getRolesForMatrixEntry(entry: RoutePermissionEntry): readonly AppRole[] {
  return getAllowedRoles(entry.permission);
}
