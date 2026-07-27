-- 008: document_status Enum um 'accepted' und 'rejected' erweitern
-- + SMTP Spalten falls 007 nicht gelaufen ist
DO $$
BEGIN
  -- Enum-Werte hinzufügen (nur falls noch nicht vorhanden)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='accepted' AND enumtypid=(SELECT oid FROM pg_type WHERE typname='document_status')) THEN
    ALTER TYPE document_status ADD VALUE 'accepted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='rejected' AND enumtypid=(SELECT oid FROM pg_type WHERE typname='document_status')) THEN
    ALTER TYPE document_status ADD VALUE 'rejected';
  END IF;
END$$;

-- SMTP Spalten (falls Migration 007 noch nicht gelaufen)
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS smtp_host        TEXT,
  ADD COLUMN IF NOT EXISTS smtp_port        INTEGER DEFAULT 587,
  ADD COLUMN IF NOT EXISTS smtp_secure      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS smtp_user        TEXT,
  ADD COLUMN IF NOT EXISTS smtp_password    TEXT,
  ADD COLUMN IF NOT EXISTS smtp_from_email  TEXT,
  ADD COLUMN IF NOT EXISTS smtp_from_name   TEXT;

-- E-Mail Log Tabelle
CREATE TABLE IF NOT EXISTS email_log (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id   INTEGER,
  document_type TEXT,
  to_email      TEXT NOT NULL,
  subject       TEXT,
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  status        TEXT DEFAULT 'sent',
  error_message TEXT,
  sent_by       INTEGER REFERENCES users(id)
);
