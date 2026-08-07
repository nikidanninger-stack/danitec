// ─── Plaud Kundengespräch Analyse ─────────────────────────────────────────────
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../utils/db');

router.use(authenticate);

function buildSystemPrompt(products = []) {
  const preisliste = products.length > 0
    ? `\n\nVERFÜGBARE PRODUKTE UND PREISE (verwende diese für Positionen):\n` +
      products.map(p =>
        `- ID:${p.id} | SKU:${p.sku} | ${p.name} | Einheit:${p.unit} | Netto:${p.net_price}€`
      ).join('\n')
    : '';

  return `Du bist ein Assistent für einen österreichischen Kälte- und Klimatechnik-Betrieb (Danitec).
Analysiere das Kundengespräch-Transkript und extrahiere alle Informationen.${preisliste}

PFLICHT-CHECKLISTE — prüfe ob folgende Punkte im Transkript erwähnt wurden:
KUNDENDATEN: Name, Telefon, E-Mail, Adresse (Straße+Nr+PLZ+Ort)
STANDORT: Raumbezeichnung/Etage, Raumgröße (m²), Wandmaterial für Kernbohrung, Leitungsweg Innen→Außen (m), Montageort Außengerät
ANLAGE: Leistung (kW) oder Raumgröße für Berechnung, Heizen/Kühlen, Gerätemarke, Innengerätetyp
ELEKTRO: Separater Stromkreis vorhanden ja/nein, Einphasig/Dreiphasig
LEITUNGSFÜHRUNG: Kabelkanal-Art und Farbe, Kondensatpumpe nötig
TERMIN: Wunschtermin, Angebotsfrist

Jeden NICHT erwähnten Pflichtpunkt in fehlende_infos eintragen — diese erscheinen ROT im Angebot!

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
    "notes": "Sonstige Infos zum Kunden"
  },
  "projekt": {
    "bezeichnung": "Kurze Projektbezeichnung (max. 60 Zeichen)",
    "beschreibung": "Detaillierte Beschreibung was der Kunde möchte",
    "standort": "Wo wird die Anlage installiert",
    "raumgroesse_m2": null,
    "leitungsweg_m": null,
    "wandmaterial": "",
    "aussengeraet_position": "",
    "heizen_kuehlen": "",
    "leistung_kw": null,
    "geraetemarke": "",
    "stromkreis_vorhanden": null,
    "kabelkanal_farbe": "",
    "kondensatpumpe": null,
    "wunschtermin": "",
    "angebotsfrist": ""
  },
  "angebot_positionen": [
    {
      "name": "Bezeichnung der Leistung oder des Materials",
      "einheit": "Stk.",
      "menge": 1,
      "product_id": null,
      "unit_price_net": 0,
      "matched": false
    }
  ],
  "aufgaben": [
    {
      "text": "Konkrete Aufgabe die noch erledigt werden muss",
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
- Mengen: exakt aus dem Gespräch übernehmen (z.B. "10m Kabel" → menge: 10)
- Preise: IMMER versuchen ein passendes Produkt aus der Preisliste zu matchen!
  → Bei einem Match: product_id auf die ID setzen, unit_price_net auf den Nettopreis, matched: true
  → Kein Match: product_id: null, unit_price_net: 0, matched: false
- Aufgaben: alles was der Techniker noch klären muss
- fehlende_infos: Felder die fehlen (Adresse, E-Mail, Telefon etc.)
- Antworte IMMER mit validem JSON`;
}

// POST /api/plaud-analyse
router.post('/', async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript || transcript.trim().length < 10) {
      return res.status(400).json({ error: 'Kein Transkript übergeben.' });
    }

    // Produkte + OpenAI Key parallel laden
    const [prods, st] = await Promise.all([
      query('SELECT id, sku, name, unit, net_price FROM products WHERE company_id=$1 AND active=true ORDER BY sku', [req.user.company_id]),
      query('SELECT openai_api_key FROM company_settings WHERE company_id=$1', [req.user.company_id]),
    ]);

    const apiKey = st.rows[0]?.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'Kein OpenAI API-Key konfiguriert.' });
    }

    const { default: OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: buildSystemPrompt(prods.rows) },
        { role: 'user',   content: `Transkript:\n\n${transcript.slice(0, 12000)}` }
      ],
      max_tokens: 3000,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    let result;
    try { result = JSON.parse(raw); } catch { result = {}; }

    result.kunde              = result.kunde              || {};
    result.projekt            = result.projekt            || {};
    result.angebot_positionen = result.angebot_positionen || [];
    result.aufgaben           = result.aufgaben           || [];
    result.fehlende_infos     = result.fehlende_infos     || [];

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
