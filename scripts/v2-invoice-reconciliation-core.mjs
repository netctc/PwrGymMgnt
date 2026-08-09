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

export function buildInvoiceResult(rows, database) {
  const counts = Object.fromEntries(rows.map((row) => [row.check_id, number(row.issue_count)]));
  const checks = [
    ['invoice_subscription_mapping_coverage', counts.missing_subscription_mappings],
    ['missing_v2_invoice_links', counts.missing_v2_links],
    ['incorrect_v2_invoice_links', counts.incorrect_v2_links],
    ['orphan_v2_invoice_links', counts.orphan_v2_links],
    ['invoice_member_mismatches', counts.member_mismatches],
    ['invoice_financial_field_issues', counts.financial_field_issues],
  ].map(([id, issueCount]) => ({ id, issueCount, ok: issueCount === 0 }));
  const issueCount = checks.reduce((sum, check) => sum + Math.max(0, check.issueCount), 0);

  return {
    generatedAt: new Date().toISOString(), database, mode: 'read-only',
    scope: 'invoices', result: issueCount === 0 ? 'PASS' : 'BLOCKED', issueCount,
    source: { legacyLinkedInvoices: counts.source_invoices },
    reconciled: { mappedInvoices: counts.mapped_source_invoices, correctlyLinkedInvoices: counts.correct_v2_links },
    checks,
    cutover: {
      ready: false,
      reason: issueCount === 0
        ? 'Invoice reconciliation passed; session-balance and access-decision comparisons are still required.'
        : 'Invoice discrepancies must be resolved before shadow mode.',
      pendingScopes: issueCount === 0 ? ['sessionBalances', 'accessDecisions'] : ['invoices', 'sessionBalances', 'accessDecisions'],
    },
  };
}
