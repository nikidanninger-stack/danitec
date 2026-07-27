// ─── Ausgaben API (mit Privatanteil-Logik) ────────────────────────────────────
const router = require('express').Router();
const { query, withTransaction } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);

// Abzugsfähige Beträge berechnen
function calcDeductible(grossAmount, vatRate, privateSharePercent) {
  const gross     = parseFloat(grossAmount)        || 0;
  const vat       = parseFloat(vatRate)            || 0;
  const privShare = parseFloat(privateSharePercent) || 0;
  const busShare  = 100 - privShare;
  const netto     = vat > 0 ? Math.round(gross / (1 + vat / 100) * 100) / 100 : gross;
  const ustBetrag = Math.round((gross - netto) * 100) / 100;
  return {
    net_amount:            netto,
    vat_amount:            ustBetrag,
    deductible_net_amount: Math.round(netto  * busShare / 100 * 100) / 100,
    deductible_vat_amount: Math.round(ustBetrag * busShare / 100 * 100) / 100,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { status, from, to, supplierId, categoryId, page=1, limit=50 } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE e.company_id=$1';
    if (status)     { params.push(status);     where += ` AND e.status=$${params.length}`; }
    if (supplierId) { params.push(supplierId); where += ` AND e.supplier_id=$${params.length}`; }
    if (categoryId) { params.push(categoryId);where += ` AND e.category_id=$${params.length}`; }
    if (from)       { params.push(from);       where += ` AND e.document_date>=$${params.length}`; }
    if (to)         { params.push(to);         where += ` AND e.document_date<=$${params.length}`; }
    const r = await query(`
      SELECT e.*,s.company_name AS supplier_name,ec.name AS category_name
      FROM expenses e
      LEFT JOIN suppliers s ON e.supplier_id=s.id
      LEFT JOIN expense_categories ec ON e.category_id=ec.id
      ${where} ORDER BY e.document_date DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params,limit,(page-1)*limit]);
    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

router.post('/', authorize('admin','geschaeftsfuehrer','buchhaltung','mitarbeiter'), async (req, res, next) => {
  try {
    const r = await withTransaction(async (client) => {
      // Ausgabennummer generieren (einfach fortlaufend)
      const countRes = await client.query('SELECT COUNT(*)+1 AS seq FROM expenses WHERE company_id=$1', [req.user.company_id]);
      const nr = `A-${new Date().getFullYear()}-${String(parseInt(countRes.rows[0].seq)).padStart(4,'0')}`;
      const { supplierId,supplierName,documentDate,paymentDate,categoryId,description,grossAmount,vatRate,privateSharePercent=0,paymentMethod,supplierInvoiceNumber,note } = req.body;
      const calc = calcDeductible(grossAmount, vatRate, privateSharePercent);
      const status = paymentDate ? 'paid' : 'open';
      const ins = await client.query(`
        INSERT INTO expenses (company_id,supplier_id,expense_number,supplier_invoice_number,document_date,payment_date,category_id,description,net_amount,vat_rate,vat_amount,gross_amount,private_share_percent,deductible_net_amount,deductible_vat_amount,payment_method,status,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [req.user.company_id,supplierId||null,nr,supplierInvoiceNumber||null,documentDate,paymentDate||null,categoryId||null,description||null,calc.net_amount,vatRate||20,calc.vat_amount,parseFloat(grossAmount)||0,privateSharePercent,calc.deductible_net_amount,calc.deductible_vat_amount,paymentMethod||'bank_transfer',status,req.user.id]);
      return ins.rows[0];
    });
    res.status(201).json(r);
  } catch (err) { next(err); }
});

router.post('/:id/mark-paid', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const { paymentDate, paymentMethod } = req.body;
    const r = await query(`UPDATE expenses SET status='paid', payment_date=$1, payment_method=$2 WHERE id=$3 AND company_id=$4 RETURNING *`,
      [paymentDate || new Date().toISOString().split('T')[0], paymentMethod||'bank_transfer', req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
