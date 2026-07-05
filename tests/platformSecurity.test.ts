import test from 'node:test';
import assert from 'node:assert/strict';
import { __platformSecurityForTests } from '../server/platformSecurity';

test('security date range normalizes inverted values and enforces max days', () => {
  const range = __platformSecurityForTests.normalizeDateRange('2026-06-30', '2026-01-01', { fallbackDays: 7, maxDays: 30 });
  assert.equal(range.from, '2026-01-01');
  assert.equal(range.to, '2026-01-31');
  assert.equal(range.truncated, true);
});

test('security alerts escalate server errors, denied access and delivery failures', () => {
  const alerts = __platformSecurityForTests.buildSecurityAlerts({
    kpis: {
      totalRequests: 100,
      warnings: 20,
      serverErrors: 6,
      accessDenials: 22,
      avgDurationMs: 120,
      maxDurationMs: 6000,
    },
    resetSummary: {
      total: 10,
      sent: 5,
      failed: 4,
      skipped: 0,
      completed: 1,
      revoked: 0,
      expired: 0,
    },
    topDenied: [{ path: '/api/admin', deniedCount: 22 }],
    topSlow: [{ path: '/api/report', durationMs: 6000 }],
  });

  assert.equal(alerts.some((alert) => alert.id === 'server-error-spike' && alert.severity === 'critical'), true);
  assert.equal(alerts.some((alert) => alert.id === 'access-denial-spike' && alert.severity === 'critical'), true);
  assert.equal(alerts.some((alert) => alert.id === 'password-reset-delivery-failures' && alert.severity === 'critical'), true);
  assert.equal(alerts.some((alert) => alert.id === 'slow-api-requests'), true);
});

test('security alerts return a positive posture item when no thresholds are exceeded', () => {
  const alerts = __platformSecurityForTests.buildSecurityAlerts({
    kpis: {
      totalRequests: 25,
      warnings: 0,
      serverErrors: 0,
      accessDenials: 0,
      avgDurationMs: 80,
      maxDurationMs: 250,
    },
    resetSummary: {
      total: 2,
      sent: 2,
      failed: 0,
      skipped: 0,
      completed: 1,
      revoked: 0,
      expired: 0,
    },
    topDenied: [],
    topSlow: [],
  });

  assert.deepEqual(alerts.map((alert) => alert.id), ['security-posture-ok']);
  assert.equal(alerts[0].severity, 'info');
});

test('security observability masks email identities in API summaries', () => {
  assert.equal(__platformSecurityForTests.maskEmailForAudit('admin@example.com'), 'a***n@example.com');
  assert.equal(__platformSecurityForTests.maskEmailForAudit('x@example.com'), 'x***@example.com');
  assert.equal(__platformSecurityForTests.maskEmailForAudit('not-an-email'), '***');
});
