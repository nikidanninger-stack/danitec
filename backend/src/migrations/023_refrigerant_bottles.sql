-- Einzelne Kältemittelflaschen (eine Zeile = eine Flasche)
CREATE TABLE IF NOT EXISTS refrigerant_bottles (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  refrigerant_type VARCHAR(30) NOT NULL,
  lagerort         VARCHAR(50),
  current_weight_kg DECIMAL(8,3) NOT NULL DEFAULT 0,
  supplier_id      INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  notes            VARCHAR(200),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_bottles_company ON refrigerant_bottles(company_id, refrigerant_type);
