import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../core/auth/middleware";
import { registerUser, loginUser } from "./auth.service";
import { ok, fail } from "../../shared/response";
import { getDb } from "../../db/database";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  organizationName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post("/auth/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await registerUser(input);
    ok(res, result, 201);
  } catch (e) {
    next(e);
  }
});

authRouter.post("/auth/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await loginUser(input.email, input.password);
    ok(res, result);
  } catch (e) {
    next(e);
  }
});

authRouter.get("/auth/me", authenticate, async (req, res) => {
  const r = req as any;
  const db = getDb();
  const user = await db.prepare("SELECT id, email, full_name, is_super_admin FROM users WHERE id = ?").get([r.user.id]);
  const memberships = await db.prepare("SELECT organization_id, role FROM memberships WHERE user_id = ? AND is_active = 1").all([r.user.id]);
  ok(res, { user, memberships });
});

