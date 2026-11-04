export async function audit(
  db: D1Database,
  actorId: string | null,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details?: Record<string, unknown>,
) {
  await db
    .prepare("INSERT INTO audit_log (actor_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)")
    .bind(actorId, action, targetType, targetId, details ? JSON.stringify(details) : null)
    .run();
}
