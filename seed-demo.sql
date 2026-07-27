-- Danitec Demo-Daten (korrigierte Spaltennamen)
DO $$
DECLARE
  cid INTEGER;
  k1 INTEGER; k2 INTEGER; k3 INTEGER; k4 INTEGER; k5 INTEGER;
BEGIN
  SELECT id INTO cid FROM companies LIMIT 1;
  IF cid IS NULL THEN RAISE EXCEPTION 'Keine Company gefunden!'; END IF;

  -- ── Kunden ────────────────────────────────────────────────────────────────
  INSERT INTO customers (company_id, customer_number, type, company_name, first_name, last_name, email, phone, address, zip, city, country, notes)
  VALUES (cid, 'K-1001', 'business', 'Billa AG', '', '', 'technik@billa.at', '+43 1 234 5678', 'Wienerbergstraße 11', '1100', 'Wien', 'AT', 'Filialleiter: Hr. Maier')
  RETURNING id INTO k1;

  INSERT INTO customers (company_id, customer_number, type, company_name, first_name, last_name, email, phone, address, zip, city, country, notes)
  VALUES (cid, 'K-1002', 'business', 'Hotel Sacher', '', '', 'facility@sacher.com', '+43 1 514 560', 'Philharmonikerstraße 4', '1010', 'Wien', 'AT', 'Ansprechpartner: Fr. Huber')
  RETURNING id INTO k2;

  INSERT INTO customers (company_id, customer_number, type, company_name, first_name, last_name, email, phone, address, zip, city, country, notes)
  VALUES (cid, 'K-1003', 'private', '', 'Thomas', 'Gruber', 'thomas.gruber@gmail.com', '+43 699 1234567', 'Hauptstraße 22', '3100', 'St. Pölten', 'AT', 'Einfamilienhaus, Split-Klimaanlage')
  RETURNING id INTO k3;

  INSERT INTO customers (company_id, customer_number, type, company_name, first_name, last_name, email, phone, address, zip, city, country, notes)
  VALUES (cid, 'K-1004', 'business', 'Interspar GmbH', '', '', 'haustechnik@interspar.at', '+43 662 44 72 0', 'Europastraße 1', '5020', 'Salzburg', 'AT', 'Zentrallager Kältetechnik')
  RETURNING id INTO k4;

  INSERT INTO customers (company_id, customer_number, type, company_name, first_name, last_name, email, phone, address, zip, city, country, notes)
  VALUES (cid, 'K-1005', 'private', '', 'Maria', 'Schuster', 'm.schuster@outlook.com', '+43 676 9876543', 'Bergstraße 7', '6020', 'Innsbruck', 'AT', 'Gaststätte Zur Alm')
  RETURNING id INTO k5;

  -- ── Kundenanlagen ─────────────────────────────────────────────────────────
  INSERT INTO customer_equipment (company_id, customer_id, equipment_number, name, equipment_type, manufacturer, model, serial_number, refrigerant, refrigerant_amount_kg, location, install_date, last_maintenance, next_maintenance, status, notes)
  VALUES (cid, k1, 'A-0001', 'Kühlraum EG', 'Kühlraum', 'Carrier', 'XCR-3000', 'CR-2021-4471', 'R404A', 8.5, 'Wienerbergstraße 11, EG', '2021-03-15', '2025-01-10', '2026-01-10', 'active', 'Läuft störungsfrei');

  INSERT INTO customer_equipment (company_id, customer_id, equipment_number, name, equipment_type, manufacturer, model, serial_number, refrigerant, refrigerant_amount_kg, location, install_date, last_maintenance, next_maintenance, status, notes)
  VALUES (cid, k1, 'A-0002', 'Tiefkühlzelle Keller', 'Tiefkühlzelle', 'Bitzer', 'CSW-7573', 'TK-2019-8812', 'R507', 12.0, 'Wienerbergstraße 11, Keller', '2019-06-01', '2024-06-01', '2025-06-01', 'active', 'Überfällige Wartung! Kompressor erhöhte Temperatur.');

  INSERT INTO customer_equipment (company_id, customer_id, equipment_number, name, equipment_type, manufacturer, model, serial_number, refrigerant, refrigerant_amount_kg, location, install_date, last_maintenance, next_maintenance, status, notes)
  VALUES (cid, k2, 'A-0003', 'Klimaanlage Rezeption', 'Split-Klimaanlage', 'Daikin', 'FTXM50R', 'DAI-2022-0091', 'R32', 1.2, 'Hotel Sacher, Rezeption EG', '2022-04-20', '2025-04-20', '2026-04-20', 'active', 'Jahreswartung immer im April');

  INSERT INTO customer_equipment (company_id, customer_id, equipment_number, name, equipment_type, manufacturer, model, serial_number, refrigerant, refrigerant_amount_kg, location, install_date, last_maintenance, next_maintenance, status, notes)
  VALUES (cid, k3, 'A-0004', 'Split-Klimaanlage Wohnzimmer', 'Split-Klimaanlage', 'Mitsubishi Electric', 'MSZ-AP35VG', 'ME-2023-5512', 'R32', 0.9, 'EFH Gruber, Wohnzimmer', '2023-08-10', '2024-08-10', '2025-08-10', 'active', 'Privatanlage, Termin telefonisch');

  INSERT INTO customer_equipment (company_id, customer_id, equipment_number, name, equipment_type, manufacturer, model, serial_number, refrigerant, refrigerant_amount_kg, location, install_date, last_maintenance, next_maintenance, status, notes)
  VALUES (cid, k4, 'A-0005', 'Kühlmöbel Obst & Gemüse', 'Kühlmöbel', 'Hussmann', 'MANHATTAN-3', 'HU-2020-3317', 'R449A', 15.0, 'Interspar Salzburg, Verkaufsfläche', '2020-02-01', '2025-02-01', '2026-02-01', 'active', 'Verbundanlage, 3 Möbel an einem Kreislauf');

  -- ── Wartungsverträge ──────────────────────────────────────────────────────
  INSERT INTO maintenance_contracts (company_id, customer_id, contract_number, name, contract_start, contract_end, interval_months, next_service_date, price_yearly, status, notes)
  VALUES (cid, k1, 'WV-0001', 'Jahreswartung Billa Kühlräume', '2024-01-01', '2026-12-31', 12, '2026-01-10', 450.00, 'active', 'Kühlraum EG + Tiefkühlzelle Keller');

  INSERT INTO maintenance_contracts (company_id, customer_id, contract_number, name, contract_start, contract_end, interval_months, next_service_date, price_yearly, status, notes)
  VALUES (cid, k2, 'WV-0002', 'Vollwartung Hotel Sacher Klimaanlagen', '2023-01-01', '2027-12-31', 6, '2025-10-20', 1200.00, 'active', '2x Wartung pro Jahr, alle Klimaanlagen');

  INSERT INTO maintenance_contracts (company_id, customer_id, contract_number, name, contract_start, contract_end, interval_months, next_service_date, price_yearly, status, notes)
  VALUES (cid, k4, 'WV-0003', 'Wartungsvertrag Interspar Kältemöbel', '2024-06-01', '2027-05-31', 12, '2026-02-01', 890.00, 'active', 'Inkl. Kältemittelcheck und Leckageprüfung');

  -- ── Produkte / Lagerbestand ───────────────────────────────────────────────
  INSERT INTO products (company_id, sku, name, category, unit, net_price, gross_price, vat_rate, product_type, stock_quantity, min_stock, purchase_price) VALUES
  (cid, 'KM-R32-10',    'R32 Kältemittel 10kg Flasche',       'Kältemittel',        'Stk',   89.00,  106.80, 20, 'material', 8,  3,  52.00),
  (cid, 'KM-R410A-11',  'R410A Kältemittel 11,3kg Flasche',   'Kältemittel',        'Stk',  120.00,  144.00, 20, 'material', 5,  2,  75.00),
  (cid, 'KM-R404A-10',  'R404A Kältemittel 10kg Flasche',     'Kältemittel',        'Stk',  195.00,  234.00, 20, 'material', 2,  3, 130.00),
  (cid, 'KM-R449A-10',  'R449A Kältemittel 10kg Flasche',     'Kältemittel',        'Stk',  210.00,  252.00, 20, 'material', 4,  2, 140.00),
  (cid, 'KR-3-8-25M',   'Kupferrohr 3/8" 25m Rolle',          'Rohre & Leitungen',  'Rolle', 68.00,   81.60, 20, 'material', 6,  2,  42.00),
  (cid, 'KR-1-2-25M',   'Kupferrohr 1/2" 25m Rolle',          'Rohre & Leitungen',  'Rolle', 88.00,  105.60, 20, 'material', 4,  2,  55.00),
  (cid, 'WD-15-22',     'Wärmedämmschlauch 15mm DN22',        'Dämmmaterial',       'm',      3.80,    4.56, 20, 'material', 50, 20,  2.10),
  (cid, 'FM-500-500',   'Filtermatte 500x500mm',              'Verbrauchsmaterial', 'Stk',    8.50,   10.20, 20, 'material', 30, 10,  4.20),
  (cid, 'KP-MINI-ORG',  'Kondensatpumpe Mini Orange',         'Zubehör',            'Stk',   42.00,   50.40, 20, 'material', 5,  2,  26.00),
  (cid, 'LS-SPRAY-400', 'Lecksuche Spray 400ml',             'Verbrauchsmaterial', 'Stk',   12.90,   15.48, 20, 'material', 12, 5,   7.50),
  (cid, 'DAI-FTXM25R',  'Daikin FTXM25R Innengerät',         'Geräte',             'Stk',  580.00,  696.00, 20, 'material', 2,  1, 380.00),
  (cid, 'ME-MSZ-AP25',  'Mitsubishi MSZ-AP25VG Innengerät',  'Geräte',             'Stk',  620.00,  744.00, 20, 'material', 1,  1, 410.00);

  -- ── Planungsprojekte ──────────────────────────────────────────────────────
  INSERT INTO projects (company_id, customer_id, project_number, name, description, status, priority, site_address, site_zip, site_city, start_date, end_date, budget_net)
  VALUES (cid, k5, 'PRJ-0001', 'Klimaanlage Gaststätte Zur Alm', 'Planung und Installation einer neuen Split-Klimaanlage im Gastraum (ca. 80m²). Außeneinheit auf Dach.', 'active', 'high', 'Bergstraße 7', '6020', 'Innsbruck', '2026-07-01', '2026-08-15', 4800.00);

  INSERT INTO projects (company_id, customer_id, project_number, name, description, status, priority, site_address, site_zip, site_city, start_date, end_date, budget_net)
  VALUES (cid, k4, 'PRJ-0002', 'Erweiterung Kälteanlagen Interspar', 'Erweiterung der bestehenden Kälteanlage um 2 weitere Kühlmöbel im Molkerei-Bereich.', 'active', 'normal', 'Europastraße 1', '5020', 'Salzburg', '2026-08-01', '2026-09-30', 12500.00);

  INSERT INTO projects (company_id, customer_id, project_number, name, description, status, priority, site_address, site_zip, site_city, start_date, end_date, budget_net)
  VALUES (cid, k2, 'PRJ-0003', 'Klimatisierung Konferenzräume Hotel Sacher', 'Neues Klimakonzept für 3 Konferenzräume im 2. OG. Kassettengeräte, Steuerung über BMS.', 'paused', 'normal', 'Philharmonikerstraße 4', '1010', 'Wien', '2026-06-01', '2026-10-31', 28000.00);

  RAISE NOTICE 'Demo-Daten erfolgreich angelegt!';
END $$;
