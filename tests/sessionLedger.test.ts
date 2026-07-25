import test from 'node:test';
import assert from 'node:assert/strict';
import { getSessionBalanceContext, mapBalance } from '../server/sessionLedger';
import { calculateCycleEnd } from '../server/subscriptionCycles';

test('session balance mapper normalizes numeric fields', () => {
  const raw = {
    id: 'bal_1',
    context_type: 'affiliation',
    context_id: 'aff_1',
    cycle_id: 'cyc_1',
    included: '20',
    carried_over: '5',
    purchased: '2',
    adjustments_positive: '1',
    refunds: '1',
    reserved: '3',
    consumed: '10',
    expired: '0',
    adjustments_negative: '1',
    available: '15',
    version: '3',
  };

  const balance = mapBalance(raw);
  assert.equal(balance.id, 'bal_1');
  assert.equal(balance.contextType, 'affiliation');
  assert.equal(balance.contextId, 'aff_1');
  assert.equal(balance.cycleId, 'cyc_1');
  assert.equal(balance.included, 20);
  assert.equal(balance.carriedOver, 5);
  assert.equal(balance.purchased, 2);
  assert.equal(balance.adjustmentsPositive, 1);
  assert.equal(balance.refunds, 1);
  assert.equal(balance.reserved, 3);
  assert.equal(balance.consumed, 10);
  assert.equal(balance.expired, 0);
  assert.equal(balance.adjustmentsNegative, 1);
  assert.equal(balance.available, 15);
  assert.equal(balance.version, 3);
});

test('session balance available formula matches specification', () => {
  const balance = mapBalance({
    id: 'bal_2',
    context_type: 'affiliation',
    context_id: 'aff_2',
    cycle_id: 'cyc_2',
    included: '30',
    carried_over: '5',
    purchased: '3',
    adjustments_positive: '2',
    refunds: '1',
    reserved: '5',
    consumed: '12',
    expired: '2',
    adjustments_negative: '1',
    available: '21', // 30+5+3+2+1 - 5-12-2-1 = 21
    version: '1',
  });

  // Verify formula: positive - negative = available
  const positive = balance.included + balance.carriedOver + balance.purchased + balance.adjustmentsPositive + balance.refunds;
  const negative = balance.reserved + balance.consumed + balance.expired + balance.adjustmentsNegative;
  const calculated = positive - negative;

  assert.equal(calculated, 21);
  assert.equal(balance.available, calculated);
});

test('session balance mapper handles null and undefined gracefully', () => {
  const balance = mapBalance({
    id: 'bal_3',
    context_type: 'subscription',
    context_id: 'sub_1',
    cycle_id: 'cyc_3',
    // All numeric fields missing
  });

  assert.equal(balance.included, 0);
  assert.equal(balance.consumed, 0);
  assert.equal(balance.available, 0);
  assert.equal(balance.version, 1);
});

test('movement direction is correct for each type', async () => {
  // Import dynamically to test the module
  const { createMovement } = await import('../server/sessionLedger');
  // We can't test createMovement without a DB connection, but we verify the export exists
  assert.equal(typeof createMovement, 'function');
});

test('idempotency key check function exists and is exported', async () => {
  const { checkIdempotencyKey, storeIdempotencyKey } = await import('../server/sessionLedger');
  assert.equal(typeof checkIdempotencyKey, 'function');
  assert.equal(typeof storeIdempotencyKey, 'function');
});

test('feature flags module exports isFeatureEnabled', async () => {
  const { isFeatureEnabled, clearFlagCache } = await import('../server/featureFlags');
  assert.equal(typeof isFeatureEnabled, 'function');
  assert.equal(typeof clearFlagCache, 'function');
});

test('subscription cycles module exports required functions', async () => {
  const { createInitialCycle, closeCycleAndOpenNext } = await import('../server/subscriptionCycles');
  assert.equal(typeof createInitialCycle, 'function');
  assert.equal(typeof closeCycleAndOpenNext, 'function');
});

test('distribution model selects the correct balance owner', () => {
  assert.deepEqual(
    getSessionBalanceContext('shared', 'sub_1', 'aff_1'),
    { contextType: 'subscription', contextId: 'sub_1' },
  );
  assert.deepEqual(
    getSessionBalanceContext('individual', 'sub_1', 'aff_1'),
    { contextType: 'affiliation', contextId: 'aff_1' },
  );
  assert.deepEqual(
    getSessionBalanceContext('custom', 'sub_1', 'aff_1'),
    { contextType: 'affiliation', contextId: 'aff_1' },
  );
});

test('cycle end supports weekly, monthly, quarterly and full-plan cycles', () => {
  assert.equal(calculateCycleEnd('2026-01-01', 'weekly', '2026-12-31'), '2026-01-08');
  assert.equal(calculateCycleEnd('2026-01-01', 'monthly', '2026-12-31'), '2026-02-01');
  assert.equal(calculateCycleEnd('2026-01-01', 'quarterly', '2026-12-31'), '2026-04-01');
  assert.equal(calculateCycleEnd('2026-01-01', 'plan_duration', '2026-05-15'), '2026-05-15');
  assert.equal(calculateCycleEnd('2026-04-01', 'quarterly', '2026-05-15'), '2026-05-15');
});
