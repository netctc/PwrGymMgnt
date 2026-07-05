export function makeDemoCheck({ id, label, actual, expected, severity = 'critical', details = {} }) {
  const numericActual = Number(actual || 0);
  const numericExpected = Number(expected || 0);
  return {
    id,
    label,
    actual: numericActual,
    expected: numericExpected,
    severity,
    status: numericActual >= numericExpected ? 'pass' : severity === 'warning' ? 'warn' : 'fail',
    details,
  };
}

export function summarizeDemoReadiness(checks = []) {
  const failed = checks.filter((check) => check.status === 'fail');
  const warnings = checks.filter((check) => check.status === 'warn');
  const passed = checks.filter((check) => check.status === 'pass');
  return {
    status: failed.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass',
    total: checks.length,
    passed: passed.length,
    failed: failed.length,
    warnings: warnings.length,
    criticalFailures: failed.map((check) => check.id),
    warningChecks: warnings.map((check) => check.id),
  };
}

export function formatDemoReadiness(summary, checks = []) {
  const statusLabel = summary.status === 'pass' ? 'PASS' : summary.status === 'warn' ? 'WARN' : 'FAIL';
  const lines = [
    'PowerGym demo scenario verification',
    '-----------------------------------',
    `Status: ${statusLabel}`,
    `Checks: ${summary.passed}/${summary.total} passed, ${summary.warnings} warning(s), ${summary.failed} failed`,
    '',
  ];

  for (const check of checks) {
    const icon = check.status === 'pass' ? 'OK' : check.status === 'warn' ? 'WARN' : 'FAIL';
    lines.push(`${icon} ${check.label}: ${check.actual}/${check.expected}`);
    if (check.status !== 'pass' && check.details?.hint) {
      lines.push(`   Hint: ${check.details.hint}`);
    }
  }

  return lines.join('\n');
}
