import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildInvoiceResult, parseArgs } from '../scripts/v2-invoice-reconciliation-core.mjs';

const source = readFileSync('scripts/reconcile-v2-invoices.mjs', 'utf8');
const rows = [
  ['source_invoices', 18], ['mapped_source_invoices', 18], ['correct_v2_links', 18],
  ['missing_subscription_mappings', 0], ['missing_v2_links', 0], ['incorrect_v2_links', 0],
  ['orphan_v2_links', 0], ['member_mismatches', 0], ['financial_field_issues', 0],
].map(([check_id, issue_count]) => ({ check_id, issue_count }));

test('matching invoices pass while later cutover scopes remain blocked', () => {
  const result = buildInvoiceResult(rows, 'pwrgymdb');
  assert.equal(result.result, 'PASS');
  assert.equal(result.cutover.ready, false);
  assert.deepEqual(result.cutover.pendingScopes, ['sessionBalances', 'accessDecisions']);
});

test('missing V2 links block invoice reconciliation', () => {
  const changed = rows.map((row) => row.check_id === 'missing_v2_links' ? { ...row, issue_count: 7 } : row);
  const result = buildInvoiceResult(changed, 'pwrgymdb');
  assert.equal(result.result, 'BLOCKED');
  assert.equal(result.issueCount, 7);
  assert.deepEqual(result.cutover.pendingScopes, ['invoices', 'sessionBalances', 'accessDecisions']);
});

test('invoice reconciliation is read-only and verifies link and money integrity', () => {
  const sql = source.slice(source.indexOf('export const INVOICE_RECONCILIATION_SQL'), source.indexOf('async function main'));
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i);
  assert.match(sql, /missing_v2_links/);
  assert.match(sql, /incorrect_v2_links/);
  assert.match(sql, /financial_field_issues/);
});

test('CLI supports JSON and protected evidence output', () => {
  assert.deepEqual(parseArgs(['--json', '--output=release-evidence/invoices.json']), { json: true, output: 'release-evidence/invoices.json' });
});
