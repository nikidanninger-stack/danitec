CREATE TABLE IF NOT EXISTS gruendungskosten (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  beschreibung TEXT NOT NULL,
  betrag NUMERIC(10,2) NOT NULL,
  bezahlt_von VARCHAR(100) NOT NULL,
  kategorie VARCHAR(100),
  beleg_nr VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gruendungskosten_company ON gruendungskosten(company_id);
