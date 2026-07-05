import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllowedRoles, hasAnyRole, hasMinimumRole, hasPermission, requirePermission, setRolePermissionOverrides, updateRolePermissionOverride, type AuthenticatedRequest } from '../server/rbac';

function req(role?: string): AuthenticatedRequest {
  return { user: role ? { role } : undefined } as AuthenticatedRequest;
}

test('RBAC grants expected read/write permissions by role', () => {
  assert.equal(hasPermission(req('super_admin'), 'platform.backups.manage'), true);
  assert.equal(hasPermission(req('admin'), 'platform.backups.manage'), true);
  assert.equal(hasPermission(req('manager'), 'platform.backups.manage'), false);
  assert.equal(hasPermission(req('accounting'), 'finance.write'), true);
  assert.equal(hasPermission(req('trainer'), 'finance.write'), false);
  assert.equal(hasPermission(req('reception'), 'membership.ecard.generate'), true);
  assert.equal(hasPermission(req('cashier'), 'membership.ecard.generate'), true);
  assert.equal(hasPermission(req('client'), 'membership.ecard.generate'), false);
});

test('RBAC ignores missing, malformed and unknown roles', () => {
  assert.equal(hasAnyRole(req(), ['admin']), false);
  assert.equal(hasPermission(req('owner'), 'finance.read'), false);
  assert.equal(hasMinimumRole(req('owner'), 'manager'), false);
});

test('RBAC hierarchy enforces minimum role checks', () => {
  assert.equal(hasMinimumRole(req('super_admin'), 'manager'), true);
  assert.equal(hasMinimumRole(req('admin'), 'manager'), true);
  assert.equal(hasMinimumRole(req('manager'), 'manager'), true);
  assert.equal(hasMinimumRole(req('trainer'), 'manager'), false);
});

test('requirePermission returns 403 instead of falling through', async () => {
  const middleware = requirePermission('platform.backups.manage');
  let statusCode = 200;
  let payload: unknown = null;
  let nextCalled = false;

  await middleware(
    req('manager'),
    {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(value: unknown) {
        payload = value;
        return this;
      },
    } as any,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
  assert.deepEqual(payload, { error: 'Permission denied', permission: 'platform.backups.manage' });
});


test('RBAC normalizes role aliases and keeps reception/cashier permissions identical', () => {
  assert.equal(hasPermission(req('warehouse-manager'), 'warehouse.write'), true);
  assert.equal(hasPermission(req('warehouse.manager'), 'warehouse.write'), true);

  const permissions = [
    'dashboard.read',
    'membership.read',
    'membership.write',
    'membership.ecard.generate',
    'membership.access.validate',
    'scheduling.read',
    'scheduling.write',
    'support.read',
    'reports.read',
    'warehouse.read',
    'warehouse.pos',
    'warehouse.purchase',
    'warehouse.reports',
    'finance.read',
    'hr.read',
    'platform.audit.read',
  ];

  for (const permission of permissions) {
    assert.equal(
      hasPermission(req('reception'), permission),
      hasPermission(req('cashier'), permission),
      `Expected reception and cashier to match for ${permission}`,
    );
  }
});

test('RBAC supports persisted runtime permission overrides', () => {
  assert.equal(hasPermission(req('trainer'), 'finance.read'), false);

  setRolePermissionOverrides([{ role: 'trainer', permission: 'finance.read', allowed: true }]);
  assert.equal(hasPermission(req('trainer'), 'finance.read'), true);
  assert.equal(getAllowedRoles('finance.read').includes('trainer'), true);

  updateRolePermissionOverride('trainer', 'finance.read', null);
  assert.equal(hasPermission(req('trainer'), 'finance.read'), false);
});

test('user maintenance permissions are admin scoped and role permission writes are super admin scoped', () => {
  assert.equal(hasPermission(req('admin'), 'user_maintenance.read'), true);
  assert.equal(hasPermission(req('admin'), 'user_maintenance.write'), true);
  assert.equal(hasPermission(req('manager'), 'user_maintenance.write'), false);
  assert.equal(hasPermission(req('admin'), 'role_permissions.write'), false);
  assert.equal(hasPermission(req('super_admin'), 'role_permissions.write'), true);
});
