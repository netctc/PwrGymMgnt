import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildResult, parseArgs } from '../scripts/v2-reconciliation-core.mjs';

const RECONCILIATION_SQL = readFileSync('scripts/reconcile-subscriptions-v2.mjs', 'utf8');

const zeroIssues = [
  ['source_plans', 10], ['source_subscriptions', 22], ['mapped_plans', 10],
  ['mapped_subscriptions', 22], ['mapped_affiliations', 22],
  ['duplicate_plan_mappings', 0], ['duplicate_subscription_mappings', 0],
  ['duplicate_affiliation_mappings', 0], ['orphan_plan_targets', 0],
  ['orphan_subscription_targets', 0], ['orphan_affiliation_targets', 0],
  ['contract_field_mismatches', 0], ['holder_mismatches', 0], ['affiliation_mismatches', 0],
].map(([check_id, issue_count]) => ({ check_id, issue_count }));

test('reconciliation passes matching structural counts but keeps cutover blocked', () => {
  const result = buildResult(zeroIssues, 'pwrgymdb');
  assert.equal(result.result, 'PASS');
  assert.equal(result.issueCount, 0);
  assert.equal(result.cutover.ready, false);
  assert.deepEqual(result.cutover.pendingScopes, ['invoices', 'sessionBalances', 'accessDecisions']);
});

test('missing mappings block reconciliation', () => {
  const rows = zeroIssues.map((row) => row.check_id === 'mapped_subscriptions' ? { ...row, issue_count: 21 } : row);
  const result = buildResult(rows, 'pwrgymdb');
  assert.equal(result.result, 'BLOCKED');
  assert.equal(result.checks.find((check) => check.id === 'subscription_mapping_coverage')?.issueCount, 1);
});

test('reconciliation is read-only and checks core legacy to V2 relationships', () => {
  assert.doesNotMatch(RECONCILIATION_SQL, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i);
  assert.match(RECONCILIATION_SQL, /contract_field_mismatches/);
  assert.match(RECONCILIATION_SQL, /holder_mismatches/);
  assert.match(RECONCILIATION_SQL, /affiliation_mismatches/);
});

test('CLI accepts protected evidence output and JSON mode', () => {
  assert.deepEqual(parseArgs(['--json', '--output=release-evidence/reconcile.json']), {
    json: true,
    output: 'release-evidence/reconcile.json',
  });
});
