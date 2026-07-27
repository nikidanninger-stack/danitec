-- Migration 006: Projekte, Aufgaben, Notizen, Kundenanlagen

-- ─── Projekt-Sequenz in company_settings ──────────────────────────────────────
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS project_prefix VARCHAR(20) DEFAULT 'PRJ';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS next_project_seq INTEGER DEFAULT 1;
UPDATE company_settings SET project_prefix = 'PRJ' WHERE project_prefix IS NULL;
UPDATE company_settings SET next_project_seq = 1 WHERE next_project_seq IS NULL;

-- ─── Projekte ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id                    SERIAL PRIMARY KEY,
  company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_number        VARCHAR(50),
  name                  VARCHAR(255) NOT NULL,
  description           TEXT,
  status                VARCHAR(50) NOT NULL DEFAULT 'active',
    -- active | completed | paused | cancelled
  customer_id           INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  -- Baustellen-Adresse (kann von Kundenadresse abweichen)
  site_address          TEXT,
  site_zip              VARCHAR(20),
  site_city             VARCHAR(100),
  -- Ansprechpartner vor Ort
  contact_person        VARCHAR(255),
  contact_phone         VARCHAR(100),
  -- Zeitraum
  start_date            DATE,
  end_date              DATE,
  -- Verknüpfungen
  offer_id              INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  invoice_id            INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  -- Budget / Kalkulation
  budget_net            NUMERIC(12,2),
  -- Intern
  priority              VARCHAR(20) DEFAULT 'normal', -- low | normal | high | urgent
  created_by            INTEGER REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Projekt-Aufgaben ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_tasks (
  id                    SERIAL PRIMARY KEY,
  project_id            INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title                 VARCHAR(255) NOT NULL,
  description           TEXT,
  status                VARCHAR(50) DEFAULT 'open', -- open | in_progress | done
  priority              VARCHAR(20) DEFAULT 'normal',
  assigned_to           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date              DATE,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Projekt-Notizen ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_notes (
  id                    SERIAL PRIMARY KEY,
  project_id            INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  note                  TEXT NOT NULL,
  created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Kundenanlagen ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_equipment (
  id                        SERIAL PRIMARY KEY,
  company_id                INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id               INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  equipment_number          VARCHAR(50),
  name                      VARCHAR(255) NOT NULL,
  -- Typ: Klimaanlage | Kühlstelle | Kühlzelle | Verbundanlage | Lüftungsgerät | Wärmepumpe | Sonstiges
  equipment_type            VARCHAR(100),
  manufacturer              VARCHAR(255),
  model                     VARCHAR(255),
  serial_number             VARCHAR(255),
  -- Standort beim Kunden
  location                  VARCHAR(500),
  -- Kältemittel
  refrigerant               VARCHAR(100), -- R410A, R32, R290, R134a, R407C ...
  refrigerant_amount_kg     NUMERIC(8,3),
  -- Baujahr & Einbau
  year_built                INTEGER,
  install_date              DATE,
  warranty_until            DATE,
  -- Wartung
  maintenance_interval_months INTEGER DEFAULT 12,
  last_maintenance          DATE,
  next_maintenance          DATE,
  -- Status
  status                    VARCHAR(50) DEFAULT 'active', -- active | defective | decommissioned
  notes                     TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indizes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_company    ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_customer   ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status     ON projects(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_proj  ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_proj  ON project_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_company   ON customer_equipment(company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_customer  ON customer_equipment(customer_id);
CREATE INDEX IF NOT EXISTS idx_equipment_next_maint ON customer_equipment(next_maintenance);
