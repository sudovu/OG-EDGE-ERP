import { getDb } from "../../db/database";
import { newId } from "../../shared/ids";
import { hashPassword, verifyPassword } from "../../core/auth/password";
import { signToken } from "../../core/auth/jwt";
import { DEFAULT_ROLES, PERMISSIONS } from "../../core/rbac/permissions";
import { logAudit } from "../audit/audit.service";
import { ConflictError, UnauthorizedError } from "../../core/errors";

export async function registerUser(input: {
  email: string;
  password: string;
  fullName: string;
  organizationName?: string;
}) {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(input.email);
  if (existing) throw new ConflictError("Email already registered");

  const userId = newId();
  const passwordHash = await hashPassword(input.password);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)",
  ).run(userId, input.email, passwordHash, input.fullName);

  let organizationId: string | null = null;
  if (input.organizationName) {
    organizationId = await createOrganizationWithOwner(userId, input.organizationName);
  }

  const token = signToken({ sub: userId, email: input.email, isSuperAdmin: false });
  return { userId, organizationId, token };
}

export async function createOrganizationWithOwner(userId: string, name: string): Promise<string> {
  const db = getDb();
  const orgId = newId();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + orgId.slice(0, 6);
  db.prepare(
    "INSERT INTO organizations (id, name, slug) VALUES (?,?,?)",
  ).run(orgId, name, slug);

  // membership
  db.prepare("INSERT INTO memberships (id, organization_id, user_id, role) VALUES (?,?,?,?)").run(
    newId(),
    orgId,
    userId,
    "owner",
  );

  // seed permissions
  seedPermissions(db);
  // seed roles for org
  for (const [roleName, perms] of Object.entries(DEFAULT_ROLES)) {
    const roleId = newId();
    db.prepare("INSERT INTO roles (id, organization_id, name, is_system) VALUES (?,?,?,1)").run(
      roleId,
      orgId,
      roleName,
    );
    for (const p of perms) {
      const permRow = db.prepare("SELECT id FROM permissions WHERE code = ?").get(p) as { id: string } | undefined;
      if (permRow) {
        db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?,?)").run(roleId, permRow.id);
      }
    }
  }
  // assign owner role to user
  const ownerRole = db.prepare("SELECT id FROM roles WHERE organization_id = ? AND name = 'owner'").get(orgId) as { id: string };
  db.prepare("INSERT OR IGNORE INTO user_roles (user_id, organization_id, role_id) VALUES (?,?,?)").run(
    userId,
    orgId,
    ownerRole.id,
  );

  // default numbering sequences
  for (const et of ["quotation", "sales_order", "invoice", "payment", "purchase_order", "goods_receipt", "service_request", "work_order", "journal_entry", "pos_session"]) {
    db.prepare(
      "INSERT INTO numbering_sequences (id, organization_id, entity_type, prefix, next_number, padding) VALUES (?,?,?,?,1,6)",
    ).run(newId(), orgId, et, "");
  }

  // default units
  for (const u of [
    { name: "Piece", symbol: "pcs", unit_type: "count" },
    { name: "Kilogram", symbol: "kg", unit_type: "weight" },
    { name: "Liter", symbol: "L", unit_type: "volume" },
    { name: "Hour", symbol: "hr", unit_type: "time" },
    { name: "Meter", symbol: "m", unit_type: "length" },
  ]) {
    db.prepare("INSERT INTO units (id, organization_id, name, symbol, unit_type) VALUES (?,?,?,?,?)").run(
      newId(),
      orgId,
      u.name,
      u.symbol,
      u.unit_type,
    );
  }

  // default price list
  db.prepare("INSERT INTO price_lists (id, organization_id, name, currency, is_default) VALUES (?,?,?,?,1)").run(
    newId(),
    orgId,
    "Default",
    "USD",
  );

  // default warehouse + location
  const locId = newId();
  db.prepare("INSERT INTO locations (id, organization_id, name, type) VALUES (?,?,?,?)").run(locId, orgId, "Main Location", "warehouse");
  const whId = newId();
  db.prepare("INSERT INTO warehouses (id, organization_id, location_id, name, code) VALUES (?,?,?,?,?)").run(whId, orgId, locId, "Main Warehouse", "WH1");

  // default chart of accounts
  seedChartOfAccounts(db, orgId);

  // default workflow for sales orders
  seedDefaultWorkflows(db, orgId);

  logAudit({ organizationId: orgId, userId, action: "organization.created", entityType: "organization", entityId: orgId });
  return orgId;
}

function seedPermissions(db: ReturnType<typeof getDb>) {
  for (const code of PERMISSIONS) {
    db.prepare("INSERT OR IGNORE INTO permissions (id, code, description) VALUES (?,?,?)").run(newId(), code, code);
  }
}

function seedChartOfAccounts(db: ReturnType<typeof getDb>, orgId: string) {
  const accounts = [
    { code: "1000", name: "Cash", type: "asset" },
    { code: "1100", name: "Bank", type: "asset" },
    { code: "1200", name: "Accounts Receivable", type: "asset" },
    { code: "1300", name: "Inventory", type: "asset" },
    { code: "2000", name: "Accounts Payable", type: "liability" },
    { code: "2100", name: "Tax Payable", type: "liability" },
    { code: "3000", name: "Owner Equity", type: "equity" },
    { code: "4000", name: "Sales Revenue", type: "revenue" },
    { code: "4100", name: "Service Revenue", type: "revenue" },
    { code: "5000", name: "Cost of Goods Sold", type: "expense" },
    { code: "5100", name: "Operating Expense", type: "expense" },
  ];
  for (const a of accounts) {
    db.prepare("INSERT INTO accounts (id, organization_id, code, name, account_type) VALUES (?,?,?,?,?)").run(
      newId(),
      orgId,
      a.code,
      a.name,
      a.type,
    );
  }
}

function seedDefaultWorkflows(db: ReturnType<typeof getDb>, orgId: string) {
  const wfId = newId();
  db.prepare("INSERT INTO workflows (id, organization_id, entity_type, name, is_default) VALUES (?,?,?,?,1)").run(
    wfId,
    orgId,
    "sales_order",
    "Default Sales Order Workflow",
  );
  const states = [
    { name: "draft", label: "Draft", initial: 1 },
    { name: "confirmed", label: "Confirmed" },
    { name: "fulfilled", label: "Fulfilled", terminal: 1 },
    { name: "cancelled", label: "Cancelled", terminal: 1 },
  ];
  const stateIds: Record<string, string> = {};
  states.forEach((s, i) => {
    const id = newId();
    stateIds[s.name] = id;
    db.prepare(
      "INSERT INTO workflow_states (id, workflow_id, name, label, is_initial, is_terminal, sort_order) VALUES (?,?,?,?,?,?,?)",
    ).run(id, wfId, s.name, s.label, s.initial ?? 0, s.terminal ?? 0, i);
  });
  const transitions = [
    ["draft", "confirmed"],
    ["confirmed", "fulfilled"],
    ["draft", "cancelled"],
    ["confirmed", "cancelled"],
  ];
  for (const [from, to] of transitions) {
    db.prepare(
      "INSERT INTO workflow_transitions (id, workflow_id, from_state_id, to_state_id, name) VALUES (?,?,?,?,?)",
    ).run(newId(), wfId, stateIds[from], stateIds[to], `${from}->${to}`);
  }

  // service request workflow
  const swf = newId();
  db.prepare("INSERT INTO workflows (id, organization_id, entity_type, name, is_default) VALUES (?,?,?,?,1)").run(
    swf,
    orgId,
    "service_request",
    "Default Service Workflow",
  );
  const sstates = [
    { name: "received", label: "Received", initial: 1 },
    { name: "diagnosed", label: "Diagnosed" },
    { name: "approved", label: "Approved" },
    { name: "in_progress", label: "In Progress" },
    { name: "completed", label: "Completed" },
    { name: "delivered", label: "Delivered", terminal: 1 },
    { name: "cancelled", label: "Cancelled", terminal: 1 },
  ];
  const ssIds: Record<string, string> = {};
  sstates.forEach((s, i) => {
    const id = newId();
    ssIds[s.name] = id;
    db.prepare(
      "INSERT INTO workflow_states (id, workflow_id, name, label, is_initial, is_terminal, sort_order) VALUES (?,?,?,?,?,?,?)",
    ).run(id, swf, s.name, s.label, s.initial ?? 0, s.terminal ?? 0, i);
  });
  const strans = [
    ["received", "diagnosed"],
    ["diagnosed", "approved"],
    ["approved", "in_progress"],
    ["in_progress", "completed"],
    ["completed", "delivered"],
    ["received", "cancelled"],
  ];
  for (const [from, to] of strans) {
    db.prepare(
      "INSERT INTO workflow_transitions (id, workflow_id, from_state_id, to_state_id, name) VALUES (?,?,?,?,?)",
    ).run(newId(), swf, ssIds[from], ssIds[to], `${from}->${to}`);
  }
}

export async function loginUser(email: string, password: string) {
  const db = getDb();
  const user = db.prepare("SELECT id, email, password_hash, full_name, is_super_admin, is_active FROM users WHERE email = ?").get(email) as
    | { id: string; email: string; password_hash: string; full_name: string; is_super_admin: number; is_active: number }
    | undefined;
  if (!user || user.is_active !== 1) throw new UnauthorizedError("Invalid credentials");
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw new UnauthorizedError("Invalid credentials");
  const token = signToken({ sub: user.id, email: user.email, isSuperAdmin: user.is_super_admin === 1 });
  const memberships = db
    .prepare("SELECT organization_id, role FROM memberships WHERE user_id = ? AND is_active = 1")
    .all(user.id) as { organization_id: string; role: string }[];
  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    isSuperAdmin: user.is_super_admin === 1,
    memberships,
    token,
  };
}

