-- Kassabuch: Bareinnahmen und Barausgaben
CREATE TABLE IF NOT EXISTS kassabuch (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  datum        DATE NOT NULL DEFAULT CURRENT_DATE,
  typ          VARCHAR(10) NOT NULL DEFAULT 'einnahme', -- 'einnahme' | 'ausgabe'
  betrag       NUMERIC(10,2) NOT NULL,
  beschreibung TEXT NOT NULL,
  beleg_nr     VARCHAR(50),
  kunde        VARCHAR(200),
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kassabuch_company ON kassabuch(company_id, datum DESC);
