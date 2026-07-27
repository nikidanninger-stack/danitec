// ─── OCR: Eingangsrechnung erkennen (Bild / PDF / DOCX) ──────────────────────
const router  = require('express').Router();
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const OpenAI  = require('openai').default;
const { authenticate } = require('../middleware/auth');
const { query } = require('../utils/db');

router.use(authenticate);

// ─── Zulässige Dateitypen ─────────────────────────────────────────────────────
const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
];

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED_MIME.includes(file.mimetype)
      || file.originalname.match(/\.(jpg|jpeg|png|webp|pdf|docx|doc)$/i);
    if (ok) cb(null, true);
    else cb(new Error('Nur Bilder (JPG/PNG/WEBP), PDF oder DOCX erlaubt.'));
  },
});

// ─── Text aus Datei extrahieren ───────────────────────────────────────────────
async function extractText(filePath, mimetype, originalName) {
  const isPdf  = mimetype === 'application/pdf' || /\.pdf$/i.test(originalName);
  const isDocx = mimetype.includes('wordprocessingml') || /\.docx?$/i.test(originalName);

  if (isPdf) {
    const pdfParse = require('pdf-parse');
    const buf = fs.readFileSync(filePath);
    const result = await pdfParse(buf);
    return result.text || '';
  }

  if (isDocx) {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  }

  return null; // Bild → kein Text
}

// ─── OpenAI-Prompt (Text-basiert für PDF/DOCX) ───────────────────────────────
const SYSTEM_PROMPT = `Du bist ein österreichischer Buchhalter und analysierst Eingangsrechnungen.
Extrahiere ALLE Positionen und gib sie als JSON zurück.

Wichtige Regeln:
- Preise immer als NETTO (ohne USt) angeben
- Wenn nur Bruttopreis erkennbar: Nettobetrag = Brutto ÷ 1.20 (bei 20% USt) berechnen
- Mengeneinheiten: "Stk", "m", "m²", "kg", "l", "Pkg", "Rolle", "Std" usw.
- Falls USt-Satz nicht erkennbar: 20 verwenden
- Beschreibungen vollständig und klar auf Deutsch

Antwort NUR als JSON (kein Markdown, keine Erklärungen):
{
  "lieferant": "Name des Lieferanten",
  "rechnungsdatum": "YYYY-MM-DD oder null",
  "rechnungsnummer": "Nummer oder null",
  "items": [
    {
      "description": "Artikelbezeichnung",
      "quantity": 1.0,
      "unit": "Stk",
      "unit_price_net": 10.50,
      "vat_rate": 20
    }
  ],
  "brutto_gesamt": 120.60,
  "notizen": "optionale Hinweise"
}`;

// ─── POST /api/ocr/scan-receipt ───────────────────────────────────────────────
router.post('/scan-receipt', upload.single('image'), async (req, res, next) => {
  const tempPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen.' });

    // API-Key aus DB oder .env
    const stRes = await query('SELECT openai_api_key FROM company_settings WHERE company_id=$1', [req.user.company_id]);
    const apiKey = stRes.rows[0]?.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Kein OpenAI API-Key konfiguriert. Bitte unter Admin-Einstellungen hinterlegen.' });

    const openai = new OpenAI({ apiKey });

    // Text extrahieren (PDF/DOCX) oder als Bild senden
    const extractedText = await extractText(tempPath, req.file.mimetype, req.file.originalname);

    let messages;

    if (extractedText && extractedText.trim().length > 50) {
      // ── Textbasierte Anfrage (PDF/DOCX mit echtem Text) ──
      messages = [{
        role: 'user',
        content: `${SYSTEM_PROMPT}\n\nHier ist der extrahierte Text der Rechnung:\n\n${extractedText.slice(0, 8000)}`,
      }];
    } else if (extractedText !== null && extractedText.trim().length <= 50) {
      // PDF ist gescannt (kein extrahierbarer Text) → als Bild senden via Puppeteer
      const imageBase64 = await pdfPageToImage(tempPath);
      if (!imageBase64) return res.status(422).json({ error: 'PDF konnte nicht verarbeitet werden. Bitte als Bild (JPG/PNG) hochladen.' });
      messages = buildImageMessages(imageBase64, 'image/png');
    } else {
      // Normales Bild
      const imageBuffer = fs.readFileSync(tempPath);
      const base64 = imageBuffer.toString('base64');
      messages = buildImageMessages(base64, req.file.mimetype || 'image/jpeg');
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 3000,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(422).json({ error: 'Keine Daten erkannt. Bitte ein schärferes Foto oder eine bessere Datei verwenden.' });

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.items || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      return res.status(422).json({ error: 'Keine Positionen erkannt. Bitte prüfen ob die Rechnung vollständig ist.' });
    }

    res.json(parsed);
  } catch (err) {
    next(err);
  } finally {
    if (tempPath) try { fs.unlinkSync(tempPath); } catch (_) {}
  }
});

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function buildImageMessages(base64, mime) {
  return [{
    role: 'user',
    content: [
      { type: 'text', text: SYSTEM_PROMPT },
      { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' } },
    ],
  }];
}

async function pdfPageToImage(pdfPath) {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });
    const fileUrl = 'file://' + path.resolve(pdfPath);
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 15000 });
    const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });
    await browser.close();
    return Buffer.from(screenshotBuffer).toString('base64');
  } catch (_) {
    return null;
  }
}

// ─── POST /api/ocr/match-products ────────────────────────────────────────────
// Gescannte Items gegen Materialien in DB abgleichen
router.post('/match-products', async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items erforderlich.' });

    // Alle Materialien dieser Firma laden
    const prods = await query(
      `SELECT id, name, sku, unit, purchase_price, stock_quantity, min_stock FROM products WHERE company_id=$1 AND product_type='material' AND active=TRUE ORDER BY name`,
      [req.user.company_id]
    );
    const materials = prods.rows;

    // Einfaches Wort-Matching: Wieviele Wörter aus dem Scan-Item kommen im Produktnamen vor
    function matchScore(scanDesc, productName) {
      const words = scanDesc.toLowerCase().replace(/[^a-zäöüß0-9]/g,' ').split(/\s+/).filter(w=>w.length>2);
      const pname = productName.toLowerCase();
      let hits = 0;
      for (const w of words) { if (pname.includes(w)) hits++; }
      return words.length > 0 ? hits / words.length : 0;
    }

    const matched = items.map(item => {
      const scored = materials.map(m => ({
        ...m,
        score: matchScore(item.description || '', m.name),
      })).filter(m => m.score > 0).sort((a,b) => b.score - a.score);

      return {
        ...item,
        suggestions: scored.slice(0, 3), // Top 3 Vorschläge
        matched_product: scored[0]?.score >= 0.4 ? scored[0] : null, // Auto-match bei >=40%
      };
    });

    res.json({ items: matched, materials });
  } catch (err) { next(err); }
});

module.exports = router;
