import { Router } from "express";
import { z } from "zod";
import { authenticate, resolveTenant, requireOrg } from "../../core/auth/middleware";
import { requirePermission } from "../../core/rbac/middleware";
import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { ok, paginated } from "../../shared/response";
import { parsePagination } from "../../shared/pagination";
import { processIntegrationEvents, retryFailedEvents } from "../webhooks/webhook.service";
import crypto from "node:crypto";

export const integrationsRouter = Router();

// API keys
integrationsRouter.get("/api-keys", authenticate, resolveTenant, requireOrg, requirePermission("org.manage"), (req, res) => {
  const r = req as any;
  const db = getDb();
  ok(res, db.prepare("SELECT id, name, key_prefix, scopes, is_active, last_used_at, created_at FROM api_keys WHERE organization_id = ?").all(r.organizationId));
});

integrationsRouter.post("/api-keys", authenticate, resolveTenant, requireOrg, requirePermission("org.manage"), (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().min(1), scopes: z.string().optional() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const rawKey = "ogk_" + crypto.randomBytes(24).toString("hex");
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const id = newId();
    db.prepare("INSERT INTO api_keys (id, organization_id, name, key_hash, key_prefix, scopes, created_by) VALUES (?,?,?,?,?,?,?)").run(
      id, r.organizationId, input.name, keyHash, rawKey.slice(0, 8), input.scopes ?? null, r.user.id,
    );
    ok(res, { id, apiKey: rawKey }, 201); // shown once
  } catch (e) {
    next(e);
  }
});

integrationsRouter.delete("/api-keys/:id", authenticate, resolveTenant, requireOrg, requirePermission("org.manage"), (req, res) => {
  const db = getDb();
  db.prepare("UPDATE api_keys SET is_active = 0 WHERE id = ?").run(req.params.id);
  ok(res, { revoked: true });
});

// Webhooks
integrationsRouter.get("/webhooks", authenticate, resolveTenant, requireOrg, requirePermission("org.manage"), (req, res) => {
  const r = req as any;
  const db = getDb();
  ok(res, db.prepare("SELECT id, url, events, is_active, created_at FROM webhooks WHERE organization_id = ?").all(r.organizationId));
});

integrationsRouter.post("/webhooks", authenticate, resolveTenant, requireOrg, requirePermission("org.manage"), (req, res, next) => {
  try {
    const schema = z.object({ url: z.string().url(), events: z.string(), secret: z.string().optional() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    db.prepare("INSERT INTO webhooks (id, organization_id, url, events, secret) VALUES (?,?,?,?,?)").run(id, r.organizationId, input.url, input.events, input.secret ?? null);
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

integrationsRouter.delete("/webhooks/:id", authenticate, resolveTenant, requireOrg, requirePermission("org.manage"), (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM webhooks WHERE id = ?").run(req.params.id);
  ok(res, { deleted: true });
});

// Background jobs
integrationsRouter.get("/jobs", authenticate, resolveTenant, requireOrg, requirePermission("org.manage"), (req, res) => {
  const r = req as any;
  const db = getDb();
  const { page, pageSize, offset } = parsePagination(req.query as any);
  const total = (db.prepare("SELECT COUNT(*) as c FROM background_jobs WHERE organization_id = ?").get(r.organizationId) as any).c;
  const rows = db.prepare("SELECT * FROM background_jobs WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?").all(r.organizationId, pageSize, offset);
  paginated(res, rows, total, page, pageSize);
});

integrationsRouter.post("/jobs", authenticate, resolveTenant, requireOrg, requirePermission("org.manage"), (req, res, next) => {
  try {
    const schema = z.object({ job_type: z.string(), payload: z.any().optional(), run_at: z.string().optional() });
    const input = schema.parse(req.body);
    const r = req as any;
    const db = getDb();
    const id = newId();
    db.prepare("INSERT INTO background_jobs (id, organization_id, job_type, payload_json, run_at) VALUES (?,?,?,?,COALESCE(?, datetime('now')))").run(
      id, r.organizationId, input.job_type, input.payload ? JSON.stringify(input.payload) : null, input.run_at ?? null,
    );
    ok(res, { id }, 201);
  } catch (e) {
    next(e);
  }
});

// Simple job processor endpoint (run pending jobs of a type) - demo
integrationsRouter.post("/jobs/process", authenticate, resolveTenant, requireOrg, requirePermission("org.manage"), (req, res) => {
  const r = req as any;
  const db = getDb();
  const pending = db.prepare("SELECT * FROM background_jobs WHERE organization_id = ? AND status = 'pending' AND datetime(run_at) <= datetime('now')").all(r.organizationId) as any[];
  let processed = 0;
  for (const job of pending) {
    try {
      db.prepare("UPDATE background_jobs SET status = 'running', started_at = datetime('now'), attempts = attempts + 1 WHERE id = ?").run(job.id);
      // demo: mark completed
      db.prepare("UPDATE background_jobs SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(job.id);
      processed++;
    } catch (e: any) {
      db.prepare("UPDATE background_jobs SET status = 'failed', error = ? WHERE id = ?").run(String(e?.message ?? e), job.id);
    }
  }
  ok(res, { processed });
});

// Process pending integration events (webhook deliveries with retry)
integrationsRouter.post("/jobs/process-events", authenticate, resolveTenant, requireOrg, requirePermission("org.manage"), async (_req, res) => {
  const result = await processIntegrationEvents();
  ok(res, result);
});

// Retry failed integration events whose next_run has passed
integrationsRouter.post("/jobs/retry-events", authenticate, resolveTenant, requireOrg, requirePermission("org.manage"), (_req, res) => {
  const result = retryFailedEvents();
  ok(res, result);
});

// Webhook deliveries log
integrationsRouter.get("/webhook-deliveries", authenticate, resolveTenant, requireOrg, requirePermission("org.manage"), (req, res) => {
  const r = req as any;
  const db = getDb();
  const rows = db.prepare("SELECT * FROM webhook_deliveries WHERE webhook_id IN (SELECT id FROM webhooks WHERE organization_id = ?) ORDER BY delivered_at DESC LIMIT 100").all(r.organizationId) as any[];
  ok(res, rows);
});