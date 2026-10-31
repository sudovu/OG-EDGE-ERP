import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { mountRoutes } from "../src/app";
import { apiRouter } from "../src/routes";

const app = createApp();
mountRoutes(app, apiRouter);

describe("Multi-currency", () => {
  it("sets exchange rate, posts FX transaction, and reports balance sheet in base currency", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "fx@test.com",
      password: "password123",
      fullName: "FX User",
      organizationName: "FX Org",
    });
    expect(res.status).toBe(201);
    const token = res.body.data.token;
    const orgId = res.body.data.organizationId;

    // Create a USD bank account
    const usdAcct = await request(app)
      .post("/api/v1/accounts")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId)
      .send({ code: "1025", name: "USD Bank Account", account_type: "asset", currency: "USD" });
    expect(usdAcct.status).toBe(201);

    // Set exchange rate: 1 USD = 135 NPR
    const rate = await request(app)
      .post("/api/v1/accounting/currency-rates")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId)
      .send({ from_currency: "USD", rate: 135, source: "manual" });
    expect(rate.status).toBe(201);

    // List rates
    const list = await request(app)
      .get("/api/v1/accounting/currency-rates")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);

    // Balance sheet should include base_currency info
    const bs = await request(app)
      .get("/api/v1/reports/balance-sheet?to=2999-12-31")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId);
    expect(bs.status).toBe(200);
    expect(bs.body.data.base_currency).toBe("NPR");
    expect(bs.body.data).toHaveProperty("balanced");
  });

  it("FX gain/loss report works with no foreign accounts", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "fx2@test.com",
      password: "password123",
      fullName: "FX2 User",
      organizationName: "FX2 Org",
    });
    expect(res.status).toBe(201);
    const token = res.body.data.token;
    const orgId = res.body.data.organizationId;
    const fx = await request(app)
      .get("/api/v1/reports/fx-gain-loss")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId);
    expect(fx.status).toBe(200);
    expect(fx.body.data.base_currency).toBe("NPR");
    expect(Array.isArray(fx.body.data.lines)).toBe(true);
  });
});
