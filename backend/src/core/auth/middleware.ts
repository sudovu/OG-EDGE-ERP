import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "./jwt";
import { getDb } from "../../db/database";
import { UnauthorizedError, ForbiddenError } from "../errors";

export interface AuthedRequest extends Request {
  user?: { id: string; email: string; isSuperAdmin: boolean };
  organizationId?: string;
  membershipRole?: string;
}

export function authenticate(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new UnauthorizedError("Missing bearer token"));
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email, isSuperAdmin: payload.isSuperAdmin };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired token"));
  }
}

export function requireSuperAdmin(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (!req.user?.isSuperAdmin) return next(new ForbiddenError("Super admin required"));
  next();
}

// Resolves organization context from X-Organization-Id header or query, validates membership.
export function resolveTenant(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (req.user?.isSuperAdmin && !req.headers["x-organization-id"] && !req.query.orgId) {
    // super admin may operate without tenant; skip
    return next();
  }
  const orgId =
    (req.headers["x-organization-id"] as string | undefined) ??
    (req.query.orgId as string | undefined) ??
    (req.body?.organizationId as string | undefined);
  if (!orgId) return next(new ForbiddenError("Organization context required (X-Organization-Id)"));
  const db = getDb();
  const mem = db
    .prepare("SELECT role, is_active FROM memberships WHERE organization_id = ? AND user_id = ?")
    .get(orgId, req.user!.id) as { role: string; is_active: number } | undefined;
  if (!mem || mem.is_active !== 1) {
    // super admin bypass membership check
    if (!req.user?.isSuperAdmin) return next(new ForbiddenError("Not a member of this organization"));
  }
  req.organizationId = orgId;
  req.membershipRole = mem?.role ?? (req.user?.isSuperAdmin ? "super_admin" : undefined);
  next();
}

export function requireOrg(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (!req.organizationId) return next(new ForbiddenError("Organization context required"));
  next();
}

