import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { mountRoutes } from "../src/app";
import { apiRouter } from "../src/routes";

const app = createApp();
mountRoutes(app, apiRouter);

describe("Financial statements", () => {
  it("returns balance sheet and cash flow", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "fin@test.com",
      password: "password123",
      fullName: "Fin User",
      organizationName: "Fin Org",
    });
    expect(res.status).toBe(201);
    const token = res.body.data.token;
    const orgId = res.body.data.organizationId;
    const prod = await request(app).post("/api/v1/products").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({ name: "FP", sku: "FP1" });
    const inv = await request(app).post("/api/v1/invoices").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({
      currency: "NPR",
      lines: [{ product_id: prod.body.data.id, description: "x", quantity: 1, unit_price: 100, tax_rate: 13 }],
    });
    const ap = await request(app).post(`/api/v1/accounting/auto-post/invoice/${inv.body.data.id}`).set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId);
    expect(ap.status).toBe(201);

    const bs = await request(app).get("/api/v1/reports/balance-sheet").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId);
    expect(bs.status).toBe(200);
    expect(bs.body.data).toHaveProperty("assets");
    expect(bs.body.data).toHaveProperty("liabilities");
    expect(bs.body.data).toHaveProperty("equity");
    expect(bs.body.data.balanced).toBe(true);

    const cf = await request(app).get("/api/v1/reports/cash-flow").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId);
    expect(cf.status).toBe(200);
    expect(cf.body.data).toHaveProperty("net_cash_flow");
  });
});
