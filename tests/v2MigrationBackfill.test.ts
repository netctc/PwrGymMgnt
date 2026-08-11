import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('scripts/backfill-subscriptions-v2.mjs', 'utf8');

test('V2 backfill dry-run is structurally read-only', () => {
  assert.doesNotMatch(source, /RENAME TABLE subscriptions/);
  assert.doesNotMatch(source, /CREATE TABLE IF NOT EXISTS subscriptions/);
  assert.match(source, /if \(!DRY_RUN\) await connection\.beginTransaction\(\)/);
  assert.match(source, /if \(!DRY_RUN\) await connection\.commit\(\)/);
  assert.match(source, /if \(!DRY_RUN\) await connection\.rollback\(\)/);
});

test('V2 backfill requires migrated schema instead of repairing it implicitly', () => {
  assert.match(source, /Run 'npm run db:migrate' first/);
  assert.match(source, /missing plan_version_id/);
  assert.match(source, /never renames or creates schema objects/);
});

test('V2 backfill can write auditable JSON evidence without overwriting it', () => {
  assert.match(source, /--output/);
  assert.match(source, /mode: DRY_RUN \? 'dry-run' : 'apply'/);
  assert.match(source, /committed: !DRY_RUN/);
  assert.match(source, /flag: 'wx'/);
});

test('V2 backfill reuses an existing plan version before creating version 1', () => {
  assert.match(source, /FROM plan_versions[\s\S]*WHERE plan_id = \?[\s\S]*ORDER BY version_number DESC/);
  assert.match(source, /const pvId = reusedVersion\?\.id \|\| createId\('pv'\)/);
  assert.match(source, /if \(!reusedVersion\) \{/);
  assert.match(source, /planVersionsReused/);
});
