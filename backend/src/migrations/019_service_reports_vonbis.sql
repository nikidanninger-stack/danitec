-- Serviceberichte: Von-Bis Arbeitszeit
ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS time_from TIME;
ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS time_to   TIME;
