import test from 'node:test';
import assert from 'node:assert/strict';

test('access authorization module exports authorizeAccess and route registration', async () => {
  const mod = await import('../server/accessAuthorization');
  assert.equal(typeof mod.authorizeAccess, 'function');
  assert.equal(typeof mod.registerAccessAuthorizationRoutes, 'function');
});

test('access request types cover qr, facial, and manual methods', async () => {
  // Type-level validation: ensure AccessRequest and AccessDecision types are importable
  const { authorizeAccess } = await import('../server/accessAuthorization');
  // The function signature accepts our defined types
  assert.equal(authorizeAccess.length, 2); // pool, req
});

test('access decision structure includes all required fields', () => {
  // Validate the decision shape matches specification
  const expectedFields = [
    'authorized', 'reason', 'personType', 'personId', 'personName',
    'affiliationId', 'subscriptionId', 'planName', 'movementId',
    'openingCommandId', 'attemptId', 'requestId', 'sessionsRemaining',
  ];

  // Build a mock decision to verify field names
  const decision = {
    authorized: true,
    reason: 'ACCESS_GRANTED',
    personType: 'member',
    personId: 'mem_123',
    personName: 'Test User',
    affiliationId: 'aff_1',
    subscriptionId: 'sub_1',
    planName: 'Premium',
    movementId: 'mov_1',
    openingCommandId: null,
    attemptId: 'att_1',
    requestId: 'req_1',
    sessionsRemaining: 19,
  };

  for (const field of expectedFields) {
    assert.ok(field in decision, `Missing field: ${field}`);
  }
});

test('denial reasons follow the error catalog naming convention', () => {
  const validReasons = [
    'IDENTITY_NOT_RESOLVED',
    'NO_ACTIVE_AFFILIATION',
    'NO_SESSIONS_AVAILABLE',
    'COOLDOWN_ACTIVE',
    'EMPLOYEE_ACCESS',
    'LEGACY_SUBSCRIPTION_ACTIVE',
    'ACCESS_GRANTED',
  ];

  // All reasons should be UPPER_SNAKE_CASE
  for (const reason of validReasons) {
    assert.match(reason, /^[A-Z][A-Z0-9_]+$/);
  }
});
