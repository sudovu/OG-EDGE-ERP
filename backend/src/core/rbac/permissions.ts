export const PERMISSIONS = [
  "org.manage",
  "user.manage",
  "branch.manage",
  "catalog.read",
  "catalog.manage",
  "customer.read",
  "customer.manage",
  "supplier.read",
  "supplier.manage",
  "sales.read",
  "sales.create",
  "sales.update",
  "sales.delete",
  "purchase.read",
  "purchase.create",
  "purchase.update",
  "inventory.read",
  "inventory.manage",
  "service.read",
  "service.manage",
  "accounting.read",
  "accounting.manage",
  "workflow.manage",
  "report.read",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Default role -> permissions mapping
export const DEFAULT_ROLES: Record<string, Permission[]> = {
  owner: [...PERMISSIONS],
  admin: PERMISSIONS.filter((p) => p !== "org.manage"),
  manager: [
    "catalog.read", "catalog.manage",
    "customer.read", "customer.manage",
    "supplier.read", "supplier.manage",
    "sales.read", "sales.create", "sales.update",
    "purchase.read", "purchase.create", "purchase.update",
    "inventory.read", "inventory.manage",
    "service.read", "service.manage",
    "report.read",
  ],
  cashier: ["catalog.read", "customer.read", "sales.read", "sales.create", "inventory.read"],
  technician: ["catalog.read", "customer.read", "service.read", "service.manage", "inventory.read"],
  accountant: ["accounting.read", "accounting.manage", "report.read", "sales.read", "purchase.read"],
  viewer: ["catalog.read", "customer.read", "supplier.read", "sales.read", "purchase.read", "inventory.read", "service.read", "report.read"],
};

