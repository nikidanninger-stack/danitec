-- Wartungsverträge: Datei-Upload + Online-Signatur
ALTER TABLE maintenance_contracts ADD COLUMN IF NOT EXISTS contract_file_path VARCHAR(500);
ALTER TABLE maintenance_contracts ADD COLUMN IF NOT EXISTS signature_data      TEXT;
ALTER TABLE maintenance_contracts ADD COLUMN IF NOT EXISTS signature_name      VARCHAR(100);
ALTER TABLE maintenance_contracts ADD COLUMN IF NOT EXISTS signature_date      DATE;
