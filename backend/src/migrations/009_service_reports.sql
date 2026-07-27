-- 009: Serviceberichte
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS service_report_prefix TEXT DEFAULT 'SB',
  ADD COLUMN IF NOT EXISTS next_service_report_seq INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS service_reports (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  report_number     TEXT NOT NULL,
  customer_id       INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  equipment_id      INTEGER REFERENCES customer_equipment(id) ON DELETE SET NULL,
  project_id        INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  report_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  technician_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  technician_name   TEXT,
  report_type       TEXT NOT NULL DEFAULT 'service',
  work_performed    TEXT,
  defects_found     TEXT,
  recommendations   TEXT,
  materials_used    JSONB NOT NULL DEFAULT '[]',
  hours_worked      NUMERIC(5,2) NOT NULL DEFAULT 0,
  travel_hours      NUMERIC(5,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'draft',
  signature_data    TEXT,
  signature_name    TEXT,
  photos            JSONB NOT NULL DEFAULT '[]',
  internal_notes    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sr_company  ON service_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_sr_customer ON service_reports(customer_id);
CREATE INDEX IF NOT EXISTS idx_sr_date     ON service_reports(report_date DESC);
