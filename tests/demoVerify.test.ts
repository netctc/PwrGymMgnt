import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

test('operational reset preserves existing identity, staff and authorization records', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'scripts/db-reset-demo.mjs'), 'utf8');
  assert.doesNotMatch(source, /DELETE FROM (?:admin_users|users)/);
  assert.match(source, /authenticationAccountsCreated: 0/);
  assert.doesNotMatch(source, /'admin_users',\s*[\r\n]/);
  assert.doesNotMatch(source, /\n\s*'staff',\s*\n|\n\s*'employees',\s*\n|\n\s*'role_permission_overrides',\s*\n/);
  assert.match(source, /Existing users, staff, employees, roles, permissions and passwords were preserved/);
  assert.match(source, /--database=/);
  assert.doesNotMatch(source, /Default password:/);
});

test('operational reset preserves HR reference catalogs without reinserting demo ids', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'scripts/db-reset-demo.mjs'), 'utf8');
  const resetTables = source.slice(source.indexOf('const RESET_TABLES = ['), source.indexOf('async function main()'));
  const seedBody = source.slice(source.indexOf('async function seed('), source.indexOf('const RESET_TABLES = ['));

  assert.doesNotMatch(resetTables, /['"]hr_departments['"]/);
  assert.doesNotMatch(resetTables, /['"]hr_job_titles['"]/);
  assert.doesNotMatch(seedBody, /bulkInsert\(connection, ['"]hr_departments['"]/);
  assert.doesNotMatch(seedBody, /bulkInsert\(connection, ['"]hr_job_titles['"]/);
  assert.match(seedBody, /inserted\.hr_departments = 0/);
  assert.match(seedBody, /inserted\.hr_job_titles = 0/);
});

test('operational reset seeds a coherent V2 invoice payment ledger', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'scripts/db-reset-demo.mjs'), 'utf8');
  assert.match(source, /invoice_payment_events_v2/);
  assert.match(source, /demo-v2-payment-/);
  assert.match(source, /demo-v2-refund-/);
  assert.match(source, /await connection\.beginTransaction\(\)/);
  assert.match(source, /await connection\.rollback\(\)/);
  assert.doesNotMatch(source, /TRUNCATE TABLE/);
});

test('operational reset keeps legacy and V2 invoice subscription links separate', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'scripts/db-reset-demo.mjs'), 'utf8');
  assert.match(source, /subscription_id: null,[\s\S]*subscription_v2_id: subscription\.id/);
  assert.match(source, /validateInvoiceSubscriptionLinks\(dataset\)/);
  assert.match(source, /unknown legacy subscription_id/);
  assert.match(source, /unknown subscription_v2_id/);
  assert.match(source, /expected exactly one legacy or V2 subscription link/);
  assert.match(source, /\['id', 'invoice_number', 'member_id', 'subscription_id', 'subscription_v2_id'/);
});

test('complete demo reset covers operational and reference modules', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'scripts/db-reset-demo.mjs'), 'utf8');
  for (const table of [
    'warehouse_categories',
    'subscription_member_history',
    'warehouse_purchase_order_status_history',
    'migration_mappings',
  ]) {
    assert.match(source, new RegExp(`['"]${table}['"]`));
  }
});
