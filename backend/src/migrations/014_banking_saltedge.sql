-- 014: Banking – Salt Edge connection_id Spalte hinzufügen
ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS connection_id TEXT,
  ADD COLUMN IF NOT EXISTS customer_secret TEXT;
