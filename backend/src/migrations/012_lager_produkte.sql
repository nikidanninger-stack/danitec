-- 012: Lagerverwaltung – Produkte erweitern + stock_movements + Default-Leistungen

-- Produkte: Typ + Lagerfelder
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_type     TEXT NOT NULL DEFAULT 'service',  -- 'service' | 'material'
  ADD COLUMN IF NOT EXISTS stock_quantity   NUMERIC(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_stock        NUMERIC(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_price   NUMERIC(12,2),                    -- Einkaufspreis
  ADD COLUMN IF NOT EXISTS supplier_id      INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;

-- Alle bestehenden Produkte als 'service' markieren (war vorher kein Typ)
-- (Bleibt bei default 'service', also nichts zu tun)

-- Lagerbewegungen
CREATE TABLE IF NOT EXISTS stock_movements (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type   TEXT NOT NULL,  -- 'in' (Wareneingang) | 'out' (Verbrauch/Verkauf) | 'adjust' (Korrektur)
  quantity        NUMERIC(10,3) NOT NULL,
  unit_price      NUMERIC(12,2),              -- Einkaufspreis bei Wareneingang
  reference_type  TEXT,                       -- 'scan' | 'invoice' | 'manual' | 'service_report'
  reference_id    INTEGER,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sm_company   ON stock_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_sm_product   ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_sm_date      ON stock_movements(created_at DESC);

-- ─── Default-Leistungen für jede Firma einfügen (falls noch keine vorhanden) ─
DO $$
DECLARE
  co RECORD;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    -- Nur einfügen wenn die Firma noch keine Produkte hat
    IF (SELECT COUNT(*) FROM products WHERE company_id = co.id) = 0 THEN
      INSERT INTO products (company_id, sku, name, description, unit, net_price, gross_price, vat_rate, product_type) VALUES
        (co.id, 'L-001', 'Montagestunde',           'Montage- und Installationsarbeiten Kältetechnik',   'Std',      85.00,  102.00, 20, 'service'),
        (co.id, 'L-002', 'Servicestunde',            'Reparatur, Service und Fehlersuche',                'Std',      75.00,   90.00, 20, 'service'),
        (co.id, 'L-003', 'Notdienststunde',          'Einsatz außerhalb der Geschäftszeiten',             'Std',     115.00,  138.00, 20, 'service'),
        (co.id, 'L-004', 'Anfahrtspauschale',        'Pauschale für An- und Abfahrt zum Kunden',          'pauschal', 45.00,   54.00, 20, 'service'),
        (co.id, 'L-005', 'Wartung Split-Gerät',      'Jährliche Wartung inkl. Protokoll',                 'pauschal',180.00,  216.00, 20, 'service'),
        (co.id, 'L-006', 'Wartung Verbundanlage',    'Jährliche Wartung Verbundanlage inkl. Protokoll',   'pauschal',320.00,  384.00, 20, 'service'),
        (co.id, 'L-007', 'Dichtigkeitsprüfung',      'Dichtigkeitsprüfung gemäß EU F-Gas-Verordnung',     'pauschal', 95.00,  114.00, 20, 'service'),
        (co.id, 'L-008', 'Inbetriebnahme',           'Erstinbetriebnahme und Einweisung',                 'pauschal',150.00,  180.00, 20, 'service'),
        (co.id, 'L-009', 'Demontage / Entsorgung',   'Demontage Altanlage und fachgerechte Entsorgung',   'pauschal',120.00,  144.00, 20, 'service'),
        (co.id, 'L-010', 'Fahrtkosten pro km',       'Kilometerabrechnung bei größeren Entfernungen',      'km',         0.50,    0.60, 20, 'service');
    END IF;
  END LOOP;
END $$;
