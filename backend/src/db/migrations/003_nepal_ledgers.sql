-- Nepal-specific: tax rates and extended ledger support
CREATE TABLE IF NOT EXISTS tax_rates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  rate REAL NOT NULL,
  tax_type TEXT NOT NULL DEFAULT 'vat', -- vat, tds, excise, income, customs
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_org ON tax_rates(organization_id);