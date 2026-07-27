// ─── Lieferanten API ──────────────────────────────────────────────────────────
const router = require('express').Router();
const { query, withTransaction } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE company_id=$1 AND active=TRUE';
    if (search) { params.push(`%${search}%`); where += ` AND (company_name ILIKE $${params.length} OR contact_person ILIKE $${params.length})`; }
    const r = await query(`SELECT * FROM suppliers ${where} ORDER BY company_name`, params);
    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM suppliers WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

router.post('/', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const r = await withTransaction(async (client) => {
      const sq = await client.query('SELECT supplier_prefix, next_supplier_seq FROM company_settings WHERE company_id=$1 FOR UPDATE', [req.user.company_id]);
      const nr = `${sq.rows[0].supplier_prefix}-${String(sq.rows[0].next_supplier_seq).padStart(4,'0')}`;
      await client.query('UPDATE company_settings SET next_supplier_seq=next_supplier_seq+1 WHERE company_id=$1', [req.user.company_id]);
      const { companyName, contactPerson, contactPhone, street, houseNumber, zip, city, country, email, phone, uidNumber, atuUid, iban, bic, defaultCategory, paymentDays, notes } = req.body;
      const address = [street, houseNumber].filter(Boolean).join(' ') || null;
      const ins = await client.query(`
        INSERT INTO suppliers (company_id, supplier_number, company_name, contact_person, contact_phone, address, street, house_number, zip, city, country, email, phone, uid_number, atu_uid, iban, bic, default_category, payment_days, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
        [req.user.company_id, nr, companyName, contactPerson||null, contactPhone||null, address, street||null, houseNumber||null, zip||null, city||null, country||'AT', email||null, phone||null, uidNumber||null, atuUid||null, iban||null, bic||null, defaultCategory||null, paymentDays||30, notes||null]);
      return ins.rows[0];
    });
    res.status(201).json(r);
  } catch (err) { next(err); }
});

router.put('/:id', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const { companyName, contactPerson, contactPhone, street, houseNumber, zip, city, country, email, phone, uidNumber, atuUid, iban, bic, defaultCategory, paymentDays, notes } = req.body;
    const address = [street, houseNumber].filter(Boolean).join(' ') || null;
    const r = await query(`
      UPDATE suppliers SET
        company_name=$1, contact_person=$2, contact_phone=$3,
        address=$4, street=$5, house_number=$6, zip=$7, city=$8, country=$9, email=$10, phone=$11,
        uid_number=$12, atu_uid=$13, iban=$14, bic=$15,
        default_category=$16, payment_days=$17, notes=$18
      WHERE id=$19 AND company_id=$20 RETURNING *`,
      [companyName, contactPerson||null, contactPhone||null, address, street||null, houseNumber||null, zip||null, city||null, country||'AT', email||null, phone||null, uidNumber||null, atuUid||null, iban||null, bic||null, defaultCategory||null, paymentDays||30, notes||null, req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('admin','geschaeftsfuehrer'), async (req, res, next) => {
  try {
    await query('UPDATE suppliers SET active=FALSE WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
