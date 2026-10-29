import { Router } from "express";
import { z } from "zod";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { ok, paginated } from "../../shared/response";
import { parsePagination } from "../../shared/pagination";

export const inventoryRouter = Router();

// Warehouses
inventoryRouter.get("/warehouses", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  ok(res, db.prepare("SELECT * FROM warehouses WHERE organization_id = ? ORDER BY name").all(r.organizationId));
});

inventoryRouter.post("/warehouses", authenticate, resolveTenant, requireOrg, requirePermission("inventory.manage"), (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().min(1), code: z.string().optional(), location_id: z.string().optional() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    db.prepare("INSERT INTO warehouses (id, organization_id, location_id, name, code) VALUES (?,?,?,?,?)").run(
      id, r.organizationId, input.location_id ?? null, input.name, input.code ?? null,
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

// Stock items (current levels)
inventoryRouter.get("/stock", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT si.*, p.name as product_name, p.sku, w.name as warehouse_name
       FROM stock_items si
       JOIN products p ON p.id = si.product_id
       JOIN warehouses w ON w.id = si.warehouse_id
       WHERE si.organization_id = ? ORDER BY p.name`,
    )
    .all(r.organizationId);
  ok(res, rows);
});

// Stock movements history
inventoryRouter.get("/stock/movements", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const { page, pageSize, offset } = parsePagination(req.query as any);
  const total = (db.prepare("SELECT COUNT(*) as c FROM stock_movements WHERE organization_id = ?").get(r.organizationId) as any).c;
  const rows = db
    .prepare("SELECT * FROM stock_movements WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(r.organizationId, pageSize, offset);
  paginated(res, rows, total, page, pageSize);
});

// Adjust stock (in/out)
inventoryRouter.post("/stock/adjust", authenticate, resolveTenant, requireOrg, requirePermission("inventory.manage"), (req, res, next) => {
  try {
    const schema = z.object({
      product_id: z.string(),
      variant_id: z.string().optional(),
      warehouse_id: z.string(),
      movement_type: z.enum(["in", "out", "adjustment"]),
      quantity: z.number().positive(),
      unit_cost: z.number().optional(),
      notes: z.string().optional(),
      batch_number: z.string().optional(),
      serial_number: z.string().optional(),
      expiry_date: z.string().optional(),
    });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const qty = input.movement_type === "out" ? -Math.abs(input.quantity) : Math.abs(input.quantity);
    const tx = db.transaction(() => {
      // upsert stock item
      const existing = db
        .prepare("SELECT id, quantity_on_hand FROM stock_items WHERE organization_id = ? AND product_id = ? AND variant_id IS ? AND warehouse_id = ?")
        .get(r.organizationId, input.product_id, input.variant_id ?? null, input.warehouse_id) as { id: string; quantity_on_hand: number } | undefined;
      // handle null variant matching properly
      let row = db
        .prepare(
          "SELECT id, quantity_on_hand FROM stock_items WHERE organization_id = ? AND product_id = ? AND COALESCE(variant_id,'') = COALESCE(?,'') AND warehouse_id = ?",
        )
        .get(r.organizationId, input.product_id, input.variant_id ?? null, input.warehouse_id) as { id: string; quantity_on_hand: number } | undefined;

      if (!row) {
        const id = newId();
        db.prepare(
          "INSERT INTO stock_items (id, organization_id, product_id, variant_id, warehouse_id, quantity_on_hand) VALUES (?,?,?,?,?,?)",
        ).run(id, r.organizationId, input.product_id, input.variant_id ?? null, input.warehouse_id, Math.max(0, qty));
        row = { id, quantity_on_hand: Math.max(0, qty) };
      } else {
        const newQty = row.quantity_on_hand + qty;
        if (newQty < 0) throw new Error("Insufficient stock");
        db.prepare("UPDATE stock_items SET quantity_on_hand = ?, updated_at = datetime('now') WHERE id = ?").run(newQty, row.id);
      }
      // movement record
      const movId = newId();
      db.prepare(
        `INSERT INTO stock_movements (id, organization_id, product_id, variant_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, notes, batch_number, serial_number, expiry_date, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        movId, r.organizationId, input.product_id, input.variant_id ?? null, input.warehouse_id,
        input.movement_type, Math.abs(input.quantity), input.unit_cost ?? null, "adjustment", input.notes ?? null,
        input.batch_number ?? null, input.serial_number ?? null, input.expiry_date ?? null, r.user.id,
      );
      return movId;
    });
    const movId = tx();
    ok(res, { movementId: movId }, 201);
  } catch (e) {
    next(e);
  }
});

// Transfer between warehouses
inventoryRouter.post("/stock/transfer", authenticate, resolveTenant, requireOrg, requirePermission("inventory.manage"), (req, res, next) => {
  try {
    const schema = z.object({
      product_id: z.string(),
      variant_id: z.string().optional(),
      from_warehouse_id: z.string(),
      to_warehouse_id: z.string(),
      quantity: z.number().positive(),
      notes: z.string().optional(),
    });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const tx = db.transaction(() => {
      // decrement source
      const src = db
        .prepare("SELECT id, quantity_on_hand FROM stock_items WHERE organization_id = ? AND product_id = ? AND COALESCE(variant_id,'') = COALESCE(?,'') AND warehouse_id = ?")
        .get(r.organizationId, input.product_id, input.variant_id ?? null, input.from_warehouse_id) as { id: string; quantity_on_hand: number } | undefined;
      if (!src || src.quantity_on_hand < input.quantity) throw new Error("Insufficient stock in source warehouse");
      db.prepare("UPDATE stock_items SET quantity_on_hand = quantity_on_hand - ?, updated_at = datetime('now') WHERE id = ?").run(input.quantity, src.id);

      // increment dest
      const dst = db
        .prepare("SELECT id FROM stock_items WHERE organization_id = ? AND product_id = ? AND COALESCE(variant_id,'') = COALESCE(?,'') AND warehouse_id = ?")
        .get(r.organizationId, input.product_id, input.variant_id ?? null, input.to_warehouse_id) as { id: string } | undefined;
      if (dst) {
        db.prepare("UPDATE stock_items SET quantity_on_hand = quantity_on_hand + ?, updated_at = datetime('now') WHERE id = ?").run(input.quantity, dst.id);
      } else {
        db.prepare("INSERT INTO stock_items (id, organization_id, product_id, variant_id, warehouse_id, quantity_on_hand) VALUES (?,?,?,?,?,?)").run(
          newId(), r.organizationId, input.product_id, input.variant_id ?? null, input.to_warehouse_id, input.quantity,
        );
      }
      const movId = newId();
      db.prepare(
        `INSERT INTO stock_movements (id, organization_id, product_id, variant_id, warehouse_id, movement_type, quantity, reference_type, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(movId, r.organizationId, input.product_id, input.variant_id ?? null, input.from_warehouse_id, "transfer", input.quantity, "transfer", input.notes ?? null, r.user.id);
      return movId;
    });
    const movId = tx();
    ok(res, { movementId: movId }, 201);
  } catch (e) {
    next(e);
  }
});

