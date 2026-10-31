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
    "INSERT INTO organizations (id, name, slug, base_currency) VALUES (?,?,?,?)",
  ).run(orgId, name, slug, "NPR");

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
    const prefixMap: Record<string, string> = {
      quotation: "Q-",
      sales_order: "SO-",
      invoice: "INV-",
      payment: "PAY-",
      purchase_order: "PO-",
      goods_receipt: "GR-",
      service_request: "SR-",
      work_order: "WO-",
      journal_entry: "JE-",
      pos_session: "POS-",
    };
    db.prepare(
      "INSERT INTO numbering_sequences (id, organization_id, entity_type, prefix, next_number, padding) VALUES (?,?,?,?,1,6)",
    ).run(newId(), orgId, et, prefixMap[et] ?? "");
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
    "NPR",
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
  // Comprehensive Chart of Accounts per Nepal Accounting Standards (NAS) / Nepal Government
  const accounts: { code: string; name: string; type: string; parent?: string }[] = [
    // ===== 1. ASSETS =====
    // 1.1 Current Assets
    { code: "1000", name: "Current Assets", type: "asset" },
    { code: "1010", name: "Cash in Hand", type: "asset" },
    { code: "1011", name: "Petty Cash", type: "asset" },
    { code: "1020", name: "Cash at Bank - NPR", type: "asset" },
    { code: "1021", name: "Cash at Bank - Foreign Currency", type: "asset" },
    { code: "1030", name: "Fixed Deposits", type: "asset" },
    { code: "1040", name: "Accounts Receivable (Debtors)", type: "asset" },
    { code: "1041", name: "Notes Receivable", type: "asset" },
    { code: "1042", name: "Advances to Suppliers", type: "asset" },
    { code: "1043", name: "Advances to Employees", type: "asset" },
    { code: "1050", name: "Inventory / Stock in Trade", type: "asset" },
    { code: "1051", name: "Raw Materials", type: "asset" },
    { code: "1052", name: "Work in Progress", type: "asset" },
    { code: "1053", name: "Finished Goods", type: "asset" },
    { code: "1060", name: "Prepaid Expenses", type: "asset" },
    { code: "1061", name: "Prepaid Insurance", type: "asset" },
    { code: "1062", name: "Prepaid Rent", type: "asset" },
    { code: "1070", name: "Tax Receivable - VAT Input", type: "asset" },
    { code: "1071", name: "Tax Receivable - TDS", type: "asset" },
    { code: "1080", name: "Other Current Assets", type: "asset" },
    // 1.2 Non-Current Assets
    { code: "1100", name: "Non-Current Assets", type: "asset" },
    { code: "1110", name: "Land", type: "asset" },
    { code: "1120", name: "Building", type: "asset" },
    { code: "1130", name: "Furniture & Fixtures", type: "asset" },
    { code: "1140", name: "Plant & Machinery", type: "asset" },
    { code: "1150", name: "Vehicles", type: "asset" },
    { code: "1160", name: "Computer & Office Equipment", type: "asset" },
    { code: "1170", name: "Intangible Assets", type: "asset" },
    { code: "1171", name: "Goodwill", type: "asset" },
    { code: "1172", name: "Patents & Trademarks", type: "asset" },
    { code: "1173", name: "Software", type: "asset" },
    { code: "1180", name: "Long-term Investments", type: "asset" },
    { code: "1190", name: "Deferred Tax Asset", type: "asset" },
    { code: "1199", name: "Accumulated Depreciation", type: "asset" },

    // ===== 2. LIABILITIES =====
    // 2.1 Current Liabilities
    { code: "2000", name: "Current Liabilities", type: "liability" },
    { code: "2010", name: "Accounts Payable (Creditors)", type: "liability" },
    { code: "2011", name: "Notes Payable", type: "liability" },
    { code: "2020", name: "Short-term Loans", type: "liability" },
    { code: "2021", name: "Bank Overdraft", type: "liability" },
    { code: "2030", name: "Accrued Expenses", type: "liability" },
    { code: "2031", name: "Accrued Salaries & Wages", type: "liability" },
    { code: "2032", name: "Accrued Interest", type: "liability" },
    { code: "2040", name: "Advance from Customers", type: "liability" },
    { code: "2050", name: "VAT Payable (Output VAT 13%)", type: "liability" },
    { code: "2051", name: "TDS Payable", type: "liability" },
    { code: "2052", name: "Income Tax Payable", type: "liability" },
    { code: "2053", name: "Excise Duty Payable", type: "liability" },
    { code: "2060", name: "Unearned Revenue", type: "liability" },
    { code: "2070", name: "Other Current Liabilities", type: "liability" },
    // 2.2 Non-Current Liabilities
    { code: "2100", name: "Non-Current Liabilities", type: "liability" },
    { code: "2110", name: "Long-term Loans", type: "liability" },
    { code: "2120", name: "Debentures", type: "liability" },
    { code: "2130", name: "Deferred Tax Liability", type: "liability" },
    { code: "2190", name: "Other Long-term Liabilities", type: "liability" },

    // ===== 3. EQUITY =====
    { code: "3000", name: "Owner's Equity", type: "equity" },
    { code: "3010", name: "Capital", type: "equity" },
    { code: "3020", name: "Drawings", type: "equity" },
    { code: "3030", name: "Retained Earnings", type: "equity" },
    { code: "3040", name: "General Reserve", type: "equity" },
    { code: "3050", name: "Revaluation Reserve", type: "equity" },

    // ===== 4. REVENUE / INCOME =====
    { code: "4000", name: "Revenue", type: "revenue" },
    { code: "4010", name: "Sales Revenue - Goods", type: "revenue" },
    { code: "4020", name: "Service Revenue", type: "revenue" },
    { code: "4030", name: "Sales Returns & Allowances", type: "revenue" },
    { code: "4040", name: "Other Operating Income", type: "revenue" },
    { code: "4050", name: "Interest Income", type: "revenue" },
    { code: "4060", name: "Discount Received", type: "revenue" },
    { code: "4070", name: "Gain on Sale of Assets", type: "revenue" },
    { code: "4080", name: "Foreign Exchange Gain", type: "revenue" },
    { code: "4090", name: "Miscellaneous Income", type: "revenue" },

    // ===== 5. EXPENSES =====
    // 5.1 Cost of Goods Sold / Direct Expenses
    { code: "5000", name: "Cost of Goods Sold", type: "expense" },
    { code: "5010", name: "Purchases", type: "expense" },
    { code: "5011", name: "Purchase Returns", type: "expense" },
    { code: "5020", name: "Direct Labor", type: "expense" },
    { code: "5030", name: "Freight In / Carriage Inward", type: "expense" },
    { code: "5040", name: "Manufacturing Overhead", type: "expense" },
    { code: "5050", name: "Customs Duty", type: "expense" },
    // 5.2 Operating Expenses
    { code: "5100", name: "Operating Expenses", type: "expense" },
    { code: "5110", name: "Salaries & Wages", type: "expense" },
    { code: "5111", name: "Staff Bonus", type: "expense" },
    { code: "5112", name: "Provident Fund Contribution", type: "expense" },
    { code: "5113", name: "Gratuity", type: "expense" },
    { code: "5120", name: "Rent Expense", type: "expense" },
    { code: "5130", name: "Electricity Expense", type: "expense" },
    { code: "5131", name: "Water Expense", type: "expense" },
    { code: "5132", name: "Internet & Telephone", type: "expense" },
    { code: "5140", name: "Office Supplies", type: "expense" },
    { code: "5141", name: "Printing & Stationery", type: "expense" },
    { code: "5150", name: "Depreciation Expense", type: "expense" },
    { code: "5151", name: "Amortization Expense", type: "expense" },
    { code: "5160", name: "Insurance Expense", type: "expense" },
    { code: "5170", name: "Repairs & Maintenance", type: "expense" },
    { code: "5180", name: "Advertising & Marketing", type: "expense" },
    { code: "5190", name: "Travel & Conveyance", type: "expense" },
    { code: "5200", name: "Professional Fees", type: "expense" },
    { code: "5201", name: "Audit Fees", type: "expense" },
    { code: "5202", name: "Legal Fees", type: "expense" },
    { code: "5210", name: "Training & Development", type: "expense" },
    { code: "5220", name: "Entertainment Expense", type: "expense" },
    { code: "5230", name: "Bank Charges", type: "expense" },
    { code: "5240", name: "Bad Debts", type: "expense" },
    { code: "5250", name: "Donation & Charity", type: "expense" },
    { code: "5290", name: "Miscellaneous Expense", type: "expense" },
    // 5.3 Financial Expenses
    { code: "5300", name: "Financial Expenses", type: "expense" },
    { code: "5310", name: "Interest Expense", type: "expense" },
    { code: "5320", name: "Loan Processing Fees", type: "expense" },
    { code: "5330", name: "Foreign Exchange Loss", type: "expense" },
  ];
  for (const a of accounts) {
    db.prepare("INSERT INTO accounts (id, organization_id, code, name, account_type) VALUES (?,?,?,?,?)").run(
      newId(), orgId, a.code, a.name, a.type,
    );
  }

  // Seed Nepal tax rates
  const taxes = [
    { name: "VAT 13%", code: "VAT13", rate: 13, tax_type: "vat", is_default: 1 },
    { name: "TDS - Rent 10%", code: "TDS_RENT", rate: 10, tax_type: "tds", is_default: 0 },
    { name: "TDS - Service 1.5%", code: "TDS_SVC", rate: 1.5, tax_type: "tds", is_default: 0 },
    { name: "TDS - Contract 1.5%", code: "TDS_CONT", rate: 1.5, tax_type: "tds", is_default: 0 },
    { name: "Excise Duty", code: "EXCISE", rate: 0, tax_type: "excise", is_default: 0 },
  ];
  for (const t of taxes) {
    db.prepare("INSERT INTO tax_rates (id, organization_id, name, code, rate, tax_type, is_default) VALUES (?,?,?,?,?,?,?)").run(
      newId(), orgId, t.name, t.code, t.rate, t.tax_type, t.is_default,
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

