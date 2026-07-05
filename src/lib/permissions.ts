export type ClientRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'accounting'
  | 'hr'
  | 'reception'
  | 'trainer'
  | 'support'
  | 'warehouse_manager'
  | 'cashier'
  | 'client'
  | 'staff';

export type ClientPermission =
  | 'dashboard.read'
  | 'membership.read'
  | 'membership.write'
  | 'membership.access.validate'
  | 'membership.ecard.generate'
  | 'scheduling.read'
  | 'scheduling.write'
  | 'hr.read'
  | 'hr.write'
  | 'finance.read'
  | 'warehouse.read'
  | 'warehouse.write'
  | 'warehouse.purchase'
  | 'warehouse.pos'
  | 'warehouse.reports'
  | 'reports.read'
  | 'platform.audit.read'
  | 'user_maintenance.read'
  | 'user_maintenance.write'
  | 'role_permissions.read'
  | 'role_permissions.write'
  | 'support.self';

const CLIENT_ROLES: readonly ClientRole[] = [
  'super_admin',
  'admin',
  'manager',
  'accounting',
  'hr',
  'reception',
  'trainer',
  'support',
  'warehouse_manager',
  'cashier',
  'client',
  'staff',
] as const;

const ALL_AUTHENTICATED_ROLES = CLIENT_ROLES;
const OPERATIONAL_DASHBOARD_ROLES: readonly ClientRole[] = ['super_admin', 'admin', 'manager', 'accounting', 'hr', 'reception', 'cashier', 'trainer', 'support', 'warehouse_manager'];
const ADMIN_ROLES: readonly ClientRole[] = ['super_admin', 'admin'];
const FRONT_DESK_AND_LEADERSHIP_ROLES: readonly ClientRole[] = ['super_admin', 'admin', 'manager', 'reception', 'cashier'];
const SCHEDULING_ROLES: readonly ClientRole[] = ['super_admin', 'admin', 'manager', 'reception', 'cashier', 'trainer'];
const MEMBERSHIP_READ_ROLES: readonly ClientRole[] = ['super_admin', 'admin', 'manager', 'reception', 'cashier', 'trainer', 'accounting', 'hr'];
const FINANCE_ROLES: readonly ClientRole[] = ['super_admin', 'admin', 'manager', 'accounting'];
const HR_READ_ROLES: readonly ClientRole[] = ['super_admin', 'admin', 'manager', 'hr', 'accounting'];
const HR_WRITE_ROLES: readonly ClientRole[] = ['super_admin', 'admin', 'manager', 'hr'];
const REPORT_ROLES: readonly ClientRole[] = ['super_admin', 'admin', 'manager', 'accounting', 'hr', 'reception', 'cashier', 'trainer', 'support', 'warehouse_manager'];
const WAREHOUSE_READ_ROLES: readonly ClientRole[] = ['super_admin', 'admin', 'manager', 'warehouse_manager', 'accounting', 'reception', 'cashier'];
const WAREHOUSE_WRITE_ROLES: readonly ClientRole[] = ['super_admin', 'admin', 'manager', 'warehouse_manager'];
const WAREHOUSE_PURCHASE_ROLES: readonly ClientRole[] = ['super_admin', 'admin', 'manager', 'warehouse_manager', 'accounting'];
const WAREHOUSE_POS_ROLES: readonly ClientRole[] = ['super_admin', 'admin', 'manager', 'warehouse_manager', 'reception', 'cashier'];
const WAREHOUSE_REPORT_ROLES: readonly ClientRole[] = ['super_admin', 'admin', 'manager', 'warehouse_manager', 'accounting'];
const USER_MAINTENANCE_ROLES: readonly ClientRole[] = ['super_admin', 'admin'];
const SUPER_ADMIN_ROLES: readonly ClientRole[] = ['super_admin'];

export const CLIENT_PERMISSIONS: Record<ClientPermission, readonly ClientRole[]> = {
  'dashboard.read': OPERATIONAL_DASHBOARD_ROLES,
  'membership.read': MEMBERSHIP_READ_ROLES,
  'membership.write': FRONT_DESK_AND_LEADERSHIP_ROLES,
  'membership.access.validate': [...FRONT_DESK_AND_LEADERSHIP_ROLES, 'trainer'],
  'membership.ecard.generate': FRONT_DESK_AND_LEADERSHIP_ROLES,
  'scheduling.read': SCHEDULING_ROLES,
  'scheduling.write': SCHEDULING_ROLES,
  'hr.read': HR_READ_ROLES,
  'hr.write': HR_WRITE_ROLES,
  'finance.read': FINANCE_ROLES,
  'warehouse.read': WAREHOUSE_READ_ROLES,
  'warehouse.write': WAREHOUSE_WRITE_ROLES,
  'warehouse.purchase': WAREHOUSE_PURCHASE_ROLES,
  'warehouse.pos': WAREHOUSE_POS_ROLES,
  'warehouse.reports': WAREHOUSE_REPORT_ROLES,
  'reports.read': REPORT_ROLES,
  'platform.audit.read': ADMIN_ROLES,
  'user_maintenance.read': USER_MAINTENANCE_ROLES,
  'user_maintenance.write': USER_MAINTENANCE_ROLES,
  'role_permissions.read': USER_MAINTENANCE_ROLES,
  'role_permissions.write': SUPER_ADMIN_ROLES,
  'support.self': ALL_AUTHENTICATED_ROLES,
};

export function isClientRole(role: unknown): role is ClientRole {
  return typeof role === 'string' && CLIENT_ROLES.includes(role as ClientRole);
}

export function normalizeClientRole(role: unknown): ClientRole | '' {
  const normalized = typeof role === 'string' ? role.trim().toLowerCase().replace(/[\s.-]+/g, '_') : '';
  return isClientRole(normalized) ? normalized : '';
}

export function hasClientPermission(role: unknown, permission: ClientPermission) {
  const normalizedRole = normalizeClientRole(role);
  return Boolean(normalizedRole && CLIENT_PERMISSIONS[permission].includes(normalizedRole));
}
