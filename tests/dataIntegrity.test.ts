import test from 'node:test';
import assert from 'node:assert/strict';
import { __dataIntegrityForTests } from '../server/dataIntegrity';

const {
  DATA_INTEGRITY_CHECKS,
  DATA_REPAIRS,
  runIntegrityChecks,
  summarizeIntegrityFindings,
  sortFindings,
  getRepairPlan,
  applyRepair,
} = __dataIntegrityForTests;

test('data integrity check catalog includes active member subscription coverage', () => {
  const ids = DATA_INTEGRITY_CHECKS.map((check) => check.id);
  assert.equal(ids.includes('active-members-without-current-subscription'), true);
  assert.equal(ids.includes('active-access-tokens-expired'), true);
  assert.equal(DATA_REPAIRS.some((repair) => repair.id === 'expire-access-tokens'), true);
});

test('data integrity summary escalates posture from warning to critical', () => {
  const summary = summarizeIntegrityFindings([
    { id: 'ok', module: 'membership', title: 'OK', severity: 'info', description: '', recommendation: '', count: 0, status: 'pass' },
    { id: 'warn', module: 'finance', title: 'Warn', severity: 'warning', description: '', recommendation: '', count: 2, status: 'fail' },
    { id: 'crit', module: 'hr', title: 'Crit', severity: 'critical', description: '', recommendation: '', count: 1, status: 'fail' },
  ]);

  assert.equal(summary.totalChecks, 3);
  assert.equal(summary.failing, 2);
  assert.equal(summary.critical, 1);
  assert.equal(summary.warning, 1);
  assert.equal(summary.affectedRows, 3);
  assert.equal(summary.posture, 'critical');
});

test('data integrity findings are sorted by severity then affected rows', () => {
  const sorted = sortFindings([
    { id: 'warning-big', module: 'finance', title: '', severity: 'warning', description: '', recommendation: '', count: 99, status: 'fail' },
    { id: 'critical-small', module: 'hr', title: '', severity: 'critical', description: '', recommendation: '', count: 1, status: 'fail' },
    { id: 'critical-big', module: 'hr', title: '', severity: 'critical', description: '', recommendation: '', count: 5, status: 'fail' },
  ]);

  assert.deepEqual(sorted.map((item) => item.id), ['critical-big', 'critical-small', 'warning-big']);
});

test('data integrity runner maps query counts into findings', async () => {
  let index = 0;
  const pool = {
    async query() {
      index += 1;
      return [[{ count: index === 1 ? 3 : 0 }], []];
    },
  };

  const findings = await runIntegrityChecks(pool as any);
  assert.equal(findings.length, DATA_INTEGRITY_CHECKS.length);
  assert.equal(findings[0].count, 3);
  assert.equal(findings[0].status, 'fail');
  assert.equal(findings[1].status, 'pass');
});

test('safe repair supports dry-run plan and apply result', async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.trim().startsWith('UPDATE')) return [{ affectedRows: 4 }, []];
      return [[{ count: 4 }], []];
    },
  };

  const plan = await getRepairPlan(pool as any, 'expire-access-tokens');
  assert.equal(plan?.affectedRows, 4);

  const result = await applyRepair(pool as any, 'expire-access-tokens');
  assert.equal(result?.changedRows, 4);
  assert.equal(queries.some((sql) => sql.trim().startsWith('UPDATE access_tokens')), true);
});
