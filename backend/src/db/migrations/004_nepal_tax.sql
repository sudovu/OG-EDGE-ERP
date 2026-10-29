-- Nepal tax compliance: TDS on payments, VAT return support
ALTER TABLE payments ADD COLUMN tds_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN tds_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN net_amount REAL;