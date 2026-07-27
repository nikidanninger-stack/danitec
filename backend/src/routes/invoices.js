// ─── Rechnungen API ───────────────────────────────────────────────────────────
const router = require('express').Router();
const { body, param, query: qVal, validationResult } = require('express-validator');
const { query, withTransaction } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { nextOrderNumber } = require('../utils/orderNumber');

// Alle Routen benötigen Authentifizierung
router.use(authenticate);

// ─── Berechnungslogik ─────────────────────────────────────────────────────────
function calcPosition(pos) {
  const menge   = parseFloat(pos.quantity)      || 0;
  const preis   = parseFloat(pos.unit_price_net) || 0;
  const rabatt  = parseFloat(pos.discount_percent) || 0;
  const ustSatz = parseFloat(pos.vat_rate)       || 0;

  const netto_gesamt  = Math.round(menge * preis * 100) / 100;
  const rabatt_betrag = Math.round(netto_gesamt * rabatt / 100 * 100) / 100;
  const netto_nR      = Math.round((netto_gesamt - rabatt_betrag) * 100) / 100;
  const ust_betrag    = Math.round(netto_nR * ustSatz / 100 * 100) / 100;
  const brutto        = Math.round((netto_nR + ust_betrag) * 100) / 100;

  return { ...pos, discount_amount: rabatt_betrag, net_amount: netto_nR, vat_amount: ust_betrag, gross_amount: brutto };
}

function calcTotals(positions) {
  const calced = positions.map(calcPosition);
  return {
    net_total:   Math.round(calced.reduce((s, p) => s + p.net_amount, 0)   * 100) / 100,
    vat_total:   Math.round(calced.reduce((s, p) => s + p.vat_amount, 0)   * 100) / 100,
    gross_total: Math.round(calced.reduce((s, p) => s + p.gross_amount, 0) * 100) / 100,
    positions:   calced,
  };
}

// ─── GET /api/invoices ────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { status, customerId, from, to, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.company_id];
    let where = 'WHERE d.company_id = $1 AND d.type = \'invoice\'';

    if (status)     { params.push(status);     where += ` AND d.status = $${params.length}`; }
    if (customerId) { params.push(customerId); where += ` AND d.customer_id = $${params.length}`; }
    if (from)       { params.push(from);       where += ` AND d.document_date >= $${params.length}`; }
    if (to)         { params.push(to);         where += ` AND d.document_date <= $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (d.number ILIKE $${params.length} OR d.order_number ILIKE $${params.length} OR c.company_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length})`;
    }

    const result = await query(`
      SELECT d.id, d.number, d.order_number, d.status, d.locked, d.document_date, d.due_date,
             d.net_total, d.vat_total, d.gross_total, d.paid_total, d.open_total,
             d.subject, d.sent_at,
             COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
             c.email AS customer_email
      FROM documents d
      LEFT JOIN customers c ON d.customer_id = c.id
      ${where}
      ORDER BY d.document_date DESC, d.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    const count = await query(`SELECT COUNT(*) FROM documents d LEFT JOIN customers c ON d.customer_id = c.id ${where}`, params);
    res.json({ data: result.rows, total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// ─── GET /api/invoices/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT d.*,
             COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
             c.address AS customer_address, c.zip AS customer_zip, c.city AS customer_city,
             c.uid_number AS customer_uid, c.email AS customer_email
      FROM documents d
      LEFT JOIN customers c ON d.customer_id = c.id
      WHERE d.id = $1 AND d.company_id = $2
    `, [req.params.id, req.user.company_id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Rechnung nicht gefunden.' });

    const items = await query(
      'SELECT * FROM document_items WHERE document_id = $1 ORDER BY position_number',
      [req.params.id]
    );
    const payments = await query(
      'SELECT * FROM document_payments WHERE document_id = $1 ORDER BY payment_date',
      [req.params.id]
    );
    const dunnings = await query(
      'SELECT * FROM dunnings WHERE document_id = $1 ORDER BY dunning_date',
      [req.params.id]
    );

    res.json({ ...result.rows[0], items: items.rows, payments: payments.rows, dunnings: dunnings.rows });
  } catch (err) { next(err); }
});

// ─── POST /api/invoices ───────────────────────────────────────────────────────
router.post('/', authorize('admin', 'geschaeftsfuehrer', 'buchhaltung'), async (req, res, next) => {
  const { customerId, documentDate, dueDate, subject, introText, closingText,
          positions = [], finalize = false } = req.body;

  if (!customerId || !documentDate) {
    return res.status(400).json({ error: 'Kunde und Rechnungsdatum sind erforderlich.' });
  }
  if (positions.length === 0) {
    return res.status(400).json({ error: 'Mindestens eine Position ist erforderlich.' });
  }

  try {
    const result = await withTransaction(async (client) => {
      // Nächste Rechnungsnummer aus den Einstellungen holen (atomar)
      const settingsRes = await client.query(
        `SELECT invoice_prefix, next_invoice_seq, COALESCE(invoice_year, EXTRACT(YEAR FROM NOW())::int) AS invoice_year
         FROM company_settings WHERE company_id = $1 FOR UPDATE`,
        [req.user.company_id]
      );
      const { invoice_prefix } = settingsRes.rows[0];
      const year = new Date(documentDate).getFullYear();
      const storedYear = parseInt(settingsRes.rows[0].invoice_year);

      // Jahreswechsel → Sequenz auf 1 zurücksetzen
      let seq = parseInt(settingsRes.rows[0].next_invoice_seq);
      if (year !== storedYear) {
        seq = 1;
        await client.query(
          'UPDATE company_settings SET next_invoice_seq = 1, invoice_year = $1 WHERE company_id = $2',
          [year, req.user.company_id]
        );
      }

      const number = `${invoice_prefix}-${year}-${String(seq).padStart(4, '0')}`;

      // Sequenz erhöhen
      await client.query(
        'UPDATE company_settings SET next_invoice_seq = next_invoice_seq + 1 WHERE company_id = $1',
        [req.user.company_id]
      );

      // Summen berechnen
      const totals = calcTotals(positions);

      // A-Nummer generieren (wenn nicht mitgegeben)
      const orderNum = req.body.orderNumber || await nextOrderNumber(req.user.company_id, 'A', client);

      // Rechnung anlegen
      const status = finalize ? 'finalized' : 'draft';
      const docRes = await client.query(`
        INSERT INTO documents (company_id, type, number, order_number, status, locked, customer_id,
          document_date, due_date, subject, intro_text, closing_text,
          net_total, vat_total, gross_total, finalized_at, created_by)
        VALUES ($1,'invoice',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING *`,
        [req.user.company_id, number, orderNum, status, finalize, customerId,
         documentDate, dueDate || null, subject || null, introText || null, closingText || null,
         totals.net_total, totals.vat_total, totals.gross_total,
         finalize ? new Date() : null, req.user.id]
      );
      const docId = docRes.rows[0].id;

      // Positionen anlegen
      for (let i = 0; i < totals.positions.length; i++) {
        const p = totals.positions[i];
        await client.query(`
          INSERT INTO document_items (document_id, position_number, product_id, description,
            quantity, unit, unit_price_net, discount_percent, discount_amount,
            vat_rate, net_amount, vat_amount, gross_amount)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [docId, i + 1, p.product_id || null, p.description, p.quantity, p.unit,
           p.unit_price_net, p.discount_percent || 0, p.discount_amount,
           p.vat_rate, p.net_amount, p.vat_amount, p.gross_amount]
        );
      }

      // Audit-Log
      if (finalize) {
        await client.query(`
          INSERT INTO audit_logs (company_id, user_id, entity_type, entity_id, action, new_value, ip_address)
          VALUES ($1,$2,'invoice',$3,'Rechnung festgeschrieben',$4,$5)`,
          [req.user.company_id, req.user.id, docId, JSON.stringify({ number, gross_total: totals.gross_total }), req.ip]
        );
      }

      return { ...docRes.rows[0], items: totals.positions };
    });

    res.status(201).json(result);
  } catch (err) { next(err); }
});

// ─── POST /api/invoices/:id/finalize ─────────────────────────────────────────
router.post('/:id/finalize', authorize('admin', 'geschaeftsfuehrer', 'buchhaltung'), async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE documents SET status = 'finalized', locked = TRUE, finalized_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status = 'draft' AND type = 'invoice'
       RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Entwurf nicht gefunden.' });

    await query(
      `INSERT INTO audit_logs (company_id, user_id, entity_type, entity_id, action, ip_address)
       VALUES ($1,$2,'invoice',$3,'Rechnung festgeschrieben',$4)`,
      [req.user.company_id, req.user.id, req.params.id, req.ip]
    );

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// ─── POST /api/invoices/:id/payment ──────────────────────────────────────────
router.post('/:id/payment', authorize('admin', 'geschaeftsfuehrer', 'buchhaltung'), async (req, res, next) => {
  const { paymentDate, amount, paymentMethod, bankReference, note } = req.body;
  if (!paymentDate || !amount) return res.status(400).json({ error: 'Datum und Betrag erforderlich.' });

  try {
    // Prüfen ob Rechnung zur Firma gehört
    const inv = await query(
      'SELECT id, gross_total FROM documents WHERE id = $1 AND company_id = $2 AND type = \'invoice\'',
      [req.params.id, req.user.company_id]
    );
    if (inv.rows.length === 0) return res.status(404).json({ error: 'Rechnung nicht gefunden.' });

    const payment = await query(`
      INSERT INTO document_payments (document_id, payment_date, amount, payment_method, bank_reference, note, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, paymentDate, amount, paymentMethod || 'bank_transfer', bankReference || null, note || null, req.user.id]
    );

    await query(
      `INSERT INTO audit_logs (company_id, user_id, entity_type, entity_id, action, new_value, ip_address)
       VALUES ($1,$2,'invoice',$3,'Zahlung gebucht',$4,$5)`,
      [req.user.company_id, req.user.id, req.params.id, JSON.stringify({ amount, paymentDate }), req.ip]
    );

    // Aktuellen Status der Rechnung zurückgeben
    const updated = await query('SELECT id, status, paid_total, open_total FROM documents WHERE id = $1', [req.params.id]);
    res.json({ payment: payment.rows[0], invoice: updated.rows[0] });
  } catch (err) { next(err); }
});

// ─── POST /api/invoices/:id/cancel ───────────────────────────────────────────
router.post('/:id/cancel', authorize('admin', 'geschaeftsfuehrer'), async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE documents SET status = 'cancelled'
       WHERE id = $1 AND company_id = $2 AND locked = TRUE AND status NOT IN ('cancelled','paid')
       RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Stornierung nicht möglich.' });

    await query(
      `INSERT INTO audit_logs (company_id, user_id, entity_type, entity_id, action, ip_address)
       VALUES ($1,$2,'invoice',$3,'Rechnung storniert',$4)`,
      [req.user.company_id, req.user.id, req.params.id, req.ip]
    );

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
