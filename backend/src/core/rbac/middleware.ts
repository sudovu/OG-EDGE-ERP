import type { Request, Response, NextFunction } from "express";
import { getDb } from "../../db/database";
import { ForbiddenError } from "../errors";
import type { AuthedRequest } from "../auth/middleware";

export function hasPermission(userId: string, orgId: string, permission: string): boolean {
  const db = getDb();
  // super admin check
  const u = db.prepare("SELECT is_super_admin FROM users WHERE id = ?").get(userId) as { is_super_admin: number } | undefined;
  if (u?.is_super_admin === 1) return true;
  const rows = db
    .prepare(
      `SELECT p.code FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = ? AND ur.organization_id = ?`,
    )
    .all(userId, orgId) as { code: string }[];
  return rows.some((r) => r.code === permission);
}

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const r = req as AuthedRequest;
    if (!r.user) return next(new ForbiddenError("Authentication required"));
    if (!r.organizationId) {
      // allow super admin without org for global endpoints
      if (r.user.isSuperAdmin) return next();
      return next(new ForbiddenError("Organization context required"));
    }
    if (!hasPermission(r.user.id, r.organizationId, permission)) {
      return next(new ForbiddenError(`Missing permission: ${permission}`));
    }
    next();
  };
}

