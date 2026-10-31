import { Router } from "express";
import { z } from "zod";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { ok, paginated } from "../../shared/response";
import { parsePagination } from "../../shared/pagination";
import { nextNumber } from "../../shared/numbering";

export const purchasingRouter = Router();

function calcTotals(lines: any[]) {
  let subtotal = 0, tax = 0, total = 0;
  for (const l of lines) {
    const qty = Number(l.quantity ?? 1);
    const cost = Number(l.unit_cost ?? 0);
    const taxRate = Number(l.tax_rate ?? 0);
    const ls = qty * cost;
    const lt = ls * (taxRate / 100);
    subtotal += ls;
    tax += lt;
    total += ls + lt;
  }
  return { subtotal, tax_total: tax, total };
}

purchasingRouter.get("/purchase-orders", authenticate, resolveTenant, requireOrg, async (req, res) => {
  const r = req as any;
  const db = getDb();
  const { page, pageSize, offset } = parsePagination(req.query as any);
  const total = (await db.prepare("SELECT COUNT(*) as c FROM purchase_orders WHERE organization_id = ?").get([r.organizationId])) as any;
  const rows = await db.prepare("SELECT * FROM purchase_orders WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?").all([r.organizationId, pageSize, offset]);
  paginated(res, rows, total.c, page, pageSize);
});

const poLineSchema = z.object({
  product_id: z.string().optional(),
  variant_id: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().positive(),
  unit_cost: z.number(),
  tax_rate: z.number().optional(),
});

const poSchema = z.object({
  supplier_id: z.string().optional(),
  branch_id: z.string().optional(),
  currency: z.string().default("USD"),
  expected_date: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(poLineSchema).min(1),
});

purchasingRouter.post("/purchase-orders", authenticate, resolveTenant, requireOrg, requirePermission("purchase.create"), async (req, res, next) => {
  try {
    const input = poSchema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const totals = calcTotals(input.lines);
    const number = await nextNumber(r.organizationId, "purchase_order", "PO-");
    const id = newId();
    await db.transaction(async () => {
      await db.prepare(
        `INSERT INTO purchase_orders (id, organization_id, branch_id, supplier_id, number, currency, subtotal, tax_total, total, expected_date, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run([id, r.organizationId, input.branch_id ?? null, input.supplier_id ?? null, number, input.currency, totals.subtotal, totals.tax_total, totals.total, input.expected_date ?? null, input.notes ?? null, r.user.id]);
      const stmt = db.prepare(
        "INSERT INTO purchase_order_lines (id, purchase_order_id, product_id, variant_id, description, quantity, unit_cost, tax_rate, line_total, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)",
      );
      for (const [i, l] of input.lines.entries()) {
        const ls = l.quantity * l.unit_cost;
        const lt = ls * ((l.tax_rate ?? 0) / 100);
        await stmt.run([newId(), id, l.product_id ?? null, l.variant_id ?? null, l.description ?? null, l.quantity, l.unit_cost, l.tax_rate ?? 0, ls + lt, i]);
      }
    });
    ok(res, { id, number }, 201);
  } catch (e) {
    next(e);
  }
});

purchasingRouter.get("/purchase-orders/:id", authenticate, resolveTenant, requireOrg, async (req, res) => {
  const db = getDb();
  const po = (await db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get([req.params.id])) as any;
  if (!po) return (res as any).status(404).json({ success: false, error: { message: "Not found" } });
  const lines = await db.prepare("SELECT * FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY sort_order").all([req.params.id]);
  ok(res, { ...po, lines });
});

purchasingRouter.patch("/purchase-orders/:id/status", authenticate, resolveTenant, requireOrg, requirePermission("purchase.update"), async (req, res, next) => {
  try {
    const schema = z.object({ status: z.string() });
    const input = schema.parse(req.body);
    const db = getDb();
    await db.prepare("UPDATE purchase_orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run([input.status, req.params.id]);
    ok(res, { updated: true });
  } catch (e) {
    next(e);
  }
});

// Goods receipt: receive items into warehouse, update stock, PO received_qty
purchasingRouter.post("/goods-receipts", authenticate, resolveTenant, requireOrg, requirePermission("purchase.update"), async (req, res, next) => {
  try {
    const schema = z.object({
      purchase_order_id: z.string().optional(),
      warehouse_id: z.string(),
      notes: z.string().optional(),
      lines: z.array(z.object({
        product_id: z.string(),
        variant_id: z.string().optional(),
        quantity: z.number().positive(),
        unit_cost: z.number().optional(),
      })).min(1),
    });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const number = await nextNumber(r.organizationId, "goods_receipt", "GR-");
    const id = newId();
    await db.transaction(async () => {
      await db.prepare("INSERT INTO goods_receipts (id, organization_id, purchase_order_id, number, warehouse_id, notes, created_by) VALUES (?,?,?,?,?,?,?)").run(
        [id, r.organizationId, input.purchase_order_id ?? null, number, input.warehouse_id, input.notes ?? null, r.user.id],
      );
      for (const l of input.lines) {
        // upsert stock
        const row = (await db
          .prepare("SELECT id, quantity_on_hand FROM stock_items WHERE organization_id = ? AND product_id = ? AND COALESCE(variant_id,'') = COALESCE(?,'') AND warehouse_id = ?")
          .get([r.organizationId, l.product_id, l.variant_id ?? null, input.warehouse_id])) as { id: string; quantity_on_hand: number } | undefined;
        if (row) {
          await db.prepare("UPDATE stock_items SET quantity_on_hand = quantity_on_hand + ?, updated_at = datetime('now') WHERE id = ?").run([l.quantity, row.id]);
        } else {
          await db.prepare("INSERT INTO stock_items (id, organization_id, product_id, variant_id, warehouse_id, quantity_on_hand) VALUES (?,?,?,?,?,?)").run(
            [newId(), r.organizationId, l.product_id, l.variant_id ?? null, input.warehouse_id, l.quantity],
          );
        }
        // movement
        await db.prepare(
          `INSERT INTO stock_movements (id, organization_id, product_id, variant_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ).run([newId(), r.organizationId, l.product_id, l.variant_id ?? null, input.warehouse_id, "in", l.quantity, l.unit_cost ?? null, "purchase", id, r.user.id]);
        // update PO received_qty
        if (input.purchase_order_id) {
          await db.prepare(
            `UPDATE purchase_order_lines SET received_qty = received_qty + ? WHERE purchase_order_id = ? AND product_id = ?`,
          ).run([l.quantity, input.purchase_order_id, l.product_id]);
        }
      }
      if (input.purchase_order_id) {
        await db.prepare("UPDATE purchase_orders SET status = 'received', updated_at = datetime('now') WHERE id = ?").run([input.purchase_order_id]);
      }
    });
    ok(res, { id, number }, 201);
  } catch (e) {
    next(e);
  }
});
