import { Router } from "express";
import { z } from "zod";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { ok, paginated } from "../../shared/response";
import { parsePagination } from "../../shared/pagination";
import { nextNumber } from "../../shared/numbering";

export const salesRouter = Router();

function calcLine(l: any) {
  const qty = Number(l.quantity ?? 1);
  const price = Number(l.unit_price ?? 0);
  const discount = Number(l.discount ?? 0);
  const taxRate = Number(l.tax_rate ?? 0);
  const subtotal = qty * price - discount;
  const tax = subtotal * (taxRate / 100);
  return { line_total: subtotal + tax, _subtotal: subtotal, _tax: tax };
}

function calcTotals(lines: any[]) {
  let subtotal = 0, discount = 0, tax = 0, total = 0;
  for (const l of lines) {
    const qty = Number(l.quantity ?? 1);
    const price = Number(l.unit_price ?? 0);
    const disc = Number(l.discount ?? 0);
    const taxRate = Number(l.tax_rate ?? 0);
    const lineSub = qty * price;
    const lineTax = (lineSub - disc) * (taxRate / 100);
    subtotal += lineSub;
    discount += disc;
    tax += lineTax;
    total += lineSub - disc + lineTax;
  }
  return { subtotal, discount_total: discount, tax_total: tax, total };
}

// ---------- Quotations ----------
salesRouter.get("/quotations", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const { page, pageSize, offset } = parsePagination(req.query as any);
  const total = (db.prepare("SELECT COUNT(*) as c FROM quotations WHERE organization_id = ?").get(r.organizationId) as any).c;
  const rows = db.prepare("SELECT * FROM quotations WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?").all(r.organizationId, pageSize, offset);
  paginated(res, rows, total, page, pageSize);
});

const quotationLineSchema = z.object({
  product_id: z.string().optional(),
  variant_id: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().positive(),
  unit_price: z.number(),
  discount: z.number().optional(),
  tax_rate: z.number().optional(),
});

const quotationSchema = z.object({
  customer_id: z.string().optional(),
  branch_id: z.string().optional(),
  currency: z.string().default("USD"),
  valid_until: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(quotationLineSchema).min(1),
});

salesRouter.post("/quotations", authenticate, resolveTenant, requireOrg, requirePermission("sales.create"), (req, res, next) => {
  try {
    const input = quotationSchema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const defaultTaxQ = db.prepare("SELECT rate FROM tax_rates WHERE organization_id = ? AND is_default = 1").get(r.organizationId) as { rate: number } | undefined;
    const linesQ = input.lines.map((l) => ({ ...l, tax_rate: l.tax_rate === undefined ? (defaultTaxQ?.rate ?? 0) : l.tax_rate }));
    const totals = calcTotals(linesQ);
    const number = nextNumber(r.organizationId, "quotation", "Q-");
    const id = newId();
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO quotations (id, organization_id, branch_id, customer_id, number, currency, subtotal, discount_total, tax_total, total, valid_until, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(id, r.organizationId, input.branch_id ?? null, input.customer_id ?? null, number, input.currency, totals.subtotal, totals.discount_total, totals.tax_total, totals.total, input.valid_until ?? null, input.notes ?? null, r.user.id);
      const stmt = db.prepare(
        "INSERT INTO quotation_lines (id, quotation_id, product_id, variant_id, description, quantity, unit_price, discount, tax_rate, line_total, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      );
      linesQ.forEach((l, i) => {
        const lt = calcLine(l).line_total;
        stmt.run(newId(), id, l.product_id ?? null, l.variant_id ?? null, l.description ?? null, l.quantity, l.unit_price, l.discount ?? 0, l.tax_rate ?? 0, lt, i);
      });
    });
    tx();
    ok(res, { id, number }, 201);
  } catch (e) {
    next(e);
  }
});

salesRouter.get("/quotations/:id", authenticate, resolveTenant, requireOrg, (req, res) => {
  const db = getDb();
  const q = db.prepare("SELECT * FROM quotations WHERE id = ?").get(req.params.id);
  if (!q) return (res as any).status(404).json({ success: false, error: { message: "Not found" } });
  const lines = db.prepare("SELECT * FROM quotation_lines WHERE quotation_id = ? ORDER BY sort_order").all(req.params.id);
  ok(res, { ...(q as any), lines });
});

salesRouter.patch("/quotations/:id/status", authenticate, resolveTenant, requireOrg, requirePermission("sales.update"), (req, res, next) => {
  try {
    const schema = z.object({ status: z.string() });
    const input = schema.parse(req.body);
    const db = getDb();
    db.prepare("UPDATE quotations SET status = ?, updated_at = datetime('now') WHERE id = ?").run(input.status, req.params.id);
    ok(res, { updated: true });
  } catch (e) {
    next(e);
  }
});

// ---------- Sales Orders ----------
salesRouter.get("/sales-orders", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const { page, pageSize, offset } = parsePagination(req.query as any);
  const total = (db.prepare("SELECT COUNT(*) as c FROM sales_orders WHERE organization_id = ?").get(r.organizationId) as any).c;
  const rows = db.prepare("SELECT * FROM sales_orders WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?").all(r.organizationId, pageSize, offset);
  paginated(res, rows, total, page, pageSize);
});

const orderLineSchema = z.object({
  product_id: z.string().optional(),
  variant_id: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().positive(),
  unit_price: z.number(),
  discount: z.number().optional(),
  tax_rate: z.number().optional(),
});

const orderSchema = z.object({
  customer_id: z.string().optional(),
  branch_id: z.string().optional(),
  quotation_id: z.string().optional(),
  currency: z.string().default("USD"),
  notes: z.string().optional(),
  lines: z.array(orderLineSchema).min(1),
});

salesRouter.post("/sales-orders", authenticate, resolveTenant, requireOrg, requirePermission("sales.create"), (req, res, next) => {
  try {
    const input = orderSchema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const defaultTaxO = db.prepare("SELECT rate FROM tax_rates WHERE organization_id = ? AND is_default = 1").get(r.organizationId) as { rate: number } | undefined;
    const linesO = input.lines.map((l) => ({ ...l, tax_rate: l.tax_rate === undefined ? (defaultTaxO?.rate ?? 0) : l.tax_rate }));
    const totals = calcTotals(linesO);
    const number = nextNumber(r.organizationId, "sales_order", "SO-");
    const id = newId();
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO sales_orders (id, organization_id, branch_id, customer_id, quotation_id, number, currency, subtotal, discount_total, tax_total, total, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(id, r.organizationId, input.branch_id ?? null, input.customer_id ?? null, input.quotation_id ?? null, number, input.currency, totals.subtotal, totals.discount_total, totals.tax_total, totals.total, input.notes ?? null, r.user.id);
      const stmt = db.prepare(
        "INSERT INTO sales_order_lines (id, sales_order_id, product_id, variant_id, description, quantity, unit_price, discount, tax_rate, line_total, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      );
      linesO.forEach((l, i) => {
        const lt = calcLine(l).line_total;
        stmt.run(newId(), id, l.product_id ?? null, l.variant_id ?? null, l.description ?? null, l.quantity, l.unit_price, l.discount ?? 0, l.tax_rate ?? 0, lt, i);
      });
      if (input.quotation_id) {
        db.prepare("UPDATE quotations SET status = 'converted', updated_at = datetime('now') WHERE id = ?").run(input.quotation_id);
      }
    });
    tx();
    ok(res, { id, number }, 201);
  } catch (e) {
    next(e);
  }
});

salesRouter.get("/sales-orders/:id", authenticate, resolveTenant, requireOrg, (req, res) => {
  const db = getDb();
  const o = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(req.params.id);
  if (!o) return (res as any).status(404).json({ success: false, error: { message: "Not found" } });
  const lines = db.prepare("SELECT * FROM sales_order_lines WHERE sales_order_id = ? ORDER BY sort_order").all(req.params.id);
  ok(res, { ...(o as any), lines });
});

salesRouter.patch("/sales-orders/:id/status", authenticate, resolveTenant, requireOrg, requirePermission("sales.update"), (req, res, next) => {
  try {
    const schema = z.object({ status: z.string() });
    const input = schema.parse(req.body);
    const db = getDb();
    db.prepare("UPDATE sales_orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(input.status, req.params.id);
    ok(res, { updated: true });
  } catch (e) {
    next(e);
  }
});

// ---------- Invoices ----------
salesRouter.get("/invoices", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const { page, pageSize, offset } = parsePagination(req.query as any);
  const total = (db.prepare("SELECT COUNT(*) as c FROM invoices WHERE organization_id = ?").get(r.organizationId) as any).c;
  const rows = db.prepare("SELECT * FROM invoices WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?").all(r.organizationId, pageSize, offset);
  paginated(res, rows, total, page, pageSize);
});

const invoiceLineSchema = z.object({
  product_id: z.string().optional(),
  variant_id: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().positive(),
  unit_price: z.number(),
  discount: z.number().optional(),
  tax_rate: z.number().optional(),
});

const invoiceSchema = z.object({
  customer_id: z.string().optional(),
  branch_id: z.string().optional(),
  sales_order_id: z.string().optional(),
  currency: z.string().default("USD"),
  due_date: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(invoiceLineSchema).min(1),
});

salesRouter.post("/invoices", authenticate, resolveTenant, requireOrg, requirePermission("sales.create"), (req, res, next) => {
  try {
    const input = invoiceSchema.parse(req.body);
    const r = req as any;
    const db = getDb();
    // Auto-apply default VAT (Nepal 13%) when tax_rate not explicitly provided
    const defaultTax = db.prepare("SELECT rate FROM tax_rates WHERE organization_id = ? AND is_default = 1").get(r.organizationId) as { rate: number } | undefined;
    const defaultRate = defaultTax?.rate ?? 0;
    const linesWithTax = input.lines.map((l) => ({
      ...l,
      tax_rate: l.tax_rate === undefined ? defaultRate : l.tax_rate,
    }));
    const totals = calcTotals(linesWithTax);
    const number = nextNumber(r.organizationId, "invoice", "INV-");
    const id = newId();
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO invoices (id, organization_id, branch_id, customer_id, sales_order_id, number, status, currency, subtotal, discount_total, tax_total, total, amount_due, due_date, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(id, r.organizationId, input.branch_id ?? null, input.customer_id ?? null, input.sales_order_id ?? null, number, "issued", input.currency, totals.subtotal, totals.discount_total, totals.tax_total, totals.total, totals.total, input.due_date ?? null, input.notes ?? null, r.user.id);
      const stmt = db.prepare(
        "INSERT INTO invoice_lines (id, invoice_id, product_id, variant_id, description, quantity, unit_price, discount, tax_rate, line_total, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      );
      linesWithTax.forEach((l, i) => {
        const lt = calcLine(l).line_total;
        stmt.run(newId(), id, l.product_id ?? null, l.variant_id ?? null, l.description ?? null, l.quantity, l.unit_price, l.discount ?? 0, l.tax_rate ?? 0, lt, i);
      });
      db.prepare("UPDATE invoices SET issued_at = datetime('now') WHERE id = ?").run(id);
    });
    tx();
    ok(res, { id, number }, 201);
  } catch (e) {
    next(e);
  }
});

salesRouter.get("/invoices/:id", authenticate, resolveTenant, requireOrg, (req, res) => {
  const db = getDb();
  const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
  if (!inv) return (res as any).status(404).json({ success: false, error: { message: "Not found" } });
  const lines = db.prepare("SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY sort_order").all(req.params.id);
  ok(res, { ...(inv as any), lines });
});

// Record payment against invoice
salesRouter.post("/payments", authenticate, resolveTenant, requireOrg, requirePermission("sales.create"), (req, res, next) => {
  try {
    const schema = z.object({
      invoice_id: z.string().optional(),
      customer_id: z.string().optional(),
      supplier_id: z.string().optional(),
      payment_type: z.string(),
      method: z.string().optional(),
      amount: z.number().positive(),
      currency: z.string(),
      reference: z.string().optional(),
      notes: z.string().optional(),
      tds_rate: z.number().optional(),
    });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    const tdsRate = input.tds_rate ?? 0;
    const tdsAmount = Math.round((input.amount * tdsRate / 100) * 100) / 100;
    const netAmount = input.amount; // amount recorded is net received
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO payments (id, organization_id, invoice_id, customer_id, supplier_id, payment_type, method, amount, currency, reference, notes, tds_rate, tds_amount, net_amount, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(id, r.organizationId, input.invoice_id ?? null, input.customer_id ?? null, input.supplier_id ?? null, input.payment_type, input.method ?? "cash", input.amount, input.currency, input.reference ?? null, input.notes ?? null, tdsRate, tdsAmount, netAmount, r.user.id);
      if (input.invoice_id) {
        const inv = db.prepare("SELECT total, amount_paid FROM invoices WHERE id = ?").get(input.invoice_id) as { total: number; amount_paid: number };
        const gross = input.amount + tdsAmount;
        const newPaid = (inv.amount_paid ?? 0) + gross;
        const due = Math.max(0, inv.total - newPaid);
        const status = due <= 0 ? "paid" : "partial";
        db.prepare("UPDATE invoices SET amount_paid = ?, amount_due = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(newPaid, due, status, input.invoice_id);
      }
    });
    tx();
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

salesRouter.get("/payments", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = db.prepare("SELECT * FROM payments WHERE organization_id = ? ORDER BY paid_at DESC").all(r.organizationId);
  ok(res, rows);
});

