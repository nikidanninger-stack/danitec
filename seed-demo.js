// ─── Danitec Demo-Daten Seed ──────────────────────────────────────────────────
const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3001,
      path: '/api' + path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(raw);
          if (res.statusCode >= 400) reject(new Error(`${path}: ${d.error || res.statusCode}`));
          else resolve(d);
        } catch(e) { reject(new Error('JSON parse error: ' + raw.slice(0,100))); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  console.log('🔐 Login...');
  const { token } = await req('POST', '/auth/login', { email: 'admin@danitec.at', password: 'Danitec2025!' });
  const r = (method, path, body) => req(method, path, body, token);

  // ─── Kunden ───────────────────────────────────────────────────────────────
  console.log('👥 Kunden anlegen...');
  const k1 = await r('POST', '/customers', {
    companyName: 'Billa AG', firstName: '', lastName: '', email: 'technik@billa.at',
    phone: '+43 1 234 5678', address: 'Wienerbergstraße 11', zip: '1100', city: 'Wien',
    country: 'Österreich', notes: 'Filialleiter: Hr. Maier'
  });
  const k2 = await r('POST', '/customers', {
    companyName: 'Hotel Sacher', firstName: '', lastName: '', email: 'facility@sacher.com',
    phone: '+43 1 514 560', address: 'Philharmonikerstraße 4', zip: '1010', city: 'Wien',
    country: 'Österreich', notes: 'Ansprechpartner Technik: Fr. Huber'
  });
  const k3 = await r('POST', '/customers', {
    companyName: '', firstName: 'Thomas', lastName: 'Gruber', email: 'thomas.gruber@gmail.com',
    phone: '+43 699 1234567', address: 'Hauptstraße 22', zip: '3100', city: 'St. Pölten',
    country: 'Österreich', notes: 'Einfamilienhaus, Split-Klimaanlage'
  });
  const k4 = await r('POST', '/customers', {
    companyName: 'Interspar GmbH', firstName: '', lastName: '', email: 'haustechnik@interspar.at',
    phone: '+43 662 44 72 0', address: 'Europastraße 1', zip: '5020', city: 'Salzburg',
    country: 'Österreich', notes: 'Zentrallager Kältetechnik'
  });
  const k5 = await r('POST', '/customers', {
    companyName: '', firstName: 'Maria', lastName: 'Schuster', email: 'm.schuster@outlook.com',
    phone: '+43 676 9876543', address: 'Bergstraße 7', zip: '6020', city: 'Innsbruck',
    country: 'Österreich', notes: 'Gaststätte Zur Alm'
  });
  console.log('  ✓ 5 Kunden');

  // ─── Kundenanlagen ────────────────────────────────────────────────────────
  console.log('🏭 Kundenanlagen anlegen...');
  await r('POST', '/equipment', {
    customerId: k1.id, name: 'Kühlraum EG', equipmentType: 'Kühlraum',
    manufacturer: 'Carrier', model: 'XCR-3000', serialNumber: 'CR-2021-4471',
    refrigerant: 'R404A', refrigerantAmount: 8.5,
    location: 'Wienerbergstraße 11, EG', installDate: '2021-03-15',
    lastMaintenance: '2025-01-10', nextMaintenance: '2026-01-10', status: 'active',
    notes: 'Läuft störungsfrei'
  });
  await r('POST', '/equipment', {
    customerId: k1.id, name: 'Tiefkühlzelle Keller', equipmentType: 'Tiefkühlzelle',
    manufacturer: 'Bitzer', model: 'CSW-7573', serialNumber: 'TK-2019-8812',
    refrigerant: 'R507', refrigerantAmount: 12.0,
    location: 'Wienerbergstraße 11, Keller', installDate: '2019-06-01',
    lastMaintenance: '2024-06-01', nextMaintenance: '2025-06-01', status: 'active',
    notes: 'Überfällige Wartung! Kompressor erhöhte Temperatur.'
  });
  await r('POST', '/equipment', {
    customerId: k2.id, name: 'Klimaanlage Rezeption', equipmentType: 'Split-Klimaanlage',
    manufacturer: 'Daikin', model: 'FTXM50R', serialNumber: 'DAI-2022-0091',
    refrigerant: 'R32', refrigerantAmount: 1.2,
    location: 'Hotel Sacher, Rezeption EG', installDate: '2022-04-20',
    lastMaintenance: '2025-04-20', nextMaintenance: '2026-04-20', status: 'active',
    notes: 'Jahreswartung immer im April'
  });
  await r('POST', '/equipment', {
    customerId: k3.id, name: 'Split-Klimaanlage Wohnzimmer', equipmentType: 'Split-Klimaanlage',
    manufacturer: 'Mitsubishi Electric', model: 'MSZ-AP35VG', serialNumber: 'ME-2023-5512',
    refrigerant: 'R32', refrigerantAmount: 0.9,
    location: 'EFH Gruber, Wohnzimmer', installDate: '2023-08-10',
    lastMaintenance: '2024-08-10', nextMaintenance: '2025-08-10', status: 'active',
    notes: 'Privatanlage, Termin telefonisch'
  });
  await r('POST', '/equipment', {
    customerId: k4.id, name: 'Kühlmöbel Obst & Gemüse', equipmentType: 'Kühlmöbel',
    manufacturer: 'Hussmann', model: 'MANHATTAN-3', serialNumber: 'HU-2020-3317',
    refrigerant: 'R449A', refrigerantAmount: 15.0,
    location: 'Interspar Salzburg, Verkaufsfläche', installDate: '2020-02-01',
    lastMaintenance: '2025-02-01', nextMaintenance: '2026-02-01', status: 'active',
    notes: 'Verbundanlage, 3 Möbel an einem Kreislauf'
  });
  console.log('  ✓ 5 Kundenanlagen');

  // ─── Serviceberichte ──────────────────────────────────────────────────────
  console.log('📋 Serviceberichte anlegen...');
  await r('POST', '/service-reports', {
    customerId: k1.id, reportDate: '2025-01-10', technicianName: 'Klaus Berger',
    workDescription: 'Jahreswartung Kühlraum. Filter gereinigt, Kältemittel geprüft (kein Verlust), Kondensator gespült, alle Temperaturen im Soll.',
    workHours: 2.5, travelHours: 0.5, materialsCost: 18.50,
    materialsUsed: 'Filtermatte 500x500mm, Reinigungsmittel', status: 'completed',
  });
  await r('POST', '/service-reports', {
    customerId: k2.id, reportDate: '2025-03-22', technicianName: 'Markus Huber',
    workDescription: 'Störung Klimaanlage Konferenzraum. Kondensatabfuhr verstopft, gereinigt. Anlage läuft wieder einwandfrei.',
    workHours: 1.5, travelHours: 1.0, materialsCost: 0,
    materialsUsed: '', status: 'completed',
  });
  await r('POST', '/service-reports', {
    customerId: k4.id, reportDate: '2025-06-15', technicianName: 'Klaus Berger',
    workDescription: 'Lecksuche Verbundanlage. Undichtigkeit an Verbindungsleitung Möbel 2 gefunden. Reparatur + 2kg R449A nachgefüllt.',
    workHours: 4.0, travelHours: 1.5, materialsCost: 145.00,
    materialsUsed: 'R449A 2kg, Lötmaterial, Dichtung', status: 'completed',
  });
  console.log('  ✓ 3 Serviceberichte');

  // ─── Wartungsverträge ─────────────────────────────────────────────────────
  console.log('📄 Wartungsverträge anlegen...');
  await r('POST', '/maintenance-contracts', {
    customerId: k1.id, name: 'Jahreswartung Billa Kühlräume',
    startDate: '2024-01-01', endDate: '2026-12-31',
    intervalMonths: 12, nextServiceDate: '2026-01-10',
    priceNet: 450.00, status: 'active',
    notes: 'Beinhaltet: Kühlraum EG + Tiefkühlzelle Keller'
  });
  await r('POST', '/maintenance-contracts', {
    customerId: k2.id, name: 'Vollwartung Hotel Sacher Klimaanlagen',
    startDate: '2023-01-01', endDate: '2027-12-31',
    intervalMonths: 6, nextServiceDate: '2025-10-20',
    priceNet: 1200.00, status: 'active',
    notes: '2x Wartung pro Jahr, alle Klimaanlagen im Hotel'
  });
  await r('POST', '/maintenance-contracts', {
    customerId: k4.id, name: 'Wartungsvertrag Interspar Kältemöbel',
    startDate: '2024-06-01', endDate: '2027-05-31',
    intervalMonths: 12, nextServiceDate: '2026-02-01',
    priceNet: 890.00, status: 'active',
    notes: 'Inkl. Kältemittelcheck und Leckageprüfung'
  });
  console.log('  ✓ 3 Wartungsverträge');

  // ─── Produkte / Lagerbestand ──────────────────────────────────────────────
  console.log('📦 Lagerbestand anlegen...');
  const produkte = [
    { name: 'R32 Kältemittel 10kg Flasche',        sku: 'KM-R32-10',     category: 'Kältemittel',        unit: 'Stk',  sellingPriceNet: 89.00,  purchasePriceNet: 52.00,  stockQuantity: 8,  minStockQuantity: 3 },
    { name: 'R410A Kältemittel 11,3kg Flasche',     sku: 'KM-R410A-11',   category: 'Kältemittel',        unit: 'Stk',  sellingPriceNet: 120.00, purchasePriceNet: 75.00,  stockQuantity: 5,  minStockQuantity: 2 },
    { name: 'R404A Kältemittel 10kg Flasche',       sku: 'KM-R404A-10',   category: 'Kältemittel',        unit: 'Stk',  sellingPriceNet: 195.00, purchasePriceNet: 130.00, stockQuantity: 2,  minStockQuantity: 3 },
    { name: 'R449A Kältemittel 10kg Flasche',       sku: 'KM-R449A-10',   category: 'Kältemittel',        unit: 'Stk',  sellingPriceNet: 210.00, purchasePriceNet: 140.00, stockQuantity: 4,  minStockQuantity: 2 },
    { name: 'Kupferrohr 3/8" 25m Rolle',            sku: 'KR-3-8-25M',    category: 'Rohre & Leitungen',  unit: 'Rolle',sellingPriceNet: 68.00,  purchasePriceNet: 42.00,  stockQuantity: 6,  minStockQuantity: 2 },
    { name: 'Kupferrohr 1/2" 25m Rolle',            sku: 'KR-1-2-25M',    category: 'Rohre & Leitungen',  unit: 'Rolle',sellingPriceNet: 88.00,  purchasePriceNet: 55.00,  stockQuantity: 4,  minStockQuantity: 2 },
    { name: 'Wärmedämmschlauch 15mm DN22',           sku: 'WD-15-22',      category: 'Dämmmaterial',       unit: 'm',    sellingPriceNet: 3.80,   purchasePriceNet: 2.10,   stockQuantity: 50, minStockQuantity: 20 },
    { name: 'Filtermatte 500x500mm',                 sku: 'FM-500-500',    category: 'Verbrauchsmaterial', unit: 'Stk',  sellingPriceNet: 8.50,   purchasePriceNet: 4.20,   stockQuantity: 30, minStockQuantity: 10 },
    { name: 'Kondensatpumpe Mini Orange',            sku: 'KP-MINI-ORG',   category: 'Zubehör',            unit: 'Stk',  sellingPriceNet: 42.00,  purchasePriceNet: 26.00,  stockQuantity: 5,  minStockQuantity: 2 },
    { name: 'Lecksuche Spray 400ml',                 sku: 'LS-SPRAY-400',  category: 'Verbrauchsmaterial', unit: 'Stk',  sellingPriceNet: 12.90,  purchasePriceNet: 7.50,   stockQuantity: 12, minStockQuantity: 5 },
    { name: 'Daikin FTXM25R Innengerät',             sku: 'DAI-FTXM25R',   category: 'Geräte',             unit: 'Stk',  sellingPriceNet: 580.00, purchasePriceNet: 380.00, stockQuantity: 2,  minStockQuantity: 1 },
    { name: 'Mitsubishi MSZ-AP25VG Innengerät',      sku: 'ME-MSZ-AP25',   category: 'Geräte',             unit: 'Stk',  sellingPriceNet: 620.00, purchasePriceNet: 410.00, stockQuantity: 1,  minStockQuantity: 1 },
  ];
  for (const p of produkte) {
    await r('POST', '/products', p);
  }
  console.log('  ✓ 12 Produkte');

  // ─── Planungsprojekte ─────────────────────────────────────────────────────
  console.log('🔨 Planungsprojekte anlegen...');
  await r('POST', '/projects', {
    customerId: k5.id, name: 'Klimaanlage Gaststätte Zur Alm',
    description: 'Planung und Installation einer neuen Split-Klimaanlage im Gastraum (ca. 80m²). Inklusive Außeneinheit auf Dach.',
    status: 'active', priority: 'high',
    siteStreet: 'Bergstraße', siteHouseNumber: '7', siteZip: '6020', siteCity: 'Innsbruck',
    startDate: '2026-07-01', endDate: '2026-08-15', budgetNet: 4800.00,
  });
  await r('POST', '/projects', {
    customerId: k4.id, name: 'Erweiterung Kälteanlagen Interspar',
    description: 'Erweiterung der bestehenden Kälteanlage um 2 weitere Kühlmöbel im Molkerei-Bereich.',
    status: 'active', priority: 'normal',
    siteStreet: 'Europastraße', siteHouseNumber: '1', siteZip: '5020', siteCity: 'Salzburg',
    startDate: '2026-08-01', endDate: '2026-09-30', budgetNet: 12500.00,
  });
  await r('POST', '/projects', {
    customerId: k2.id, name: 'Klimatisierung Konferenzräume Hotel Sacher',
    description: 'Neues Klimakonzept für 3 Konferenzräume im 2. OG. Kassettengeräte, Steuerung über BMS.',
    status: 'paused', priority: 'normal',
    siteStreet: 'Philharmonikerstraße', siteHouseNumber: '4', siteZip: '1010', siteCity: 'Wien',
    startDate: '2026-06-01', endDate: '2026-10-31', budgetNet: 28000.00,
  });
  console.log('  ✓ 3 Planungsprojekte');

  console.log('\n✅ Alle Demo-Daten erfolgreich angelegt!');
  console.log('   → http://localhost:3000 aufrufen');
}

main().catch(e => { console.error('❌ Fehler:', e.message); process.exit(1); });
