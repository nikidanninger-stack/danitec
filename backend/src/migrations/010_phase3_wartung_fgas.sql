-- 010: Phase 3 – Wartungsverträge + F-Gase-Dokumentation

-- ─── Wartungsverträge ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_contracts (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_number     TEXT NOT NULL,
  customer_id         INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'active', -- active, paused, cancelled
  contract_start      DATE,
  contract_end        DATE,
  interval_months     INTEGER NOT NULL DEFAULT 12,
  price_per_service   NUMERIC(10,2),
  price_yearly        NUMERIC(10,2),
  last_service_date   DATE,
  next_service_date   DATE,
  equipment_ids       JSONB NOT NULL DEFAULT '[]',
  technician_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mc_company    ON maintenance_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_mc_customer   ON maintenance_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_mc_next       ON maintenance_contracts(next_service_date ASC);

-- ─── F-Gase-Dokumentation ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fgas_logs (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id        INTEGER REFERENCES customer_equipment(id) ON DELETE SET NULL,
  customer_id         INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  log_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  technician_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  technician_name     TEXT,
  work_type           TEXT NOT NULL DEFAULT 'maintenance',
  refrigerant_type    TEXT,
  amount_added_kg     NUMERIC(8,3),
  amount_removed_kg   NUMERIC(8,3),
  leak_check_done     BOOLEAN NOT NULL DEFAULT FALSE,
  leak_found          BOOLEAN NOT NULL DEFAULT FALSE,
  leak_repaired       BOOLEAN NOT NULL DEFAULT FALSE,
  certificate_number  TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fgas_company   ON fgas_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_fgas_equipment ON fgas_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_fgas_date      ON fgas_logs(log_date DESC);

-- Wartungsvertrag-Nummerierung in company_settings
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS maintenance_contract_prefix TEXT DEFAULT 'WV',
  ADD COLUMN IF NOT EXISTS next_maintenance_contract_seq INTEGER DEFAULT 1;
