import { Router } from "express";
import { z } from "zod";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { ok } from "../../shared/response";
import { getAllowedTransitions, transitionEntity } from "./workflow.engine";

export const workflowsRouter = Router();

workflowsRouter.get("/workflows", authenticate, resolveTenant, requireOrg, async (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = await db.prepare("SELECT * FROM workflows WHERE organization_id = ? ORDER BY created_at DESC").all([r.organizationId]);
  ok(res, rows);
});

workflowsRouter.post("/workflows", authenticate, resolveTenant, requireOrg, requirePermission("workflow.manage"), async (req, res, next) => {
  try {
    const schema = z.object({ entity_type: z.string(), name: z.string().min(1), description: z.string().optional(), is_default: z.number().optional() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    await db.prepare("INSERT INTO workflows (id, organization_id, entity_type, name, description, is_default) VALUES (?,?,?,?,?,?)").run(
      [id, r.organizationId, input.entity_type, input.name, input.description ?? null, input.is_default ?? 0],
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

workflowsRouter.get("/workflows/:id", authenticate, resolveTenant, requireOrg, async (req, res) => {
  const db = getDb();
  const wf = (await db.prepare("SELECT * FROM workflows WHERE id = ?").get([req.params.id])) as any;
  if (!wf) return (res as any).status(404).json({ success: false, error: { message: "Not found" } });
  const states = await db.prepare("SELECT * FROM workflow_states WHERE workflow_id = ? ORDER BY sort_order").all([req.params.id]);
  const transitions = await db.prepare("SELECT * FROM workflow_transitions WHERE workflow_id = ?").all([req.params.id]);
  ok(res, { ...wf, states, transitions });
});

workflowsRouter.post("/workflows/:id/states", authenticate, resolveTenant, requireOrg, requirePermission("workflow.manage"), async (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().min(1), label: z.string().min(1), color: z.string().optional(), is_initial: z.number().optional(), is_terminal: z.number().optional(), sort_order: z.number().optional() });
    const input = schema.parse(req.body);
    const db = getDb();
    const id = newId();
    await db.prepare("INSERT INTO workflow_states (id, workflow_id, name, label, color, is_initial, is_terminal, sort_order) VALUES (?,?,?,?,?,?,?,?)").run(
      [id, req.params.id, input.name, input.label, input.color ?? null, input.is_initial ?? 0, input.is_terminal ?? 0, input.sort_order ?? 0],
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

workflowsRouter.post("/workflows/:id/transitions", authenticate, resolveTenant, requireOrg, requirePermission("workflow.manage"), async (req, res, next) => {
  try {
    const schema = z.object({ from_state_id: z.string(), to_state_id: z.string(), name: z.string().min(1), required_permission: z.string().optional() });
    const input = schema.parse(req.body);
    const db = getDb();
    const id = newId();
    await db.prepare("INSERT INTO workflow_transitions (id, workflow_id, from_state_id, to_state_id, name, required_permission) VALUES (?,?,?,?,?,?)").run(
      [id, req.params.id, input.from_state_id, input.to_state_id, input.name, input.required_permission ?? null],
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

// Allowed transitions for an entity's current state
workflowsRouter.get("/workflows/transitions", authenticate, resolveTenant, requireOrg, async (req, res, next) => {
  try {
    const entityType = String(req.query.entityType);
    const currentState = String(req.query.state);
    const orgId = (req as any).organizationId;
    const transitions = await getAllowedTransitions(orgId, entityType, currentState);
    ok(res, transitions);
  } catch (e) {
    next(e);
  }
});

// Execute a transition
workflowsRouter.post("/workflows/transition", authenticate, resolveTenant, requireOrg, async (req, res, next) => {
  try {
    const schema = z.object({
      entityType: z.string(),
      entityId: z.string(),
      toState: z.string(),
    });
    const input = schema.parse(req.body);
    const r = req as any;
    const result = await transitionEntity({
      orgId: r.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      toState: input.toState,
      userId: r.user.id,
    });
    ok(res, result);
  } catch (e) {
    next(e);
  }
});
