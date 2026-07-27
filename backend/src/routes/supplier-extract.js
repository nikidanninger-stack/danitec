// ─── Lieferant aus Text extrahieren (OpenAI) ──────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// POST /api/supplier-extract/lookup-by-name  – body: { name: string }
router.post('/lookup-by-name', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Firmenname zu kurz.' });

    const stRes = await query('SELECT openai_api_key FROM company_settings WHERE company_id=$1', [req.user.company_id]);
    const apiKey = stRes.rows[0]?.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Kein OpenAI API-Key konfiguriert (Einstellungen → OpenAI).' });

    const { default: OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `Du bist ein Assistent für ein österreichisches Unternehmen im Bereich Kälte- und Klimatechnik.
Wenn du nach einem österreichischen oder deutschen Unternehmen gefragt wirst, gib alle dir bekannten Stammdaten zurück.
Antworte NUR mit einem JSON-Objekt, keine Erklärungen, keine Markdown-Blöcke.
Felder die du nicht kennst: null.`
      }, {
        role: 'user',
        content: `Suche nach dem Unternehmen: "${name}"
Gib alle bekannten Stammdaten zurück als JSON:
{"name":"","street":"","houseNumber":"","zip":"","city":"","country":"AT","email":"","phone":"","website":"","contactPerson":"","atuUid":"","iban":"","bic":""}
Wenn mehrere Unternehmen mit diesem Namen existieren, nimm das bekannteste aus Österreich oder Deutschland.`
      }],
      max_tokens: 500,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    res.json({ data });
  } catch (err) { next(err); }
});

// POST /api/supplier-extract  – body: { text: string }
router.post('/', async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || text.trim().length < 20) return res.status(400).json({ error: 'Kein Text übergeben.' });

    const stRes = await query('SELECT openai_api_key FROM company_settings WHERE company_id=$1', [req.user.company_id]);
    const apiKey = stRes.rows[0]?.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Kein OpenAI API-Key konfiguriert (Einstellungen → OpenAI).' });

    const { default: OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'Extrahiere Unternehmensdaten aus dem Text. Antworte NUR mit einem JSON-Objekt, keine Erklärungen.'
      }, {
        role: 'user',
        content: `Extrahiere alle verfügbaren Unternehmensdaten und gib sie als JSON zurück:
{"name":"","address":"","zip":"","city":"","country":"AT","email":"","phone":"","contactPerson":"","atuUid":"","iban":"","bic":""}
Felder die nicht gefunden werden: null lassen.

Text: ${text.slice(0, 6000)}`
      }],
      max_tokens: 400,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    res.json({ data });
  } catch (err) { next(err); }
});

module.exports = router;
