import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDemoReadiness, makeDemoCheck, summarizeDemoReadiness } from '../scripts/db-demo-verify-utils.mjs';

test('demo readiness checks distinguish pass, warning and failure', () => {
  const pass = makeDemoCheck({ id: 'members', label: 'Members', actual: 20, expected: 20 });
  const warn = makeDemoCheck({ id: 'notifications', label: 'Notifications', actual: 2, expected: 6, severity: 'warning' });
  const fail = makeDemoCheck({ id: 'products', label: 'Products', actual: 12, expected: 30 });

  assert.equal(pass.status, 'pass');
  assert.equal(warn.status, 'warn');
  assert.equal(fail.status, 'fail');
});

test('demo readiness summary fails only on critical failed checks', () => {
  const warningOnly = summarizeDemoReadiness([
    makeDemoCheck({ id: 'members', label: 'Members', actual: 20, expected: 20 }),
    makeDemoCheck({ id: 'support', label: 'Support Tickets', actual: 1, expected: 4, severity: 'warning' }),
  ]);
  assert.equal(warningOnly.status, 'warn');
  assert.deepEqual(warningOnly.warningChecks, ['support']);

  const failed = summarizeDemoReadiness([
    makeDemoCheck({ id: 'members', label: 'Members', actual: 4, expected: 20 }),
  ]);
  assert.equal(failed.status, 'fail');
  assert.deepEqual(failed.criticalFailures, ['members']);
});

test('demo readiness formatter includes actionable check status lines', () => {
  const checks = [makeDemoCheck({ id: 'warehouse.products', label: 'Warehouse products', actual: 30, expected: 30 })];
  const summary = summarizeDemoReadiness(checks);
  const output = formatDemoReadiness(summary, checks);

  assert.match(output, /PowerGym demo scenario verification/);
  assert.match(output, /Status: PASS/);
  assert.match(output, /OK Warehouse products: 30\/30/);
});
