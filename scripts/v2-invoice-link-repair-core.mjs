export const INVOICE_LINK_DIAGNOSTIC_SQL = `
SELECT 'eligible_missing_links' check_id, COUNT(*) row_count
FROM invoices i
JOIN migration_mappings mm
  ON mm.source_table = 'member_subscriptions'
 AND mm.source_id = i.subscription_id
 AND mm.target_table = 'subscriptions'
JOIN subscriptions s ON s.id = mm.target_id
WHERE i.subscription_id IS NOT NULL AND i.subscription_v2_id IS NULL
UNION ALL SELECT 'missing_subscription_mappings', COUNT(*)
FROM invoices i
LEFT JOIN migration_mappings mm
  ON mm.source_table = 'member_subscriptions'
 AND mm.source_id = i.subscription_id
 AND mm.target_table = 'subscriptions'
WHERE i.subscription_id IS NOT NULL AND mm.target_id IS NULL
UNION ALL SELECT 'incorrect_existing_links', COUNT(*)
FROM invoices i
JOIN migration_mappings mm
  ON mm.source_table = 'member_subscriptions'
 AND mm.source_id = i.subscription_id
 AND mm.target_table = 'subscriptions'
WHERE i.subscription_v2_id IS NOT NULL AND i.subscription_v2_id <> mm.target_id
UNION ALL SELECT 'orphan_mapping_targets', COUNT(*)
FROM invoices i
JOIN migration_mappings mm
  ON mm.source_table = 'member_subscriptions'
 AND mm.source_id = i.subscription_id
 AND mm.target_table = 'subscriptions'
LEFT JOIN subscriptions s ON s.id = mm.target_id
WHERE i.subscription_id IS NOT NULL AND s.id IS NULL
UNION ALL SELECT 'member_mismatches', COUNT(*)
FROM invoices i
JOIN member_subscriptions ms ON ms.id = i.subscription_id
JOIN migration_mappings mm
  ON mm.source_table = 'member_subscriptions'
 AND mm.source_id = ms.id
 AND mm.target_table = 'subscriptions'
JOIN subscriptions s ON s.id = mm.target_id
WHERE i.member_id <> ms.member_id OR i.member_id <> s.holder_member_id
`;

export const INVOICE_LINK_UPDATE_SQL = `
UPDATE invoices i
JOIN migration_mappings mm
  ON mm.source_table = 'member_subscriptions'
 AND mm.source_id = i.subscription_id
 AND mm.target_table = 'subscriptions'
JOIN subscriptions s ON s.id = mm.target_id
SET i.subscription_v2_id = mm.target_id
WHERE i.subscription_id IS NOT NULL AND i.subscription_v2_id IS NULL
`;

export function parseArgs(argv) {
  const parsed = { apply: false, json: false, output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') parsed.apply = true;
    else if (token === '--json') parsed.json = true;
    else if (token === '--output' || token.startsWith('--output=')) {
      const value = token.includes('=') ? token.slice(token.indexOf('=') + 1) : argv[++index];
      if (!value) throw new Error('--output requires a file path.');
      parsed.output = value;
    } else throw new Error(`Unknown option: ${token}`);
  }
  return parsed;
}

export function summarize(rows) {
  const counts = Object.fromEntries(rows.map((row) => [row.check_id, Number(row.row_count || 0)]));
  const blockers = ['missing_subscription_mappings', 'incorrect_existing_links', 'orphan_mapping_targets', 'member_mismatches']
    .map((id) => ({ id, count: counts[id] || 0 }))
    .filter((item) => item.count > 0);
  return { eligible: counts.eligible_missing_links || 0, blockers };
}
