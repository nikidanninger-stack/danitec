-- Migration 003: Sequenzen nach Seed-Daten korrigieren + Letterhead-Spalte
-- Setzt next_customer_seq, next_supplier_seq, next_invoice_seq auf max+1

UPDATE company_settings cs SET
  next_customer_seq = COALESCE(
    (SELECT MAX(CAST(REGEXP_REPLACE(customer_number, '[^0-9]', '', 'g') AS INTEGER)) + 1
     FROM customers WHERE company_id = cs.company_id AND customer_number ~ '^[A-Z]+-[0-9]+$'),
    1
  ),
  next_supplier_seq = COALESCE(
    (SELECT MAX(CAST(REGEXP_REPLACE(supplier_number, '[^0-9]', '', 'g') AS INTEGER)) + 1
     FROM suppliers WHERE company_id = cs.company_id AND supplier_number ~ '^[A-Z]+-[0-9]+$'),
    1
  ),
  next_invoice_seq = COALESCE(
    (SELECT MAX(CAST(REGEXP_REPLACE(number, '[^0-9]', '', 'g') AS INTEGER)) + 1
     FROM documents WHERE company_id = cs.company_id AND type = 'invoice' AND number ~ '^[A-Z]+-[0-9]+-[0-9]+$'),
    1
  );

-- Letterhead für eigene Rechnungsvorlage
ALTER TABLE companies ADD COLUMN IF NOT EXISTS letterhead_path TEXT;
