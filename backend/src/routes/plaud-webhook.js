// ─── Plaud Vollautomatischer Webhook (Zapier → Danitec) ──────────────────────
// Kein JWT nötig — Authentifizierung via Secret-Key in Request-Body oder Header
const router = require('express').Router();
const { query } = require('../utils/db');
const logger = require('../utils/logger');
const { sendInternalNotification } = require('../services/emailService');

// System-Prompt für Kundengespräche — mit Preislisten-Matching
function buildSystemPromptKunde(products) {
  const preisliste = products.map(p =>
    `ID:${p.id} | ${p.name} | ${p.unit} | Netto: €${p.net_price}`
  ).join('\n');

  return `Du bist ein Assistent für einen österreichischen Kälte- und Klimatechnik-Betrieb (Danitec).
Analysiere das Kundengespräch-Transkript und extrahiere alle relevanten Informationen.

VERFÜGBARE PREISLISTE (matche Positionen so gut wie möglich):
${preisliste}

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
      "product_id": 123,
      "name": "Bezeichnung (aus Preisliste wenn gefunden, sonst frei)",
      "einheit": "Stk.",
      "menge": 1,
      "unit_price_net": 0.00,
      "matched": true
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
- Mengen EXAKT aus dem Gespräch übernehmen (z.B. "10m Kabel" → menge: 10, einheit: "m")
- product_id: ID aus der Preisliste wenn gefunden, sonst null
- unit_price_net: Preis aus Preisliste wenn gefunden, sonst 0
- matched: true wenn in Preisliste gefunden, false wenn nicht
- Angebotspositionen: ALLE im Gespräch erwähnten Materialien und Leistungen
- Einheiten: "Stk.", "m", "m²", "Std.", "Psch."
- Aufgaben: alles was noch geklärt oder beschafft werden muss
- Antworte IMMER mit validem JSON`;
}

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

  // Preisliste für Matching laden
  const productsRes = await query(
    'SELECT id, name, unit, net_price, gross_price, vat_rate FROM products WHERE company_id=$1 AND active=true ORDER BY name',
    [company_id]
  );
  const products = productsRes.rows;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: buildSystemPromptKunde(products) },
      { role: 'user', content: `Aufnahme: ${recordingName}\n\nTranskript:\n\n${transcript.slice(0, 12000)}` }
    ],
    max_tokens: 3000,
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

  // Angebot anlegen (korrekte Tabellen: documents + offer_details + document_items)
  let offerId = null;
  if (customerId) {
    const { pool } = require('../utils/db');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Angebotsnummer generieren
      const sq = await client.query(
        'SELECT offer_prefix, next_offer_seq FROM company_settings WHERE company_id=$1 FOR UPDATE',
        [company_id]
      );
      const prefix = sq.rows[0]?.offer_prefix || 'AN';
      const seq    = sq.rows[0]?.next_offer_seq || 1;
      const year   = new Date().getFullYear();
      const offerNumber = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
      await client.query('UPDATE company_settings SET next_offer_seq=next_offer_seq+1 WHERE company_id=$1', [company_id]);

      // A-Nummer (Auftragsnummer)
      const seqA = await client.query(
        `SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(order_number,'[^0-9]','','g'),'') AS INT)),0)+1 AS next FROM documents WHERE company_id=$1 AND order_number LIKE 'A-%'`,
        [company_id]
      );
      const orderNumber = `A-${String(seqA.rows[0]?.next || 1).padStart(4, '0')}`;

      const today      = new Date().toISOString().slice(0, 10);
      const validUntil = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
      const subject    = projekt.bezeichnung || recordingName;

      const docRes = await client.query(
        `INSERT INTO documents (company_id, type, number, order_number, status, customer_id, document_date, due_date, subject, net_total, vat_total, gross_total, plaud_transcript)
         VALUES ($1,'offer',$2,$3,'draft',$4,$5,$6,$7,0,0,0,$8) RETURNING id`,
        [company_id, offerNumber, orderNumber, customerId, today, validUntil, subject, transcript]
      );
      offerId = docRes.rows[0].id;

      await client.query(
        'INSERT INTO offer_details (document_id, offer_status, valid_until) VALUES ($1,$2,$3)',
        [offerId, 'draft', validUntil]
      );

      let netTotal = 0;
      for (let i = 0; i < positionen.length; i++) {
        const pos = positionen[i];
        const menge        = parseFloat(pos.menge) || 1;
        const unitPriceNet = parseFloat(pos.unit_price_net) || 0;
        const vatRate      = pos.vat_rate ? parseFloat(pos.vat_rate) : 20;
        const netAmount    = Math.round(menge * unitPriceNet * 100) / 100;
        const vatAmount    = Math.round(netAmount * vatRate / 100 * 100) / 100;
        const grossAmount  = Math.round((netAmount + vatAmount) * 100) / 100;
        netTotal += netAmount;

        await client.query(
          `INSERT INTO document_items (document_id, position_number, product_id, description, quantity, unit, unit_price_net, vat_rate, net_amount, vat_amount, gross_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [offerId, i + 1, pos.product_id || null, pos.name, menge, pos.einheit || 'Stk.',
           unitPriceNet, vatRate, netAmount, vatAmount, grossAmount]
        );
      }

      // Gesamtsummen aktualisieren
      const vatTotal   = Math.round(netTotal * 0.20 * 100) / 100;
      const grossTotal = Math.round((netTotal + vatTotal) * 100) / 100;
      await client.query(
        'UPDATE documents SET net_total=$1, vat_total=$2, gross_total=$3 WHERE id=$4',
        [netTotal, vatTotal, grossTotal, offerId]
      );

      await client.query('COMMIT');
      logger.info(`Plaud: Angebot ${offerNumber} angelegt (ID ${offerId}) mit ${positionen.length} Positionen`);
    } catch (e) {
      await client.query('ROLLBACK');
      logger.error('Plaud: Angebot anlegen fehlgeschlagen: ' + e.message);
    } finally {
      client.release();
    }
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
