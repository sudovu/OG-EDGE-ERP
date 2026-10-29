import { Router } from "express";
import { z } from "zod";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { ok } from "../../shared/response";
import { hashPassword } from "../../core/auth/password";
import { DEFAULT_ROLES } from "../../core/rbac/permissions";

export const usersRouter = Router();

usersRouter.get("/users", authenticate, resolveTenant, requireOrg, (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.full_name, u.is_active, m.role, m.joined_at
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ? ORDER BY u.full_name`,
    )
    .all(r.organizationId);
  ok(res, rows);
});

usersRouter.post("/users", authenticate, resolveTenant, requireOrg, requirePermission("user.manage"), async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      fullName: z.string().min(1),
      role: z.string().default("viewer"),
    });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    let user = db.prepare("SELECT id FROM users WHERE email = ?").get(input.email) as { id: string } | undefined;
    let userId: string;
    if (!user) {
      userId = newId();
      const hash = await hashPassword(input.password);
      db.prepare("INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)").run(userId, input.email, hash, input.fullName);
    } else {
      userId = user.id;
    }
    db.prepare("INSERT OR IGNORE INTO memberships (id, organization_id, user_id, role) VALUES (?,?,?,?)").run(
      newId(),
      r.organizationId,
      userId,
      input.role,
    );
    // assign role
    const roleRow = db.prepare("SELECT id FROM roles WHERE organization_id = ? AND name = ?").get(r.organizationId, input.role) as { id: string } | undefined;
    if (roleRow) {
      db.prepare("INSERT OR IGNORE INTO user_roles (user_id, organization_id, role_id) VALUES (?,?,?)").run(userId, r.organizationId, roleRow.id);
    }
    ok(res, { userId }, 201);
  } catch (e) {
    next(e);
  }
});

usersRouter.patch("/users/:id/role", authenticate, resolveTenant, requireOrg, requirePermission("user.manage"), (req, res, next) => {
  try {
    const schema = z.object({ role: z.string() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    db.prepare("UPDATE memberships SET role = ? WHERE organization_id = ? AND user_id = ?").run(input.role, r.organizationId, req.params.id);
    // reset user_roles for org
    db.prepare("DELETE FROM user_roles WHERE user_id = ? AND organization_id = ?").run(req.params.id, r.organizationId);
    const roleRow = db.prepare("SELECT id FROM roles WHERE organization_id = ? AND name = ?").get(r.organizationId, input.role) as { id: string } | undefined;
    if (roleRow) {
      db.prepare("INSERT OR IGNORE INTO user_roles (user_id, organization_id, role_id) VALUES (?,?,?)").run(req.params.id, r.organizationId, roleRow.id);
    }
    ok(res, { updated: true });
  } catch (e) {
    next(e);
  }
});

