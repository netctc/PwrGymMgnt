export function parseArgs(argv) {
  const parsed = { output: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') parsed.json = true;
    else if (token === '--output' || token.startsWith('--output=')) {
      const value = token.includes('=') ? token.slice(token.indexOf('=') + 1) : argv[++index];
      if (!value) throw new Error('--output requires a file path.');
      parsed.output = value;
    } else throw new Error(`Unknown option: ${token}`);
  }
  return parsed;
}

const number = (value) => Number(value || 0);

export function buildSessionBalanceResult(rows, database) {
  const counts = Object.fromEntries(rows.map((row) => [row.check_id, number(row.issue_count)]));
  const checks = [
    ['missing_active_cycles', counts.missing_active_cycles],
    ['duplicate_active_cycles', counts.duplicate_active_cycles],
    ['missing_session_balances', counts.missing_session_balances],
    ['unexpected_unlimited_balances', counts.unexpected_unlimited_balances],
    ['invalid_balance_contexts', counts.invalid_balance_contexts],
    ['orphan_session_movements', counts.orphan_session_movements],
    ['balance_formula_mismatches', counts.balance_formula_mismatches],
    ['movement_projection_mismatches', counts.movement_projection_mismatches],
    ['negative_session_values', counts.negative_session_values],
  ].map(([id, issueCount]) => ({ id, issueCount, ok: issueCount === 0 }));
  const issueCount = checks.reduce((sum, check) => sum + Math.max(0, check.issueCount), 0);

  return {
    generatedAt: new Date().toISOString(), database, mode: 'read-only',
    scope: 'sessionBalances', result: issueCount === 0 ? 'PASS' : 'BLOCKED', issueCount,
    source: {
      migratedSubscriptions: counts.migrated_subscriptions,
      limitedSubscriptions: counts.limited_subscriptions,
      unlimitedSubscriptions: counts.unlimited_subscriptions,
    },
    reconciled: {
      activeCycles: counts.active_cycles,
      sessionBalances: counts.session_balances,
      sessionMovements: counts.session_movements,
    },
    checks,
    cutover: {
      ready: false,
      reason: issueCount === 0
        ? 'Session-balance reconciliation passed; access-decision shadow comparison is still required.'
        : 'Session-balance discrepancies must be resolved before shadow mode.',
      pendingScopes: issueCount === 0 ? ['accessDecisions'] : ['sessionBalances', 'accessDecisions'],
    },
  };
}
