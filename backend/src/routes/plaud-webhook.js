// ─── Plaud Vollautomatischer Webhook (Zapier → Danitec) ──────────────────────
// Kein JWT nötig — Authentifizierung via Secret-Key in Request-Body oder Header
const router = require('express').Router();
const { query } = require('../utils/db');
const logger = require('../utils/logger');
const { sendInternalNotification } = require('../services/emailService');

// System-Prompt für Kundengespräche (enthält "danitec")
const SYSTEM_PROMPT_KUNDE = `Du bist ein Assistent für einen österreichischen Kälte- und Klimatechnik-Betrieb (Danitec).
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

// System-Prompt für alle anderen Gespräche (ohne "danitec")
const SYSTEM_PROMPT_ALLGEMEIN = `Du bist ein persönlicher Assistent.
Analysiere das folgende Gesprächs-Transkript und extrahiere die wichtigsten Informationen.

Gib die Antwort ALS REINES JSON zurück (kein Markdown, keine Erklärungen):
{
  "titel": "Kurzer Titel des Gesprächs (max. 60 Zeichen)",
  "zusammenfassung": "Kurze Zusammenfassung des Gesprächs in 2-3 Sätzen",
  "aufgaben": [
    {
      "text": "Konkrete To-do oder Aufgabe die sich aus dem Gespräch ergibt",
      "prioritaet": "hoch"
    }
  ]
}

Wichtige Regeln:
- Nur Aufgaben extrahieren die wirklich actionable sind (Anrufen, Kaufen, Erledigen, Nachfragen etc.)
- Priorität: "hoch", "mittel" oder "niedrig"
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

    // Ist es ein Kundengespräch (enthält "danitec")?
    const isKundengespraech = transcript.toLowerCase().includes('danitec');

    if (isKundengespraech) {
      processKundengespraech({ company_id, openai_api_key, transcript, recordingName, company_name })
        .catch(err => logger.error(`Plaud Kundengespräch Fehler (${company_id}): ${err.message}`));
    } else {
      processAllgemeinesGespraech({ company_id, openai_api_key, transcript, recordingName })
        .catch(err => logger.error(`Plaud Allgemeines Gespräch Fehler (${company_id}): ${err.message}`));
    }

  } catch (err) {
    logger.error('Plaud Webhook: ' + err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── Kundengespräch: Kunde + Angebot + Tasks ────────────────────────────────────
async function processKundengespraech({ company_id, openai_api_key, transcript, recordingName, company_name }) {
  const apiKey = openai_api_key || process.env.OPENAI_API_KEY;
  if (!apiKey) { logger.error(`Plaud: Kein OpenAI API-Key für company ${company_id}`); return; }

  logger.info(`Plaud Kundengespräch: "${recordingName}" für ${company_name}`);

  const { default: OpenAI } = require('openai');
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_KUNDE },
      { role: 'user', content: `Aufnahme: ${recordingName}\n\nTranskript:\n\n${transcript.slice(0, 12000)}` }
    ],
    max_tokens: 2500,
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  let data;
  try { data = JSON.parse(response.choices[0]?.message?.content || '{}'); }
  catch { logger.error('Plaud: JSON Parse Fehler'); return; }

  const kunde = data.kunde || {};
  const positionen = data.angebot_positionen || [];
  const aufgaben = data.aufgaben || [];
  const projekt = data.projekt || {};

  // Kunde anlegen
  const hasName = kunde.companyName || kunde.firstName || kunde.lastName;
  let customerId = null;
  if (hasName) {
    const type = kunde.companyName ? 'business' : 'private';
    const kundeRes = await query(
      `INSERT INTO customers
         (company_id, type, company_name, first_name, last_name, email, phone,
          street, house_number, zip, city, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [company_id, type, kunde.companyName||null, kunde.firstName||null, kunde.lastName||null,
       kunde.email||null, kunde.phone||null, kunde.street||null, kunde.houseNumber||null,
       kunde.zip||null, kunde.city||null, `[Plaud: ${recordingName}]\n${kunde.notes||''}`.trim()]
    );
    customerId = kundeRes.rows[0].id;
    logger.info(`Plaud: Kunde angelegt (ID ${customerId})`);
  }

  // Angebot anlegen
  if (customerId) {
    const today = new Date().toISOString().slice(0, 10);
    const validUntil = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const offerRes = await query(
      `INSERT INTO offers (company_id, customer_id, document_date, valid_until, subject, net_total, vat_total, gross_total, status)
       VALUES ($1,$2,$3,$4,$5,0,0,0,'draft') RETURNING id`,
      [company_id, customerId, today, validUntil, projekt.bezeichnung || recordingName]
    );
    const offerId = offerRes.rows[0].id;
    for (let i = 0; i < positionen.length; i++) {
      const pos = positionen[i];
      await query(
        `INSERT INTO offer_positions (offer_id, position_number, description, quantity, unit, unit_price_net, vat_rate, net_amount, vat_amount, gross_amount)
         VALUES ($1,$2,$3,$4,$5,0,20,0,0,0)`,
        [offerId, i + 1, pos.name, pos.menge || 1, pos.einheit || 'Stk.']
      );
    }
    logger.info(`Plaud: Angebot angelegt (ID ${offerId}) mit ${positionen.length} Positionen`);
  }

  // Tasks im Board "Plaud Aufgaben"
  if (aufgaben.length > 0) {
    const boardId = await getOrCreateBoard(company_id, 'Plaud Aufgaben', '#7c3aed');
    const kundenName = kunde.companyName || `${kunde.firstName||''} ${kunde.lastName||''}`.trim() || 'Unbekannt';
    for (const aufgabe of aufgaben) {
      await insertCard(boardId, `[${kundenName}] ${aufgabe.text}`, aufgabe.prioritaet);
    }
    logger.info(`Plaud: ${aufgaben.length} Kunden-Tasks angelegt`);
  }

  // E-Mail Benachrichtigung
  const companyInfo = await query('SELECT email FROM companies WHERE id=$1', [company_id]);
  const toEmail = companyInfo.rows[0]?.email;
  if (toEmail) {
    const kundenName = kunde.companyName || `${kunde.firstName||''} ${kunde.lastName||''}`.trim() || 'Unbekannt';
    await sendInternalNotification({
      companyId: company_id,
      toEmail,
      subject: `✅ Plaud: Kundengespräch verarbeitet – ${kundenName}`,
      lines: [
        { label: 'Aufnahme', value: recordingName },
        { label: 'Kunde', value: kundenName },
        { label: 'Angebot', value: offerId ? `Angebot #${offerId} angelegt (Preise noch einzutragen)` : 'Kein Angebot (Name nicht erkannt)' },
        { label: 'Aufgaben', value: `${aufgaben.length} Task(s) im Workspace angelegt` },
        { divider: true },
        { label: 'Nächster Schritt', value: 'Angebot in Danitec öffnen → Preise eintragen → versenden' },
      ],
    });
  }

  logger.info(`Plaud Kundengespräch "${recordingName}" vollständig verarbeitet ✅`);
}

// ── Allgemeines Gespräch: Zusammenfassung + Tasks ──────────────────────────────
async function processAllgemeinesGespraech({ company_id, openai_api_key, transcript, recordingName }) {
  const apiKey = openai_api_key || process.env.OPENAI_API_KEY;
  if (!apiKey) { logger.error(`Plaud: Kein OpenAI API-Key für company ${company_id}`); return; }

  logger.info(`Plaud Allgemeines Gespräch: "${recordingName}"`);

  const { default: OpenAI } = require('openai');
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_ALLGEMEIN },
      { role: 'user', content: `Aufnahme: ${recordingName}\n\nTranskript:\n\n${transcript.slice(0, 12000)}` }
    ],
    max_tokens: 1000,
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  let data;
  try { data = JSON.parse(response.choices[0]?.message?.content || '{}'); }
  catch { logger.error('Plaud: JSON Parse Fehler (allgemein)'); return; }

  const aufgaben = data.aufgaben || [];
  const titel = data.titel || recordingName;
  const zusammenfassung = data.zusammenfassung || '';

  // Tasks im Board "Allgemeine Gespräche"
  const boardId = await getOrCreateBoard(company_id, 'Allgemeine Gespräche', '#0ea5e9');

  // Zusammenfassung als erste Karte
  if (zusammenfassung) {
    await insertCard(boardId, `📝 ${titel}: ${zusammenfassung}`, 'mittel');
  }

  // Aufgaben als einzelne Karten
  for (const aufgabe of aufgaben) {
    await insertCard(boardId, aufgabe.text, aufgabe.prioritaet);
  }

  // E-Mail Benachrichtigung
  const companyInfo2 = await query('SELECT email FROM companies WHERE id=$1', [company_id]);
  const toEmail2 = companyInfo2.rows[0]?.email;
  if (toEmail2) {
    await sendInternalNotification({
      companyId: company_id,
      toEmail: toEmail2,
      subject: `📝 Plaud: Gespräch gespeichert – ${titel}`,
      lines: [
        { label: 'Aufnahme', value: recordingName },
        { label: 'Titel', value: titel },
        { label: 'Zusammenfassung', value: zusammenfassung },
        { label: 'Aufgaben', value: `${aufgaben.length} Task(s) in Asana + Obsidian` },
      ],
    });
  }

  logger.info(`Plaud: "${recordingName}" → ${aufgaben.length} Tasks + Zusammenfassung im Board "Allgemeine Gespräche" ✅`);
}

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────
async function getOrCreateBoard(company_id, name, color) {
  const r = await query(
    `SELECT id FROM workspace_boards WHERE company_id=$1 AND name=$2 LIMIT 1`,
    [company_id, name]
  );
  if (r.rows.length > 0) return r.rows[0].id;
  const n = await query(
    `INSERT INTO workspace_boards (company_id, name, color) VALUES ($1,$2,$3) RETURNING id`,
    [company_id, name, color]
  );
  return n.rows[0].id;
}

async function insertCard(boardId, title, prioritaet) {
  const priority = prioritaet === 'hoch' ? 'high' : prioritaet === 'niedrig' ? 'low' : 'medium';
  await query(
    `INSERT INTO workspace_cards (board_id, title, priority, status) VALUES ($1,$2,$3,'open')`,
    [boardId, title, priority]
  ).catch(() =>
    query(`INSERT INTO workspace_cards (board_id, title) VALUES ($1,$2)`, [boardId, title])
  );
}

module.exports = router;
