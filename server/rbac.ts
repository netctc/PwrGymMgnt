import type { NextFunction, Request, Response } from "express";

export type AppRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "accounting"
  | "hr"
  | "reception"
  | "trainer"
  | "support"
  | "warehouse_manager"
  | "cashier"
  | "client"
  | "staff";

export type AuthenticatedRequest = Request & {
  user?: {
    uid?: string;
    email?: string;
    role?: string;
  };
  requestId?: string;
  cacheHit?: boolean;
};

const ROLE_HIERARCHY: Record<AppRole, number> = {
  super_admin: 100,
  admin: 90,
  manager: 70,
  accounting: 60,
  hr: 60,
  warehouse_manager: 60,
  reception: 50,
  cashier: 50,
  trainer: 40,
  support: 40,
  staff: 30,
  client: 10,
};

export const APP_ROLES = Object.freeze(Object.keys(ROLE_HIERARCHY) as AppRole[]);

const ALL_AUTHENTICATED_ROLES = APP_ROLES;
const OPERATIONAL_DASHBOARD_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "accounting", "hr", "reception", "cashier", "trainer", "support", "warehouse_manager"];
const ADMIN_ROLES: readonly AppRole[] = ["super_admin", "admin"];
const PLATFORM_OBSERVER_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager"];
const SUPER_ADMIN_ROLES: readonly AppRole[] = ["super_admin"];
const LEADERSHIP_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager"];
const FRONT_DESK_ROLES: readonly AppRole[] = ["reception", "cashier"];
const FRONT_DESK_AND_LEADERSHIP_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "reception", "cashier"];
const SCHEDULING_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "reception", "cashier", "trainer"];
const MEMBERSHIP_READ_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "reception", "cashier", "trainer", "accounting", "hr"];
const STAFF_READ_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "hr"];
const FINANCE_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "accounting"];
const HR_READ_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "hr", "accounting"];
const HR_WRITE_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "hr"];
const SUPPORT_READ_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "support", "reception", "cashier"];
const SUPPORT_WRITE_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "support"];
const REPORT_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "accounting", "hr", "reception", "cashier", "trainer", "support", "warehouse_manager"];
const WAREHOUSE_READ_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "warehouse_manager", "accounting", "reception", "cashier"];
const WAREHOUSE_MANAGE_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "warehouse_manager"];
const WAREHOUSE_PURCHASE_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "warehouse_manager", "accounting"];
const WAREHOUSE_POS_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "warehouse_manager", "reception", "cashier"];
const WAREHOUSE_REPORT_ROLES: readonly AppRole[] = ["super_admin", "admin", "manager", "warehouse_manager", "accounting"];
const USER_MAINTENANCE_ROLES: readonly AppRole[] = ["super_admin", "admin"];


export function isAppRole(role: unknown): role is AppRole {
  return typeof role === "string" && role in ROLE_HIERARCHY;
}

export function normalizeAppRole(role: unknown): AppRole | "" {
  const normalized = typeof role === "string" ? role.trim().toLowerCase().replace(/[\s.-]+/g, "_") : "";
  return isAppRole(normalized) ? normalized : "";
}

export const DEFAULT_PERMISSIONS: Record<string, readonly AppRole[]> = {
  "dashboard.read": OPERATIONAL_DASHBOARD_ROLES,

  "platform.audit.read": ADMIN_ROLES,
  "platform.security.observe": PLATFORM_OBSERVER_ROLES,
  "platform.data.integrity": PLATFORM_OBSERVER_ROLES,
  "platform.health.detail": ADMIN_ROLES,
  "platform.backups.manage": ADMIN_ROLES,
  "platform.backups.restore": SUPER_ADMIN_ROLES,

  "user_maintenance.read": USER_MAINTENANCE_ROLES,
  "user_maintenance.write": USER_MAINTENANCE_ROLES,
  "role_permissions.read": USER_MAINTENANCE_ROLES,
  "role_permissions.write": SUPER_ADMIN_ROLES,

  "records.members.read": MEMBERSHIP_READ_ROLES,
  "records.members.write": FRONT_DESK_AND_LEADERSHIP_ROLES,
  "records.staff.read": STAFF_READ_ROLES,
  "records.staff.write": HR_WRITE_ROLES,
  "records.users.read": STAFF_READ_ROLES,
  "records.users.write": ADMIN_ROLES,
  "records.classes.read": SCHEDULING_ROLES,
  "records.classes.write": SCHEDULING_ROLES,
  "records.private_classes.read": SCHEDULING_ROLES,
  "records.private_classes.write": SCHEDULING_ROLES,
  "records.shifts.read": [...SCHEDULING_ROLES, "hr"],
  "records.shifts.write": HR_WRITE_ROLES,
  "records.hr_profiles.read": STAFF_READ_ROLES,
  "records.hr_profiles.write": HR_WRITE_ROLES,
  "records.settings.read": [...OPERATIONAL_DASHBOARD_ROLES, "client", "staff"],
  "records.settings.write": ADMIN_ROLES,
  "records.audit_logs.read": ADMIN_ROLES,
  "records.audit_logs.write": ADMIN_ROLES,

  "membership.read": MEMBERSHIP_READ_ROLES,
  "membership.write": FRONT_DESK_AND_LEADERSHIP_ROLES,
  "membership.ecard.generate": FRONT_DESK_AND_LEADERSHIP_ROLES,
  "membership.access.validate": [...FRONT_DESK_AND_LEADERSHIP_ROLES, "trainer"],

  "finance.read": FINANCE_ROLES,
  "finance.write": FINANCE_ROLES,

  "hr.read": HR_READ_ROLES,
  "hr.write": HR_WRITE_ROLES,
  "payroll.approve": FINANCE_ROLES,

  "scheduling.read": SCHEDULING_ROLES,
  "scheduling.write": SCHEDULING_ROLES,

  "support.read": SUPPORT_READ_ROLES,
  "support.write": SUPPORT_WRITE_ROLES,
  "support.self": ALL_AUTHENTICATED_ROLES,

  "reports.read": REPORT_ROLES,

  "warehouse.read": WAREHOUSE_READ_ROLES,
  "warehouse.write": WAREHOUSE_MANAGE_ROLES,
  "warehouse.purchase": WAREHOUSE_PURCHASE_ROLES,
  "warehouse.pos": WAREHOUSE_POS_ROLES,
  "warehouse.reports": WAREHOUSE_REPORT_ROLES,
};

export function getUserRole(req: AuthenticatedRequest): AppRole | "" {
  return normalizeAppRole(req.user?.role);
}

export function hasAnyRole(req: AuthenticatedRequest, roles: readonly string[]) {
  const role = getUserRole(req);
  return Boolean(role && roles.includes(role));
}

export function hasMinimumRole(req: AuthenticatedRequest, minimumRole: AppRole) {
  const role = getUserRole(req);
  return Boolean(role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimumRole]);
}

const dynamicRolePermissionOverrides = new Map<string, Map<AppRole, boolean>>();

export const PERMISSIONS = DEFAULT_PERMISSIONS;

export type RolePermissionOverride = {
  role: AppRole;
  permission: string;
  allowed: boolean;
};

export function setRolePermissionOverrides(overrides: readonly RolePermissionOverride[]) {
  dynamicRolePermissionOverrides.clear();
  for (const override of overrides) {
    if (!DEFAULT_PERMISSIONS[override.permission]) continue;
    if (!isAppRole(override.role)) continue;
    const permissionOverrides = dynamicRolePermissionOverrides.get(override.permission) || new Map<AppRole, boolean>();
    permissionOverrides.set(override.role, Boolean(override.allowed));
    dynamicRolePermissionOverrides.set(override.permission, permissionOverrides);
  }
}

export function updateRolePermissionOverride(role: AppRole, permission: string, allowed: boolean | null) {
  if (!DEFAULT_PERMISSIONS[permission]) return;
  const permissionOverrides = dynamicRolePermissionOverrides.get(permission) || new Map<AppRole, boolean>();
  if (allowed === null) {
    permissionOverrides.delete(role);
  } else {
    permissionOverrides.set(role, Boolean(allowed));
  }
  if (permissionOverrides.size === 0) dynamicRolePermissionOverrides.delete(permission);
  else dynamicRolePermissionOverrides.set(permission, permissionOverrides);
}

export function getPermissionKeys() {
  return Object.keys(DEFAULT_PERMISSIONS).sort();
}

export function getAllowedRoles(permission: string): readonly AppRole[] {
  const defaultRoles = DEFAULT_PERMISSIONS[permission];
  if (!defaultRoles) return [];
  const overrideMap = dynamicRolePermissionOverrides.get(permission);
  if (!overrideMap) return defaultRoles;

  const roles = new Set<AppRole>(defaultRoles);
  for (const [role, allowed] of overrideMap.entries()) {
    if (allowed) roles.add(role);
    else roles.delete(role);
  }
  return APP_ROLES.filter((role) => roles.has(role));
}

export function getDefaultAllowedRoles(permission: string): readonly AppRole[] {
  return DEFAULT_PERMISSIONS[permission] || [];
}

export function hasPermission(req: AuthenticatedRequest, permission: string) {
  const allowedRoles = getAllowedRoles(permission);
  if (!allowedRoles.length) return false;
  return hasAnyRole(req, allowedRoles);
}

export function requireRole(...roles: AppRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!hasAnyRole(req, roles)) {
      return res.status(403).json({ error: "Permission denied", requiredRoles: roles });
    }
    return next();
  };
}

export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!hasPermission(req, permission)) {
      return res.status(403).json({ error: "Permission denied", permission });
    }
    return next();
  };
}
