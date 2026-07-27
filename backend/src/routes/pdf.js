// ─── PDF & E-Mail Routen ──────────────────────────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { generateInvoicePdf, generateDunningPdf, generateEAReportPdf, generateServiceReportPdf, generateMaintenanceContractPdf } = require('../services/pdfService');
const { sendInvoiceEmail, verifyConnection, getDefaultInvoiceEmailText, getDefaultOfferEmailText } = require('../services/emailService');

router.use(authenticate);

// ─── GET /api/pdf/:id – Angebot oder Rechnung PDF (generischer Route) ────────
router.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const docRes = await query(`
      SELECT d.*,
             c.company_name AS customer_company, c.first_name AS customer_first_name,
             c.last_name AS customer_last_name, c.address AS customer_address,
             c.zip AS customer_zip, c.city AS customer_city, c.country AS customer_country,
             c.uid_number AS customer_uid, c.email AS customer_email
      FROM documents d LEFT JOIN customers c ON d.customer_id = c.id
      WHERE d.id = $1 AND d.company_id = $2`, [req.params.id, req.user.company_id]);

    if (!docRes.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });

    const doc = docRes.rows[0];
    const itemsRes = await query('SELECT * FROM document_items WHERE document_id=$1 ORDER BY position_number', [req.params.id]);
    doc.items = itemsRes.rows;

    const coRes = await query('SELECT * FROM companies WHERE id=$1', [req.user.company_id]);
    const stRes = await query('SELECT * FROM company_settings WHERE company_id=$1', [req.user.company_id]);

    const pdfBuffer = await generateInvoicePdf(doc, coRes.rows[0], stRes.rows[0]);
    const label = doc.type === 'offer' ? 'Angebot' : 'Rechnung';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${label}_${doc.number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ─── GET /api/pdf/invoice/:id – PDF generieren ───────────────────────────────
router.get('/invoice/:id', async (req, res, next) => {
  try {
    const docRes = await query(`
      SELECT d.*,
             c.company_name AS customer_company, c.first_name AS customer_first_name,
             c.last_name AS customer_last_name, c.address AS customer_address,
             c.zip AS customer_zip, c.city AS customer_city, c.country AS customer_country,
             c.uid_number AS customer_uid, c.email AS customer_email
      FROM documents d LEFT JOIN customers c ON d.customer_id = c.id
      WHERE d.id = $1 AND d.company_id = $2`, [req.params.id, req.user.company_id]);

    if (!docRes.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });

    const doc = docRes.rows[0];
    const itemsRes = await query('SELECT * FROM document_items WHERE document_id=$1 ORDER BY position_number', [req.params.id]);
    doc.items = itemsRes.rows;

    const coRes  = await query('SELECT * FROM companies WHERE id=$1', [req.user.company_id]);
    const stRes  = await query('SELECT * FROM company_settings WHERE company_id=$1', [req.user.company_id]);

    const pdfBuffer = await generateInvoicePdf(doc, coRes.rows[0], stRes.rows[0]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ─── GET /api/pdf/dunning/:id – Mahnungs-PDF ─────────────────────────────────
router.get('/dunning/:id', async (req, res, next) => {
  try {
    const dRes = await query(`
      SELECT dn.*, d.number, d.document_date, d.due_date, d.gross_total,
             c.company_name AS customer_company, c.address AS customer_address,
             c.zip AS customer_zip, c.city AS customer_city
      FROM dunnings dn
      JOIN documents d ON dn.document_id = d.id
      LEFT JOIN customers c ON d.customer_id = c.id
      WHERE dn.id = $1 AND d.company_id = $2`, [req.params.id, req.user.company_id]);

    if (!dRes.rows[0]) return res.status(404).json({ error: 'Mahnung nicht gefunden.' });
    const coRes = await query('SELECT * FROM companies WHERE id=$1', [req.user.company_id]);
    const pdfBuffer = await generateDunningPdf(dRes.rows[0], dRes.rows[0], coRes.rows[0]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Mahnung_${dRes.rows[0].dunning_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ─── GET /api/pdf/ea?year=2025 – E/A-Rechnung als PDF ───────────────────────
router.get('/ea', async (req, res, next) => {
  try {
    // Daten via reports-Logik holen
    const year = req.query.year || new Date().getFullYear();
    const cId = req.user.company_id;

    const einnahmen = await query(`
      SELECT dp.payment_date, d.number, d.net_total AS netto, d.vat_total AS ust, dp.amount AS brutto,
             COALESCE(c.company_name, c.first_name||' '||c.last_name) AS kunde
      FROM document_payments dp JOIN documents d ON dp.document_id=d.id
      LEFT JOIN customers c ON d.customer_id=c.id
      WHERE d.company_id=$1 AND d.type='invoice' AND EXTRACT(YEAR FROM dp.payment_date)=$2`, [cId, year]);

    const ausgaben = await query(`
      SELECT e.payment_date, e.expense_number, e.description,
             e.deductible_net_amount AS netto, e.deductible_vat_amount AS ust,
             ec.name AS kategorie
      FROM expenses e LEFT JOIN expense_categories ec ON e.category_id=ec.id
      WHERE e.company_id=$1 AND e.status='paid' AND EXTRACT(YEAR FROM e.payment_date)=$2`, [cId, year]);

    const afaRes = await query(`SELECT COALESCE(SUM(ad.amount),0) AS afa FROM asset_depreciations ad JOIN assets a ON ad.asset_id=a.id WHERE a.company_id=$1 AND ad.year=$2`, [cId, year]);
    const coRes  = await query('SELECT * FROM companies WHERE id=$1', [cId]);

    const einnahmenSum = einnahmen.rows.reduce((s,r)=>s+parseFloat(r.netto),0);
    const ausgabenSum  = ausgaben.rows.reduce((s,r)=>s+parseFloat(r.netto),0);
    const afa          = parseFloat(afaRes.rows[0].afa);
    const ustOut       = einnahmen.rows.reduce((s,r)=>s+parseFloat(r.ust),0);
    const vorst        = ausgaben.rows.reduce((s,r)=>s+parseFloat(r.ust),0);
    const katMap = {};
    ausgaben.rows.forEach(r=>{if(!katMap[r.kategorie])katMap[r.kategorie]=0;katMap[r.kategorie]+=parseFloat(r.netto);});

    const reportData = {
      jahr: year,
      einnahmen: { summe: einnahmenSum, positionen: einnahmen.rows },
      ausgaben: { summe: ausgabenSum, nachKategorie: katMap },
      afa,
      gewinn: einnahmenSum - ausgabenSum - afa,
      ust: { ausgang: ustOut, vorsteuer: vorst, zahllast: ustOut - vorst },
    };

    const pdfBuffer = await generateEAReportPdf(reportData, coRes.rows[0]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Danitec_EA_Rechnung_${year}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ─── POST /api/pdf/send/:id – Rechnung per E-Mail senden ─────────────────────
router.post('/send/:id', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const { toEmail, subject, bodyText } = req.body;
    if (!toEmail) return res.status(400).json({ error: 'E-Mail-Adresse erforderlich.' });

    const docRes = await query(`
      SELECT d.*,
             c.company_name AS customer_company, c.first_name AS customer_first_name,
             c.last_name AS customer_last_name, c.email AS customer_email,
             c.address AS customer_address, c.zip AS customer_zip, c.city AS customer_city,
             c.uid_number AS customer_uid
      FROM documents d LEFT JOIN customers c ON d.customer_id=c.id
      WHERE d.id=$1 AND d.company_id=$2`, [req.params.id, req.user.company_id]);

    if (!docRes.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });
    const doc = docRes.rows[0];

    const itemsRes = await query('SELECT * FROM document_items WHERE document_id=$1 ORDER BY position_number', [req.params.id]);
    doc.items = itemsRes.rows;

    const coRes = await query('SELECT * FROM companies WHERE id=$1', [req.user.company_id]);
    const stRes = await query('SELECT * FROM company_settings WHERE company_id=$1', [req.user.company_id]);
    const company = coRes.rows[0];

    // PDF generieren
    const pdfBuffer = await generateInvoicePdf(doc, company, stRes.rows[0]);

    // E-Mail senden
    const emailText = bodyText ||
      (doc.type === 'invoice' ? getDefaultInvoiceEmailText(doc, company) : getDefaultOfferEmailText(doc, company));
    const emailSubject = subject || `${doc.type === 'invoice' ? 'Rechnung' : 'Angebot'} ${doc.number} von ${company.name}`;
    const customerName = doc.customer_company || `${doc.customer_first_name || ''} ${doc.customer_last_name || ''}`.trim();

    await sendInvoiceEmail({
      toEmail,
      toName: customerName,
      subject: emailSubject,
      bodyText: emailText,
      pdfBuffer,
      pdfFileName: `${doc.number}.pdf`,
      company,
      documentId: doc.id,
      companyId: req.user.company_id,
      userId: req.user.id,
    });

    // Status auf "sent" setzen
    await query(
      `UPDATE documents SET status = CASE WHEN status='finalized' THEN 'sent' ELSE status END, sent_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    await query(
      `INSERT INTO audit_logs (company_id,user_id,entity_type,entity_id,action,new_value,ip_address)
       VALUES ($1,$2,'invoice',$3,'Per E-Mail versendet',$4,$5)`,
      [req.user.company_id, req.user.id, req.params.id, JSON.stringify({ toEmail }), req.ip]
    );

    res.json({ success: true, message: `E-Mail erfolgreich an ${toEmail} versendet.` });
  } catch (err) { next(err); }
});

// ─── GET /api/pdf/email-preview/:id – Vorschau E-Mail-Text ───────────────────
router.get('/email-preview/:id', async (req, res, next) => {
  try {
    const docRes = await query('SELECT d.*,c.email AS customer_email,c.company_name AS customer_company,c.first_name,c.last_name FROM documents d LEFT JOIN customers c ON d.customer_id=c.id WHERE d.id=$1 AND d.company_id=$2', [req.params.id, req.user.company_id]);
    if (!docRes.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });
    const coRes = await query('SELECT * FROM companies WHERE id=$1', [req.user.company_id]);
    const doc = docRes.rows[0]; const company = coRes.rows[0];
    const customerName = doc.customer_company || `${doc.first_name||''} ${doc.last_name||''}`.trim();
    res.json({
      to: doc.customer_email || '',
      subject: `${doc.type==='invoice'?'Rechnung':'Angebot'} ${doc.number} von ${company.name}`,
      body: doc.type==='invoice' ? getDefaultInvoiceEmailText(doc, company) : getDefaultOfferEmailText(doc, company),
      customerName,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/pdf/service-report/:id ─────────────────────────────────────────
router.get('/service-report/:id', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT sr.*,
        COALESCE(c.company_name, c.first_name||' '||c.last_name) AS customer_name,
        c.address AS customer_address, c.zip AS customer_zip, c.city AS customer_city,
        c.email AS customer_email, c.phone AS customer_phone,
        e.name AS equipment_name, e.equipment_type, e.manufacturer, e.model,
        e.serial_number, e.location AS equipment_location,
        p.name AS project_name,
        u.name AS technician_user_name,
        co.name AS company_name_full, co.address AS company_address,
        co.zip AS company_zip, co.city AS company_city,
        co.phone AS company_phone, co.email AS company_email,
        co.uid_number, co.logo_path
      FROM service_reports sr
      LEFT JOIN customers c           ON sr.customer_id  = c.id
      LEFT JOIN customer_equipment e  ON sr.equipment_id = e.id
      LEFT JOIN projects p            ON sr.project_id   = p.id
      LEFT JOIN users u               ON sr.technician_id = u.id
      LEFT JOIN companies co          ON sr.company_id   = co.id
      WHERE sr.id=$1 AND sr.company_id=$2`, [req.params.id, req.user.company_id]);

    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });

    // Merge company info into report object for template
    const sr = r.rows[0];
    const company = {
      name: sr.company_name_full, address: sr.company_address,
      zip: sr.company_zip, city: sr.company_city,
      phone: sr.company_phone, email: sr.company_email,
      uid_number: sr.uid_number, logo_path: sr.logo_path,
    };

    const pdfBuffer = await generateServiceReportPdf({ ...sr, ...company, name: company.name });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Servicebericht_${sr.report_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ─── GET /api/pdf/maintenance-contract/:id ───────────────────────────────────
router.get('/maintenance-contract/:id', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT mc.*,
        COALESCE(c.company_name, c.first_name||' '||c.last_name) AS customer_name,
        c.address AS customer_address, c.zip AS customer_zip, c.city AS customer_city,
        c.email AS customer_email, c.phone AS customer_phone
      FROM maintenance_contracts mc
      LEFT JOIN customers c ON mc.customer_id = c.id
      WHERE mc.id=$1 AND mc.company_id=$2
    `, [req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });

    const coRes = await query('SELECT * FROM companies WHERE id=$1', [req.user.company_id]);
    const stRes = await query('SELECT * FROM company_settings WHERE company_id=$1', [req.user.company_id]);
    const co = { ...coRes.rows[0], logo_path: stRes.rows[0]?.logo_path };
    const settings = stRes.rows[0] || {};

    const pdfBuffer = await generateMaintenanceContractPdf(r.rows[0], co, settings);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Wartungsvertrag_${r.rows[0].order_number||r.rows[0].contract_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ─── POST /api/pdf/maintenance-contract/:id/send ─────────────────────────────
router.post('/maintenance-contract/:id/send', async (req, res, next) => {
  try {
    const { toEmail, subject, bodyText } = req.body;
    const r = await query(`
      SELECT mc.*,
        COALESCE(c.company_name, c.first_name||' '||c.last_name) AS customer_name,
        c.address AS customer_address, c.zip AS customer_zip, c.city AS customer_city,
        c.email AS customer_email, c.phone AS customer_phone
      FROM maintenance_contracts mc
      LEFT JOIN customers c ON mc.customer_id = c.id
      WHERE mc.id=$1 AND mc.company_id=$2
    `, [req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });

    const contract = r.rows[0];
    const coRes = await query('SELECT * FROM companies WHERE id=$1', [req.user.company_id]);
    const stRes = await query('SELECT * FROM company_settings WHERE company_id=$1', [req.user.company_id]);
    const co = { ...coRes.rows[0], logo_path: stRes.rows[0]?.logo_path };
    const settings = stRes.rows[0] || {};

    const pdfBuffer = await generateMaintenanceContractPdf(contract, co, settings);
    const fileName = `Wartungsvertrag_${contract.order_number||contract.contract_number}.pdf`;
    const recipient = toEmail || contract.customer_email;
    if (!recipient) return res.status(400).json({ error: 'Keine E-Mail-Adresse angegeben.' });

    await sendInvoiceEmail({
      toEmail: recipient,
      toName: contract.customer_name,
      subject: subject || `Wartungsvertrag ${contract.order_number||contract.contract_number} – ${contract.name}`,
      bodyText: bodyText || `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie Ihren Wartungsvertrag als PDF.\n\nMit freundlichen Grüßen\n${co.name}`,
      pdfBuffer,
      pdfFileName: fileName,
      company: co,
      companyId: req.user.company_id,
      userId: req.user.id,
    });

    res.json({ success: true, sentTo: recipient });
  } catch (err) { next(err); }
});

// ─── GET /api/pdf/smtp-test – SMTP-Verbindung testen ─────────────────────────
router.get('/smtp-test', authorize('admin'), async (req, res, next) => {
  try {
    const result = await verifyConnection(req.user.company_id);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
