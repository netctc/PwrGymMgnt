import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DATE_MISMATCH_SQL, parseArgs } from '../scripts/v2-date-repair-core.mjs';

const repairSource = readFileSync('scripts/repair-v2-migrated-dates.mjs', 'utf8');
const backfillSource = readFileSync('scripts/backfill-subscriptions-v2.mjs', 'utf8');

test('repair defaults to a non-mutating dry run and requires explicit apply', () => {
  assert.deepEqual(parseArgs([]), { apply: false, output: '' });
  assert.deepEqual(parseArgs(['--apply', '--output=evidence.json']), { apply: true, output: 'evidence.json' });
});

test('repair is limited to mapped subscriptions and affiliations', () => {
  assert.match(DATE_MISMATCH_SQL, /migration_mappings sm/);
  assert.match(DATE_MISMATCH_SQL, /migration_mappings am/);
  assert.match(DATE_MISMATCH_SQL, /s\.start_date <=> ms\.start_date/);
  assert.match(DATE_MISMATCH_SQL, /a\.end_date <=> ms\.end_date/);
});

test('apply is transactional and evidence cannot be overwritten', () => {
  assert.match(repairSource, /beginTransaction\(\)/);
  assert.match(repairSource, /rollback\(\)/);
  assert.match(repairSource, /flag: 'wx'/);
});

test('backfill preserves MySQL DATE strings without UTC conversion', () => {
  assert.match(backfillSource, /dateStrings: \['DATE'\]/);
  assert.doesNotMatch(backfillSource, /ms\.start_date instanceof Date/);
  assert.doesNotMatch(backfillSource, /ms\.end_date instanceof Date/);
});
