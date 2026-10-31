import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { logger } from "../../core/logger";

const crypto = require("node:crypto");

export interface WebhookConfig {
  id: string;
  organization_id: string;
  url: string;
  events: string;
  secret: string | null;
  is_active: number;
}

export function sign(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/** Queue an integration event for delivery (called by business modules). */
export async function queueEvent(params: {
  organizationId: string;
  event: string;
  payload: unknown;
}) {
  const db = getDb();
  await db.prepare(
    `INSERT INTO integration_events (id, organization_id, event, payload_json, status, attempts)
     VALUES (?,?,?,?,?,0)`,
  ).run([newId(), params.organizationId, params.event, JSON.stringify(params.payload), "pending"]);
}

/** Process pending integration events: deliver webhooks with retry + backoff. */
export async function processIntegrationEvents(): Promise<{ processed: number; delivered: number; failed: number }> {
  const db = getDb();
  const now = new Date().toISOString();
  const pending = (await db.prepare(
    `SELECT * FROM integration_events WHERE status = 'pending' AND attempts < 5 ORDER BY created_at ASC LIMIT 100`,
  ).all()) as any[];

  let processed = 0, delivered = 0, failed = 0;

  for (const ev of pending) {
    processed++;
    const webhooks = (await db.prepare("SELECT * FROM webhooks WHERE organization_id = ? AND is_active = 1").all([ev.organization_id])) as WebhookConfig[];
    const matching = webhooks.filter((w) => w.events.split(",").map((e) => e.trim()).includes(ev.event));

    if (matching.length === 0) {
      await db.prepare("UPDATE integration_events SET status = 'delivered', delivered_at = ? WHERE id = ?").run([now, ev.id]);
      delivered++;
      continue;
    }

    let allOk = true;
    for (const w of matching) {
      const body = JSON.stringify({
        event: ev.event,
        timestamp: new Date().toISOString(),
        data: JSON.parse(ev.payload_json ?? "{}"),
      });
      let statusCode: number | null = null;
      let responseBody = "queued";
      try {
        const res = await fetch(w.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(w.secret ? { "X-Signature": sign(body, w.secret) } : {}),
          },
          body,
        });
        statusCode = res.status;
        responseBody = "OK";
      } catch (e: any) {
        allOk = false;
        responseBody = String(e?.message ?? e);
        logger.warn({ eventId: ev.id, webhookId: w.id, err: e?.message }, "webhook dispatch error");
      }
      await db.prepare(
        `INSERT INTO webhook_deliveries (id, webhook_id, event, payload_json, status_code, response_body, attempts, next_run, delivered_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run([newId(), w.id, ev.event, body, statusCode, responseBody, 1, now, now]);
    }

    if (allOk) {
      await db.prepare("UPDATE integration_events SET status = 'delivered', delivered_at = ? WHERE id = ?").run([now, ev.id]);
      delivered++;
    } else {
      const attempts = (ev.attempts ?? 0) + 1;
      const nextRun = new Date(Date.now() + Math.min(300000, 1000 * 2 ** attempts)).toISOString();
      await db.prepare(
        `UPDATE integration_events SET status = 'failed', attempts = ?, last_error = ?, next_run = ? WHERE id = ?`,
      ).run([attempts, "delivery error", nextRun, ev.id]);
      failed++;
    }
  }

  return { processed, delivered, failed };
}

/** Retry previously failed integration events whose next_run has passed. */
export async function retryFailedEvents(): Promise<{ retried: number }> {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = (await db.prepare(
    `SELECT id FROM integration_events WHERE status = 'failed' AND attempts < 5 AND datetime(next_run) <= datetime(?) LIMIT 50`,
  ).all([now])) as any[];
  let retried = 0;
  for (const r of rows) {
    await db.prepare("UPDATE integration_events SET status = 'pending', attempts = attempts WHERE id = ?").run([r.id]);
    retried++;
  }
  return { retried };
}
