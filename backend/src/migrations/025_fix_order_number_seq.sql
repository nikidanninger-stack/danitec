-- Fix: order_number_seq Spalte 'prefix' sicherstellen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='order_number_seq' AND column_name='prefix'
  ) THEN
    -- Tabelle komplett neu erstellen falls prefix fehlt
    DROP TABLE IF EXISTS order_number_seq;
    CREATE TABLE order_number_seq (
      company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      prefix      VARCHAR(5) NOT NULL,
      year        INTEGER NOT NULL,
      last_number INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (company_id, prefix, year)
    );
  END IF;
END $$;

-- Prefix auf 5 Zeichen erweitern falls nötig (für 'W', 'K' etc.)
ALTER TABLE order_number_seq ALTER COLUMN prefix TYPE VARCHAR(5);
