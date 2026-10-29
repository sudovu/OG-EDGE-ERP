import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { mountRoutes } from "../src/app";
import { apiRouter } from "../src/routes";

const app = createApp();
mountRoutes(app, apiRouter);

// Reuse org from api.test? Tests share DB but variables not shared. Re-register a fresh org for isolation.
let token = "";
let orgId = "";

describe("Milestone 4", () => {
  it("setup org", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "m4@test.com",
      password: "password123",
      fullName: "M4 User",
      organizationName: "M4 Org",
    });
    expect(res.status).toBe(201);
    token = res.body.data.token;
    orgId = res.body.data.organizationId;
  });

  it("workflow transition executes", async () => {
    // create sales order (status draft)
    const prod = await request(app).post("/api/v1/products").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({ name: "P", sku: "P1" });
    const so = await request(app).post("/api/v1/sales-orders").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({
      currency: "USD",
      lines: [{ product_id: prod.body.data.id, description: "x", quantity: 1, unit_price: 10 }],
    });
    expect(so.status).toBe(201);
    const id = so.body.data.id;
    const tr = await request(app).post("/api/v1/workflows/transition").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({
      entityType: "sales_order", entityId: id, toState: "confirmed",
    });
    expect(tr.status).toBe(200);
    expect(tr.body.data.to).toBe("confirmed");
    // invalid transition
    const bad = await request(app).post("/api/v1/workflows/transition").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({
      entityType: "sales_order", entityId: id, toState: "draft",
    });
    expect(bad.status).not.toBe(200);
  });

  it("service billing creates invoice", async () => {
    const sr = await request(app).post("/api/v1/service-requests").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({
      title: "Repair", priority: "normal", currency: "USD", estimated_cost: 50,
    });
    expect(sr.status).toBe(201);
    const id = sr.body.data.id;
    // add work order with labor line
    const wo = await request(app).post("/api/v1/work-orders").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({
      service_request_id: id,
      title: "WO1",
      lines: [{ line_type: "labor", description: "Labor", quantity: 2, unit_cost: 25 }],
    });
    expect(wo.status).toBe(201);
    const bill = await request(app).post(`/api/v1/service-requests/${id}/bill`).set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId);
    expect(bill.status).toBe(201);
    const inv = await request(app).get(`/api/v1/invoices/${bill.body.data.id}`).set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId);
    expect(inv.body.data.total).toBe(50);
  });

  it("accounting auto-post invoice and payment", async () => {
    const prod = await request(app).post("/api/v1/products").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({ name: "X", sku: "X1" });
    const inv = await request(app).post("/api/v1/invoices").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({
      currency: "USD",
      lines: [{ product_id: prod.body.data.id, description: "x", quantity: 1, unit_price: 100, tax_rate: 10 }],
    });
    expect(inv.status).toBe(201);
    const invoiceId = inv.body.data.id;
    const ap = await request(app).post(`/api/v1/accounting/auto-post/invoice/${invoiceId}`).set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId);
    expect(ap.status).toBe(201);
    // payment
    const pay = await request(app).post("/api/v1/payments").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({
      invoice_id: invoiceId, payment_type: "customer_receipt", method: "cash", amount: 110, currency: "USD",
    });
    expect(pay.status).toBe(201);
    const ap2 = await request(app).post(`/api/v1/accounting/auto-post/payment/${pay.body.data.id}`).set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId);
    expect(ap2.status).toBe(201);
  });

  it("integrations: api key, webhook, job", async () => {
    const key = await request(app).post("/api/v1/api-keys").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({ name: "Test Key" });
    expect(key.status).toBe(201);
    expect(key.body.data.apiKey).toMatch(/^ogk_/);
    const wh = await request(app).post("/api/v1/webhooks").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({ url: "https://example.com/hook", events: "invoice.created" });
    expect(wh.status).toBe(201);
    const job = await request(app).post("/api/v1/jobs").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({ job_type: "demo" });
    expect(job.status).toBe(201);
    const proc = await request(app).post("/api/v1/jobs/process").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId);
    expect(proc.status).toBe(200);
    expect(proc.body.data.processed).toBeGreaterThanOrEqual(1);
  });

  it("accounting periods and approvals", async () => {
    const per = await request(app).post("/api/v1/accounting/periods").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({ name: "Q1", start_date: "2026-01-01", end_date: "2026-03-31" });
    expect(per.status).toBe(201);
    const close = await request(app).post(`/api/v1/accounting/periods/${per.body.data.id}/close`).set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId);
    expect(close.status).toBe(200);
    const appr = await request(app).post("/api/v1/approvals").set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({ entity_type: "invoice", entity_id: "x" });
    expect(appr.status).toBe(201);
    const dec = await request(app).post(`/api/v1/approvals/${appr.body.data.id}/decide`).set("Authorization", `Bearer ${token}`).set("X-Organization-Id", orgId).send({ status: "approved" });
    expect(dec.status).toBe(200);
  });
});