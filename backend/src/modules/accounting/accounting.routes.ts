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

