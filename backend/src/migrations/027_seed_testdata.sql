-- Migration 027: Alle Kunden/Projekte löschen + realistische österreichische Testdaten
-- Kälte & Klimatechnik – 10 Kunden, 15 Anlagen, 7 Wartungsverträge

DO $$
DECLARE
  v_company_id INTEGER;
  v_prefix     VARCHAR(10);
  v_seq        INTEGER;

  c1 INT; c2 INT; c3 INT; c4 INT; c5 INT;
  c6 INT; c7 INT; c8 INT; c9 INT; c10 INT;

  e1 INT; e2 INT; e3 INT; e4 INT; e5 INT;
  e6 INT; e7 INT; e8 INT; e9 INT; e10 INT;
  e11 INT; e12 INT; e13 INT; e14 INT; e15 INT;

  v_wnum VARCHAR(30);

BEGIN
  SELECT id INTO v_company_id FROM companies ORDER BY id LIMIT 1;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Keine Company gefunden!'; END IF;

  SELECT COALESCE(maintenance_contract_prefix, 'WV') INTO v_prefix
    FROM company_settings WHERE company_id = v_company_id;

  -- ── ALLES LÖSCHEN ──────────────────────────────
  DELETE FROM maintenance_contracts WHERE company_id = v_company_id;
  DELETE FROM service_reports        WHERE company_id = v_company_id;
  DELETE FROM customer_equipment     WHERE company_id = v_company_id;
  DELETE FROM project_notes  WHERE project_id IN (SELECT id FROM projects WHERE company_id = v_company_id);
  DELETE FROM project_tasks  WHERE project_id IN (SELECT id FROM projects WHERE company_id = v_company_id);
  DELETE FROM projects       WHERE company_id = v_company_id;
  -- Dokumente + alle abhängigen Tabellen (FK-Reihenfolge beachten)
  DELETE FROM document_payments WHERE document_id IN (SELECT id FROM documents WHERE company_id = v_company_id);
  DELETE FROM offer_details     WHERE document_id IN (SELECT id FROM documents WHERE company_id = v_company_id);
  DELETE FROM document_items    WHERE document_id IN (SELECT id FROM documents WHERE company_id = v_company_id);
  DELETE FROM documents         WHERE company_id = v_company_id;
  DELETE FROM customers      WHERE company_id = v_company_id;

  -- Sequenzen zurücksetzen
  DELETE FROM order_number_seq WHERE company_id = v_company_id AND prefix IN ('A','W');
  INSERT INTO order_number_seq (company_id, prefix, year, last_number)
    VALUES (v_company_id, 'A', 2026, 0),(v_company_id, 'W', 2026, 0)
    ON CONFLICT DO NOTHING;
  UPDATE company_settings SET next_maintenance_contract_seq = 1 WHERE company_id = v_company_id;

  -- ── 10 KUNDEN ─────────────────────────────────

  INSERT INTO customers (company_id,type,company_name,address,zip,city,country,phone,email,notes,created_at)
  VALUES (v_company_id,'business','BILLA AG – Filiale Wiener Neustadt','Wiener Straße 87','2700','Wiener Neustadt','AT','+43 2622 24810','technik.wneustadt@billa.at','Lebensmittelhandel, mehrere Kühltheken und Tiefkühlbereiche',NOW())
  RETURNING id INTO c1;

  INSERT INTO customers (company_id,type,company_name,address,zip,city,country,phone,email,notes,created_at)
  VALUES (v_company_id,'business','Hotel Schlossberg GmbH','Burgring 12','8010','Graz','AT','+43 316 807070','haustechnik@hotelschlossberg.at','4-Sterne-Hotel, VRV-Klimaanlage Zimmer + Konferenz, Küche',NOW())
  RETURNING id INTO c2;

  INSERT INTO customers (company_id,type,company_name,address,zip,city,country,phone,email,notes,created_at)
  VALUES (v_company_id,'business','Metzgerei Kronberger KG','Hauptplatz 5','4020','Linz','AT','+43 732 661234','office@metzgerei-kronberger.at','Fleischerei mit Kühlhaus und Verkaufstheke',NOW())
  RETURNING id INTO c3;

  INSERT INTO customers (company_id,type,company_name,address,zip,city,country,phone,email,notes,created_at)
  VALUES (v_company_id,'business','Rechenzentrum DATACOR GmbH','Laxenburger Straße 244','1230','Wien','AT','+43 1 8900 4400','facility@datacor.at','IT-Rechenzentrum, Präzisionskühlung, 24/7 Bereitschaft',NOW())
  RETURNING id INTO c4;

  INSERT INTO customers (company_id,type,company_name,address,zip,city,country,phone,email,notes,created_at)
  VALUES (v_company_id,'business','Apotheke am Dom','Domplatz 3','5020','Salzburg','AT','+43 662 841520','info@apotheke-am-dom.at','Medikamentenkühlraum, Klimatisierung Verkaufsraum',NOW())
  RETURNING id INTO c5;

  INSERT INTO customers (company_id,type,first_name,last_name,address,zip,city,country,phone,email,notes,created_at)
  VALUES (v_company_id,'private','Klaus','Brandstätter','Sonnbergweg 14','6020','Innsbruck','AT','+43 664 3821094','k.brandsttter@icloud.com','Einfamilienhaus, Split-Klimaanlage Wohnzimmer + Schlafzimmer',NOW())
  RETURNING id INTO c6;

  INSERT INTO customers (company_id,type,company_name,address,zip,city,country,phone,email,notes,created_at)
  VALUES (v_company_id,'business','Brauerei Ottakringer – Lager Süd','Brauereiplatz 1','1160','Wien','AT','+43 1 4860 0300','technik@ottakringer.at','NH3-Großkühlanlage, F-Gas Dokumentation, Sachkundenachweis erforderlich',NOW())
  RETURNING id INTO c7;

  INSERT INTO customers (company_id,type,company_name,address,zip,city,country,phone,email,notes,created_at)
  VALUES (v_company_id,'business','Seniorenresidenz Sonnenhof GmbH','Parkstraße 8','3100','Sankt Pölten','AT','+43 2742 880220','verwaltung@sonnenhof-stpoelten.at','Pflegeheim, Klimatisierung Patientenzimmer, HEPA-Filter',NOW())
  RETURNING id INTO c8;

  INSERT INTO customers (company_id,type,company_name,address,zip,city,country,phone,email,notes,created_at)
  VALUES (v_company_id,'business','AutoZentrum Kern GmbH & Co KG','Industriestraße 33','9020','Klagenfurt','AT','+43 463 211580','service@autozentrum-kern.at','Autohaus + Werkstatt, Showroom Klimaanlage, Lackierkabine',NOW())
  RETURNING id INTO c9;

  INSERT INTO customers (company_id,type,first_name,last_name,address,zip,city,country,phone,email,notes,created_at)
  VALUES (v_company_id,'private','Sabine','Wolfgruber','Fichtenweg 22','4600','Wels','AT','+43 650 7741882','s.wolfgruber@gmail.com','Einfamilienhaus, Luft/Wasser Wärmepumpe Heizung + Kühlung',NOW())
  RETURNING id INTO c10;

  -- ── 15 ANLAGEN ────────────────────────────────

  -- Anlage 1: BILLA – Verbundkälteanlage
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c1,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'Verbundkälteanlage Verkaufsraum','Verbundanlage','Carrier','AquaSnap 30RB-170','CR-2021-VB8821','Verkaufsraum EG','R-449A',14.5,2021,'2021-03-15',6,'2025-11-10','2026-05-10','active','Hauptanlage Kühltheken + Tiefkühlbereiche')
  RETURNING id INTO e1;

  -- Anlage 2: BILLA – Split Büro
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c1,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'Split-Klimaanlage Büro','Split-Klimaanlage','Daikin','FTXM35R','DK-22-BG4491','Büro OG','R-32',0.9,2022,'2022-06-01',12,'2025-06-03','2026-06-03','active',NULL)
  RETURNING id INTO e2;

  -- Anlage 3: Hotel Schlossberg – VRV
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c2,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'VRV-System Hotelzimmer 1-40','VRV-Anlage','Daikin','VRV IV-S RYYQ20T','DK-VRV-2019-0041','Technikraum UG','R-410A',38.0,2019,'2019-09-12',6,'2025-09-15','2026-03-15','active','40 Innengeräte, jährliche F-Gas Leckprüfung Pflicht')
  RETURNING id INTO e3;

  -- Anlage 4: Hotel Schlossberg – Kühlanlage Küche
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c2,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'Kühlanlage Hotelküche','Kühlzelle','Viessmann','Vitocal 200-G','VS-KH-2020-2291','Küchenbereich EG','R-134a',5.2,2020,'2020-04-08',12,'2025-04-10','2026-04-10','active','Walk-In Kühlraum + Tiefkühlzelle Küche')
  RETURNING id INTO e4;

  -- Anlage 5: Metzgerei – Kühlhaus
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c3,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'Tiefkühlhaus Fleischlagerung','Kühlanlage','Bitzer','CSH9553-140Y','BZ-2018-KH0088','Kühlhaus hinten','R-404A',22.0,2018,'2018-11-20',6,'2025-10-22','2026-04-22','active','Tiefkühlhaus -18°C, Fleischlagerung ca. 200 m³')
  RETURNING id INTO e5;

  -- Anlage 6: DATACOR – Serverraum A
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c4,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'Präzisionsklimaanlage Serverraum A','Präzisionsklimaanlage','Stulz','CyberAir 3 DX','ST-2022-RZ9901','Serverraum A','R-410A',12.5,2022,'2022-01-17',3,'2026-03-20','2026-06-20','active','24/7 Betrieb, Alarmmeldung an Betrieb')
  RETURNING id INTO e6;

  -- Anlage 7: DATACOR – Serverraum B
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c4,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'Präzisionsklimaanlage Serverraum B','Präzisionsklimaanlage','Stulz','CyberAir 3 DX','ST-2022-RZ9902','Serverraum B','R-410A',12.5,2022,'2022-01-17',3,'2026-03-20','2026-06-20','active','Redundanzanlage zu Serverraum A')
  RETURNING id INTO e7;

  -- Anlage 8: Apotheke – Klima + Medikamentenkühlraum
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c5,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'Split-Klimaanlage Verkaufsraum','Split-Klimaanlage','Mitsubishi Electric','MSZ-EF25VGK','ME-2023-APO0032','Verkaufsraum','R-32',0.75,2023,'2023-03-05',12,'2025-03-08','2026-03-08','active','Temperaturregulierung 20-22°C, UV-C Filter')
  RETURNING id INTO e8;

  -- Anlage 9: Brandstätter – Multisplit
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c6,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'Multisplit Wohnzimmer & Schlafzimmer','Multisplit-Klimaanlage','Daikin','MXM50N + 2x CTXM25R','DK-2024-IBK7710','Wohnhaus EG + OG','R-32',1.8,2024,'2024-05-14',24,'2025-05-16','2027-05-16','active','Privathaus, 2 Innengeräte')
  RETURNING id INTO e9;

  -- Anlage 10: Ottakringer – NH3-Anlage
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c7,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'NH3-Kälteanlage Gärkeller','Großkühlanlage','GEA','Grasso 10M','GEA-2015-NH30041','Technikraum Keller','R-717 (NH3)',280.0,2015,'2015-08-01',3,'2026-02-14','2026-05-14','active','Ammoniak-Anlage! Sachkundenachweis + PSA Pflicht, jährliche Druckprüfung')
  RETURNING id INTO e10;

  -- Anlage 11: Ottakringer – Lagertanks Kältesatz
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c7,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'Kältesatz Lagertanks','Kühlanlage','Bitzer','CSVH9553-200Y','BZ-2017-OT8820','Lagerhalle','R-507A',45.0,2017,'2017-05-23',6,'2025-11-25','2026-05-25','active','Kühlung Gärtanks + Lagertanks Keller')
  RETURNING id INTO e11;

  -- Anlage 12: Sonnenhof – Zentralklima
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c8,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'Zentralklimaanlage Patiententrakt','Zentralklimaanlage','Carrier','AHU 50VZ','CR-2020-SH5501','Technikraum Dach','R-410A',28.0,2020,'2020-07-22',6,'2026-01-20','2026-07-20','active','Klimatisierung 35 Patientenzimmer, HEPA-Filter')
  RETURNING id INTO e12;

  -- Anlage 13: Sonnenhof – Medikamentenkühlraum
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c8,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'Kühlzelle Medikamentenlager','Kühlzelle','Zanotti','MPE 115L','ZN-2021-SH0044','Wirtschaftsraum EG','R-449A',3.2,2021,'2021-01-30',12,'2025-01-28','2026-01-28','active','Medikamentenkühlraum 2-8°C, Temperaturalarm vorhanden')
  RETURNING id INTO e13;

  -- Anlage 14: AutoZentrum Kern – VRF Showroom
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c9,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'VRF-Anlage Showroom & Büros','VRF-Anlage','LG Electronics','Multi V 5','LG-2023-KFN0192','Technikraum Dach','R-410A',22.0,2023,'2023-08-09',12,'2025-08-11','2026-08-11','active','Showroom + 4 Büros + Besprechungsraum')
  RETURNING id INTO e14;

  -- Anlage 15: Wolfgruber – Wärmepumpe
  UPDATE order_number_seq SET last_number = last_number+1 WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='A' AND year=2026;
  INSERT INTO customer_equipment (company_id,customer_id,order_number,name,equipment_type,manufacturer,model,serial_number,location,refrigerant,refrigerant_amount_kg,year_built,install_date,maintenance_interval_months,last_maintenance,next_maintenance,status,notes)
  VALUES (v_company_id,c10,'A-2026-'||LPAD(v_seq::TEXT,4,'0'),'Wärmepumpe Heizung & Kühlung','Wärmepumpe','Vaillant','aroTHERM plus VWL 125/6 A','VA-2023-WE9903','Technikraum','R-290',1.4,2023,'2023-11-03',24,'2025-11-05','2027-11-05','active','Luft/Wasser WP, Heizung + aktive Kühlung EFH')
  RETURNING id INTO e15;

  -- ── 7 WARTUNGSVERTRÄGE ────────────────────────

  -- WV 1: BILLA – Verbundanlage (halbjährig)
  UPDATE company_settings SET next_maintenance_contract_seq = next_maintenance_contract_seq+1 WHERE company_id=v_company_id;
  SELECT v_prefix||'-2026-'||LPAD((next_maintenance_contract_seq-1)::TEXT,4,'0') INTO v_wnum
    FROM company_settings WHERE company_id=v_company_id;
  UPDATE order_number_seq SET last_number=last_number+1 WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  INSERT INTO maintenance_contracts (company_id,contract_number,order_number,customer_id,name,description,status,contract_start,contract_end,interval_months,price_per_service,price_yearly,last_service_date,next_service_date,equipment_ids,notes,created_by)
  VALUES (v_company_id,v_wnum,'W-2026-'||LPAD(v_seq::TEXT,4,'0'),c1,'Wartungsvertrag Kühlanlage BILLA Wr. Neustadt','Halbjährliche Wartung Verbundkälteanlage inkl. Kältemittelkontrolle und F-Gas Dokumentation','active','2024-01-01','2027-12-31',6,420.00,840.00,'2025-11-10','2026-05-10',('[' || e1 || ']')::jsonb,'Schlüssel beim Filialleiter, Wartung außerhalb Öffnungszeiten (vor 8:00 Uhr)',1);

  -- WV 2: Hotel Schlossberg – VRV + Küche (halbjährig)
  UPDATE company_settings SET next_maintenance_contract_seq = next_maintenance_contract_seq+1 WHERE company_id=v_company_id;
  SELECT v_prefix||'-2026-'||LPAD((next_maintenance_contract_seq-1)::TEXT,4,'0') INTO v_wnum
    FROM company_settings WHERE company_id=v_company_id;
  UPDATE order_number_seq SET last_number=last_number+1 WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  INSERT INTO maintenance_contracts (company_id,contract_number,order_number,customer_id,name,description,status,contract_start,contract_end,interval_months,price_per_service,price_yearly,last_service_date,next_service_date,equipment_ids,notes,created_by)
  VALUES (v_company_id,v_wnum,'W-2026-'||LPAD(v_seq::TEXT,4,'0'),c2,'Wartungsvertrag VRV-System Hotel Schlossberg','Halbjährliche Vollwartung VRV-System inkl. aller 40 Innengeräte, Filterreinigung, F-Gas Leckprüfung','active','2023-01-01','2026-12-31',6,1850.00,3700.00,'2025-09-15','2026-03-15',('[' || e3 || ',' || e4 || ']')::jsonb,'Ansprechpartner: Hr. Riedl (Haustechnik) +43 316 807070-22',1);

  -- WV 3: DATACOR – Serverräume A+B (vierteljährlich)
  UPDATE company_settings SET next_maintenance_contract_seq = next_maintenance_contract_seq+1 WHERE company_id=v_company_id;
  SELECT v_prefix||'-2026-'||LPAD((next_maintenance_contract_seq-1)::TEXT,4,'0') INTO v_wnum
    FROM company_settings WHERE company_id=v_company_id;
  UPDATE order_number_seq SET last_number=last_number+1 WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  INSERT INTO maintenance_contracts (company_id,contract_number,order_number,customer_id,name,description,status,contract_start,contract_end,interval_months,price_per_service,price_yearly,last_service_date,next_service_date,equipment_ids,notes,created_by)
  VALUES (v_company_id,v_wnum,'W-2026-'||LPAD(v_seq::TEXT,4,'0'),c4,'Präventivwartung RZ DATACOR – Serverräume A & B','Vierteljährliche Wartung beider Präzisionsklimaanlagen, 24/7 Notfallservice inkl.','active','2023-01-01','2027-12-31',3,980.00,3920.00,'2026-03-20','2026-06-20',('[' || e6 || ',' || e7 || ']')::jsonb,'24/7 Notfallbereitschaft, Zutritt via Sicherheitsschleuse (Ausweis mitnehmen!)',1);

  -- WV 4: Ottakringer – NH3 + Lagerkältesatz (vierteljährlich)
  UPDATE company_settings SET next_maintenance_contract_seq = next_maintenance_contract_seq+1 WHERE company_id=v_company_id;
  SELECT v_prefix||'-2026-'||LPAD((next_maintenance_contract_seq-1)::TEXT,4,'0') INTO v_wnum
    FROM company_settings WHERE company_id=v_company_id;
  UPDATE order_number_seq SET last_number=last_number+1 WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  INSERT INTO maintenance_contracts (company_id,contract_number,order_number,customer_id,name,description,status,contract_start,contract_end,interval_months,price_per_service,price_yearly,last_service_date,next_service_date,equipment_ids,notes,created_by)
  VALUES (v_company_id,v_wnum,'W-2026-'||LPAD(v_seq::TEXT,4,'0'),c7,'Wartungsvertrag Kälteanlagen Ottakringer Brauerei','Quartalsweise Wartung NH3-Anlage + Lagerkältesatz, Druckprüfung, Lecksuche, Betriebstagebuch','active','2022-01-01','2026-12-31',3,2400.00,9600.00,'2026-02-14','2026-05-14',('[' || e10 || ',' || e11 || ']')::jsonb,'NH3 Sachkundenachweis + PSA Pflicht! Sicherheitsunterweisung vor Arbeitsbeginn',1);

  -- WV 5: Sonnenhof – Klimaanlage + Medikamentenkühlraum (halbjährig)
  UPDATE company_settings SET next_maintenance_contract_seq = next_maintenance_contract_seq+1 WHERE company_id=v_company_id;
  SELECT v_prefix||'-2026-'||LPAD((next_maintenance_contract_seq-1)::TEXT,4,'0') INTO v_wnum
    FROM company_settings WHERE company_id=v_company_id;
  UPDATE order_number_seq SET last_number=last_number+1 WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  INSERT INTO maintenance_contracts (company_id,contract_number,order_number,customer_id,name,description,status,contract_start,contract_end,interval_months,price_per_service,price_yearly,last_service_date,next_service_date,equipment_ids,notes,created_by)
  VALUES (v_company_id,v_wnum,'W-2026-'||LPAD(v_seq::TEXT,4,'0'),c8,'Wartungsvertrag Klimatechnik Seniorenresidenz Sonnenhof','Halbjährliche Wartung Zentralklima + Medikamentenkühlraum, HEPA-Filterservice, Hygienekontrolle','active','2023-06-01','2027-05-31',6,1150.00,2300.00,'2026-01-20','2026-07-20',('[' || e12 || ',' || e13 || ']')::jsonb,'Pflegebetrieb: Arbeiten nur 9-12 Uhr oder 14-16 Uhr, ruhig und diskret arbeiten',1);

  -- WV 6: Metzgerei Kronberger – Kühlhaus (halbjährig)
  UPDATE company_settings SET next_maintenance_contract_seq = next_maintenance_contract_seq+1 WHERE company_id=v_company_id;
  SELECT v_prefix||'-2026-'||LPAD((next_maintenance_contract_seq-1)::TEXT,4,'0') INTO v_wnum
    FROM company_settings WHERE company_id=v_company_id;
  UPDATE order_number_seq SET last_number=last_number+1 WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  INSERT INTO maintenance_contracts (company_id,contract_number,order_number,customer_id,name,description,status,contract_start,contract_end,interval_months,price_per_service,price_yearly,last_service_date,next_service_date,equipment_ids,notes,created_by)
  VALUES (v_company_id,v_wnum,'W-2026-'||LPAD(v_seq::TEXT,4,'0'),c3,'Wartungsvertrag Tiefkühlanlage Metzgerei Kronberger','Halbjährliche Wartung Tiefkühlanlage -18°C, Kältemittelkontrolle, Abtauheizungen, Türdichtungen','active','2022-03-01','2027-02-28',6,580.00,1160.00,'2025-10-22','2026-04-22',('[' || e5 || ']')::jsonb,'Wartung vor 7:00 Uhr (Betriebsbeginn Metzgerei um 7:00 Uhr)',1);

  -- WV 7: Sabine Wolfgruber – Wärmepumpe (2-jährig)
  UPDATE company_settings SET next_maintenance_contract_seq = next_maintenance_contract_seq+1 WHERE company_id=v_company_id;
  SELECT v_prefix||'-2026-'||LPAD((next_maintenance_contract_seq-1)::TEXT,4,'0') INTO v_wnum
    FROM company_settings WHERE company_id=v_company_id;
  UPDATE order_number_seq SET last_number=last_number+1 WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  SELECT last_number INTO v_seq FROM order_number_seq WHERE company_id=v_company_id AND prefix='W' AND year=2026;
  INSERT INTO maintenance_contracts (company_id,contract_number,order_number,customer_id,name,description,status,contract_start,contract_end,interval_months,price_per_service,price_yearly,last_service_date,next_service_date,equipment_ids,notes,created_by)
  VALUES (v_company_id,v_wnum,'W-2026-'||LPAD(v_seq::TEXT,4,'0'),c10,'Wartungsvertrag Wärmepumpe Wolfgruber','Zweijährige Inspektion Luft/Wasser-Wärmepumpe, Kältekreis, Heizungsanlage und Kühlfunktion','active','2023-11-01','2029-10-31',24,390.00,195.00,'2025-11-05','2027-11-05',('[' || e15 || ']')::jsonb,'Privatkundin, Terminabsprache per SMS bevorzugt, gerne samstags',1);

  RAISE NOTICE 'Testdaten OK: 10 Kunden, 15 Anlagen, 7 Wartungsverträge – Company-ID: %', v_company_id;
END;
$$;
