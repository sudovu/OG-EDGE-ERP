import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { mountRoutes } from "../src/app";
import { apiRouter } from "../src/routes";

const app = createApp();
mountRoutes(app, apiRouter);

describe("Webhook delivery", () => {
  it("creates webhook, triggers event via invoice, processes delivery", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "wh@test.com",
      password: "password123",
      fullName: "WH User",
      organizationName: "WH Org",
    });
    expect(res.status).toBe(201);
    const token = res.body.data.token;
    const orgId = res.body.data.organizationId;

    // create webhook pointing to a dummy local URL (delivery will attempt; network may fail, but event queued)
    const w = await request(app)
      .post("/api/v1/webhooks")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId)
      .send({ url: "http://127.0.0.1:9/webhook", events: "invoice.created" });
    expect(w.status).toBe(201);

    const prod = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId)
      .send({ name: "WP", sku: "WP1" });
    const inv = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId)
      .send({ currency: "NPR", lines: [{ product_id: prod.body.data.id, description: "x", quantity: 1, unit_price: 100, tax_rate: 13 }] });
    expect(inv.status).toBe(201);

    // process events: queues delivery record even if endpoint unreachable
    const proc = await request(app)
      .post("/api/v1/jobs/process-events")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId);
    expect(proc.status).toBe(200);

    const dels = await request(app)
      .get("/api/v1/webhook-deliveries")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId);
    expect(dels.status).toBe(200);
    expect(dels.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
