import { Router } from "express";
import { z } from "zod";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { ok, paginated, fail } from "../../shared/response";
import { parsePagination } from "../../shared/pagination";
import { createOrganizationWithOwner } from "../auth/auth.service";
import { logAudit } from "../audit/audit.service";

export const organizationsRouter = Router();

// List organizations the current user belongs to
organizationsRouter.get("/organizations", authenticate, (req, res) => {
  const r = req as any;
  const db = getDb();
  let rows;
  if (r.user.isSuperAdmin) {
    rows = db.prepare("SELECT * FROM organizations ORDER BY created_at DESC").all();
  } else {
    rows = db
      .prepare(
        `SELECT o.* FROM organizations o JOIN memberships m ON m.organization_id = o.id
         WHERE m.user_id = ? AND m.is_active = 1 ORDER BY o.created_at DESC`,
      )
      .all(r.user.id);
  }
  ok(res, rows);
});

organizationsRouter.get("/organizations/:id", authenticate, (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM organizations WHERE id = ?").get(req.params.id);
  if (!row) return fail(res, 404, "Organization not found");
  ok(res, row);
});

const createOrgSchema = z.object({ name: z.string().min(1), ownerUserId: z.string().optional() });

organizationsRouter.post("/organizations", authenticate, async (req, res, next) => {
  try {
    const input = createOrgSchema.parse(req.body);
    const r = req as any;
    const ownerId = input.ownerUserId ?? r.user.id;
    const orgId = await createOrganizationWithOwner(ownerId, input.name);
    logAudit({ organizationId: orgId, userId: r.user.id, action: "organization.created", entityType: "organization", entityId: orgId });
    ok(res, { id: orgId }, 201);
  } catch (e) {
    next(e);
  }
});

const updateOrgSchema = z.object({
  name: z.string().optional(),
  legal_name: z.string().optional(),
  tax_id: z.string().optional(),
  base_currency: z.string().optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  settings_json: z.string().optional(),
  branding_json: z.string().optional(),
});

organizationsRouter.patch(
  "/organizations/:id",
  authenticate,
  resolveTenant,
  requireOrg,
  requirePermission("org.manage"),
  (req, res, next) => {
    try {
      const input = updateOrgSchema.parse(req.body);
      const db = getDb();
      const fields = Object.keys(input);
      if (fields.length === 0) return ok(res, { updated: false });
      const setClause = fields.map((f) => `${f} = ?`).join(", ") + ", updated_at = datetime('now')";
      const values = fields.map((f) => (input as any)[f]);
      db.prepare(`UPDATE organizations SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
      ok(res, { updated: true });
    } catch (e) {
      next(e);
    }
  },
);

// Branches
organizationsRouter.get("/branches", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = db.prepare("SELECT * FROM branches WHERE organization_id = ? ORDER BY name").all(r.organizationId);
  ok(res, rows);
});

organizationsRouter.post("/branches", authenticate, resolveTenant, requireOrg, requirePermission("branch.manage"), (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().min(1), code: z.string().optional(), address: z.string().optional(), city: z.string().optional(), country: z.string().optional() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    db.prepare("INSERT INTO branches (id, organization_id, name, code, address, city, country) VALUES (?,?,?,?,?,?,?)").run(
      id, r.organizationId, input.name, input.code ?? null, input.address ?? null, input.city ?? null, input.country ?? null,
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

// Locations
organizationsRouter.get("/locations", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = db.prepare("SELECT * FROM locations WHERE organization_id = ? ORDER BY name").all(r.organizationId);
  ok(res, rows);
});

organizationsRouter.post("/locations", authenticate, resolveTenant, requireOrg, requirePermission("branch.manage"), (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().min(1), type: z.string().optional(), branch_id: z.string().optional(), address: z.string().optional() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    db.prepare("INSERT INTO locations (id, organization_id, branch_id, name, type, address) VALUES (?,?,?,?,?,?)").run(
      id, r.organizationId, input.branch_id ?? null, input.name, input.type ?? "warehouse", input.address ?? null,
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

