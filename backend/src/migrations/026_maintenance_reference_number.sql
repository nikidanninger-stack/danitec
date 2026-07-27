-- Migration 026: reference_number Spalte für Wartungsverträge
ALTER TABLE maintenance_contracts
  ADD COLUMN IF NOT EXISTS reference_number VARCHAR(50);
