import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { mountRoutes } from "../src/app";
import { apiRouter } from "../src/routes";

const app = createApp();
mountRoutes(app, apiRouter);

let token = "";
let orgId = "";

describe("Nepal tax", () => {
  it("setup", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "np2@test.com", password: "password123", fullName: "NP2", organizationName: "NP2 Org",
    });
    expect(res.status).toBe(201);
    token = res.body.data.token;
    orgId = res.body.data.organizationId;
  });

  it("auto-applies 13% VAT on invoice when tax_rate omitted", async () => {
    const prod = await request(app).post("/api/v1/products").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({ name: "P", sku: "P1" });
    const inv = await request(app).post("/api/v1/invoices").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({
      currency: "NPR",
      lines: [{ product_id: prod.body.data.id, description: "x", quantity: 2, unit_price: 100 }],
    });
    expect(inv.status).toBe(201);
    const get = await request(app).get(`/api/v1/invoices/${inv.body.data.id}`).set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId);
    const i = get.body.data;
    expect(i.tax_total).toBe(26); // 200 * 0.13
    expect(i.total).toBe(226);
  });

  it("VAT return report", async () => {
    const r = await request(app).get("/api/v1/reports/vat-return").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId);
    expect(r.status).toBe(200);
    expect(r.body.data.net_vat_payable).toBeGreaterThanOrEqual(0);
  });

  it("TDS on payment + summary", async () => {
    const prod = await request(app).post("/api/v1/products").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({ name: "P2", sku: "P2" });
    const inv = await request(app).post("/api/v1/invoices").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({
      currency: "NPR",
      lines: [{ product_id: prod.body.data.id, description: "x", quantity: 1, unit_price: 100, tax_rate: 13 }],
    });
    const pay = await request(app).post("/api/v1/payments").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({
      invoice_id: inv.body.data.id, payment_type: "customer_receipt", method: "bank", amount: 98.5, currency: "NPR", tds_rate: 1.5,
    });
    expect(pay.status).toBe(201);
    const r = await request(app).get("/api/v1/reports/tds-summary").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId);
    expect(r.status).toBe(200);
  });
});