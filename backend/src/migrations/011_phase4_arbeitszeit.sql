-- 011: Phase 4 – Arbeitszeit-Erfassung

CREATE TABLE IF NOT EXISTS time_entries (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time          TIME,
  end_time            TIME,
  break_minutes       INTEGER NOT NULL DEFAULT 0,
  total_hours         NUMERIC(5,2),          -- berechnet: (end-start) - pause
  work_type           TEXT NOT NULL DEFAULT 'work', -- work, travel, training, sick, vacation, holiday
  customer_id         INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  project_id          INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  service_report_id   INTEGER REFERENCES service_reports(id) ON DELETE SET NULL,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'draft', -- draft, submitted, approved
  approved_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_te_company  ON time_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_te_user     ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_te_date     ON time_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_te_month    ON time_entries(company_id, user_id, entry_date);
