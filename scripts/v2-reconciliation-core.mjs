export function parseArgs(argv) {
  const parsed = { output: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') {
      parsed.json = true;
      continue;
    }
    if (token === '--output' || token.startsWith('--output=')) {
      const value = token.includes('=') ? token.slice(token.indexOf('=') + 1) : argv[++index];
      if (!value) throw new Error('--output requires a file path.');
      parsed.output = value;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return parsed;
}

function number(value) {
  return Number(value || 0);
}

export function buildResult(rows, database) {
  const counts = Object.fromEntries(rows.map((row) => [row.check_id, number(row.issue_count)]));
  const checks = [
    ['plan_mapping_coverage', counts.source_plans - counts.mapped_plans],
    ['subscription_mapping_coverage', counts.source_subscriptions - counts.mapped_subscriptions],
    ['affiliation_mapping_coverage', counts.source_subscriptions - counts.mapped_affiliations],
    ['duplicate_plan_mappings', counts.duplicate_plan_mappings],
    ['duplicate_subscription_mappings', counts.duplicate_subscription_mappings],
    ['duplicate_affiliation_mappings', counts.duplicate_affiliation_mappings],
    ['orphan_plan_targets', counts.orphan_plan_targets],
    ['orphan_subscription_targets', counts.orphan_subscription_targets],
    ['orphan_affiliation_targets', counts.orphan_affiliation_targets],
    ['contract_field_mismatches', counts.contract_field_mismatches],
    ['holder_mismatches', counts.holder_mismatches],
    ['affiliation_mismatches', counts.affiliation_mismatches],
  ].map(([id, issueCount]) => ({ id, issueCount, ok: issueCount === 0 }));

  const issueCount = checks.reduce((sum, check) => sum + Math.max(0, check.issueCount), 0);
  return {
    generatedAt: new Date().toISOString(),
    database,
    mode: 'read-only',
    result: issueCount === 0 ? 'PASS' : 'BLOCKED',
    issueCount,
    source: { plans: counts.source_plans, memberSubscriptions: counts.source_subscriptions },
    mapped: { plans: counts.mapped_plans, subscriptions: counts.mapped_subscriptions, affiliations: counts.mapped_affiliations },
    checks,
    cutover: {
      ready: false,
      reason: issueCount === 0
        ? 'Structural reconciliation passed; invoice, session-balance and access-decision shadow checks are still required.'
        : 'Structural reconciliation discrepancies must be resolved before shadow mode.',
      pendingScopes: ['invoices', 'sessionBalances', 'accessDecisions'],
    },
  };
}
