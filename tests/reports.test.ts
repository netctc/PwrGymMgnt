import test from 'node:test';
import assert from 'node:assert/strict';
import { __reportsForTests } from '../server/reports';

const {
  SCREEN_REPORTS,
  findScreenReport,
  canAccessScreenReport,
  parseScreenReportFilters,
  addScreenReportWhere,
  screenReportFilename,
  isTechnicalIdentifierLabel,
  withoutTechnicalIdentifiers,
} = __reportsForTests;

test('screen report catalog contains the expected operational reports', () => {
  assert.equal(SCREEN_REPORTS.length, 15);
  const reportIds = new Set(SCREEN_REPORTS.map((report) => report.id));
  assert.equal(reportIds.has('members-directory'), true);
  assert.equal(reportIds.has('invoices-collection'), true);
  assert.equal(reportIds.has('consumed-sessions'), true);
  assert.equal(reportIds.has('security-audit'), true);
});

test('consumed sessions report supports member, plan and period filters', () => {
  const definition = findScreenReport('consumed-sessions');
  assert.ok(definition);
  assert.match(definition!.baseSql, /session_movements sm/);
  assert.match(definition!.baseSql, /private_sessions ps/);
  assert.match(definition!.baseSql, /class_sessions cs/);

  const filters = parseScreenReportFilters({
    from: '2026-07-01',
    to: '2026-07-31',
    memberId: 'mem_001',
    planId: 'plan_pt_10',
  } as any);
  const result = addScreenReportWhere(definition!, filters);
  assert.match(result.whereSql, /DATE\(sm\.created_at\) BETWEEN \? AND \?/);
  assert.deepEqual(result.params, ['2026-07-01', '2026-07-31', 'mem_001', 'plan_pt_10']);
});

test('screen report access is role-specific', () => {
  const membersReport = findScreenReport('members-directory');
  const securityReport = findScreenReport('security-audit');
  assert.ok(membersReport);
  assert.ok(securityReport);

  assert.equal(canAccessScreenReport(membersReport!, 'reception'), true);
  assert.equal(canAccessScreenReport(membersReport!, 'cashier'), true);
  assert.equal(canAccessScreenReport(membersReport!, 'client'), false);
  assert.equal(canAccessScreenReport(securityReport!, 'manager'), false);
  assert.equal(canAccessScreenReport(securityReport!, 'support'), false);
});

test('screen report filters normalize dates and remove blank/all values', () => {
  const filters = parseScreenReportFilters({
    from: '2026-01-01',
    to: '2026-01-31',
    status: 'active',
    q: '  john@example.com  ',
    trainerId: 'all',
    memberId: '',
  } as any);

  assert.equal(filters.fromDate, '2026-01-01');
  assert.equal(filters.toDate, '2026-01-31');
  assert.equal(filters.values.status, 'active');
  assert.equal(filters.values.q, 'john@example.com');
  assert.equal(filters.values.trainerId, '');
  assert.equal(filters.values.memberId, '');
});

test('screen report filters reject inverted and overlong date ranges', () => {
  assert.throws(
    () => parseScreenReportFilters({ from: '2026-02-01', to: '2026-01-01' } as any),
    /from.*after.*to/i,
  );
  assert.throws(
    () => parseScreenReportFilters({ from: '2025-01-01', to: '2026-12-31' } as any),
    /366 days/i,
  );
});

test('screen report SQL builder uses parameterized filters', () => {
  const definition = findScreenReport('members-directory');
  assert.ok(definition);
  const filters = parseScreenReportFilters({
    from: '2026-01-01',
    to: '2026-01-31',
    status: 'active',
    q: "O'Hara%",
  } as any);
  const { whereSql, params } = addScreenReportWhere(definition!, filters);

  assert.match(whereSql, /DATE\(m\.join_date\) BETWEEN \? AND \?/);
  assert.match(whereSql, /CASE WHEN LOWER\(TRIM\(m\.status\)\) = 'active'.*END = \?/);
  assert.match(whereSql, /LIKE \?/);
  assert.equal(params[0], '2026-01-01');
  assert.equal(params[1], '2026-01-31');
  assert.equal(params[2], 'active');
  assert.equal(params.includes("%O'Hara%%"), true);
  assert.equal(whereSql.includes("O'Hara"), false);
});

test('numeric report filters only accept bounded numeric values', () => {
  const definition = findScreenReport('security-audit');
  assert.ok(definition);
  const valid = parseScreenReportFilters({ from: '2026-01-01', to: '2026-01-31', statusCode: '403' } as any);
  const result = addScreenReportWhere(definition!, valid);
  assert.equal(result.params.includes(403), true);

  const invalid = parseScreenReportFilters({ from: '2026-01-01', to: '2026-01-31', statusCode: '403 OR 1=1' } as any);
  assert.throws(() => addScreenReportWhere(definition!, invalid), /Invalid numeric report filter/);
});

test('screen report filenames are PDF attachments with stable prefix', () => {
  assert.match(screenReportFilename('members-directory'), /^powergym-members-directory-\d{4}-\d{2}-\d{2}\.pdf$/);
});

test('report tables omit technical identifiers while keeping business numbers', () => {
  assert.equal(isTechnicalIdentifierLabel('ID'), true);
  assert.equal(isTechnicalIdentifierLabel('Member ID'), true);
  assert.equal(isTechnicalIdentifierLabel('Request ID'), true);
  assert.equal(isTechnicalIdentifierLabel('Movement'), true);
  assert.equal(isTechnicalIdentifierLabel('Invoice'), false);
  assert.equal(isTechnicalIdentifierLabel('Employee Code'), false);
  assert.deepEqual(
    withoutTechnicalIdentifiers(['ID', 'Member', 'Member ID', 'Invoice', 'Status']),
    ['Member', 'Invoice', 'Status'],
  );
});
