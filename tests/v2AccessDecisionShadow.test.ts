import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildAccessDecisionShadowResult, parseArgs } from '../scripts/v2-access-decision-shadow-core.mjs';

const row = (check_id: string, issue_count: number) => ({ check_id, issue_count });

test('matching shadow decisions complete the final migration scope', () => {
  const result = buildAccessDecisionShadowResult([
    row('migrated_subscriptions', 22), row('compared_mappings', 22), row('incomplete_shadow_inputs', 0),
    row('authorization_mismatches', 0), row('legacy_allowed', 22), row('v2_allowed', 22),
  ], 'pwrgymdb');
  assert.equal(result.result, 'PASS');
  assert.equal(result.cutover.ready, true);
  assert.deepEqual(result.cutover.pendingScopes, []);
});

test('a mismatch blocks cutover and remains visible', () => {
  const result = buildAccessDecisionShadowResult([
    row('migrated_subscriptions', 22), row('compared_mappings', 22), row('incomplete_shadow_inputs', 0),
    row('authorization_mismatches', 2), row('legacy_allowed', 22), row('v2_allowed', 20),
  ], 'pwrgymdb', [{
    legacy_subscription_id: 'legacy-1', v2_subscription_id: 'v2-1', affiliation_id: 'aff-1',
    legacy_allowed: 1, v2_allowed: 0, member_active: 1, subscription_active: 1,
    subscription_started: 1, subscription_not_expired: 1, affiliation_active: 1,
    affiliation_started: 1, affiliation_not_expired: 1, payment_not_refunded: 1,
    payment_not_overdue: 0, reasons: 'payment_overdue',
  }]);
  assert.equal(result.result, 'BLOCKED');
  assert.equal(result.compared.matches, 20);
  assert.deepEqual(result.cutover.pendingScopes, ['accessDecisions']);
  assert.deepEqual(result.mismatches[0].reasons, ['payment_overdue']);
  assert.equal(result.mismatches[0].conditions.paymentNotOverdue, false);
});

test('zero migrated subscriptions pass as a non-applicable shadow comparison', () => {
  const result = buildAccessDecisionShadowResult([
    row('migrated_subscriptions', 0), row('compared_mappings', 0), row('incomplete_shadow_inputs', 0),
    row('authorization_mismatches', 0), row('legacy_allowed', 0), row('v2_allowed', 0),
  ], 'pwrgymdb');
  assert.equal(result.result, 'PASS');
  assert.equal(result.applicability, 'not_applicable');
  assert.equal(result.cutover.ready, true);
  assert.deepEqual(result.cutover.pendingScopes, []);
});

test('shadow command is read-only and avoids access side effects', () => {
  const source = fs.readFileSync(new URL('../scripts/reconcile-v2-access-decisions.mjs', import.meta.url), 'utf8');
  assert.match(source, /member_subscriptions/);
  assert.match(source, /migration_mappings/);
  assert.match(source, /legacy_allowed <> v2_allowed/);
  assert.match(source, /ACCESS_DECISION_MISMATCH_SQL/);
  assert.match(source, /payment_overdue/);
  assert.doesNotMatch(source, /INSERT INTO access_attempts|session_movements|authorizeAccess\(/);
});

test('CLI accepts protected evidence output and rejects unknown options', () => {
  assert.deepEqual(parseArgs(['--json', '--output=evidence.json']), { json: true, output: 'evidence.json' });
  assert.throws(() => parseArgs(['--apply']), /Unknown option/);
});
