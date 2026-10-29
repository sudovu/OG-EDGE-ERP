export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "OG-EDGE ERP API",
    version: "1.0.0",
    description: "Universal Business Management Platform API",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": { get: { summary: "Health check", responses: { "200": { description: "OK" } } } },
    "/auth/register": { post: { summary: "Register user/organization", responses: { "201": { description: "Created" } } } },
    "/auth/login": { post: { summary: "Login", responses: { "200": { description: "OK" } } } },
    "/products": { get: { summary: "List products", responses: { "200": { description: "OK" } } } },
    "/customers": { get: { summary: "List customers", responses: { "200": { description: "OK" } } } },
    "/invoices": { get: { summary: "List invoices", responses: { "200": { description: "OK" } } }, post: { summary: "Create invoice", responses: { "201": { description: "Created" } } } },
    "/stock": { get: { summary: "Stock levels", responses: { "200": { description: "OK" } } } },
    "/reports/dashboard": { get: { summary: "Dashboard metrics", responses: { "200": { description: "OK" } } } },
  },
};