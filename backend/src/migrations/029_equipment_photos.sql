-- 029: Fotos für Kundenanlagen + Google Drive Integration
CREATE TABLE IF NOT EXISTS equipment_photos (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id  INTEGER NOT NULL REFERENCES customer_equipment(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  original_name TEXT,
  drive_file_id TEXT,          -- Google Drive File ID
  drive_url     TEXT,          -- Shareable URL
  caption       TEXT,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equip_photos_equipment ON equipment_photos(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equip_photos_company   ON equipment_photos(company_id);

-- Google Drive Tokens pro Firma
CREATE TABLE IF NOT EXISTS google_drive_tokens (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  access_token  TEXT,
  refresh_token TEXT NOT NULL,
  expiry_date   BIGINT,
  drive_folder_id TEXT,        -- Haupt-Ordner in Drive
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
