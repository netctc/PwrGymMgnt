import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_ROLES,
  getAllowedRoles,
  hasPermission,
  isAppRole,
  normalizeAppRole,
  type AuthenticatedRequest,
} from '../server/rbac';
import { API_ROUTE_PERMISSION_MATRIX, getUnknownMatrixPermissions } from '../server/routePermissions';
import { CLIENT_PERMISSIONS, hasClientPermission, type ClientPermission } from '../src/lib/permissions';

function req(role?: string): AuthenticatedRequest {
  return { user: role ? { role } : undefined } as AuthenticatedRequest;
}

test('Phase 2 rejects unknown JWT roles before permission checks can pass', () => {
  assert.equal(isAppRole('admin'), true);
  assert.equal(isAppRole('owner'), false);
  assert.equal(normalizeAppRole(' manager '), 'manager');
  assert.equal(normalizeAppRole('warehouse-manager'), 'warehouse_manager');
  assert.equal(normalizeAppRole('warehouse.manager'), 'warehouse_manager');
  assert.equal(normalizeAppRole('owner'), '');
  assert.equal(normalizeAppRole(null), '');
  assert.equal(hasPermission(req('owner'), 'finance.read'), false);
});

test('Phase 2 route permission matrix references only registered RBAC permissions', () => {
  assert.equal(API_ROUTE_PERMISSION_MATRIX.length > 40, true);
  assert.deepEqual(getUnknownMatrixPermissions(), []);
});

test('Phase 2 sensitive write boundaries are explicit', () => {
  assert.equal(hasPermission(req('trainer'), 'finance.read'), false);
  assert.equal(hasPermission(req('accounting'), 'finance.write'), true);
  assert.equal(hasPermission(req('trainer'), 'finance.write'), false);
  assert.equal(hasPermission(req('hr'), 'hr.write'), true);
  assert.equal(hasPermission(req('accounting'), 'hr.write'), false);
  assert.equal(hasPermission(req('manager'), 'payroll.approve'), true);
  assert.equal(hasPermission(req('trainer'), 'payroll.approve'), false);
});

test('Phase 2 client navigation permissions stay aligned to backend permissions where names match', () => {
  for (const [permission, clientRoles] of Object.entries(CLIENT_PERMISSIONS) as Array<[ClientPermission, readonly string[]]>) {
    const backendRoles = getAllowedRoles(permission);
    if (backendRoles.length === 0) continue;
    for (const role of clientRoles) {
      assert.equal(
        APP_ROLES.includes(role as any),
        true,
        `Client permission ${permission} references unknown role ${role}`,
      );
      assert.equal(
        backendRoles.includes(role as any),
        true,
        `Client grants ${permission} to ${role}, but backend does not`,
      );
    }
  }
});

test('Phase 2 frontend permission helper hides privileged modules from lower roles', () => {
  assert.equal(hasClientPermission('accounting', 'finance.read'), true);
  assert.equal(hasClientPermission('trainer', 'finance.read'), false);
  assert.equal(hasClientPermission('cashier', 'warehouse.pos'), true);
  assert.equal(hasClientPermission('reception', 'warehouse.pos'), true);
  assert.equal(hasClientPermission('warehouse-manager', 'warehouse.read'), true);
  assert.equal(hasClientPermission('warehouse.manager', 'warehouse.read'), true);
  assert.equal(hasClientPermission('client', 'warehouse.pos'), false);
  assert.equal(hasClientPermission('owner', 'dashboard.read'), false);
});


test('Phase 2 reception and cashier share the same application-facing permissions', () => {
  for (const permission of Object.keys(CLIENT_PERMISSIONS) as ClientPermission[]) {
    assert.equal(
      hasClientPermission('reception', permission),
      hasClientPermission('cashier', permission),
      `Expected reception and cashier to match for ${permission}`,
    );
  }
});
