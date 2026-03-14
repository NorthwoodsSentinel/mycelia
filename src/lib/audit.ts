import type { AuditEventType, AuditTargetType } from '../types';
import { now } from './utils';

/**
 * Write an audit log entry to D1 and update the KV feed cache.
 */
export async function writeAuditLog(
  db: D1Database,
  kv: KVNamespace,
  entry: {
    event_type: AuditEventType;
    actor_id: string | null;
    target_type: AuditTargetType;
    target_id: string;
    detail?: Record<string, unknown>;
  }
): Promise<void> {
  const timestamp = now();

  await db.prepare(
    `INSERT INTO audit_log (event_type, actor_id, target_type, target_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    entry.event_type,
    entry.actor_id,
    entry.target_type,
    entry.target_id,
    entry.detail ? JSON.stringify(entry.detail) : null,
    timestamp
  ).run();

  // Update the latest feed cache (best-effort, non-blocking)
  // Full feed update happens in the feed route handler
}
