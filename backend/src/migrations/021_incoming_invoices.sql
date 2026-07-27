-- Eingangsrechnungen vs. Ausgangsrechnungen
ALTER TABLE documents ADD COLUMN IF NOT EXISTS direction VARCHAR(10) DEFAULT 'outgoing'
  CHECK (direction IN ('outgoing','incoming'));
-- Index für schnelle Filterung
CREATE INDEX IF NOT EXISTS idx_documents_direction ON documents(company_id, direction);
-- Bestehende Rechnungen sind alle ausgehend
UPDATE documents SET direction = 'outgoing' WHERE direction IS NULL;
