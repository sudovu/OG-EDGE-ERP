import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { mountRoutes } from "../src/app";
import { apiRouter } from "../src/routes";

const app = createApp();
mountRoutes(app, apiRouter);

describe("Ledger Book", () => {
  it("returns ledger entries for an organization", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "led@test.com",
      password: "password123",
      fullName: "Ledger User",
      organizationName: "Ledger Org",
    });
    expect(res.status).toBe(201);
    const token = res.body.data.token;
    const orgId = res.body.data.organizationId;
    const prod = await request(app).post("/api/v1/products").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({ name: "LP", sku: "LP1" });
    const inv = await request(app).post("/api/v1/invoices").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({
      currency: "NPR",
      lines: [{ product_id: prod.body.data.id, description: "x", quantity: 1, unit_price: 100, tax_rate: 13 }],
    });
    const ap = await request(app).post(`/api/v1/accounting/auto-post/invoice/${inv.body.data.id}`).set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId);
    expect(ap.status).toBe(201);
    const r = await request(app).get("/api/v1/reports/ledger").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).query({ from: "1970-01-01", to: "2999-12-31" });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
    expect(r.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
