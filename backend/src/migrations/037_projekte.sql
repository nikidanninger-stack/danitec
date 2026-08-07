-- Migration 037: Projekte + Fotos

-- Projekte-Tabelle
CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  company_id  INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  status      VARCHAR(50) DEFAULT 'aktiv',  -- aktiv, abgeschlossen, storniert
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);

-- Fotos pro Projekt (in DB gespeichert als bytea)
CREATE TABLE IF NOT EXISTS project_photos (
  id          SERIAL PRIMARY KEY,
  project_id  INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename    VARCHAR(255) NOT NULL,
  mimetype    VARCHAR(100) DEFAULT 'image/jpeg',
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_photos_project ON project_photos(project_id);

-- Dokumente (Angebote, Rechnungen) mit Projekt verknüpfen
ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
