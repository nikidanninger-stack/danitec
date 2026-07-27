-- Kältemittel-Lager
CREATE TABLE IF NOT EXISTS refrigerant_stock (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  refrigerant_type VARCHAR(20) NOT NULL,
  bottle_count     INTEGER NOT NULL DEFAULT 0,
  bottle_weight_kg DECIMAL(8,3) NOT NULL DEFAULT 0,
  supplier_id      INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  notes            VARCHAR(200),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, refrigerant_type)
);
