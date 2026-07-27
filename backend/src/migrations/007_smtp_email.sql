-- 007: SMTP-Einstellungen + E-Mail-Log
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS smtp_host        TEXT,
  ADD COLUMN IF NOT EXISTS smtp_port        INTEGER DEFAULT 587,
  ADD COLUMN IF NOT EXISTS smtp_secure      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS smtp_user        TEXT,
  ADD COLUMN IF NOT EXISTS smtp_password    TEXT,
  ADD COLUMN IF NOT EXISTS smtp_from_email  TEXT,
  ADD COLUMN IF NOT EXISTS smtp_from_name   TEXT;

CREATE TABLE IF NOT EXISTS email_log (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id   INTEGER,
  document_type TEXT,        -- 'invoice' | 'offer'
  to_email      TEXT NOT NULL,
  subject       TEXT,
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  status        TEXT DEFAULT 'sent',   -- 'sent' | 'error'
  error_message TEXT,
  sent_by       INTEGER REFERENCES users(id)
);
