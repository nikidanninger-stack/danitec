// ─── Seed-Daten für Entwicklung ───────────────────────────────────────────────
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Seed-Daten werden eingefügt...');

    // Firma
    const co = await client.query(`
      INSERT INTO companies (name,legal_form,address,zip,city,country,phone,email,uid_number,tax_number,iban,bank_name)
      VALUES ('Danitec GmbH','GmbH','Musterstraße 1','1010','Wien','AT','+43 1 234567','office@danitec.at','ATU12345678','12 345/6789','AT12 3456 7890 1234 5678','Erste Bank')
      ON CONFLICT DO NOTHING RETURNING id`);
    const companyId = co.rows[0]?.id;
    if (!companyId) { console.log('Firma bereits vorhanden.'); await client.query('ROLLBACK'); return; }

    // Einstellungen
    await client.query(`INSERT INTO company_settings (company_id,default_invoice_text,default_offer_text)
      VALUES ($1,'Rechnungsdatum entspricht dem Liefer- bzw. Leistungsdatum. Zahlungsziel: 14 Tage netto. Bei Zahlungsverzug behalten wir uns die Verrechnung gesetzlicher Verzugszinsen vor.','Dieses Angebot ist 30 Tage gültig.')`, [companyId]);

    // Admin-User
    const hash = await bcrypt.hash('Danitec2025!', 12);
    await client.query(`INSERT INTO users (company_id,email,password_hash,name,role) VALUES ($1,'admin@danitec.at',$2,'Admin Danitec','admin')`, [companyId, hash]);

    // Ausgaben-Kategorien
    const kats = ['Wareneinkauf','Werkzeug','Fahrzeugkosten','Treibstoff','Versicherung','Telefon und Internet','Software','Steuerberatung','Bürobedarf','Werbung','Miete','Bankspesen','Sonstige Betriebsausgaben'];
    for (let i = 0; i < kats.length; i++) {
      await client.query('INSERT INTO expense_categories (company_id,name,sort_order) VALUES ($1,$2,$3)', [companyId, kats[i], i]);
    }

    // Muster-Kunden
    const customers = [
      ['K-0001','business','Kühltech Austria GmbH',null,null,'Industrieweg 5','3100','St. Pölten','AT','office@kuehltech.at','+43 2742 12345','ATU99887766',14],
      ['K-0002','private',null,'Martin','Huber','Hauptstr. 12','1120','Wien','AT','m.huber@email.at','+43 664 1234567',null,14],
      ['K-0003','business','Supermarkt Steyr GmbH',null,null,'Bahnhofplatz 2','4400','Steyr','AT','info@supermarkt-steyr.at','+43 7252 98765','ATU55443322',30],
    ];
    for (const c of customers) {
      await client.query(`INSERT INTO customers (company_id,customer_number,type,company_name,first_name,last_name,address,zip,city,country,email,phone,uid_number,payment_days) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [companyId,...c]);
    }

    // Muster-Produkte
    const products = [
      ['P-001','Montagestunde Kältetechnik','Montage- und Installationsarbeiten','Std',85.00,102.00,20],
      ['P-002','Servicestunde Kältetechnik','Reparatur und Service','Std',75.00,90.00,20],
      ['P-003','Anfahrtspauschale','Pauschale für An- und Abfahrt','pauschal',35.00,42.00,20],
      ['P-004','Wartung Kälteanlage','Regelmäßige Wartung inkl. Protokoll','pauschal',220.00,264.00,20],
      ['P-005','Kältemittel R32','Kältemittel R32 je kg','kg',18.00,21.60,20],
      ['P-006','Dichtheitsprüfung','Dichtheitsprüfung gemäß EU-Verordnung','pauschal',95.00,114.00,20],
    ];
    for (const p of products) {
      await client.query(`INSERT INTO products (company_id,sku,name,description,unit,net_price,gross_price,vat_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [companyId,...p]);
    }

    await client.query('COMMIT');
    console.log('\n✓ Seed erfolgreich!');
    console.log('  Login: admin@danitec.at / Danitec2025!');
    console.log(`  Firma-ID: ${companyId}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.log('Seed-Fehler (nicht fatal):', err.message);
    console.log('→ Seed-Daten bereits vorhanden, Server startet trotzdem.');
    // process.exit(0) – kein Fehler, Server soll starten
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
