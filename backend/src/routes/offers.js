// offers.js
const offerRouter = require('express').Router();
const { query, withTransaction } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { nextOrderNumber } = require('../utils/orderNumber');

offerRouter.use(authenticate);

offerRouter.get('/', async (req,res,next) => {
  try {
    const { search, orderNumber } = req.query;
    let where = 'WHERE d.company_id=$1 AND d.type=\'offer\'';
    const params = [req.user.company_id];
    if (orderNumber) { params.push(orderNumber); where += ` AND d.order_number=$${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (d.number ILIKE $${params.length} OR d.order_number ILIKE $${params.length} OR c.company_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length})`;
    }
    const r = await query(`SELECT d.*,od.offer_status,od.valid_until,COALESCE(c.company_name,c.first_name||' '||c.last_name) AS customer_name,c.email AS customer_email FROM documents d JOIN offer_details od ON od.document_id=d.id LEFT JOIN customers c ON d.customer_id=c.id ${where} ORDER BY d.document_date DESC`, params);
    res.json({ data: r.rows });
  } catch(err) { next(err); }
});

offerRouter.post('/', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req,res,next) => {
  try {
    const r = await withTransaction(async (client) => {
      const sq = await client.query('SELECT offer_prefix,next_offer_seq FROM company_settings WHERE company_id=$1 FOR UPDATE',[req.user.company_id]);
      const nr = `${sq.rows[0].offer_prefix}-${new Date().getFullYear()}-${String(sq.rows[0].next_offer_seq).padStart(4,'0')}`;
      await client.query('UPDATE company_settings SET next_offer_seq=next_offer_seq+1 WHERE company_id=$1',[req.user.company_id]);

      // A-Nummer generieren (wenn nicht mitgegeben)
      const orderNum = req.body.orderNumber || await nextOrderNumber(req.user.company_id, 'A', client);

      const { customerId,documentDate,validUntil,subject,netTotal=0,vatTotal=0,grossTotal=0,positions=[],plaudTranscript=null } = req.body;
      const doc = await client.query(
        `INSERT INTO documents (company_id,type,number,order_number,status,customer_id,document_date,due_date,subject,net_total,vat_total,gross_total,plaud_transcript,created_by)
         VALUES ($1,'offer',$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [req.user.company_id,nr,orderNum,customerId||null,documentDate,validUntil||null,subject||null,netTotal,vatTotal,grossTotal,plaudTranscript||null,req.user.id]);
      const docId = doc.rows[0].id;
      await client.query('INSERT INTO offer_details (document_id,offer_status,valid_until) VALUES ($1,$2,$3)',[docId,'draft',validUntil||null]);
      for(let i=0;i<positions.length;i++) {
        const p=positions[i];
        await client.query(
          `INSERT INTO document_items (document_id,position_number,product_id,description,quantity,unit,unit_price_net,vat_rate,net_amount,vat_amount,gross_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [docId,i+1,p.product_id||null,p.description,p.quantity,p.unit,p.unit_price_net,p.vat_rate,p.net_amount,p.vat_amount,p.gross_amount]);
      }
      return doc.rows[0];
    });
    res.status(201).json(r);
  } catch(err) { next(err); }
});

offerRouter.post('/:id/send', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req,res,next) => {
  try {
    await query('UPDATE offer_details SET offer_status=$1 WHERE document_id=$2',['sent', req.params.id]);
    await query('UPDATE documents SET status=$1, sent_at=NOW() WHERE id=$2',['sent', req.params.id]);
    res.json({ message: 'Angebot als versendet markiert.' });
  } catch(err) { next(err); }
});

offerRouter.post('/:id/accept', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req,res,next) => {
  try {
    await query('UPDATE offer_details SET offer_status=$1 WHERE document_id=$2',['accepted', req.params.id]);
    await query('UPDATE documents SET status=$1 WHERE id=$2',['accepted', req.params.id]);
    res.json({ message: 'Angebot als angenommen markiert.' });
  } catch(err) { next(err); }
});

offerRouter.post('/:id/reject', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req,res,next) => {
  try {
    await query('UPDATE offer_details SET offer_status=$1 WHERE document_id=$2',['rejected', req.params.id]);
    await query('UPDATE documents SET status=$1 WHERE id=$2',['rejected', req.params.id]);
    res.json({ message: 'Angebot als abgelehnt markiert.' });
  } catch(err) { next(err); }
});

offerRouter.post('/:id/convert-to-invoice', authorize('admin','geschaeftsfuehrer'), async (req,res,next) => {
  try {
    const r = await withTransaction(async (client) => {
      const offer = await client.query(`SELECT d.*,od.valid_until FROM documents d JOIN offer_details od ON od.document_id=d.id WHERE d.id=$1 AND d.company_id=$2`,[req.params.id,req.user.company_id]);
      if (!offer.rows[0]) throw { status:404, message:'Angebot nicht gefunden.' };
      const o = offer.rows[0];
      const sq = await client.query('SELECT invoice_prefix,next_invoice_seq,COALESCE(invoice_year,EXTRACT(YEAR FROM NOW())::int) AS invoice_year FROM company_settings WHERE company_id=$1 FOR UPDATE',[req.user.company_id]);
      const curYear = new Date().getFullYear();
      let seq = parseInt(sq.rows[0].next_invoice_seq);
      if (curYear !== parseInt(sq.rows[0].invoice_year)) {
        seq = 1;
        await client.query('UPDATE company_settings SET next_invoice_seq=1,invoice_year=$1 WHERE company_id=$2',[curYear,req.user.company_id]);
      }
      const nr = `${sq.rows[0].invoice_prefix}-${curYear}-${String(seq).padStart(4,'0')}`;
      await client.query('UPDATE company_settings SET next_invoice_seq=next_invoice_seq+1 WHERE company_id=$1',[req.user.company_id]);
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now()+14*86400000).toISOString().split('T')[0];
      // A-Nummer vom Angebot auf Rechnung übernehmen
      const inv = await client.query(
        `INSERT INTO documents (company_id,type,number,order_number,status,locked,customer_id,document_date,due_date,subject,net_total,vat_total,gross_total,finalized_at,created_by)
         VALUES ($1,'invoice',$2,$3,'finalized',TRUE,$4,$5,$6,$7,$8,$9,$10,NOW(),$11) RETURNING *`,
        [req.user.company_id,nr,o.order_number,o.customer_id,today,dueDate,o.subject,o.net_total,o.vat_total,o.gross_total,req.user.id]);
      const invId = inv.rows[0].id;
      const items = await client.query('SELECT * FROM document_items WHERE document_id=$1 ORDER BY position_number',[req.params.id]);
      for(const item of items.rows) {
        await client.query(
          `INSERT INTO document_items (document_id,position_number,product_id,description,quantity,unit,unit_price_net,discount_percent,vat_rate,net_amount,vat_amount,gross_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [invId,item.position_number,item.product_id,item.description,item.quantity,item.unit,item.unit_price_net,item.discount_percent,item.vat_rate,item.net_amount,item.vat_amount,item.gross_amount]);
      }
      await client.query('UPDATE offer_details SET offer_status=$1,converted_to_id=$2,converted_at=NOW() WHERE document_id=$3',['converted',invId,req.params.id]);
      return { offer: o, invoice: inv.rows[0] };
    });
    res.json(r);
  } catch(err) { next(err); }
});

// ─── GET /api/offers/:id — Einzelnes Angebot mit Positionen ──────────────────
offerRouter.get('/:id', async (req, res, next) => {
  try {
    const doc = await query(
      `SELECT d.*, od.offer_status, od.valid_until,
              COALESCE(c.company_name, c.first_name||' '||c.last_name) AS customer_name,
              c.email AS customer_email
       FROM documents d
       JOIN offer_details od ON od.document_id=d.id
       LEFT JOIN customers c ON d.customer_id=c.id
       WHERE d.id=$1 AND d.company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!doc.rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
    const items = await query(
      'SELECT * FROM document_items WHERE document_id=$1 ORDER BY position_number',
      [req.params.id]
    );
    res.json({ ...doc.rows[0], items: items.rows });
  } catch(err) { next(err); }
});

// ─── PUT /api/offers/:id — Angebot-Positionen aktualisieren ──────────────────
offerRouter.put('/:id', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const { subject, validUntil, positions = [] } = req.body;
    await withTransaction(async (client) => {
      await client.query('DELETE FROM document_items WHERE document_id=$1', [req.params.id]);
      let net = 0, vat = 0, gross = 0;
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        const qty   = parseFloat(p.quantity) || 1;
        const price = parseFloat(p.unit_price_net) || 0;
        const disc  = parseFloat(p.discount_percent) || 0;
        const vatR  = parseFloat(p.vat_rate) ?? 20;
        const netA  = Math.round(qty * price * (1 - disc/100) * 100) / 100;
        const vatA  = Math.round(netA * vatR / 100 * 100) / 100;
        const grs   = Math.round((netA + vatA) * 100) / 100;
        net += netA; vat += vatA; gross += grs;
        await client.query(
          `INSERT INTO document_items (document_id,position_number,product_id,description,quantity,unit,unit_price_net,discount_percent,vat_rate,net_amount,vat_amount,gross_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [req.params.id, i+1, p.product_id||null, p.description, qty, p.unit||'Stk.', price, disc, vatR, netA, vatA, grs]
        );
      }
      net = Math.round(net*100)/100; vat = Math.round(vat*100)/100; gross = Math.round(gross*100)/100;
      await client.query(
        `UPDATE documents SET subject=COALESCE($1,subject), net_total=$2, vat_total=$3, gross_total=$4 WHERE id=$5`,
        [subject||null, net, vat, gross, req.params.id]
      );
      if (validUntil) {
        await client.query('UPDATE offer_details SET valid_until=$1 WHERE document_id=$2', [validUntil, req.params.id]);
        await client.query('UPDATE documents SET due_date=$1 WHERE id=$2', [validUntil, req.params.id]);
      }
    });
    res.json({ success: true });
  } catch(err) { next(err); }
});

// ─── POST /api/offers/:id/analyse — "Was fehlt?" KI-Analyse ──────────────────
offerRouter.post('/:id/analyse', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Angebot + Transkript + Positionen laden
    const docRes = await query(
      `SELECT d.subject, d.plaud_transcript,
              COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS kunde
       FROM documents d
       LEFT JOIN customers c ON c.id = d.customer_id
       WHERE d.id=$1 AND d.company_id=$2`,
      [id, req.user.company_id]
    );
    if (!docRes.rows[0]) return res.status(404).json({ error: 'Angebot nicht gefunden.' });

    const doc = docRes.rows[0];
    if (!doc.plaud_transcript) {
      return res.status(400).json({ error: 'Kein Plaud-Transkript für dieses Angebot vorhanden.' });
    }

    const itemsRes = await query(
      'SELECT description, quantity, unit, unit_price_net FROM document_items WHERE document_id=$1 ORDER BY position_number',
      [id]
    );

    const settingsRes = await query('SELECT openai_api_key FROM company_settings WHERE company_id=$1', [req.user.company_id]);
    const apiKey = settingsRes.rows[0]?.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Kein OpenAI API-Key konfiguriert.' });

    const { default: OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey });

    const currentItems = itemsRes.rows.map(i =>
      `- ${i.description} (${i.quantity} ${i.unit}, €${i.unit_price_net} Netto)`
    ).join('\n');

    const prompt = `Du analysierst ein Klimatechnik-Angebot. Vergleiche das Transkript mit den bereits eingetragenen Positionen.

TRANSKRIPT:
${doc.plaud_transcript.slice(0, 8000)}

BEREITS IM ANGEBOT EINGETRAGEN:
${currentItems || '(noch keine Positionen)'}

Antworte mit REINEM JSON:
{
  "fehlende_positionen": [
    { "name": "Bezeichnung", "menge": 1, "einheit": "Stk.", "grund": "Warum fehlt das?" }
  ],
  "preis_null": [
    { "name": "Bezeichnung", "hinweis": "Welchen Preis schätzt du dafür?" }
  ],
  "vollstaendigkeit": 75,
  "kommentar": "Kurzer Kommentar zum Angebot"
}

Regeln:
- fehlende_positionen: Materialien/Leistungen die im Transkript erwähnt wurden aber NICHT im Angebot sind
- preis_null: Positionen die im Angebot sind aber Preis 0 haben und dringend einen Preis brauchen
- vollstaendigkeit: 0-100%, wie vollständig ist das Angebot basierend auf dem Transkript
- Antworte NUR mit validem JSON`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const analyse = JSON.parse(response.choices[0]?.message?.content || '{}');
    res.json({ ...analyse, kunde: doc.kunde, betreff: doc.subject });

  } catch(err) { next(err); }
});

// ─── POST /api/offers/:id/add-position — Position aus Analyse hinzufügen ─────
offerRouter.post('/:id/add-position', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, menge, einheit, unit_price_net = 0 } = req.body;

    const lastPos = await query(
      'SELECT COALESCE(MAX(position_number),0)+1 AS next FROM document_items WHERE document_id=$1',
      [id]
    );
    const posNr = lastPos.rows[0].next;
    const qty   = parseFloat(menge) || 1;
    const price = parseFloat(unit_price_net) || 0;
    const net   = Math.round(qty * price * 100) / 100;
    const vat   = Math.round(net * 0.20 * 100) / 100;

    await query(
      `INSERT INTO document_items (document_id, position_number, description, quantity, unit, unit_price_net, vat_rate, net_amount, vat_amount, gross_amount)
       VALUES ($1,$2,$3,$4,$5,$6,20,$7,$8,$9)`,
      [id, posNr, name, qty, einheit || 'Stk.', price, net, vat, net + vat]
    );

    // Gesamtsummen neu berechnen
    const totals = await query(
      'SELECT SUM(net_amount) AS net, SUM(vat_amount) AS vat, SUM(gross_amount) AS gross FROM document_items WHERE document_id=$1',
      [id]
    );
    const t = totals.rows[0];
    await query(
      'UPDATE documents SET net_total=$1, vat_total=$2, gross_total=$3 WHERE id=$4',
      [t.net||0, t.vat||0, t.gross||0, id]
    );

    res.json({ success: true });
  } catch(err) { next(err); }
});

module.exports = offerRouter;
