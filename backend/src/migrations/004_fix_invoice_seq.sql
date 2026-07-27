-- Migration 004: Rechnungssequenz korrekt zurücksetzen + Jahres-Tracking
-- Zählt alle bestehenden Rechnungen → nächste Seq = Anzahl + 1
-- (egal ob Nummern RE-2026-0003 oder RE-2026-20260008 Format)

UPDATE company_settings cs SET
  next_invoice_seq = (
    SELECT COUNT(*) + 1
    FROM documents
    WHERE company_id = cs.company_id AND type = 'invoice'
  ),
  next_offer_seq = (
    SELECT COUNT(*) + 1
    FROM documents
    WHERE company_id = cs.company_id AND type = 'offer'
  ),
  next_customer_seq = COALESCE(
    (SELECT CAST(SPLIT_PART(MAX(customer_number), '-', 2) AS INTEGER) + 1
     FROM customers
     WHERE company_id = cs.company_id AND customer_number ~ '^[A-Z]+-[0-9]+$'),
    1
  ),
  next_supplier_seq = COALESCE(
    (SELECT CAST(SPLIT_PART(MAX(supplier_number), '-', 2) AS INTEGER) + 1
     FROM suppliers
     WHERE company_id = cs.company_id AND supplier_number ~ '^[A-Z]+-[0-9]+$'),
    1
  );

-- Jahres-Tracking für automatischen Jahreswechsel
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS invoice_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW());
UPDATE company_settings SET invoice_year = EXTRACT(YEAR FROM NOW()) WHERE invoice_year IS NULL;
