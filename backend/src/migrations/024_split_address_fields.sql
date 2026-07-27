-- Straße und Hausnummer als separate Felder

-- companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS street VARCHAR(200);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS house_number VARCHAR(20);

-- customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS street VARCHAR(200);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS house_number VARCHAR(20);

-- suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS street VARCHAR(200);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS house_number VARCHAR(20);

-- projects: Baustellenadresse
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_street VARCHAR(200);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_house_number VARCHAR(20);

-- Bestehende Daten migrieren: letztes Wort als Hausnummer wenn es mit Ziffer beginnt
UPDATE companies SET
  street       = TRIM(regexp_replace(address, '\s+\S+$', '')),
  house_number = TRIM(regexp_replace(address, '^.*\s+', ''))
WHERE address IS NOT NULL AND address ~ '\s+\S*\d\S*$';

UPDATE customers SET
  street       = TRIM(regexp_replace(address, '\s+\S+$', '')),
  house_number = TRIM(regexp_replace(address, '^.*\s+', ''))
WHERE address IS NOT NULL AND address ~ '\s+\S*\d\S*$';

UPDATE suppliers SET
  street       = TRIM(regexp_replace(address, '\s+\S+$', '')),
  house_number = TRIM(regexp_replace(address, '^.*\s+', ''))
WHERE address IS NOT NULL AND address ~ '\s+\S*\d\S*$';

UPDATE projects SET
  site_street       = TRIM(regexp_replace(site_address, '\s+\S+$', '')),
  site_house_number = TRIM(regexp_replace(site_address, '^.*\s+', ''))
WHERE site_address IS NOT NULL AND site_address ~ '\s+\S*\d\S*$';
