import { Router } from "express";
import { z } from "zod";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { ok } from "../../shared/response";
import { ValidationError } from "../../core/errors";
import { nextNumber } from "../../shared/numbering";

export const accountingRouter = Router();

accountingRouter.get("/accounts", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  ok(res, db.prepare("SELECT * FROM accounts WHERE organization_id = ? ORDER BY code").all(r.organizationId));
});

accountingRouter.post("/accounts", authenticate, resolveTenant, requireOrg, requirePermission("accounting.manage"), (req, res, next) => {
  try {
    const schema = z.object({ code: z.string().min(1), name: z.string().min(1), account_type: z.string(), parent_id: z.string().optional() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    db.prepare("INSERT INTO accounts (id, organization_id, code, name, account_type, parent_id) VALUES (?,?,?,?,?,?)").run(
      id, r.organizationId, input.code, input.name, input.account_type, input.parent_id ?? null,
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

// Journal entries
accountingRouter.get("/journal-entries", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = db.prepare("SELECT * FROM journal_entries WHERE organization_id = ? ORDER BY created_at DESC").all(r.organizationId);
  ok(res, rows);
});

const jeLineSchema = z.object({
  account_id: z.string(),
  debit: z.number().optional(),
  credit: z.number().optional(),
  description: z.string().optional(),
});

const jeSchema = z.object({
  entry_date: z.string(),
  description: z.string().optional(),
  source_type: z.string().optional(),
  source_id: z.string().optional(),
  lines: z.array(jeLineSchema).min(2),
});

accountingRouter.post("/journal-entries", authenticate, resolveTenant, requireOrg, requirePermission("accounting.manage"), (req, res, next) => {
  try {
    const input = jeSchema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const totalDebit = input.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = input.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new ValidationError(`Unbalanced journal entry: debit ${totalDebit} != credit ${totalCredit}`);
    }
    const number = nextNumber(r.organizationId, "journal_entry", "JE-");
    const id = newId();
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO journal_entries (id, organization_id, number, entry_date, description, source_type, source_id, is_posted, created_by)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(id, r.organizationId, number, input.entry_date, input.description ?? null, input.source_type ?? null, input.source_id ?? null, 1, r.user.id);
      const stmt = db.prepare("INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, sort_order) VALUES (?,?,?,?,?,?,?)");
      input.lines.forEach((l, i) => {
        stmt.run(newId(), id, l.account_id, l.debit ?? 0, l.credit ?? 0, l.description ?? null, i);
      });
    });
    tx();
    ok(res, { id, number }, 201);
  } catch (e) {
    next(e);
  }
});

accountingRouter.get("/journal-entries/:id", authenticate, resolveTenant, requireOrg, (req, res) => {
  const db = getDb();
  const je = db.prepare("SELECT * FROM journal_entries WHERE id = ?").get(req.params.id);
  if (!je) return (res as any).status(404).json({ success: false, error: { message: "Not found" } });
  const lines = db.prepare("SELECT jl.*, a.code, a.name FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id WHERE jl.journal_entry_id = ? ORDER BY jl.sort_order").all(req.params.id);
  ok(res, { ...(je as any), lines });
});

// Trial balance
accountingRouter.get("/reports/trial-balance", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.id, a.code, a.name, a.account_type,
              COALESCE(SUM(jl.debit),0) as total_debit,
              COALESCE(SUM(jl.credit),0) as total_credit
       FROM accounts a
       LEFT JOIN journal_lines jl ON jl.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE a.organization_id = ? AND (je.is_posted = 1 OR je.id IS NULL)
       GROUP BY a.id ORDER BY a.code`,
    )
    .all(r.organizationId);
  ok(res, rows);
});

// P&L summary
accountingRouter.get("/reports/profit-loss", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const revenue = db
    .prepare(
      `SELECT COALESCE(SUM(jl.credit - jl.debit),0) as amount FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE a.organization_id=? AND a.account_type='revenue' AND je.is_posted=1`,
    )
    .get(r.organizationId) as { amount: number };
  const expense = db
    .prepare(
      `SELECT COALESCE(SUM(jl.debit - jl.credit),0) as amount FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE a.organization_id=? AND a.account_type='expense' AND je.is_posted=1`,
    )
    .get(r.organizationId) as { amount: number };
  ok(res, { revenue: revenue.amount, expense: expense.amount, net: revenue.amount - expense.amount });
});


// Auto-post invoice to accounting: debit AR, credit revenue, credit tax payable
accountingRouter.post("/accounting/auto-post/invoice/:id", authenticate, resolveTenant, requireOrg, requirePermission("accounting.manage"), (req, res, next) => {
  try {
    const r = req as any;
    const db = getDb();
    const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id) as any;
    if (!inv || inv.organization_id !== r.organizationId) throw new Error("Invoice not found");
    const lines = db.prepare("SELECT * FROM invoice_lines WHERE invoice_id = ?").all(req.params.id) as any[];
    // find accounts
    const ar = db.prepare("SELECT id FROM accounts WHERE organization_id = ? AND code = '1200'").get(r.organizationId) as { id: string };
    const rev = db.prepare("SELECT id FROM accounts WHERE organization_id = ? AND code = '4000'").get(r.organizationId) as { id: string };
    const tax = db.prepare("SELECT id FROM accounts WHERE organization_id = ? AND code = '2100'").get(r.organizationId) as { id: string };
    const jeLines: any[] = [
      { account_id: ar.id, debit: inv.total, credit: 0, description: `Invoice ${inv.number}` },
      { account_id: rev.id, debit: 0, credit: inv.subtotal - inv.discount_total, description: `Revenue ${inv.number}` },
    ];
    if (inv.tax_total > 0) {
      jeLines.push({ account_id: tax.id, debit: 0, credit: inv.tax_total, description: `Tax ${inv.number}` });
    }
    const number = nextNumber(r.organizationId, "journal_entry", "JE-");
    const id = newId();
    const tx = db.transaction(() => {
      db.prepare("INSERT INTO journal_entries (id, organization_id, number, entry_date, description, source_type, source_id, is_posted, created_by) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(id, r.organizationId, number, new Date().toISOString().slice(0, 10), `Auto-post invoice ${inv.number}`, "invoice", inv.id, 1, r.user.id);
      const stmt = db.prepare("INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, sort_order) VALUES (?,?,?,?,?,?,?)");
      jeLines.forEach((l, i) => stmt.run(newId(), id, l.account_id, l.debit, l.credit, l.description, i));
    });
    tx();
    ok(res, { id, number }, 201);
  } catch (e) {
    next(e);
  }
});

// Auto-post payment: debit cash, credit AR
accountingRouter.post("/accounting/auto-post/payment/:id", authenticate, resolveTenant, requireOrg, requirePermission("accounting.manage"), (req, res, next) => {
  try {
    const r = req as any;
    const db = getDb();
    const pay = db.prepare("SELECT * FROM payments WHERE id = ?").get(req.params.id) as any;
    if (!pay || pay.organization_id !== r.organizationId) throw new Error("Payment not found");
    const cash = db.prepare("SELECT id FROM accounts WHERE organization_id = ? AND code = '1000'").get(r.organizationId) as { id: string };
    const ar = db.prepare("SELECT id FROM accounts WHERE organization_id = ? AND code = '1200'").get(r.organizationId) as { id: string };
    const number = nextNumber(r.organizationId, "journal_entry", "JE-");
    const id = newId();
    const tx = db.transaction(() => {
      db.prepare("INSERT INTO journal_entries (id, organization_id, number, entry_date, description, source_type, source_id, is_posted, created_by) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(id, r.organizationId, number, new Date().toISOString().slice(0, 10), `Auto-post payment ${pay.id}`, "payment", pay.id, 1, r.user.id);
      const stmt = db.prepare("INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, sort_order) VALUES (?,?,?,?,?,?,?)");
      stmt.run(newId(), id, cash.id, pay.amount, 0, "Cash received", 0);
      stmt.run(newId(), id, ar.id, 0, pay.amount, "AR cleared", 1);
    });
    tx();
    ok(res, { id, number }, 201);
  } catch (e) {
    next(e);
  }
});

// Accounting periods
accountingRouter.get("/accounting/periods", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  ok(res, db.prepare("SELECT * FROM accounting_periods WHERE organization_id = ? ORDER BY start_date DESC").all(r.organizationId));
});

accountingRouter.post("/accounting/periods", authenticate, resolveTenant, requireOrg, requirePermission("accounting.manage"), (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().min(1), start_date: z.string(), end_date: z.string() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    db.prepare("INSERT INTO accounting_periods (id, organization_id, name, start_date, end_date) VALUES (?,?,?,?,?)").run(id, r.organizationId, input.name, input.start_date, input.end_date);
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

accountingRouter.post("/accounting/periods/:id/close", authenticate, resolveTenant, requireOrg, requirePermission("accounting.manage"), (req, res, next) => {
  try {
    const r = req as any;
    const db = getDb();
    db.prepare("UPDATE accounting_periods SET is_closed = 1, closed_at = datetime('now'), closed_by = ? WHERE id = ? AND organization_id = ?").run(r.user.id, req.params.id, r.organizationId);
    ok(res, { closed: true });
  } catch (e) {
    next(e);
  }
});

// Approvals
accountingRouter.get("/approvals", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  ok(res, db.prepare("SELECT * FROM approval_requests WHERE organization_id = ? ORDER BY created_at DESC").all(r.organizationId));
});

accountingRouter.post("/approvals", authenticate, resolveTenant, requireOrg, (req, res, next) => {
  try {
    const schema = z.object({ entity_type: z.string(), entity_id: z.string(), approver_id: z.string().optional(), notes: z.string().optional() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    db.prepare("INSERT INTO approval_requests (id, organization_id, entity_type, entity_id, requested_by, approver_id, notes) VALUES (?,?,?,?,?,?,?)").run(id, r.organizationId, input.entity_type, input.entity_id, r.user.id, input.approver_id ?? null, input.notes ?? null);
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

accountingRouter.post("/approvals/:id/decide", authenticate, resolveTenant, requireOrg, (req, res, next) => {
  try {
    const schema = z.object({ status: z.enum(["approved", "rejected"]), notes: z.string().optional() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    db.prepare("UPDATE approval_requests SET status = ?, notes = COALESCE(?, notes), decided_at = datetime('now') WHERE id = ? AND organization_id = ?").run(input.status, input.notes ?? null, req.params.id, r.organizationId);
    ok(res, { decided: true });
  } catch (e) {
    next(e);
  }
});

// Receivables aging
accountingRouter.get("/reports/receivables-aging", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = db.prepare(
    `SELECT c.id, c.name, i.number, i.total, i.amount_due, i.due_date,
            CAST(julianday('now') - julianday(i.due_date) AS INTEGER) as days_overdue
     FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.organization_id = ? AND i.amount_due > 0
     ORDER BY i.due_date`,
  ).all(r.organizationId);
  ok(res, rows);
});

// Payables aging (supplier invoices not tracked separately; use purchase orders received unpaid approximation)
accountingRouter.get("/reports/payables-aging", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = db.prepare(
    `SELECT s.id, s.name, po.number, po.total, po.status, po.expected_date
     FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
     WHERE po.organization_id = ? AND po.status IN ('ordered','received')
     ORDER BY po.expected_date`,
  ).all(r.organizationId);
  ok(res, rows);
});
