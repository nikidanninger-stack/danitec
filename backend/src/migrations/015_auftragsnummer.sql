-- 015: Auftragsnummer (A-Nummer) + Service-Nummer (S-Nummer)
-- A-Nummer: A-2026-0001 → Aufträge/Projekte/Angebote/Rechnungen
-- S-Nummer: S-2026-0001 → Serviceeinsätze/Notfälle/Ersatzteilbestellungen

-- Sequenz-Tabelle (eine Zeile pro Firma und Typ)
CREATE TABLE IF NOT EXISTS order_number_seq (
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  prefix      VARCHAR(1) NOT NULL,   -- 'A' oder 'S'
  year        INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, prefix, year)
);

-- Spalten hinzufügen
ALTER TABLE documents             ADD COLUMN IF NOT EXISTS order_number VARCHAR(20);
ALTER TABLE projects              ADD COLUMN IF NOT EXISTS order_number VARCHAR(20);
ALTER TABLE service_reports       ADD COLUMN IF NOT EXISTS order_number VARCHAR(20);
ALTER TABLE maintenance_contracts ADD COLUMN IF NOT EXISTS order_number VARCHAR(20);
ALTER TABLE customer_equipment    ADD COLUMN IF NOT EXISTS order_number VARCHAR(20);

-- Indizes für schnelle Suche
CREATE INDEX IF NOT EXISTS idx_documents_order_number   ON documents(company_id, order_number);
CREATE INDEX IF NOT EXISTS idx_projects_order_number    ON projects(company_id, order_number);
CREATE INDEX IF NOT EXISTS idx_svcreports_order_number  ON service_reports(company_id, order_number);
CREATE INDEX IF NOT EXISTS idx_maint_order_number       ON maintenance_contracts(company_id, order_number);
CREATE INDEX IF NOT EXISTS idx_equipment_order_number   ON customer_equipment(company_id, order_number);
