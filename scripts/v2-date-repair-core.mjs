export function parseArgs(argv) {
  const parsed = { apply: false, output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') parsed.apply = true;
    else if (token === '--output' || token.startsWith('--output=')) {
      const value = token.includes('=') ? token.slice(token.indexOf('=') + 1) : argv[++index];
      if (!value) throw new Error('--output requires a file path.');
      parsed.output = value;
    } else throw new Error(`Unknown option: ${token}`);
  }
  return parsed;
}

export const DATE_MISMATCH_SQL = `
SELECT ms.id source_id, sm.target_id subscription_id, am.target_id affiliation_id,
       ms.start_date expected_start_date, ms.end_date expected_end_date,
       s.start_date subscription_start_date, s.end_date subscription_end_date,
       a.start_date affiliation_start_date, a.end_date affiliation_end_date
  FROM member_subscriptions ms
  JOIN migration_mappings sm ON sm.source_table = 'member_subscriptions'
   AND sm.source_id = ms.id AND sm.target_table = 'subscriptions'
  JOIN migration_mappings am ON am.source_table = 'member_subscriptions'
   AND am.source_id = ms.id AND am.target_table = 'affiliations'
  JOIN subscriptions s ON s.id = sm.target_id
  JOIN affiliations a ON a.id = am.target_id
 WHERE NOT (s.start_date <=> ms.start_date) OR NOT (s.end_date <=> ms.end_date)
    OR NOT (a.start_date <=> ms.start_date) OR NOT (a.end_date <=> ms.end_date)
 ORDER BY ms.id`;
