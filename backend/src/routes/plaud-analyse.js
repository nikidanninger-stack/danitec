// ─── Plaud Kundengespräch Analyse ─────────────────────────────────────────────
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../utils/db');

router.use(authenticate);

const SYSTEM_PROMPT = `Du bist ein Assistent für einen österreichischen Kälte- und Klimatechnik-Betrieb (Danitec).
Analysiere das folgende Kundengespräch-Transkript und extrahiere alle relevanten Informationen.

Gib die Antwort ALS REINES JSON zurück (kein Markdown, keine Erklärungen):
{
  "kunde": {
    "companyName": "Firmenname oder leer",
    "firstName": "Vorname oder leer",
    "lastName": "Nachname oder leer",
    "email": "E-Mail oder leer",
    "phone": "Telefonnummer oder leer",
    "street": "Straße oder leer",
    "houseNumber": "Hausnummer oder leer",
    "zip": "PLZ oder leer",
    "city": "Ort oder leer",
    "notes": "Sonstige Infos zum Kunden (Besonderheiten, Präferenzen etc.)"
  },
  "projekt": {
    "bezeichnung": "Kurze Projektbezeichnung (max. 60 Zeichen)",
    "beschreibung": "Detaillierte Beschreibung was der Kunde möchte",
    "standort": "Wo wird die Anlage installiert"
  },
  "angebot_positionen": [
    {
      "name": "Bezeichnung der Leistung oder des Materials",
      "einheit": "Stk.",
      "menge": 1
    }
  ],
  "aufgaben": [
    {
      "text": "Konkrete Aufgabe die noch erledigt oder recherchiert werden muss",
      "prioritaet": "hoch"
    }
  ],
  "fehlende_infos": [
    {
      "feld": "email",
      "label": "E-Mail-Adresse",
      "frage": "Wie lautet die E-Mail-Adresse des Kunden?"
    }
  ]
}

Wichtige Regeln:
- Typ des Kunden: companyName füllen wenn Firma, sonst firstName/lastName
- Angebotspositionen: nur wenn aus dem Gespräch erkennbar (Klimaanlage, Rohre, Montage, Materialien etc.)
- Einheiten: "Stk.", "m", "m²", "Std.", "Psch."
- Aufgaben: alles was der Techniker noch klären, messen oder recherchieren muss
- fehlende_infos: Felder die für Kunde oder Angebot wichtig wären aber nicht im Gespräch erwähnt wurden
- Antworte IMMER mit validem JSON`;

// POST /api/plaud-analyse
router.post('/', async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript || transcript.trim().length < 10) {
      return res.status(400).json({ error: 'Kein Transkript übergeben.' });
    }

    // OpenAI Key aus company_settings oder Umgebungsvariable
    const st = await query('SELECT openai_api_key FROM company_settings WHERE company_id=$1', [req.user.company_id]);
    const apiKey = st.rows[0]?.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'Kein OpenAI API-Key konfiguriert. Bitte unter Einstellungen → OpenAI eintragen.' });
    }

    const { default: OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Transkript:\n\n${transcript.slice(0, 12000)}` }
      ],
      max_tokens: 2500,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      result = {};
    }

    // Defaults sicherstellen
    result.kunde            = result.kunde            || {};
    result.projekt          = result.projekt          || {};
    result.angebot_positionen = result.angebot_positionen || [];
    result.aufgaben         = result.aufgaben         || [];
    result.fehlende_infos   = result.fehlende_infos   || [];

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
