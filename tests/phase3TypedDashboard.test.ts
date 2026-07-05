import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dashboardApiContracts,
  dashboardSummaryResponseSchema,
  trainerUtilizationResponseSchema,
} from '../shared/apiContracts';
import { API_ROUTE_PERMISSION_MATRIX } from '../server/routePermissions';

test('Phase 3 dashboard API contracts validate expected summary payload shape', () => {
  const parsed = dashboardSummaryResponseSchema.parse({
    kpis: {
      totalMembers: 12,
      activeSubscriptions: 10,
      classesToday: 3,
      occupancyRate: 75,
    },
    weeklyClasses: [{ day: 'Mon', classes: 2 }],
    membershipDistribution: [{ name: 'Monthly', value: 8 }],
    signups: [{ name: 'Jun', signups: 4, yearMonth: '2026-5' }],
    hr: {
      activeStaffCount: 2,
      understaffedDepts: 1,
      pendingContracts: 3,
      salaryDistribution: [{ name: 'Trainer', value: 1500 }],
    },
    generatedAt: new Date().toISOString(),
  });

  assert.equal(parsed.kpis.totalMembers, 12);
  assert.equal(parsed.weeklyClasses[0].day, 'Mon');
});

test('Phase 3 trainer utilization contract rejects negative class counters', () => {
  const result = trainerUtilizationResponseSchema.safeParse({
    trainers: [{ id: 'trainer_1', name: 'Trainer One', totalClasses: -1, privateClasses: 0, groupClasses: 0 }],
    periodDays: 30,
    generatedAt: new Date().toISOString(),
  });

  assert.equal(result.success, false);
});

test('Phase 3 dashboard endpoints are registered in the route permission matrix', () => {
  const paths = new Set(API_ROUTE_PERMISSION_MATRIX.map((entry) => `${entry.method} ${entry.path}`));
  assert.equal(paths.has('GET /api/dashboard/summary'), true);
  assert.equal(paths.has('GET /api/dashboard/trainer-utilization'), true);
});

test('Phase 3 contract registry documents dashboard endpoints', () => {
  assert.equal(dashboardApiContracts.summary.method, 'GET');
  assert.equal(dashboardApiContracts.summary.path, '/api/dashboard/summary');
  assert.equal(dashboardApiContracts.trainerUtilization.path, '/api/dashboard/trainer-utilization');
});
