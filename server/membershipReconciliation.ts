import { activeMembersWithoutCurrentSubscriptionSql } from './membershipEligibility';

type ReconciliationCandidate = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

type ReconciliationConnection = {
  query(sql: string, values?: unknown[]): Promise<any>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
};

type ReconciliationPool = {
  getConnection(): Promise<ReconciliationConnection>;
};

const CANDIDATE_SQL = activeMembersWithoutCurrentSubscriptionSql(
  'm.id, m.first_name, m.last_name, m.email',
  'ORDER BY m.id FOR UPDATE',
);

export async function reconcileMembershipStatuses(
  pool: ReconciliationPool,
  options: { apply?: boolean; performedBy?: string } = {},
) {
  const apply = options.apply === true;
  const performedBy = options.performedBy || 'daily-membership-reconciliation';
  const connection = await pool.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await connection.beginTransaction();
    const [rows] = await connection.query(CANDIDATE_SQL);
    const candidates = (Array.isArray(rows) ? rows : []) as ReconciliationCandidate[];

    if (!apply) {
      await connection.rollback();
      return { mode: 'dry-run' as const, checked: candidates.length, deactivated: 0, candidates };
    }

    if (candidates.length === 0) {
      await connection.commit();
      return { mode: 'apply' as const, checked: 0, deactivated: 0, candidates: [] };
    }

    const placeholders = candidates.map(() => '?').join(', ');
    const ids = candidates.map((candidate) => candidate.id);
    const [updateResult] = await connection.query(
      `UPDATE members
          SET status = 'inactive', updated_at = NOW()
        WHERE LOWER(COALESCE(status, '')) = 'active'
          AND id IN (${placeholders})`,
      ids,
    );
    const deactivated = Number(updateResult?.affectedRows ?? 0);
    if (deactivated !== candidates.length) {
      throw new Error(
        `Membership reconciliation changed ${deactivated} of ${candidates.length} locked candidates`,
      );
    }

    for (const candidate of candidates) {
      await connection.query(
        `INSERT INTO audit_logs (action, details, performed_by)
         VALUES ('member_automatically_deactivated', ?, ?)`,
        [
          JSON.stringify({
            memberId: candidate.id,
            previousStatus: 'active',
            newStatus: 'inactive',
            reason: 'no-current-subscription',
            source: performedBy,
          }),
          performedBy,
        ],
      );
    }

    await connection.commit();
    return { mode: 'apply' as const, checked: candidates.length, deactivated, candidates };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
