import { Router } from "express";
import { z } from "zod";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { ok } from "../../shared/response";

export const workflowsRouter = Router();

workflowsRouter.get("/workflows", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = db.prepare("SELECT * FROM workflows WHERE organization_id = ? ORDER BY created_at DESC").all(r.organizationId);
  ok(res, rows);
});

workflowsRouter.post("/workflows", authenticate, resolveTenant, requireOrg, requirePermission("workflow.manage"), (req, res, next) => {
  try {
    const schema = z.object({ entity_type: z.string(), name: z.string().min(1), description: z.string().optional(), is_default: z.number().optional() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    db.prepare("INSERT INTO workflows (id, organization_id, entity_type, name, description, is_default) VALUES (?,?,?,?,?,?)").run(
      id, r.organizationId, input.entity_type, input.name, input.description ?? null, input.is_default ?? 0,
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

workflowsRouter.get("/workflows/:id", authenticate, resolveTenant, requireOrg, (req, res) => {
  const db = getDb();
  const wf = db.prepare("SELECT * FROM workflows WHERE id = ?").get(req.params.id);
  if (!wf) return (res as any).status(404).json({ success: false, error: { message: "Not found" } });
  const states = db.prepare("SELECT * FROM workflow_states WHERE workflow_id = ? ORDER BY sort_order").all(req.params.id);
  const transitions = db.prepare("SELECT * FROM workflow_transitions WHERE workflow_id = ?").all(req.params.id);
  ok(res, { ...(wf as any), states, transitions });
});

workflowsRouter.post("/workflows/:id/states", authenticate, resolveTenant, requireOrg, requirePermission("workflow.manage"), (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().min(1), label: z.string().min(1), color: z.string().optional(), is_initial: z.number().optional(), is_terminal: z.number().optional(), sort_order: z.number().optional() });
    const input = schema.parse(req.body);
    const db = getDb();
    const id = newId();
    db.prepare("INSERT INTO workflow_states (id, workflow_id, name, label, color, is_initial, is_terminal, sort_order) VALUES (?,?,?,?,?,?,?,?)").run(
      id, req.params.id, input.name, input.label, input.color ?? null, input.is_initial ?? 0, input.is_terminal ?? 0, input.sort_order ?? 0,
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

workflowsRouter.post("/workflows/:id/transitions", authenticate, resolveTenant, requireOrg, requirePermission("workflow.manage"), (req, res, next) => {
  try {
    const schema = z.object({ from_state_id: z.string(), to_state_id: z.string(), name: z.string().min(1), required_permission: z.string().optional() });
    const input = schema.parse(req.body);
    const db = getDb();
    const id = newId();
    db.prepare("INSERT INTO workflow_transitions (id, workflow_id, from_state_id, to_state_id, name, required_permission) VALUES (?,?,?,?,?,?)").run(
      id, req.params.id, input.from_state_id, input.to_state_id, input.name, input.required_permission ?? null,
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

