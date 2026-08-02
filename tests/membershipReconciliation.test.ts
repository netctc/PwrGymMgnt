import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRENT_MEMBERSHIP_EXISTS_SQL } from '../server/membershipEligibility';
import { reconcileMembershipStatuses } from '../server/membershipReconciliation';

function fakePool(candidates: any[] = []) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const events: string[] = [];
  const connection = {
    async query(sql: string, values?: unknown[]) {
      queries.push({ sql, values });
      if (/^SELECT m\.id/m.test(sql)) return [candidates, []];
      if (/^\s*UPDATE members/m.test(sql)) return [{ affectedRows: candidates.length }, []];
      return [{ affectedRows: 1 }, []];
    },
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); },
  };
  return { pool: { async getConnection() { return connection; } }, queries, events };
}

test('current membership covers legacy and V2 affiliations with inclusive dates', () => {
  assert.match(CURRENT_MEMBERSHIP_EXISTS_SQL, /FROM member_subscriptions ms/);
  assert.match(CURRENT_MEMBERSHIP_EXISTS_SQL, /FROM affiliations a/);
  assert.match(CURRENT_MEMBERSHIP_EXISTS_SQL, /JOIN subscriptions s/);
  assert.match(CURRENT_MEMBERSHIP_EXISTS_SQL, /ms\.start_date <= CURDATE\(\)/);
  assert.match(CURRENT_MEMBERSHIP_EXISTS_SQL, /ms\.end_date >= CURDATE\(\)/);
  assert.match(CURRENT_MEMBERSHIP_EXISTS_SQL, /a\.start_date <= CURDATE\(\)/);
  assert.match(CURRENT_MEMBERSHIP_EXISTS_SQL, /a\.end_date >= CURDATE\(\)/);
});

test('dry-run returns candidates without changing member status', async () => {
  const fixture = fakePool([{ id: 'member-1', first_name: 'Ada', last_name: 'Test' }]);
  const result = await reconcileMembershipStatuses(fixture.pool as any);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.checked, 1);
  assert.equal(result.deactivated, 0);
  assert.equal(fixture.queries.some(({ sql }) => /^\s*UPDATE members/m.test(sql)), false);
  assert.deepEqual(fixture.events, ['begin', 'rollback', 'release']);
});

test('apply deactivates candidates transactionally and writes one audit row per member', async () => {
  const fixture = fakePool([{ id: 'member-1' }, { id: 'member-2' }]);
  const result = await reconcileMembershipStatuses(fixture.pool as any, { apply: true });
  assert.equal(result.deactivated, 2);
  assert.equal(fixture.queries[0].sql, 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  assert.equal(fixture.queries.filter(({ sql }) => /INSERT INTO audit_logs/.test(sql)).length, 2);
  assert.deepEqual(fixture.events, ['begin', 'commit', 'release']);
});
