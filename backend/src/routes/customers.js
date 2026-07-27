// ─── Kunden API ───────────────────────────────────────────────────────────────
const router = require('express').Router();
const { query, withTransaction } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { search, type, page = 1, limit = 100 } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE company_id = $1 AND active = TRUE';
    if (type)   { params.push(type);          where += ` AND type = $${params.length}`; }
    if (search) { params.push(`%${search}%`); where += ` AND (company_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR customer_number ILIKE $${params.length})`; }
    const result = await query(`SELECT * FROM customers ${where} ORDER BY company_name, last_name LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, (page-1)*limit]);
    res.json({ data: result.rows, total: result.rowCount });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM customers WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });
    // Telefonnummern mitladen
    const phones = await query('SELECT * FROM customer_phones WHERE customer_id=$1 AND company_id=$2 ORDER BY is_primary DESC, id ASC', [req.params.id, req.user.company_id]).catch(()=>({rows:[]}));
    res.json({ ...r.rows[0], phones: phones.rows });
  } catch (err) { next(err); }
});

// ─── GET /api/customers/:id/overview ─────────────────────────────────────────
router.get('/:id/overview', async (req, res, next) => {
  try {
    const cid = req.params.id;
    const co  = req.user.company_id;
    const sq = async (sql, params) => {
      try { return await query(sql, params); }
      catch(e) { console.warn('[customers/overview] query warn:', e.message); return { rows: [] }; }
    };
    const [customer, phones, equipment, contracts, serviceReports, invoices, projects] = await Promise.all([
      query('SELECT * FROM customers WHERE id=$1 AND company_id=$2', [cid, co]),
      sq('SELECT * FROM customer_phones WHERE customer_id=$1 AND company_id=$2 ORDER BY is_primary DESC, id ASC', [cid, co]),
      sq(`SELECT *, CASE WHEN next_maintenance < CURRENT_DATE THEN 'overdue' WHEN next_maintenance <= (CURRENT_DATE + INTERVAL '30 days') THEN 'due_soon' ELSE 'ok' END AS maintenance_status FROM customer_equipment WHERE customer_id=$1 AND company_id=$2 ORDER BY next_maintenance ASC NULLS LAST, name ASC`, [cid, co]),
      sq(`SELECT *, CASE WHEN next_service_date < CURRENT_DATE THEN 'overdue' WHEN next_service_date <= (CURRENT_DATE + INTERVAL '30 days') THEN 'due_soon' ELSE 'ok' END AS service_status FROM maintenance_contracts WHERE customer_id=$1 AND company_id=$2 ORDER BY next_service_date ASC NULLS LAST`, [cid, co]),
      sq(`SELECT sr.id, sr.report_number, sr.order_number, sr.report_date, sr.report_type, sr.status, sr.technician_name, sr.hours_worked, sr.travel_hours, e.name AS equipment_name FROM service_reports sr LEFT JOIN customer_equipment e ON sr.equipment_id = e.id WHERE sr.customer_id=$1 AND sr.company_id=$2 ORDER BY sr.report_date DESC LIMIT 10`, [cid, co]),
      sq(`SELECT id, number, order_number, document_date, due_date, gross_total, status FROM documents WHERE customer_id=$1 AND company_id=$2 AND type='invoice' ORDER BY document_date DESC LIMIT 10`, [cid, co]),
      sq(`SELECT id, project_number, order_number, name, status, start_date, end_date FROM projects WHERE customer_id=$1 AND company_id=$2 ORDER BY created_at DESC`, [cid, co]),
    ]);
    if (!customer.rows[0]) return res.status(404).json({ error: 'Kunde nicht gefunden.' });
    const eq = equipment.rows;
    const inv = invoices.rows;
    const summary = {
      equipment_count:    eq.length,
      overdue_count:      eq.filter(e => e.maintenance_status === 'overdue').length,
      due_soon_count:     eq.filter(e => e.maintenance_status === 'due_soon').length,
      open_invoices:      inv.filter(i => ['finalized','sent','partial_paid','overdue'].includes(i.status)).length,
      open_invoice_total: inv.filter(i => ['finalized','sent','partial_paid','overdue'].includes(i.status)).reduce((s,i) => s + parseFloat(i.gross_total||0), 0),
      active_contracts:   contracts.rows.filter(c => c.status === 'active').length,
    };
    res.json({ customer: { ...customer.rows[0], phones: phones.rows }, equipment: eq, contracts: contracts.rows, serviceReports: serviceReports.rows, invoices: inv, projects: projects.rows, summary });
  } catch (err) { next(err); }
});

// ─── GET /api/customers/:id/phones ───────────────────────────────────────────
router.get('/:id/phones', async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM customer_phones WHERE customer_id=$1 AND company_id=$2 ORDER BY is_primary DESC, sort_order ASC, id ASC', [req.params.id, req.user.company_id]);
    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

// ─── POST /api/customers/:id/phones ──────────────────────────────────────────
router.post('/:id/phones', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const { label = 'Standard', phone, is_primary = false } = req.body;
    if (!phone) return res.status(400).json({ error: 'Telefonnummer erforderlich.' });
    if (is_primary) await query('UPDATE customer_phones SET is_primary=FALSE WHERE customer_id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    const r = await query('INSERT INTO customer_phones (customer_id, company_id, label, phone, is_primary) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.params.id, req.user.company_id, label, phone, is_primary]);
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── PUT /api/customers/:id/phones/:phoneId ──────────────────────────────────
router.put('/:id/phones/:phoneId', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const { label, phone, is_primary } = req.body;
    if (is_primary) await query('UPDATE customer_phones SET is_primary=FALSE WHERE customer_id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    const r = await query('UPDATE customer_phones SET label=$1, phone=$2, is_primary=$3 WHERE id=$4 AND customer_id=$5 AND company_id=$6 RETURNING *', [label, phone, is_primary||false, req.params.phoneId, req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── DELETE /api/customers/:id/phones/:phoneId ───────────────────────────────
router.delete('/:id/phones/:phoneId', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    await query('DELETE FROM customer_phones WHERE id=$1 AND customer_id=$2 AND company_id=$3', [req.params.phoneId, req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── POST /api/customers ─────────────────────────────────────────────────────
router.post('/', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const r = await withTransaction(async (client) => {
      const sq = await client.query('SELECT customer_prefix, next_customer_seq FROM company_settings WHERE company_id=$1 FOR UPDATE', [req.user.company_id]);
      const { customer_prefix, next_customer_seq } = sq.rows[0];
      const year = new Date().getFullYear();
      const nr = `${customer_prefix}-${year}-${String(next_customer_seq).padStart(4,'0')}`;
      await client.query('UPDATE company_settings SET next_customer_seq=next_customer_seq+1 WHERE company_id=$1', [req.user.company_id]);
      const { type='business',companyName,firstName,lastName,street,houseNumber,zip,city,country='AT',email,phone,uidNumber,paymentDays=14,notes } = req.body;
      const address = [street, houseNumber].filter(Boolean).join(' ') || null;
      const ins = await client.query(`INSERT INTO customers (company_id,customer_number,type,company_name,first_name,last_name,address,street,house_number,zip,city,country,email,phone,uid_number,payment_days,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [req.user.company_id,nr,type,companyName||null,firstName||null,lastName||null,address,street||null,houseNumber||null,zip||null,city||null,country,email||null,phone||null,type==='private'?null:(uidNumber||null),paymentDays,notes||null]);
      return ins.rows[0];
    });
    res.status(201).json(r);
  } catch (err) { next(err); }
});

// ─── PUT /api/customers/:id ───────────────────────────────────────────────────
router.put('/:id', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const { type,companyName,firstName,lastName,street,houseNumber,zip,city,country,email,phone,uidNumber,paymentDays,notes } = req.body;
    const address = [street, houseNumber].filter(Boolean).join(' ') || null;
    const r = await query(`UPDATE customers SET company_name=$1,first_name=$2,last_name=$3,address=$4,street=$5,house_number=$6,zip=$7,city=$8,country=$9,email=$10,phone=$11,uid_number=$12,payment_days=$13,notes=$14 WHERE id=$15 AND company_id=$16 RETURNING *`,
      [companyName||null,firstName||null,lastName||null,address,street||null,houseNumber||null,zip||null,city||null,country||'AT',email||null,phone||null,type==='private'?null:(uidNumber||null),paymentDays||14,notes||null,req.params.id,req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── DELETE /api/customers/:id ────────────────────────────────────────────────
router.delete('/:id', authorize('admin'), async (req, res, next) => {
  try {
    await query('UPDATE customers SET active=FALSE WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ message: 'Kunde deaktiviert.' });
  } catch (err) { next(err); }
});

module.exports = router;
