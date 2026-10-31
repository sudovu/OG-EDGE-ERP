import { test, expect } from "@playwright/test";

test("complete ERP flow: register → dashboard → product → invoice → ledger", async ({ page, request }) => {
  // ---- 1. Register a new organization via UI ----
  await page.goto("/register");

  // Wait for the registration API response before asserting navigation
  const registerResponse = page.waitForResponse((resp) =>
    resp.url().includes("/api/v1/auth/register") && resp.request().method() === "POST",
  );

  await page.fill('input[placeholder="Full name"]', "E2E User");
  await page.fill('input[placeholder="Email"]', `e2e-${Date.now()}@test.com`);
  await page.fill('input[placeholder="Password (min 8)"]', "password123");
  await page.fill('input[placeholder="Organization name (optional)"]', "E2E Org");
  await page.click('button:has-text("Register")');

  const regResp = await registerResponse;
  expect(regResp.status()).toBe(201);

  // Client-side redirect to dashboard
  await page.waitForURL("/");
  await expect(page.locator("h1")).toContainText("Dashboard");

  // Grab auth context for API calls later
  const storedOrgId = await page.evaluate(() => localStorage.getItem("orgId"));
  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(storedOrgId).toBeTruthy();
  expect(token).toBeTruthy();

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "X-Organization-Id": storedOrgId!,
  };

  // ---- 2. Create a product via UI ----
  await page.click('a:has-text("Catalog")');
  await expect(page.locator("h1")).toContainText("Catalog / Products");

  await page.fill('input[placeholder="Name"]', "E2E Widget");
  await page.fill('input[placeholder="SKU"]', "W1");
  await page.click('button:has-text("Add")');

  // Product should appear in the table
  await expect(page.locator("table")).toContainText("E2E Widget");
  await expect(page.locator("table")).toContainText("W1");

  // ---- 3. Create an invoice via UI ----
  await page.click('a:has-text("Sales")');
  await expect(page.locator("h1")).toContainText("Sales / Invoices");

  // Select the product we just created, add a line
  await page.selectOption('select:has(option:has-text("E2E Widget"))', {
    label: "E2E Widget",
  });
  await page.fill('input[placeholder="Unit price"]', "100");
  await page.click('button:has-text("Add line")');

  // Line item should appear
  await expect(page.locator("ul")).toContainText("E2E Widget");

  // Create the invoice
  await page.click('button:has-text("Create invoice")');

  // Invoice should appear in the invoices table (number may have prefix like INV-)
  await expect(page.locator("table")).toContainText(/\d{6}/);

  // Grab the latest invoice number
  const invoiceNumber = await page
    .locator("table tbody tr")
    .first()
    .locator("td")
    .first()
    .textContent();
  expect(invoiceNumber).toMatch(/^(INV-)?\d{6}$/);

  // ---- 4. Auto-post the invoice to accounting via API ----
  const invoicesRes = await request.get(`/api/v1/invoices`, { headers: authHeaders });
  expect(invoicesRes.ok).toBeTruthy();
  const invoiceList = (await invoicesRes.json()).data as any[];
  const latestInvoice = invoiceList.find((i) => i.number === invoiceNumber);
  expect(latestInvoice).toBeDefined();

  const postRes = await request.post(
    `/api/v1/accounting/auto-post/invoice/${latestInvoice.id}`,
    { headers: authHeaders },
  );
  expect(postRes.ok).toBeTruthy();

  // ---- 5. Verify the ledger shows the posted entry ----
  await page.click('a:has-text("Ledger")');
  await expect(page.locator("h1")).toContainText("Ledger Book");
  await page.click('button:has-text("Load")');

  // The ledger table should contain our invoice journal entry
  await expect(page.locator("table")).toContainText(invoiceNumber!);
});
