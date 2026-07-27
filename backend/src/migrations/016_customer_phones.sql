-- Mehrere Telefonnummern pro Kunde
CREATE TABLE IF NOT EXISTS customer_phones (
  id         SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label       VARCHAR(50)  NOT NULL DEFAULT 'Standard',
  phone       VARCHAR(50)  NOT NULL,
  is_primary  BOOLEAN DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_phones_customer ON customer_phones(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_phones_company  ON customer_phones(company_id);
