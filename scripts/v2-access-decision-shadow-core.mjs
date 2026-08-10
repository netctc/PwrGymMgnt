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

export function buildAccessDecisionShadowResult(rows, database, mismatchRows = []) {
  const counts = Object.fromEntries(rows.map((row) => [row.check_id, number(row.issue_count)]));
  const compared = counts.compared_mappings;
  const migrated = counts.migrated_subscriptions;
  const applicable = migrated > 0;
  const mismatches = counts.authorization_mismatches;
  const incomplete = counts.incomplete_shadow_inputs;
  const issueCount = mismatches + incomplete;
  const checks = [
    ['incomplete_shadow_inputs', incomplete],
    ['authorization_mismatches', mismatches],
  ].map(([id, count]) => ({ id, issueCount: count, ok: count === 0 }));

  return {
    generatedAt: new Date().toISOString(), database, mode: 'read-only-shadow',
    scope: 'accessDecisions', result: issueCount === 0 && (!applicable || compared > 0) ? 'PASS' : 'BLOCKED', issueCount,
    applicability: applicable ? 'applicable' : 'not_applicable',
    source: { migratedSubscriptions: migrated },
    compared: {
      mappings: compared,
      matches: Math.max(0, compared - mismatches),
      mismatches,
      legacyAllowed: counts.legacy_allowed,
      v2Allowed: counts.v2_allowed,
    },
    checks,
    mismatches: mismatchRows.map((row) => ({
      legacySubscriptionId: row.legacy_subscription_id,
      v2SubscriptionId: row.v2_subscription_id,
      affiliationId: row.affiliation_id,
      legacyAllowed: Boolean(number(row.legacy_allowed)),
      v2Allowed: Boolean(number(row.v2_allowed)),
      conditions: {
        memberActive: Boolean(number(row.member_active)),
        subscriptionActive: Boolean(number(row.subscription_active)),
        subscriptionStarted: Boolean(number(row.subscription_started)),
        subscriptionNotExpired: Boolean(number(row.subscription_not_expired)),
        affiliationActive: Boolean(number(row.affiliation_active)),
        affiliationStarted: Boolean(number(row.affiliation_started)),
        affiliationNotExpired: Boolean(number(row.affiliation_not_expired)),
        paymentNotRefunded: Boolean(number(row.payment_not_refunded)),
        paymentNotOverdue: Boolean(number(row.payment_not_overdue)),
      },
      reasons: String(row.reasons || '').split(',').filter(Boolean),
    })),
    cutover: {
      ready: issueCount === 0,
      reason: !applicable
        ? 'No migrated subscriptions exist; the legacy-to-V2 access shadow comparison is not applicable.'
        : issueCount === 0 && compared > 0
          ? 'All migration scopes passed; access cutover may proceed only through the separately controlled rollout procedure.'
          : 'Access-decision shadow discrepancies must be resolved before cutover.',
      pendingScopes: issueCount === 0 ? [] : ['accessDecisions'],
    },
  };
}
