import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { INVOICE_LINK_DIAGNOSTIC_SQL, INVOICE_LINK_UPDATE_SQL, parseArgs, summarize } from '../scripts/v2-invoice-link-repair-core.mjs';

test('dry-run is default and apply must be explicit', () => {
  assert.deepEqual(parseArgs([]), { apply: false, json: false, output: '' });
  assert.deepEqual(parseArgs(['--apply', '--json', '--output=evidence.json']), { apply: true, json: true, output: 'evidence.json' });
});

test('repair only fills null V2 links through subscription mappings', () => {
  assert.match(INVOICE_LINK_UPDATE_SQL, /SET i\.subscription_v2_id = mm\.target_id/);
  assert.match(INVOICE_LINK_UPDATE_SQL, /i\.subscription_v2_id IS NULL/);
  assert.match(INVOICE_LINK_UPDATE_SQL, /JOIN subscriptions s ON s\.id = mm\.target_id/);
  assert.doesNotMatch(INVOICE_LINK_UPDATE_SQL, /\b(INSERT|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i);
});

test('preflight blocks unsafe mapping and member conditions', () => {
  const rows = [
    ['eligible_missing_links', 22], ['missing_subscription_mappings', 0],
    ['incorrect_existing_links', 1], ['orphan_mapping_targets', 0], ['member_mismatches', 0],
  ].map(([check_id, row_count]) => ({ check_id, row_count }));
  const result = summarize(rows);
  assert.equal(result.eligible, 22);
  assert.deepEqual(result.blockers, [{ id: 'incorrect_existing_links', count: 1 }]);
  assert.match(INVOICE_LINK_DIAGNOSTIC_SQL, /member_mismatches/);
});

test('CLI protects evidence and wraps writes in a transaction', () => {
  const source = readFileSync('scripts/repair-v2-invoice-links.mjs', 'utf8');
  assert.match(source, /beginTransaction\(\)/);
  assert.match(source, /commit\(\)/);
  assert.match(source, /rollback\(\)/);
  assert.match(source, /flag: 'wx'/);
  assert.match(source, /Post-update verification failed/);
});
