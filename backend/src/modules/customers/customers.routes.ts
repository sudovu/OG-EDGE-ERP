import { Router } from "express";
import { z } from "zod";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { ok, paginated } from "../../shared/response";
import { parsePagination } from "../../shared/pagination";

export const customersRouter = Router();

customersRouter.get("/customers", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const { page, pageSize, offset } = parsePagination(req.query as any);
  const search = (req.query.search as string) ?? "";
  let where = "organization_id = ?";
  const params: any[] = [r.organizationId];
  if (search) {
    where += " AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM customers WHERE ${where}`).get(...params) as any).c;
  const rows = db.prepare(`SELECT * FROM customers WHERE ${where} ORDER BY name LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  paginated(res, rows, total, page, pageSize);
});

const customerSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  tax_id: z.string().optional(),
  credit_limit: z.number().optional(),
  price_list_id: z.string().optional(),
  customer_group: z.string().optional(),
  notes: z.string().optional(),
});

customersRouter.post("/customers", authenticate, resolveTenant, requireOrg, requirePermission("customer.manage"), (req, res, next) => {
  try {
    const input = customerSchema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    db.prepare(
      `INSERT INTO customers (id, organization_id, name, email, phone, address, city, country, tax_id, credit_limit, price_list_id, customer_group, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id, r.organizationId, input.name, input.email ?? null, input.phone ?? null, input.address ?? null,
      input.city ?? null, input.country ?? null, input.tax_id ?? null, input.credit_limit ?? 0,
      input.price_list_id ?? null, input.customer_group ?? null, input.notes ?? null,
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

customersRouter.get("/customers/:id", authenticate, resolveTenant, requireOrg, (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
  if (!row) return (res as any).status(404).json({ success: false, error: { message: "Not found" } });
  ok(res, row);
});

customersRouter.patch("/customers/:id", authenticate, resolveTenant, requireOrg, requirePermission("customer.manage"), (req, res, next) => {
  try {
    const input = customerSchema.partial().parse(req.body);
    const db = getDb();
    const fields = Object.keys(input);
    if (fields.length === 0) return ok(res, { updated: false });
    const setClause = fields.map((f) => `${f} = ?`).join(", ") + ", updated_at = datetime('now')";
    const values = fields.map((f) => (input as any)[f]);
    db.prepare(`UPDATE customers SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
    ok(res, { updated: true });
  } catch (e) {
    next(e);
  }
});

