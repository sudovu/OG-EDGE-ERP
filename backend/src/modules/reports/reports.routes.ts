import { Router } from "express";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { ok } from "../../shared/response";

export const reportsRouter = Router();

reportsRouter.get("/reports/dashboard", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const orgId = r.organizationId;
  const customers = (db.prepare("SELECT COUNT(*) as c FROM customers WHERE organization_id = ?").get(orgId) as any).c;
  const products = (db.prepare("SELECT COUNT(*) as c FROM products WHERE organization_id = ?").get(orgId) as any).c;
  const invoices = (db.prepare("SELECT COUNT(*) as c FROM invoices WHERE organization_id = ?").get(orgId) as any).c;
  const revenue = (db.prepare("SELECT COALESCE(SUM(total),0) as s FROM invoices WHERE organization_id = ?").get(orgId) as any).s;
  const outstanding = (db.prepare("SELECT COALESCE(SUM(amount_due),0) as s FROM invoices WHERE organization_id = ?").get(orgId) as any).s;
  const serviceRequests = (db.prepare("SELECT COUNT(*) as c FROM service_requests WHERE organization_id = ?").get(orgId) as any).c;
  const stockValue = (db.prepare(
    `SELECT COALESCE(SUM(si.quantity_on_hand * COALESCE(p_cost.amount,0)),0) as s
     FROM stock_items si JOIN products p ON p.id=si.product_id
     LEFT JOIN prices p_cost ON p_cost.product_id=p.id AND p_cost.price_type='cost'
     WHERE si.organization_id=?`,
  ).get(orgId) as any).s;
  ok(res, { customers, products, invoices, revenue, outstanding, serviceRequests, stockValue });
});

reportsRouter.get("/reports/sales-summary", authenticate, resolveTenant, requireOrg, requirePermission("report.read"), (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(total),0) as total FROM invoices WHERE organization_id = ? GROUP BY status`,
    )
    .all(r.organizationId);
  ok(res, rows);
});

