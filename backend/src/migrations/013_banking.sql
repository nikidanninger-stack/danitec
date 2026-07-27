-- 013: Banking – GoCardless Open Banking (BAWAG)

-- Bankverbindungen (eine pro Firma)
CREATE TABLE IF NOT EXISTS bank_connections (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL DEFAULT 'gocardless',   -- 'gocardless'
  institution_id    TEXT NOT NULL DEFAULT 'BAWAG_BAWAATWWXXX',
  institution_name  TEXT NOT NULL DEFAULT 'BAWAG',
  requisition_id    TEXT,                                  -- GoCardless requisition ID
  account_id        TEXT,                                  -- GoCardless account ID (nach OAuth)
  iban              TEXT,
  account_name      TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',       -- 'pending' | 'linked' | 'expired' | 'error'
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id)
);

-- Banktransaktionen
CREATE TABLE IF NOT EXISTS bank_transactions (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_connection_id  INTEGER NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
  transaction_id      TEXT NOT NULL,                       -- GoCardless transaction ID (eindeutig)
  booking_date        DATE NOT NULL,
  value_date          DATE,
  amount              NUMERIC(12,2) NOT NULL,              -- positiv = Eingang, negativ = Ausgang
  currency            TEXT NOT NULL DEFAULT 'EUR',
  description         TEXT,                               -- Verwendungszweck
  counterpart_name    TEXT,                               -- Name des Absenders/Empfängers
  counterpart_iban    TEXT,
  matched_invoice_id  INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  match_confidence    NUMERIC(3,2),                       -- 0.0–1.0
  match_status        TEXT NOT NULL DEFAULT 'unmatched',  -- 'unmatched' | 'auto' | 'manual' | 'ignored'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_company    ON bank_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_date       ON bank_transactions(booking_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_tx_matched    ON bank_transactions(matched_invoice_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_status     ON bank_transactions(match_status);
