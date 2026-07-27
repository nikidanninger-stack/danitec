-- Projekte: Inbetriebnahmedatum
ALTER TABLE projects ADD COLUMN IF NOT EXISTS inbetriebnahmedatum DATE;
