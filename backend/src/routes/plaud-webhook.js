// ─── Plaud Vollautomatischer Webhook (Zapier → Danitec) ──────────────────────
// Kein JWT nötig — Authentifizierung via Secret-Key in Request-Body oder Header
const router = require('express').Router();
const { query } = require('../utils/db');
const logger = require('../utils/logger');

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
    "notes": "Sonstige Infos zum Kunden"
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
  ]
}

Wichtige Regeln:
- companyName füllen wenn Firma, sonst firstName/lastName
- Angebotspositionen: nur wenn aus Gespräch erkennbar (Klimaanlage, Rohre, Montage etc.)
- Einheiten: "Stk.", "m", "m²", "Std.", "Psch."
- Aufgaben: alles was der Techniker noch klären oder recherchieren muss
- Antworte IMMER mit validem JSON`;

// POST /api/plaud-webhook
router.post('/', async (req, res) => {
  try {
    // Secret aus Body oder Header lesen
    const secret = req.body.secret || req.headers['x-plaud-secret'];
    if (!secret) {
      return res.status(401).json({ error: 'Kein Secret angegeben.' });
    }

    // Company anhand Secret-Key suchen
    const companyRes = await query(
      `SELECT cs.company_id, cs.openai_api_key, c.name as company_name
       FROM company_settings cs
       JOIN companies c ON c.id = cs.company_id
       WHERE cs.plaud_webhook_secret = $1`,
      [secret]
    );
    if (companyRes.rows.length === 0) {
      return res.status(401).json({ error: 'Ungültiger Secret-Key.' });
    }

    const { company_id, openai_api_key, company_name } = companyRes.rows[0];

    // Transkript aus verschiedenen möglichen Zapier-Feldern lesen
    const transcript = req.body.transcript
      || req.body.text
      || req.body.content
      || req.body.transcription
      || '';

    const recordingName = req.body.name || req.body.recording_name || req.body.title || 'Plaud Aufnahme';

    if (transcript.trim().length < 10) {
      return res.status(400).json({ error: 'Kein verwertbares Transkript.' });
    }

    // Sofort 200 antworten (Zapier-Timeout vermeiden) – Rest async
    res.json({ status: 'ok', message: 'Wird verarbeitet...' });

    // === Ab hier asynchron ===
    processPlaudWebhook({ company_id, openai_api_key, transcript, recordingName, company_name })
      .catch(err => logger.error(`Plaud Webhook Fehler (${company_id}): ${err.message}`));

  } catch (err) {
    logger.error('Plaud Webhook: ' + err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

async function processPlaudWebhook({ company_id, openai_api_key, transcript, recordingName, company_name }) {
  const apiKey = openai_api_key || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error(`Plaud Webhook: Kein OpenAI API-Key für company ${company_id}`);
    return;
  }

  logger.info(`Plaud Webhook: Verarbeite Aufnahme "${recordingName}" für ${company_name}`);

  // ── 1. GPT-4o Analyse ──────────────────────────────────────────────────────
  const { default: OpenAI } = require('openai');
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Aufnahme: ${recordingName}\n\nTranskript:\n\n${transcript.slice(0, 12000)}` }
    ],
    max_tokens: 2500,
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  let data;
  try {
    data = JSON.parse(response.choices[0]?.message?.content || '{}');
  } catch {
    logger.error('Plaud Webhook: JSON Parse Fehler');
    return;
  }

  const kunde = data.kunde || {};
  const positionen = data.angebot_positionen || [];
  const aufgaben = data.aufgaben || [];
  const projekt = data.projekt || {};

  // ── 2. Kunde anlegen ───────────────────────────────────────────────────────
  const hasName = kunde.companyName || kunde.firstName || kunde.lastName;
  let customerId = null;

  if (hasName) {
    const type = kunde.companyName ? 'business' : 'private';
    const kundeRes = await query(
      `INSERT INTO customers
         (company_id, type, company_name, first_name, last_name, email, phone,
          street, house_number, zip, city, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        company_id,
        type,
        kunde.companyName || null,
        kunde.firstName  || null,
        kunde.lastName   || null,
        kunde.email      || null,
        kunde.phone      || null,
        kunde.street     || null,
        kunde.houseNumber|| null,
        kunde.zip        || null,
        kunde.city       || null,
        `[Plaud: ${recordingName}]\n${kunde.notes || ''}`.trim(),
      ]
    );
    customerId = kundeRes.rows[0].id;
    logger.info(`Plaud Webhook: Kunde angelegt (ID ${customerId})`);
  }

  // ── 3. Angebot anlegen ─────────────────────────────────────────────────────
  let offerId = null;
  if (customerId) {
    const today = new Date().toISOString().slice(0, 10);
    const validUntil = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const subject = projekt.bezeichnung || recordingName;

    const offerRes = await query(
      `INSERT INTO offers
         (company_id, customer_id, document_date, valid_until, subject,
          net_total, vat_total, gross_total, status)
       VALUES ($1,$2,$3,$4,$5,0,0,0,'draft')
       RETURNING id`,
      [company_id, customerId, today, validUntil, subject]
    );
    offerId = offerRes.rows[0].id;

    // Positionen einfügen
    for (let i = 0; i < positionen.length; i++) {
      const pos = positionen[i];
      await query(
        `INSERT INTO offer_positions
           (offer_id, position_number, description, quantity, unit,
            unit_price_net, vat_rate, net_amount, vat_amount, gross_amount)
         VALUES ($1,$2,$3,$4,$5,0,20,0,0,0)`,
        [offerId, i + 1, pos.name, pos.menge || 1, pos.einheit || 'Stk.']
      );
    }
    logger.info(`Plaud Webhook: Angebot angelegt (ID ${offerId}) mit ${positionen.length} Positionen`);
  }

  // ── 4. Workspace Tasks anlegen ─────────────────────────────────────────────
  if (aufgaben.length > 0) {
    // Standard-Board "Plaud Aufgaben" suchen oder erstellen
    let boardId;
    const boardRes = await query(
      `SELECT id FROM workspace_boards WHERE company_id=$1 AND name='Plaud Aufgaben' LIMIT 1`,
      [company_id]
    );
    if (boardRes.rows.length > 0) {
      boardId = boardRes.rows[0].id;
    } else {
      const newBoard = await query(
        `INSERT INTO workspace_boards (company_id, name, color) VALUES ($1,'Plaud Aufgaben','#7c3aed') RETURNING id`,
        [company_id]
      );
      boardId = newBoard.rows[0].id;
    }

    const kundenName = kunde.companyName || `${kunde.firstName || ''} ${kunde.lastName || ''}`.trim() || 'Unbekannt';
    for (const aufgabe of aufgaben) {
      await query(
        `INSERT INTO workspace_cards (board_id, title, priority, status)
         VALUES ($1, $2, $3, 'open')`,
        [
          boardId,
          `[${kundenName}] ${aufgabe.text}`,
          aufgabe.prioritaet === 'hoch' ? 'high' : aufgabe.prioritaet === 'niedrig' ? 'low' : 'medium',
        ]
      ).catch(() => {
        // Fallback ohne priority/status falls Spalten anders heißen
        return query(
          `INSERT INTO workspace_cards (board_id, title) VALUES ($1,$2)`,
          [boardId, `[${kundenName}] ${aufgabe.text}`]
        );
      });
    }
    logger.info(`Plaud Webhook: ${aufgaben.length} Aufgaben angelegt`);
  }

  logger.info(`Plaud Webhook: Aufnahme "${recordingName}" vollständig verarbeitet ✅`);
}

module.exports = router;
