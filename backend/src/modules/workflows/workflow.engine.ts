import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { hasPermission } from "../../core/rbac/middleware";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../../core/errors";
import { logAudit } from "../audit/audit.service";

const ENTITY_TABLE: Record<string, { table: string; statusCol: string }> = {
  sales_order: { table: "sales_orders", statusCol: "status" },
  quotation: { table: "quotations", statusCol: "status" },
  service_request: { table: "service_requests", statusCol: "status" },
  invoice: { table: "invoices", statusCol: "status" },
  purchase_order: { table: "purchase_orders", statusCol: "status" },
  work_order: { table: "work_orders", statusCol: "status" },
};

export interface TransitionResult {
  from: string;
  to: string;
  entity: any;
}

export async function getAllowedTransitions(orgId: string, entityType: string, currentState: string) {
  const db = getDb();
  const wf = (await db.prepare("SELECT id FROM workflows WHERE organization_id = ? AND entity_type = ? AND is_default = 1").get([orgId, entityType])) as { id: string } | undefined;
  if (!wf) {
    // fall back to any workflow for entity type
    const anyWf = (await db.prepare("SELECT id FROM workflows WHERE organization_id = ? AND entity_type = ?").get([orgId, entityType])) as { id: string } | undefined;
    if (!anyWf) return [];
    return getTransitionsForWorkflow(anyWf.id, currentState);
  }
  return getTransitionsForWorkflow(wf.id, currentState);
}

async function getTransitionsForWorkflow(workflowId: string, currentState: string) {
  const db = getDb();
  const fromState = (await db.prepare("SELECT id, name, label FROM workflow_states WHERE workflow_id = ? AND name = ?").get([workflowId, currentState])) as { id: string; name: string; label: string } | undefined;
  if (!fromState) return [];
  const rows = await db
    .prepare(
      `SELECT wt.id, wt.name, fs.name as from_name, ts.name as to_name, ts.label as to_label, wt.required_permission
       FROM workflow_transitions wt
       JOIN workflow_states fs ON fs.id = wt.from_state_id
       JOIN workflow_states ts ON ts.id = wt.to_state_id
       WHERE wt.workflow_id = ? AND wt.from_state_id = ?`,
    )
    .all([workflowId, fromState.id]);
  return rows;
}

export async function transitionEntity(params: {
  orgId: string;
  entityType: string;
  entityId: string;
  toState: string;
  userId: string;
}): Promise<TransitionResult> {
  const db = getDb();
  const mapping = ENTITY_TABLE[params.entityType];
  if (!mapping) throw new ValidationError(`Unsupported entity type: ${params.entityType}`);

  const entity = (await db.prepare(`SELECT * FROM ${mapping.table} WHERE id = ?`).get([params.entityId])) as any;
  if (!entity || entity.organization_id !== params.orgId) throw new NotFoundError("Entity not found");

  const currentState = entity[mapping.statusCol];
  if (currentState === params.toState) {
    return { from: currentState, to: params.toState, entity };
  }

  const transitions = (await getAllowedTransitions(params.orgId, params.entityType, currentState)) as any[];
  const tr = transitions.find((t: any) => t.to_name === params.toState);
  if (!tr) throw new ValidationError(`Transition from '${currentState}' to '${params.toState}' is not allowed`);

  if (tr.required_permission && !(await hasPermission(params.userId, params.orgId, tr.required_permission))) {
    throw new ForbiddenError(`Missing permission: ${tr.required_permission}`);
  }

  await db.prepare(`UPDATE ${mapping.table} SET ${mapping.statusCol} = ?, updated_at = datetime('now') WHERE id = ?`).run([params.toState, params.entityId]);
  const updated = (await db.prepare(`SELECT * FROM ${mapping.table} WHERE id = ?`).get([params.entityId])) as any;
  await logAudit({
    organizationId: params.orgId,
    userId: params.userId,
    action: `${params.entityType}.transition`,
    entityType: params.entityType,
    entityId: params.entityId,
    metadata: { from: currentState, to: params.toState, transition: tr.name },
  });
  return { from: currentState, to: params.toState, entity: updated };
}
