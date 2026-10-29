import { Router } from "express";
import { z } from "zod";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { ok, paginated } from "../../shared/response";
import { parsePagination } from "../../shared/pagination";

export const suppliersRouter = Router();

suppliersRouter.get("/suppliers", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const { page, pageSize, offset } = parsePagination(req.query as any);
  const total = (db.prepare("SELECT COUNT(*) as c FROM suppliers WHERE organization_id = ?").get(r.organizationId) as any).c;
  const rows = db.prepare("SELECT * FROM suppliers WHERE organization_id = ? ORDER BY name LIMIT ? OFFSET ?").all(r.organizationId, pageSize, offset);
  paginated(res, rows, total, page, pageSize);
});

const supplierSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  tax_id: z.string().optional(),
  payment_terms: z.string().optional(),
  notes: z.string().optional(),
});

suppliersRouter.post("/suppliers", authenticate, resolveTenant, requireOrg, requirePermission("supplier.manage"), (req, res, next) => {
  try {
    const input = supplierSchema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    db.prepare(
      `INSERT INTO suppliers (id, organization_id, name, email, phone, address, city, country, tax_id, payment_terms, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, r.organizationId, input.name, input.email ?? null, input.phone ?? null, input.address ?? null, input.city ?? null, input.country ?? null, input.tax_id ?? null, input.payment_terms ?? null, input.notes ?? null);
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

suppliersRouter.get("/suppliers/:id", authenticate, resolveTenant, requireOrg, (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(req.params.id);
  if (!row) return (res as any).status(404).json({ success: false, error: { message: "Not found" } });
  ok(res, row);
});

suppliersRouter.patch("/suppliers/:id", authenticate, resolveTenant, requireOrg, requirePermission("supplier.manage"), (req, res, next) => {
  try {
    const input = supplierSchema.partial().parse(req.body);
    const db = getDb();
    const fields = Object.keys(input);
    if (fields.length === 0) return ok(res, { updated: false });
    const setClause = fields.map((f) => `${f} = ?`).join(", ") + ", updated_at = datetime('now')";
    const values = fields.map((f) => (input as any)[f]);
    db.prepare(`UPDATE suppliers SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
    ok(res, { updated: true });
  } catch (e) {
    next(e);
  }
});

