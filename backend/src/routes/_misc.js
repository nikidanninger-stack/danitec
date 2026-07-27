// payments.js
const pRouter = require('express').Router();
const { query } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
pRouter.use(authenticate);
pRouter.get('/', async (req,res,next) => {
  try {
    const { from, to } = req.query;
    let where = 'WHERE d.company_id=$1'; const params=[req.user.company_id];
    if (from) { params.push(from); where+=` AND dp.payment_date>=$${params.length}`; }
    if (to)   { params.push(to);   where+=` AND dp.payment_date<=$${params.length}`; }
    const r = await query(`SELECT dp.*,d.number AS invoice_number,COALESCE(c.company_name,c.first_name||' '||c.last_name) AS customer_name FROM document_payments dp JOIN documents d ON dp.document_id=d.id LEFT JOIN customers c ON d.customer_id=c.id ${where} ORDER BY dp.payment_date DESC`,params);
    res.json({ data: r.rows });
  } catch(err) { next(err); }
});
module.exports = pRouter;

// company.js
const cRouter = require('express').Router();
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');
const { query: q } = require('../utils/db');
const { authenticate: auth, authorize: authz } = require('../middleware/auth');
cRouter.use(auth);

// Logo-Upload + Letterhead-Upload Middleware (geteilt)
const makeStorage = (subdir, filename) => multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'uploads', subdir);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${filename}_${req.user.company_id}${ext}`);
  },
});

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'uploads', 'logos');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `logo_${req.user.company_id}${ext}`);
  },
});
const logoUpload = multer({ storage: logoStorage, limits: { fileSize: 5 * 1024 * 1024 } });

// Letterhead: Temp-Upload, danach Konvertierung zu PNG (falls PDF/DOCX)
const letterheadUpload = multer({
  dest: require('os').tmpdir(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('image/')
      || file.mimetype === 'application/pdf'
      || file.mimetype.includes('wordprocessingml')
      || /\.(pdf|docx|doc)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error('Nur Bilder (PNG/JPG), PDF oder DOCX erlaubt.'));
  },
});

// PDF/DOCX → PNG konvertieren und in uploads/letterheads/ speichern
async function processLetterhead(filePath, mimetype, originalName, companyId) {
  const dir = path.join(__dirname, '..', '..', 'uploads', 'letterheads');
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `letterhead_${companyId}.png`);

  const isPdf  = mimetype === 'application/pdf' || /\.pdf$/i.test(originalName);
  const isDocx = mimetype.includes('wordprocessingml') || /\.docx?$/i.test(originalName);

  if (isPdf) {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 3 }); // A4 @ 300 dpi
    await page.goto('file://' + path.resolve(filePath), { waitUntil: 'networkidle0', timeout: 20000 });
    await page.screenshot({ path: outPath, type: 'png', fullPage: false });
    await browser.close();
  } else if (isDocx) {
    const mammoth   = require('mammoth');
    const puppeteer = require('puppeteer');
    const { value: html } = await mammoth.convertToHtml({ path: filePath });
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box;} body{font-family:Arial,sans-serif;font-size:11pt;margin:2cm;line-height:1.5;color:#222;}
      table{width:100%;border-collapse:collapse;} td,th{border:1px solid #ccc;padding:4px 6px;}
      img{max-width:100%;}
    </style></head><body>${html}</body></html>`;
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 3 });
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: outPath, type: 'png', fullPage: false });
    await browser.close();
  } else {
    // Bild → direkt kopieren
    fs.copyFileSync(filePath, outPath);
  }

  return outPath;
}

cRouter.get('/', async (req,res,next) => {
  try {
    const co = await q('SELECT * FROM companies WHERE id=$1',[req.user.company_id]);
    const st = await q('SELECT * FROM company_settings WHERE company_id=$1',[req.user.company_id]);
    const company = co.rows[0];
    if (company?.logo_path && fs.existsSync(company.logo_path)) {
      const ext = path.extname(company.logo_path);
      company.logo_url = `/uploads/logos/logo_${req.user.company_id}${ext}`;
    }
    if (company?.letterhead_path && fs.existsSync(company.letterhead_path)) {
      company.letterhead_url = `/uploads/letterheads/letterhead_${req.user.company_id}.png`;
    }
    res.json({ company, settings: st.rows[0] });
  } catch(err) { next(err); }
});
cRouter.put('/', authz('admin','geschaeftsfuehrer'), async (req,res,next) => {
  try {
    const { name,legalForm,address,zip,city,country,phone,email,website,uidNumber,taxNumber,companyRegisterNr,companyRegisterCourt,bankName,bankAccountHolder,iban,bic } = req.body;
    const r = await q(`UPDATE companies SET name=$1,legal_form=$2,address=$3,zip=$4,city=$5,country=$6,phone=$7,email=$8,website=$9,uid_number=$10,tax_number=$11,company_register_nr=$12,company_register_court=$13,bank_name=$14,bank_account_holder=$15,iban=$16,bic=$17 WHERE id=$18 RETURNING *`,
      [name,legalForm||null,address||null,zip||null,city||null,country||'AT',phone||null,email||null,website||null,uidNumber||null,taxNumber||null,companyRegisterNr||null,companyRegisterCourt||null,bankName||null,bankAccountHolder||null,iban||null,bic||null,req.user.company_id]);
    res.json(r.rows[0]);
  } catch(err) { next(err); }
});
cRouter.put('/settings', authz('admin'), async (req,res,next) => {
  try {
    const { smallBusiness,taxationType,vatNetSystem,defaultVatRate,defaultCurrency,defaultPaymentDays,invoicePrefix,offerPrefix,reverseChargeEnabled,defaultInvoiceText,invoiceColor,openaiApiKey } = req.body;
    // Dynamisch nur vorhandene Spalten updaten (invoice_color & openai_api_key sind neue Spalten)
    const r = await q(`UPDATE company_settings SET small_business=$1,taxation_type=$2,vat_net_system=$3,default_vat_rate=$4,default_currency=$5,default_payment_days=$6,invoice_prefix=$7,offer_prefix=$8,reverse_charge_enabled=$9,default_invoice_text=$10 WHERE company_id=$11 RETURNING *`,
      [smallBusiness||false,taxationType||'ist',vatNetSystem!==false,defaultVatRate||20,defaultCurrency||'EUR',defaultPaymentDays||14,invoicePrefix||'RE',offerPrefix||'AN',reverseChargeEnabled||false,defaultInvoiceText||null,req.user.company_id]);
    // Neue Felder separat updaten (falls Spalten vorhanden)
    if (invoiceColor !== undefined) {
      try { await q('UPDATE company_settings SET invoice_color=$1 WHERE company_id=$2',[invoiceColor,req.user.company_id]); } catch(_) {}
    }
    if (openaiApiKey !== undefined) {
      try { await q('UPDATE company_settings SET openai_api_key=$1 WHERE company_id=$2',[openaiApiKey||null,req.user.company_id]); } catch(_) {}
    }
    // SMTP-Einstellungen
    const { smtpHost,smtpPort,smtpSecure,smtpUser,smtpPassword,smtpFromEmail,smtpFromName } = req.body;
    if (smtpHost !== undefined) {
      try {
        await q(`UPDATE company_settings SET smtp_host=$1,smtp_port=$2,smtp_secure=$3,smtp_user=$4,smtp_from_email=$5,smtp_from_name=$6 WHERE company_id=$7`,
          [smtpHost||null,parseInt(smtpPort)||587,smtpSecure||false,smtpUser||null,smtpFromEmail||null,smtpFromName||null,req.user.company_id]);
        if (smtpPassword) {
          await q('UPDATE company_settings SET smtp_password=$1 WHERE company_id=$2',[smtpPassword,req.user.company_id]);
        }
      } catch(_) {}
    }
    res.json(r.rows[0]);
  } catch(err) { next(err); }
});

// ─── POST /api/company/logo – Logo hochladen ──────────────────────────────────
cRouter.post('/logo', authz('admin','geschaeftsfuehrer'), logoUpload.single('logo'), async (req,res,next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Kein Bild hochgeladen.' });
    const logoPath = req.file.path;
    try { await q('UPDATE companies SET logo_path=$1 WHERE id=$2',[logoPath,req.user.company_id]); } catch(_) {}
    const ext = path.extname(req.file.filename);
    res.json({ success: true, logo_url: `/uploads/logos/logo_${req.user.company_id}${ext}` });
  } catch(err) { next(err); }
});

// ─── DELETE /api/company/logo – Logo löschen ─────────────────────────────────
cRouter.delete('/logo', authz('admin','geschaeftsfuehrer'), async (req,res,next) => {
  try {
    const co = await q('SELECT logo_path FROM companies WHERE id=$1',[req.user.company_id]);
    const lp = co.rows[0]?.logo_path;
    if (lp && fs.existsSync(lp)) try { fs.unlinkSync(lp); } catch(_) {}
    try { await q('UPDATE companies SET logo_path=NULL WHERE id=$1',[req.user.company_id]); } catch(_) {}
    res.json({ success: true });
  } catch(err) { next(err); }
});

// ─── POST /api/company/letterhead – Briefpapier/Vorlage hochladen ─────────────
cRouter.post('/letterhead', authz('admin','geschaeftsfuehrer'), letterheadUpload.single('letterhead'), async (req,res,next) => {
  const tempPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen.' });
    const outPath = await processLetterhead(tempPath, req.file.mimetype, req.file.originalname, req.user.company_id);
    await q('UPDATE companies SET letterhead_path=$1 WHERE id=$2',[outPath, req.user.company_id]);
    res.json({ success: true, letterhead_url: `/uploads/letterheads/letterhead_${req.user.company_id}.png` });
  } catch(err) { next(err); }
  finally { if (tempPath) try { fs.unlinkSync(tempPath); } catch(_) {} }
});

// ─── DELETE /api/company/letterhead – Briefpapier löschen ────────────────────
cRouter.delete('/letterhead', authz('admin','geschaeftsfuehrer'), async (req,res,next) => {
  try {
    const co = await q('SELECT letterhead_path FROM companies WHERE id=$1',[req.user.company_id]);
    const lp = co.rows[0]?.letterhead_path;
    if (lp && fs.existsSync(lp)) try { fs.unlinkSync(lp); } catch(_) {}
    try { await q('UPDATE companies SET letterhead_path=NULL WHERE id=$1',[req.user.company_id]); } catch(_) {}
    res.json({ success: true });
  } catch(err) { next(err); }
});

module.exports = { payments: pRouter, company: cRouter };
