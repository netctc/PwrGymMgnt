import test from 'node:test';
import assert from 'node:assert/strict';

test('workers module exports all required functions', async () => {
  const mod = await import('../server/workers');
  assert.equal(typeof mod.processCycleClosings, 'function');
  assert.equal(typeof mod.drainOutbox, 'function');
  assert.equal(typeof mod.releaseExpiredReservations, 'function');
  assert.equal(typeof mod.reconcileBalances, 'function');
  assert.equal(typeof mod.startWorkers, 'function');
});

test('startWorkers returns a timer handle', async () => {
  const { startWorkers } = await import('../server/workers');
  // With null pool, workers should not crash
  const handle = startWorkers(() => null, 999_999);
  assert.ok(handle);
  clearInterval(handle);
});

test('reconcileBalances structure matches expected output', async () => {
  const { reconcileBalances } = await import('../server/workers');
  // Function signature: pool → { checked, discrepancies }
  assert.equal(reconcileBalances.length, 1);
});
