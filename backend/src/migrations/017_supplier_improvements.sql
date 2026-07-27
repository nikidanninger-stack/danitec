-- Lieferanten: neue Felder
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_phone  VARCHAR(50);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS atu_uid        VARCHAR(30);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS iban           VARCHAR(34);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bic            VARCHAR(11);
