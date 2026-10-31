-- Webhook retry support + background job scheduling
ALTER TABLE webhook_deliveries ADD COLUMN next_run TEXT;
ALTER TABLE webhook_deliveries ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(webhook_id, status_code, next_run);

-- Scheduled events outbox: durable event queue for integrations
CREATE TABLE IF NOT EXISTS integration_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, delivered, failed
  attempts INTEGER NOT NULL DEFAULT 0,
  next_run TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_integration_events_status ON integration_events(status, created_at);
