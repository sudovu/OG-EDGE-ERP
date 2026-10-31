-- Multi-currency support
ALTER TABLE accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'NPR';
CREATE INDEX IF NOT EXISTS idx_accounts_currency ON accounts(currency);

-- payments already has currency from 001_initial.sql

CREATE TABLE IF NOT EXISTS currency_rates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL DEFAULT 'NPR',
  rate REAL NOT NULL, -- 1 from_currency = rate to_currency
  effective_from TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT DEFAULT 'manual',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (organization_id, from_currency, to_currency, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_currency_rates_org ON currency_rates(organization_id);
CREATE INDEX IF NOT EXISTS idx_currency_rates_pair ON currency_rates(from_currency, to_currency);
