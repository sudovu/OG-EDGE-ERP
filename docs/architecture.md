# Architecture

## Style
Modular monolith. Domain modules under `backend/src/modules`. Shared kernel under `backend/src/core` and `backend/src/shared`.

## Multi-tenancy
Shared database, tenant isolation by `organization_id` column on every scoped table.
`resolveTenant` middleware validates membership per request. Super admins can operate cross-tenant.

## Key domains
- Organization & Tenant Management
- RBAC (roles, permissions, user_roles)
- Dynamic Catalog (categories, products, variants, units, prices, custom fields)
- Customers & Suppliers
- Inventory (warehouses, stock_items, stock_movements)
- Sales (quotations, sales_orders, invoices, payments)
- Purchasing (purchase_orders, goods_receipts)
- Services (service_requests, work_orders)
- Accounting (accounts, journal_entries, reports)
- Workflows (configurable states/transitions)
- Audit logs

## Data integrity
- Foreign keys enabled.
- Inventory updates wrapped in transactions.
- Invoice totals computed server-side.
- Journal entries must balance (debit == credit).
- Numbering sequences atomic via transaction.

## Scalability path
- Stateless app (JWT), horizontal scaling behind reverse proxy.
- Background jobs: Redis/BullMQ (future).
- Database: migrate SQLite -> PostgreSQL for larger deployments (schema portable).