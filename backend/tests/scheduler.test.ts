import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { mountRoutes } from "../src/app";
import { apiRouter } from "../src/routes";

const app = createApp();
mountRoutes(app, apiRouter);

describe("Scheduler", () => {
  it("returns scheduler status and can run a tick", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "sch@test.com",
      password: "password123",
      fullName: "Scheduler User",
      organizationName: "Scheduler Org",
    });
    expect(res.status).toBe(201);
    const token = res.body.data.token;
    const orgId = res.body.data.organizationId;

    // status
    const st = await request(app)
      .get("/api/v1/scheduler/status")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId);
    expect(st.status).toBe(200);
    expect(st.body.data).toHaveProperty("running");
    expect(st.body.data).toHaveProperty("intervalMs");

    // run-now
    const rn = await request(app)
      .post("/api/v1/scheduler/run-now")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId);
    expect(rn.status).toBe(200);
    expect(rn.body.data.lastRun.processed).toBeGreaterThanOrEqual(0);
  });

  it("start/stop scheduler", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "sch2@test.com",
      password: "password123",
      fullName: "Scheduler2 User",
      organizationName: "Scheduler2 Org",
    });
    expect(res.status).toBe(201);
    const token = res.body.data.token;
    const orgId = res.body.data.organizationId;

    const start = await request(app)
      .post("/api/v1/scheduler/start")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId)
      .send({ interval_ms: 10000 });
    expect(start.status).toBe(200);
    expect(start.body.data.started).toBe(true);

    const st = await request(app)
      .get("/api/v1/scheduler/status")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId);
    expect(st.status).toBe(200);

    const stop = await request(app)
      .post("/api/v1/scheduler/stop")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId);
    expect(stop.status).toBe(200);
    expect(stop.body.data.stopped).toBe(true);
  });
});

describe("Nepal VAT return form + TDS certificate", () => {
  it("generates VAT return form", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "vat@test.com",
      password: "password123",
      fullName: "VAT User",
      organizationName: "VAT Org",
    });
    expect(res.status).toBe(201);
    const token = res.body.data.token;
    const orgId = res.body.data.organizationId;

    // create product + invoice with VAT
    const prod = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId)
      .send({ name: "VATP", sku: "VATP1" });
    const inv = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId)
      .send({ currency: "NPR", lines: [{ product_id: prod.body.data.id, description: "x", quantity: 2, unit_price: 100, tax_rate: 13 }] });
    expect(inv.status).toBe(201);

    const vat = await request(app)
      .get("/api/v1/reports/vat-return-form?from=1970-01-01&to=2999-12-31")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId);
    expect(vat.status).toBe(200);
    expect(vat.body.data.form).toBe("VAT Return");
    expect(vat.body.data.output_vat.output_vat).toBe(26); // 200 * 13%
    expect(vat.body.data.net_vat_payable).toBe(26);
  });

  it("generates TDS certificate", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "tds@test.com",
      password: "password123",
      fullName: "TDS User",
      organizationName: "TDS Org",
    });
    expect(res.status).toBe(201);
    const token = res.body.data.token;
    const orgId = res.body.data.organizationId;

    const prod = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId)
      .send({ name: "TDSP", sku: "TDSP1" });
    const inv = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId)
      .send({ currency: "NPR", lines: [{ product_id: prod.body.data.id, description: "x", quantity: 1, unit_price: 100, tax_rate: 13 }] });
    const pay = await request(app)
      .post("/api/v1/payments")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId)
      .send({ invoice_id: inv.body.data.id, payment_type: "customer_receipt", method: "bank", amount: 98.5, currency: "NPR", tds_rate: 1.5 });
    expect(pay.status).toBe(201);

    const tds = await request(app)
      .get("/api/v1/reports/tds-certificate?from=1970-01-01&to=2999-12-31")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Organization-Id", orgId);
    expect(tds.status).toBe(200);
    expect(tds.body.data.form).toBe("TDS Certificate");
    expect(tds.body.data.total_tds_deducted).toBeGreaterThan(0);
    expect(Array.isArray(tds.body.data.entries)).toBe(true);
  });
});
