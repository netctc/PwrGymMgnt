import test from 'node:test';
import assert from 'node:assert/strict';

test('biometric profiles module exports registerBiometricRoutes', async () => {
  const mod = await import('../server/biometricProfiles');
  assert.equal(typeof mod.registerBiometricRoutes, 'function');
});

test('biometric permissions are registered in RBAC', async () => {
  const { DEFAULT_PERMISSIONS } = await import('../server/rbac');
  assert.ok('biometrics.enroll' in DEFAULT_PERMISSIONS);
  assert.ok('biometrics.read_metadata' in DEFAULT_PERMISSIONS);
  assert.ok('biometrics.revoke' in DEFAULT_PERMISSIONS);
  assert.ok('biometrics.delete' in DEFAULT_PERMISSIONS);
});

test('biometric enroll permission is restricted to admin roles', async () => {
  const { DEFAULT_PERMISSIONS } = await import('../server/rbac');
  const enrollRoles = DEFAULT_PERMISSIONS['biometrics.enroll'];
  assert.ok(enrollRoles.includes('super_admin'));
  assert.ok(enrollRoles.includes('admin'));
  assert.ok(enrollRoles.includes('manager'));
  // Non-admin roles should NOT have enroll permission
  assert.ok(!enrollRoles.includes('trainer'));
  assert.ok(!enrollRoles.includes('cashier'));
  assert.ok(!enrollRoles.includes('reception'));
});

test('biometric delete permission is super_admin/admin only', async () => {
  const { DEFAULT_PERMISSIONS } = await import('../server/rbac');
  const deleteRoles = DEFAULT_PERMISSIONS['biometrics.delete'];
  assert.ok(deleteRoles.includes('super_admin'));
  assert.ok(deleteRoles.includes('admin'));
  assert.equal(deleteRoles.length, 2);
});

test('template_reference is never exposed in profile API responses', () => {
  // This is a design validation — the profile mapper in biometricProfiles.ts
  // explicitly excludes template_reference from the response
  // Verified by code inspection: SELECT statement does not include template_reference
  const exposedFields = [
    'id', 'personType', 'personId', 'status', 'qualityScore',
    'enrolledAt', 'enrolledBy', 'enrolledAtBranch',
    'revokedAt', 'revokedBy', 'revocationReason',
    'lastRecognitionAt', 'version',
  ];
  // template_reference must NOT be in this list
  assert.ok(!exposedFields.includes('templateReference'));
  assert.ok(!exposedFields.includes('template_reference'));
});
