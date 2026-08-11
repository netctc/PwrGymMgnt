import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildSessionBalanceResult, parseArgs } from '../scripts/v2-session-balance-reconciliation-core.mjs';

const source = readFileSync('scripts/reconcile-v2-session-balances.mjs', 'utf8');
const rows = [
  ['migrated_subscriptions', 22], ['limited_subscriptions', 0], ['unlimited_subscriptions', 22],
  ['active_cycles', 0], ['session_balances', 0], ['session_movements', 0],
  ['missing_active_cycles', 0], ['duplicate_active_cycles', 0], ['missing_session_balances', 0],
  ['unexpected_unlimited_balances', 0], ['invalid_balance_contexts', 0],
  ['orphan_session_movements', 0], ['balance_formula_mismatches', 0],
  ['movement_projection_mismatches', 0], ['negative_session_values', 0],
].map(([check_id, issue_count]) => ({ check_id, issue_count }));

test('unlimited migrated subscriptions need no balances and pass this scope', () => {
  const result = buildSessionBalanceResult(rows, 'pwrgymdb');
  assert.equal(result.result, 'PASS');
  assert.deepEqual(result.cutover.pendingScopes, ['accessDecisions']);
  assert.equal(result.cutover.ready, false);
});

test('missing cycles for limited subscriptions block reconciliation', () => {
  const changed = rows.map((row) => row.check_id === 'missing_active_cycles' ? { ...row, issue_count: 4 } : row);
  const result = buildSessionBalanceResult(changed, 'pwrgymdb');
  assert.equal(result.result, 'BLOCKED');
  assert.equal(result.issueCount, 4);
  assert.deepEqual(result.cutover.pendingScopes, ['sessionBalances', 'accessDecisions']);
});

test('reconciliation is read-only and checks ledger projection and balance formula', () => {
  const sql = source.slice(source.indexOf('export const SESSION_BALANCE_RECONCILIATION_SQL'), source.indexOf('async function main'));
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i);
  assert.match(sql, /movement_projection_mismatches/);
  assert.match(sql, /balance_formula_mismatches/);
  assert.match(sql, /invalid_balance_contexts/);
});

test('CLI supports JSON and protected evidence output', () => {
  assert.deepEqual(parseArgs(['--json', '--output=release-evidence/sessions.json']), { json: true, output: 'release-evidence/sessions.json' });
});
