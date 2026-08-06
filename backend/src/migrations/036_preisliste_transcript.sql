-- 036: Plaud-Transkript in Angeboten speichern + Klimatechnik Preisliste

-- Transkript-Feld im Dokument
ALTER TABLE documents ADD COLUMN IF NOT EXISTS plaud_transcript TEXT;

-- Klimatechnik Material- und Geräteliste für alle bestehenden Firmen
DO $$
DECLARE co RECORD;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    INSERT INTO products (company_id, sku, name, description, unit, net_price, gross_price, vat_rate, product_type)
    SELECT co.id, v.sku, v.name, v.description, v.unit,
           v.net_price::NUMERIC, v.gross_price::NUMERIC, 20, v.product_type
    FROM (VALUES
      -- ── Leistungen ───────────────────────────────────────────────────────────
      ('L-011', 'Montage Split 2,5 kW',         'Montage und Inbetriebnahme Split-Klimaanlage 2,5 kW inkl. Kernbohrung', 'pauschal', 480, 576, 'service'),
      ('L-012', 'Montage Split 3,5 kW',         'Montage und Inbetriebnahme Split-Klimaanlage 3,5 kW inkl. Kernbohrung', 'pauschal', 560, 672, 'service'),
      ('L-013', 'Montage Split 5,0 kW',         'Montage und Inbetriebnahme Split-Klimaanlage 5,0 kW inkl. Kernbohrung', 'pauschal', 680, 816, 'service'),
      ('L-014', 'Montage Split 7,0 kW',         'Montage und Inbetriebnahme Split-Klimaanlage 7,0 kW inkl. Kernbohrung', 'pauschal', 820, 984, 'service'),
      ('L-015', 'Kernbohrung',                  'Kernbohrung Mauerwerk für Kältemittelleitungen', 'pauschal', 95, 114, 'service'),
      ('L-016', 'Rohrverlängerung je Meter',    'Zusätzliche Kältemittelleitung je Meter über Standardlänge', 'm', 18, 21.60, 'service'),
      ('L-017', 'F-Gas Dichtheitsprüfung',       'Dichtigkeitsprüfung gemäß EU F-Gas-Verordnung mit Protokoll', 'pauschal', 95, 114, 'service'),
      ('L-018', 'Entsorgung Kältemittel',        'Fachgerechte Entsorgung und Rückgewinnung Kältemittel', 'pauschal', 65, 78, 'service'),
      ('L-019', 'Aufstellung Außengerät',        'Aufstellungsarbeit Außengerät inkl. Halterung', 'pauschal', 120, 144, 'service'),
      ('L-020', 'Elektroanschluss',              'Elektrischer Anschluss Klimaanlage', 'pauschal', 85, 102, 'service'),
      -- ── Material: Kabel ──────────────────────────────────────────────────────
      ('M-001', 'Kabel 5x1,5mm²',              'NYM-J 5x1,5mm² Installationskabel', 'm', 2.50, 3.00, 'material'),
      ('M-002', 'Kabel 5x2,5mm²',              'NYM-J 5x2,5mm² Installationskabel', 'm', 3.80, 4.56, 'material'),
      ('M-003', 'Kabel 3x1,5mm²',              'NYM-J 3x1,5mm² Installationskabel', 'm', 1.80, 2.16, 'material'),
      ('M-004', 'Kabel 3x2,5mm²',              'NYM-J 3x2,5mm² Installationskabel', 'm', 2.50, 3.00, 'material'),
      -- ── Material: Kupferrohre ─────────────────────────────────────────────────
      ('M-010', 'Kupferrohr 1/4"',             'Kupferrohr weich 1/4" (6,35mm) mit Dämmung', 'm', 3.20, 3.84, 'material'),
      ('M-011', 'Kupferrohr 3/8"',             'Kupferrohr weich 3/8" (9,52mm) mit Dämmung', 'm', 4.50, 5.40, 'material'),
      ('M-012', 'Kupferrohr 1/2"',             'Kupferrohr weich 1/2" (12,7mm) mit Dämmung', 'm', 6.00, 7.20, 'material'),
      ('M-013', 'Kupferrohr 5/8"',             'Kupferrohr weich 5/8" (15,88mm) mit Dämmung', 'm', 7.80, 9.36, 'material'),
      -- ── Material: Geräte ─────────────────────────────────────────────────────
      ('G-001', 'Split-Außengerät 2,5 kW',    'Klimaanlage Außengerät 2,5 kW (Lieferant nach Wahl)', 'Stk.', 420, 504, 'material'),
      ('G-002', 'Split-Außengerät 3,5 kW',    'Klimaanlage Außengerät 3,5 kW (Lieferant nach Wahl)', 'Stk.', 580, 696, 'material'),
      ('G-003', 'Split-Außengerät 5,0 kW',    'Klimaanlage Außengerät 5,0 kW (Lieferant nach Wahl)', 'Stk.', 780, 936, 'material'),
      ('G-004', 'Split-Außengerät 7,0 kW',    'Klimaanlage Außengerät 7,0 kW (Lieferant nach Wahl)', 'Stk.', 980, 1176, 'material'),
      ('G-005', 'Split-Innengerät 2,5 kW',    'Klimaanlage Innengerät 2,5 kW (Lieferant nach Wahl)', 'Stk.', 280, 336, 'material'),
      ('G-006', 'Split-Innengerät 3,5 kW',    'Klimaanlage Innengerät 3,5 kW (Lieferant nach Wahl)', 'Stk.', 380, 456, 'material'),
      ('G-007', 'Split-Innengerät 5,0 kW',    'Klimaanlage Innengerät 5,0 kW (Lieferant nach Wahl)', 'Stk.', 480, 576, 'material'),
      ('G-008', 'Split-Innengerät 7,0 kW',    'Klimaanlage Innengerät 7,0 kW (Lieferant nach Wahl)', 'Stk.', 620, 744, 'material'),
      -- ── Material: Zubehör ─────────────────────────────────────────────────────
      ('Z-001', 'Wanddurchführung',            'Wanddurchführung mit Abdeckung', 'Stk.', 18, 21.60, 'material'),
      ('Z-002', 'Kondensatpumpe',              'Kondensatpumpe für Innengerät', 'Stk.', 48, 57.60, 'material'),
      ('Z-003', 'Außenwandhalterung',          'Wandhalterung für Außengerät verzinkt', 'Stk.', 35, 42, 'material'),
      ('Z-004', 'Kältemittel R32 (per kg)',    'Kältemittel R32 inkl. Einfüllprotokoll', 'kg', 14, 16.80, 'material'),
      ('Z-005', 'Kältemittel R410A (per kg)',  'Kältemittel R410A inkl. Einfüllprotokoll', 'kg', 9, 10.80, 'material'),
      ('Z-006', 'Wärmedämmung 9mm (per m)',    'Armaflex-Dämmschlauch 9mm Wandstärke', 'm', 2.20, 2.64, 'material'),
      ('Z-007', 'Wärmedämmung 13mm (per m)',   'Armaflex-Dämmschlauch 13mm Wandstärke', 'm', 2.80, 3.36, 'material'),
      ('Z-008', 'Kabelkanal 40x25mm (per m)',  'PVC Kabelkanal für Außenmontage', 'm', 4.50, 5.40, 'material'),
      ('Z-009', 'Dübel & Schrauben Set',       'Befestigungsmaterial pauschal', 'pauschal', 12, 14.40, 'material'),
      ('Z-010', 'Abflussschlauch (per m)',     'Kondensatschlauch für Außenführung', 'm', 1.80, 2.16, 'material')
    ) AS v(sku, name, description, unit, net_price, gross_price, product_type)
    WHERE NOT EXISTS (
      SELECT 1 FROM products WHERE company_id = co.id AND sku = v.sku
    );
  END LOOP;
END $$;
