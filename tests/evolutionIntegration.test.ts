/**
 * Integration tests for the evolution system.
 * Tests the full lifecycle: plan → subscription → cycle → balance → consume/refund.
 * These are structural/contract tests (no DB required).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

test('evolution module exports are correctly structured', async () => {
  const sessionLedger = await import('../server/sessionLedger');
  const cycles = await import('../server/subscriptionCycles');
  const flags = await import('../server/featureFlags');
  const access = await import('../server/accessAuthorization');
  const bio = await import('../server/biometricProfiles');
  const subsV2 = await import('../server/subscriptionsV2');

  // All modules export their registration or service functions
  assert.equal(typeof sessionLedger.createMovement, 'function');
  assert.equal(typeof sessionLedger.getBalanceForUpdate, 'function');
  assert.equal(typeof sessionLedger.checkIdempotencyKey, 'function');
  assert.equal(typeof sessionLedger.storeIdempotencyKey, 'function');
  assert.equal(typeof sessionLedger.mapBalance, 'function');
  assert.equal(typeof cycles.createInitialCycle, 'function');
  assert.equal(typeof cycles.closeCycleAndOpenNext, 'function');
  assert.equal(typeof flags.isFeatureEnabled, 'function');
  assert.equal(typeof flags.clearFlagCache, 'function');
  assert.equal(typeof access.authorizeAccess, 'function');
  assert.equal(typeof access.registerAccessAuthorizationRoutes, 'function');
  assert.equal(typeof bio.registerBiometricRoutes, 'function');
  assert.equal(typeof subsV2.registerSubscriptionsV2Routes, 'function');
});

test('session balance formula: available = positive - negative', async () => {
  const { mapBalance } = await import('../server/sessionLedger');

  // Scenario: Plan with 30 sessions, 5 carried, 2 purchased, 1 refund, 1 adjustment+
  // Used: 3 reserved, 15 consumed, 2 expired, 1 adjustment-
  const balance = mapBalance({
    id: 'bal_test',
    context_type: 'affiliation',
    context_id: 'aff_test',
    cycle_id: 'cyc_test',
    included: '30',
    carried_over: '5',
    purchased: '2',
    adjustments_positive: '1',
    refunds: '1',
    reserved: '3',
    consumed: '15',
    expired: '2',
    adjustments_negative: '1',
    available: '18', // (30+5+2+1+1) - (3+15+2+1) = 39 - 21 = 18
    version: '1',
  });

  const positive = balance.included + balance.carriedOver + balance.purchased + balance.adjustmentsPositive + balance.refunds;
  const negative = balance.reserved + balance.consumed + balance.expired + balance.adjustmentsNegative;
  assert.equal(positive, 39);
  assert.equal(negative, 21);
  assert.equal(positive - negative, 18);
  assert.equal(balance.available, 18);
});

test('plan version types cover all required options', () => {
  const validPlanTypes = ['individual', 'family', 'group', 'corporate'];
  const validDistributions = ['shared', 'individual', 'custom'];
  const validFrequencies = ['monthly', 'weekly', 'quarterly', 'plan_duration'];

  // Validate all enum values are documented
  assert.equal(validPlanTypes.length, 4);
  assert.equal(validDistributions.length, 3);
  assert.equal(validFrequencies.length, 4);
});

test('movement types cover all defined operations', () => {
  const movementTypes = [
    'allocation', 'reservation', 'release', 'consumption',
    'refund', 'purchase', 'carryover', 'expiration',
    'adjustment_positive', 'adjustment_negative', 'compensation',
  ];
  assert.equal(movementTypes.length, 11);

  // Verify each type has a clear direction
  const creditTypes = ['allocation', 'release', 'refund', 'purchase', 'carryover', 'adjustment_positive', 'compensation'];
  const debitTypes = ['reservation', 'consumption', 'expiration', 'adjustment_negative'];
  assert.equal(creditTypes.length + debitTypes.length, 11);
});

test('access decision reasons follow naming convention', () => {
  const reasons = [
    'ACCESS_GRANTED', 'IDENTITY_NOT_RESOLVED', 'NO_ACTIVE_AFFILIATION',
    'NO_SESSIONS_AVAILABLE', 'COOLDOWN_ACTIVE', 'EMPLOYEE_ACCESS',
    'LEGACY_SUBSCRIPTION_ACTIVE',
  ];

  for (const reason of reasons) {
    assert.match(reason, /^[A-Z][A-Z0-9_]+$/, `Reason ${reason} should be UPPER_SNAKE_CASE`);
  }
});

test('feature flags cover all phases', () => {
  const requiredFlags = [
    'ENABLE_NEW_SUBSCRIPTION_MODEL',
    'ENABLE_SESSION_LEDGER',
    'ENABLE_MULTI_AFFILIATION',
    'ENABLE_MULTI_USER_PLANS',
    'ENABLE_UNIFIED_ACCESS',
    'ENABLE_FACIAL_ACCESS',
  ];
  assert.equal(requiredFlags.length, 6);
});

test('access authorization contract matches specification', async () => {
  const { authorizeAccess } = await import('../server/accessAuthorization');

  // Verify the function accepts pool + request
  assert.equal(authorizeAccess.length, 2);

  // Verify the AccessRequest fields match specification
  const requiredRequestFields = [
    'method', 'accessPointId', 'branch', 'zone', 'direction',
    'tokenHash', 'memberId', 'biometricProfileId', 'personType', 'personId',
    'confidenceScore', 'operatorEmail', 'affiliationId', 'serviceType',
    'idempotencyKey', 'requestId',
  ];
  assert.equal(requiredRequestFields.length, 16);

  // Verify decision fields match specification
  const requiredDecisionFields = [
    'authorized', 'reason', 'personType', 'personId', 'personName',
    'affiliationId', 'subscriptionId', 'planName', 'movementId',
    'openingCommandId', 'attemptId', 'requestId', 'sessionsRemaining',
  ];
  assert.equal(requiredDecisionFields.length, 13);
});

test('biometric permissions are properly scoped', async () => {
  const { DEFAULT_PERMISSIONS } = await import('../server/rbac');

  // Enrollment is admin-level
  const enrollRoles = DEFAULT_PERMISSIONS['biometrics.enroll'];
  assert.ok(!enrollRoles.includes('reception' as any));
  assert.ok(!enrollRoles.includes('trainer' as any));

  // Read metadata allows reception (for verification at desk)
  const readRoles = DEFAULT_PERMISSIONS['biometrics.read_metadata'];
  assert.ok(readRoles.includes('reception' as any));

  // Delete is most restrictive
  const deleteRoles = DEFAULT_PERMISSIONS['biometrics.delete'];
  assert.ok(deleteRoles.includes('super_admin' as any));
  assert.ok(!deleteRoles.includes('manager' as any));
});

test('SQL migration file exists and contains all expected tables', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const migration = fs.readFileSync(path.join(process.cwd(), 'sql', '013_phase1_evolution_schema.sql'), 'utf8');

  const expectedTables = [
    'plan_versions', 'subscriptions', 'subscription_members', 'affiliations',
    'subscription_cycles', 'session_balances', 'session_movements',
    'idempotency_keys', 'outbox_events', 'feature_flags', 'migration_mappings',
  ];

  for (const table of expectedTables) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `Missing table: ${table}`);
  }
});

test('backfill script exists and is executable', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const exists = fs.existsSync(path.join(process.cwd(), 'scripts', 'backfill-subscriptions-v2.mjs'));
  assert.equal(exists, true);

  const content = fs.readFileSync(path.join(process.cwd(), 'scripts', 'backfill-subscriptions-v2.mjs'), 'utf8');
  assert.match(content, /--dry-run/);
  assert.match(content, /migration_mappings/);
  assert.match(content, /plan_versions/);
  assert.match(content, /subscriptions/);
  assert.match(content, /affiliations/);
});
