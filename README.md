# OG-EDGE ERP — Universal Business Management Platform

A modular, multi-organization business management platform. Organizations can configure their own
catalog (products/services), workflows, customers, sales, purchasing, inventory, services/repairs,
and accounting — without code changes.

## Stack

- Backend: Node.js + TypeScript + Express (modular monolith)
- Database: SQLite (dev) — schema designed for portability to PostgreSQL
- Frontend: React + TypeScript + Vite + Tailwind CSS
- Auth: JWT + bcrypt, RBAC, tenant isolation

## Quick start (development)

Prerequisites: Node.js 20+.

```bash
# Backend
cd backend
npm install
npm run migrate
npm run seed        # optional, permissions seeded on migrate
npm run dev         # http://localhost:4000

# Frontend (new terminal)
cd frontend
npm install
npm run dev         # http://localhost:5173
```

Open http://localhost:5173, register an account with an organization name.

## Environment

See `backend/.env.example` and `frontend/.env.example`.

## Tests

```bash
cd backend
npm test
```

8 integration tests cover auth, tenant isolation, catalog/inventory, invoice totals,
accounting balance, service workflow, and workflow config.

## API

Base URL: `/api/v1`. All organization-scoped endpoints require `X-Organization-Id` header.
Auth via `Authorization: Bearer <token>`.

Key endpoints:
- `/auth/register`, `/auth/login`, `/auth/me`
- `/organizations`, `/branches`, `/locations`
- `/products`, `/categories`, `/units`, `/prices`
- `/customers`, `/suppliers`
- `/warehouses`, `/stock`, `/stock/adjust`, `/stock/transfer`, `/stock/movements`
- `/quotations`, `/sales-orders`, `/invoices`, `/payments`
- `/purchase-orders`, `/goods-receipts`
- `/service-requests`, `/work-orders`
- `/accounts`, `/journal-entries`, `/reports/trial-balance`, `/reports/profit-loss`
- `/workflows`
- `/reports/dashboard`

## Docker (single server)

```bash
cp .env.example .env   # set JWT_SECRET
docker compose up -d --build
```

App available on port 80. Database persisted in `og_edge_data` volume.

## Architecture

Modular monolith organized by domain: `src/modules/*`. Each module owns its routes, validation,
and DB access. Shared kernel: auth, RBAC, tenant resolution, numbering, audit.

Tenant isolation: every organization-scoped table has `organization_id`; membership is validated
per request via `resolveTenant` middleware. RBAC via `user_roles` + `role_permissions`.

## Roadmap

Phase 0-3 implemented: platform foundation, dynamic catalog, transaction engine (sales, purchasing,
inventory), service/repair workflows, accounting core, workflows, reports.

Remaining: advanced RBAC admin UI, e-commerce integrations, payroll, advanced reporting, Postgres
adapter for production, backups/restore automation.

## Security notes

- Passwords hashed with bcrypt (12 rounds).
- JWT signed with `JWT_SECRET` (must be set in production).
- All financial totals computed server-side.
- Tenant boundaries enforced in middleware and queries.
- No arbitrary code execution from workflow config.
- Do not expose the database port publicly.