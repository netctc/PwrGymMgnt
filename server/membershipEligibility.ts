export const CURRENT_MEMBERSHIP_EXISTS_SQL = `(EXISTS (
          SELECT 1
            FROM member_subscriptions ms
           WHERE ms.member_id = m.id
             AND LOWER(COALESCE(ms.status, '')) = 'active'
             AND ms.start_date <= CURDATE()
             AND ms.end_date >= CURDATE()
        ) OR EXISTS (
          SELECT 1
            FROM affiliations a
            JOIN subscriptions s ON s.id = a.subscription_id
           WHERE a.member_id = m.id
             AND LOWER(COALESCE(a.status, '')) = 'active'
             AND a.start_date <= CURDATE()
             AND a.end_date >= CURDATE()
             AND LOWER(COALESCE(s.status, '')) = 'active'
             AND s.start_date <= CURDATE()
             AND s.end_date >= CURDATE()
        ))`;

export function activeMembersWithoutCurrentSubscriptionSql(
  selectClause: string,
  suffix = '',
) {
  return `SELECT ${selectClause}
      FROM members m
      WHERE LOWER(COALESCE(m.status, '')) = 'active'
        AND NOT ${CURRENT_MEMBERSHIP_EXISTS_SQL}${suffix ? `\n      ${suffix}` : ''}`;
}
