// ─── KI Text-Verbesserung ─────────────────────────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// POST /api/ai-text  – body: { text, field }
// field: 'arbeiten' | 'maengel' | 'empfehlungen' | 'notiz'
router.post('/', async (req, res, next) => {
  try {
    const { text, field = 'arbeiten' } = req.body;
    if (!text || text.trim().length < 3) return res.status(400).json({ error: 'Kein Text übergeben.' });

    const stRes = await query('SELECT openai_api_key FROM company_settings WHERE company_id=$1', [req.user.company_id]);
    const apiKey = stRes.rows[0]?.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Kein OpenAI API-Key konfiguriert (Einstellungen → OpenAI).' });

    const prompts = {
      arbeiten: 'Du bist ein Assistent für einen österreichischen Kälte- und Klimatechnik-Betrieb. Verbessere den folgenden Text für das Feld "Durchgeführte Arbeiten" in einem Servicebericht. Korrigiere Rechtschreibfehler, formuliere professionell und klar, verwende Fachbegriffe korrekt. Behalte den Inhalt und die Fakten exakt bei. Antworte NUR mit dem verbesserten Text, ohne Erklärungen.',
      maengel: 'Du bist ein Assistent für einen österreichischen Kälte- und Klimatechnik-Betrieb. Verbessere den folgenden Text für das Feld "Festgestellte Mängel" in einem Servicebericht. Korrigiere Rechtschreibfehler, formuliere professionell und technisch präzise. Behalte den Inhalt exakt bei. Antworte NUR mit dem verbesserten Text.',
      empfehlungen: 'Du bist ein Assistent für einen österreichischen Kälte- und Klimatechnik-Betrieb. Verbessere den folgenden Text für das Feld "Empfehlungen" in einem Servicebericht. Formuliere professionell, kundenfreundlich und klar. Behalte den Inhalt exakt bei. Antworte NUR mit dem verbesserten Text.',
      notiz: 'Korrigiere Rechtschreibfehler und verbessere die Formulierung dieses Textes. Behalte den Inhalt exakt bei. Antworte NUR mit dem verbesserten Text.',
    };

    const { default: OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompts[field] || prompts.notiz },
        { role: 'user', content: text }
      ],
      max_tokens: 800,
      temperature: 0.3,
    });

    const improved = response.choices[0]?.message?.content?.trim() || text;
    res.json({ improved });
  } catch (err) { next(err); }
});

module.exports = router;
