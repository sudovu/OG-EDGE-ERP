import { Router } from "express";
import { z } from "zod";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { ok, paginated } from "../../shared/response";
import { parsePagination } from "../../shared/pagination";

export const catalogRouter = Router();

// Units
catalogRouter.get("/units", authenticate, resolveTenant, requireOrg, async (req, res) => {
  const r = req as any;
  const db = getDb();
  ok(res, await db.prepare("SELECT * FROM units WHERE organization_id = ? ORDER BY name").all([r.organizationId]));
});

catalogRouter.post("/units", authenticate, resolveTenant, requireOrg, requirePermission("catalog.manage"), async (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().min(1), symbol: z.string().min(1), unit_type: z.string().optional() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    await db.prepare("INSERT INTO units (id, organization_id, name, symbol, unit_type) VALUES (?,?,?,?,?)").run(
      [id, r.organizationId, input.name, input.symbol, input.unit_type ?? "count"],
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

// Categories
catalogRouter.get("/categories", authenticate, resolveTenant, requireOrg, async (req, res) => {
  const r = req as any;
  const db = getDb();
  ok(res, await db.prepare("SELECT * FROM categories WHERE organization_id = ? ORDER BY sort_order, name").all([r.organizationId]));
});

catalogRouter.post("/categories", authenticate, resolveTenant, requireOrg, requirePermission("catalog.manage"), async (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().min(1), description: z.string().optional(), parent_id: z.string().optional(), sort_order: z.number().optional() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    await db.prepare("INSERT INTO categories (id, organization_id, parent_id, name, description, sort_order) VALUES (?,?,?,?,?,?)").run(
      [id, r.organizationId, input.parent_id ?? null, input.name, input.description ?? null, input.sort_order ?? 0],
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

catalogRouter.patch("/categories/:id", authenticate, resolveTenant, requireOrg, requirePermission("catalog.manage"), async (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().optional(), description: z.string().optional(), parent_id: z.string().nullable().optional(), sort_order: z.number().optional(), is_active: z.number().optional() });
    const input = schema.parse(req.body);
    const db = getDb();
    const fields = Object.keys(input);
    if (fields.length === 0) return ok(res, { updated: false });
    const setClause = fields.map((f) => `${f} = ?`).join(", ") + ", updated_at = datetime('now')";
    const values = fields.map((f) => (input as any)[f]);
    await db.prepare(`UPDATE categories SET ${setClause} WHERE id = ?`).run([...values, req.params.id]);
    ok(res, { updated: true });
  } catch (e) {
    next(e);
  }
});

// Products
catalogRouter.get("/products", authenticate, resolveTenant, requireOrg, async (req, res) => {
  const r = req as any;
  const db = getDb();
  const { page, pageSize, offset } = parsePagination(req.query as any);
  const total = (await db.prepare("SELECT COUNT(*) as c FROM products WHERE organization_id = ?").get([r.organizationId])) as any;
  const rows = await db.prepare("SELECT * FROM products WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?").all([r.organizationId, pageSize, offset]);
  paginated(res, rows, total.c, page, pageSize);
});

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  item_type: z.string().optional(),
  category_id: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  model_number: z.string().optional(),
  unit_id: z.string().optional(),
  track_inventory: z.number().optional(),
  track_serial: z.number().optional(),
  track_batch: z.number().optional(),
  track_expiry: z.number().optional(),
  attributes_json: z.string().optional(),
});

catalogRouter.post("/products", authenticate, resolveTenant, requireOrg, requirePermission("catalog.manage"), async (req, res, next) => {
  try {
    const input = productSchema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    await db.prepare(
      `INSERT INTO products (id, organization_id, category_id, name, description, item_type, sku, barcode, model_number, unit_id, track_inventory, track_serial, track_batch, track_expiry, attributes_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run([
      id,
      r.organizationId,
      input.category_id ?? null,
      input.name,
      input.description ?? null,
      input.item_type ?? "product",
      input.sku ?? null,
      input.barcode ?? null,
      input.model_number ?? null,
      input.unit_id ?? null,
      input.track_inventory ?? 1,
      input.track_serial ?? 0,
      input.track_batch ?? 0,
      input.track_expiry ?? 0,
      input.attributes_json ?? null,
    ]);
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

catalogRouter.get("/products/:id", authenticate, resolveTenant, requireOrg, async (req, res) => {
  const db = getDb();
  const row = await db.prepare("SELECT * FROM products WHERE id = ?").get([req.params.id]);
  if (!row) return (res as any).status(404).json({ success: false, error: { message: "Not found" } });
  const variants = await db.prepare("SELECT * FROM product_variants WHERE product_id = ?").all([req.params.id]);
  const prices = await db.prepare("SELECT * FROM prices WHERE product_id = ?").all([req.params.id]);
  ok(res, { ...(row as any), variants, prices });
});

catalogRouter.patch("/products/:id", authenticate, resolveTenant, requireOrg, requirePermission("catalog.manage"), async (req, res, next) => {
  try {
    const input = productSchema.partial().parse(req.body);
    const db = getDb();
    const fields = Object.keys(input);
    if (fields.length === 0) return ok(res, { updated: false });
    const setClause = fields.map((f) => `${f} = ?`).join(", ") + ", updated_at = datetime('now')";
    const values = fields.map((f) => (input as any)[f]);
    await db.prepare(`UPDATE products SET ${setClause} WHERE id = ?`).run([...values, req.params.id]);
    ok(res, { updated: true });
  } catch (e) {
    next(e);
  }
});

// Variants
catalogRouter.post("/products/:id/variants", authenticate, resolveTenant, requireOrg, requirePermission("catalog.manage"), async (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().min(1), sku: z.string().optional(), barcode: z.string().optional(), attributes_json: z.string().optional(), price_override: z.number().optional(), cost_override: z.number().optional() });
    const input = schema.parse(req.body);
    const db = getDb();
    const id = newId();
    await db.prepare("INSERT INTO product_variants (id, product_id, name, sku, barcode, attributes_json, price_override, cost_override) VALUES (?,?,?,?,?,?,?,?)").run(
      [id, req.params.id, input.name, input.sku ?? null, input.barcode ?? null, input.attributes_json ?? null, input.price_override ?? null, input.cost_override ?? null],
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

// Prices
catalogRouter.post("/prices", authenticate, resolveTenant, requireOrg, requirePermission("catalog.manage"), async (req, res, next) => {
  try {
    const schema = z.object({
      product_id: z.string(),
      variant_id: z.string().optional(),
      price_list_id: z.string().optional(),
      price_type: z.string().optional(),
      amount: z.number(),
      currency: z.string(),
      min_quantity: z.number().optional(),
    });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    await db.prepare(
      "INSERT INTO prices (id, organization_id, product_id, variant_id, price_list_id, price_type, amount, currency, min_quantity) VALUES (?,?,?,?,?,?,?,?,?)",
    ).run(
      [id, r.organizationId, input.product_id, input.variant_id ?? null, input.price_list_id ?? null,
        input.price_type ?? "sell", input.amount, input.currency, input.min_quantity ?? 1],
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

// Price lists
catalogRouter.get("/price-lists", authenticate, resolveTenant, requireOrg, async (req, res) => {
  const r = req as any;
  const db = getDb();
  ok(res, await db.prepare("SELECT * FROM price_lists WHERE organization_id = ?").all([r.organizationId]));
});
