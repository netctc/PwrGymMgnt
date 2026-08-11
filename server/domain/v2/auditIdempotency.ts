import crypto from "node:crypto";
import type { Pool, PoolConnection } from "mysql2/promise";

type Executor = Pick<Pool | PoolConnection, "query">;

export async function appendDomainAudit(executor: Executor, event: { entityType: string; entityId: string; eventType: string; actorId?: string | null; correlationId: string; before?: unknown; after?: unknown; reason?: string | null }) {
  const id = `dae_${crypto.randomUUID().replace(/-/g, "")}`;
  await executor.query(
    `INSERT INTO domain_audit_events (id, entity_type, entity_id, event_type, actor_id, correlation_id, before_state, after_state, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, event.entityType, event.entityId, event.eventType, event.actorId ?? null, event.correlationId, JSON.stringify(event.before ?? null), JSON.stringify(event.after ?? null), event.reason ?? null],
  );
  return id;
}

export async function claimIdempotencyKey(executor: Executor, scope: string, key: string, requestHash: string) {
  const [result]: any = await executor.query(
    `INSERT IGNORE INTO domain_idempotency_keys (scope_key, idempotency_key, request_hash, status)
     VALUES (?, ?, ?, 'processing')`, [scope, key, requestHash],
  );
  return Number(result.affectedRows || 0) === 1;
}
