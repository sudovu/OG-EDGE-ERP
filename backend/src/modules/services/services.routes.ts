import { Router } from "express";
import { z } from "zod";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { ok, paginated } from "../../shared/response";
import { parsePagination } from "../../shared/pagination";
import { nextNumber } from "../../shared/numbering";

export const servicesRouter = Router();

servicesRouter.get("/service-requests", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const { page, pageSize, offset } = parsePagination(req.query as any);
  const status = req.query.status as string | undefined;
  let where = "organization_id = ?";
  const params: any[] = [r.organizationId];
  if (status) { where += " AND status = ?"; params.push(status); }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM service_requests WHERE ${where}`).get(...params) as any).c;
  const rows = db.prepare(`SELECT * FROM service_requests WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  paginated(res, rows, total, page, pageSize);
});

const srSchema = z.object({
  customer_id: z.string().optional(),
  branch_id: z.string().optional(),
  product_id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.string().optional(),
  assigned_to: z.string().optional(),
  scheduled_at: z.string().optional(),
  warranty: z.number().optional(),
  currency: z.string().default("USD"),
  estimated_cost: z.number().optional(),
});

servicesRouter.post("/service-requests", authenticate, resolveTenant, requireOrg, requirePermission("service.manage"), (req, res, next) => {
  try {
    const input = srSchema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const number = nextNumber(r.organizationId, "service_request", "SR-");
    const id = newId();
    db.prepare(
      `INSERT INTO service_requests (id, organization_id, branch_id, customer_id, product_id, number, title, description, priority, assigned_to, scheduled_at, warranty, currency, estimated_cost, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id, r.organizationId, input.branch_id ?? null, input.customer_id ?? null, input.product_id ?? null,
      number, input.title, input.description ?? null, input.priority ?? "normal", input.assigned_to ?? null,
      input.scheduled_at ?? null, input.warranty ?? 0, input.currency, input.estimated_cost ?? 0, r.user.id,
    );
    ok(res, { id, number }, 201);
  } catch (e) {
    next(e);
  }
});

servicesRouter.get("/service-requests/:id", authenticate, resolveTenant, requireOrg, (req, res) => {
  const db = getDb();
  const sr = db.prepare("SELECT * FROM service_requests WHERE id = ?").get(req.params.id);
  if (!sr) return (res as any).status(404).json({ success: false, error: { message: "Not found" } });
  const wos = db.prepare("SELECT * FROM work_orders WHERE service_request_id = ?").all(req.params.id);
  ok(res, { ...(sr as any), work_orders: wos });
});

servicesRouter.patch("/service-requests/:id", authenticate, resolveTenant, requireOrg, requirePermission("service.manage"), (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      priority: z.string().optional(),
      assigned_to: z.string().optional(),
      scheduled_at: z.string().optional(),
      actual_cost: z.number().optional(),
      billing_status: z.string().optional(),
    });
    const input = schema.parse(req.body);
    const db = getDb();
    const fields = Object.keys(input);
    if (fields.length === 0) return ok(res, { updated: false });
    const setClause = fields.map((f) => `${f} = ?`).join(", ") + ", updated_at = datetime('now')";
    const values = fields.map((f) => (input as any)[f]);
    db.prepare(`UPDATE service_requests SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
    ok(res, { updated: true });
  } catch (e) {
    next(e);
  }
});

// Work orders
servicesRouter.post("/work-orders", authenticate, resolveTenant, requireOrg, requirePermission("service.manage"), (req, res, next) => {
  try {
    const schema = z.object({
      service_request_id: z.string().optional(),
      title: z.string().min(1),
      assigned_to: z.string().optional(),
      notes: z.string().optional(),
      lines: z.array(z.object({
        line_type: z.string().optional(),
        product_id: z.string().optional(),
        description: z.string(),
        quantity: z.number().optional(),
        unit_cost: z.number().optional(),
      })).optional(),
    });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const number = nextNumber(r.organizationId, "work_order", "WO-");
    const id = newId();
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO work_orders (id, organization_id, service_request_id, number, title, assigned_to, notes)
         VALUES (?,?,?,?,?,?,?)`,
      ).run(id, r.organizationId, input.service_request_id ?? null, number, input.title, input.assigned_to ?? null, input.notes ?? null);
      if (input.lines) {
        const stmt = db.prepare("INSERT INTO work_order_lines (id, work_order_id, line_type, product_id, description, quantity, unit_cost, line_total, sort_order) VALUES (?,?,?,?,?,?,?,?,?)");
        input.lines.forEach((l, i) => {
          const qty = l.quantity ?? 1;
          const cost = l.unit_cost ?? 0;
          stmt.run(newId(), id, l.line_type ?? "labor", l.product_id ?? null, l.description, qty, cost, qty * cost, i);
        });
      }
    });
    tx();
    ok(res, { id, number }, 201);
  } catch (e) {
    next(e);
  }
});

servicesRouter.get("/work-orders", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = db.prepare("SELECT * FROM work_orders WHERE organization_id = ? ORDER BY created_at DESC").all(r.organizationId);
  ok(res, rows);
});

servicesRouter.get("/work-orders/:id", authenticate, resolveTenant, requireOrg, (req, res) => {
  const db = getDb();
  const wo = db.prepare("SELECT * FROM work_orders WHERE id = ?").get(req.params.id);
  if (!wo) return (res as any).status(404).json({ success: false, error: { message: "Not found" } });
  const lines = db.prepare("SELECT * FROM work_order_lines WHERE work_order_id = ? ORDER BY sort_order").all(req.params.id);
  ok(res, { ...(wo as any), lines });
});

servicesRouter.patch("/work-orders/:id", authenticate, resolveTenant, requireOrg, requirePermission("service.manage"), (req, res, next) => {
  try {
    const schema = z.object({ title: z.string().optional(), status: z.string().optional(), assigned_to: z.string().optional(), notes: z.string().optional(), started_at: z.string().optional(), completed_at: z.string().optional() });
    const input = schema.parse(req.body);
    const db = getDb();
    const fields = Object.keys(input);
    if (fields.length === 0) return ok(res, { updated: false });
    const setClause = fields.map((f) => `${f} = ?`).join(", ") + ", updated_at = datetime('now')";
    const values = fields.map((f) => (input as any)[f]);
    db.prepare(`UPDATE work_orders SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
    ok(res, { updated: true });
  } catch (e) {
    next(e);
  }
});


// Bill a completed service request: generate invoice from work order lines
servicesRouter.post("/service-requests/:id/bill", authenticate, resolveTenant, requireOrg, requirePermission("service.manage"), (req, res, next) => {
  try {
    const r = req as any;
    const db = getDb();
    const sr = db.prepare("SELECT * FROM service_requests WHERE id = ?").get(req.params.id) as any;
    if (!sr || sr.organization_id !== r.organizationId) throw new Error("Service request not found");
    const workOrders = db.prepare("SELECT id FROM work_orders WHERE service_request_id = ?").all(req.params.id) as { id: string }[];
    const lines: any[] = [];
    for (const wo of workOrders) {
      const wlines = db.prepare("SELECT * FROM work_order_lines WHERE work_order_id = ?").all(wo.id) as any[];
      for (const wl of wlines) {
        lines.push({
          product_id: wl.product_id,
          description: wl.description,
          quantity: wl.quantity,
          unit_price: wl.unit_cost,
          tax_rate: 0,
        });
      }
    }
    if (lines.length === 0) {
      // fallback: use estimated/actual cost as single labor line
      lines.push({
        description: sr.title,
        quantity: 1,
        unit_price: sr.actual_cost || sr.estimated_cost || 0,
        tax_rate: 0,
      });
    }
    const totals = lines.reduce((acc, l) => {
      const sub = l.quantity * l.unit_price;
      acc.subtotal += sub;
      acc.total += sub;
      return acc;
    }, { subtotal: 0, discount_total: 0, tax_total: 0, total: 0 });
    const number = nextNumber(r.organizationId, "invoice", "INV-");
    const id = newId();
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO invoices (id, organization_id, branch_id, customer_id, number, status, currency, subtotal, discount_total, tax_total, total, amount_due, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(id, r.organizationId, sr.branch_id, sr.customer_id, number, "issued", sr.currency, totals.subtotal, 0, 0, totals.total, totals.total, `Service request ${sr.number}`, r.user.id);
      const stmt = db.prepare("INSERT INTO invoice_lines (id, invoice_id, product_id, description, quantity, unit_price, discount, tax_rate, line_total, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)");
      lines.forEach((l, i) => stmt.run(newId(), id, l.product_id ?? null, l.description, l.quantity, l.unit_price, 0, l.tax_rate ?? 0, l.quantity * l.unit_price, i));
      db.prepare("UPDATE invoices SET issued_at = datetime('now') WHERE id = ?").run(id);
      db.prepare("UPDATE service_requests SET billing_status = 'billed', invoice_id = ?, updated_at = datetime('now') WHERE id = ?").run(id, req.params.id);
    });
    tx();
    ok(res, { id, number }, 201);
  } catch (e) {
    next(e);
  }
});
