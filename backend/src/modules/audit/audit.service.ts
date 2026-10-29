import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";

export function logAudit(params: {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: unknown;
  ipAddress?: string;
}) {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, metadata_json, ip_address)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    newId(),
    params.organizationId ?? null,
    params.userId ?? null,
    params.action,
    params.entityType ?? null,
    params.entityId ?? null,
    params.metadata ? JSON.stringify(params.metadata) : null,
    params.ipAddress ?? null,
  );
}

