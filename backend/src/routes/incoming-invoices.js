// ─── Eingangsrechnungen API ───────────────────────────────────────────────────
const router = require('express').Router();
const { query, withTransaction } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { nextOrderNumber } = require('../utils/orderNumber');

router.use(authenticate);

// ─── GET /api/incoming-invoices ───────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { status, supplierId, from, to, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.company_id];
    let where = "WHERE e.company_id=$1";
    if (status)     { params.push(status);     where += ` AND e.status=$${params.length}`; }
    if (supplierId) { params.push(supplierId); where += ` AND e.supplier_id=$${params.length}`; }
    if (from)       { params.push(from);       where += ` AND e.invoice_date>=$${params.length}`; }
    if (to)         { params.push(to);         where += ` AND e.invoice_date<=$${params.length}`; }
    if (search)     { params.push(`%${search}%`); where += ` AND (e.invoice_number ILIKE $${params.length} OR s.company_name ILIKE $${params.length})`; }

    const r = await query(`
      SELECT e.*, s.company_name AS supplier_name
      FROM expenses e
      LEFT JOIN suppliers s ON e.supplier_id = s.id
      ${where}
      ORDER BY e.invoice_date DESC, e.id DESC
      LIMIT $${params.length+1} OFFSET $${params.length+2}
    `, [...params, limit, offset]);
    const cnt = await query(`SELECT COUNT(*) FROM expenses e LEFT JOIN suppliers s ON e.supplier_id=s.id ${where}`, params);
    res.json({ data: r.rows, total: parseInt(cnt.rows[0].count) });
  } catch (err) { next(err); }
});

// ─── POST /api/incoming-invoices ──────────────────────────────────────────────
router.post('/', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const {
      supplierId, invoiceNumber, invoiceDate, dueDate,
      netAmount, vatRate = 20, vatAmount, grossAmount,
      category, description, paymentMethod, paidDate,
      status = 'open', addToStock = false, productId, quantity
    } = req.body;
    if (!invoiceDate) return res.status(400).json({ error: 'Rechnungsdatum erforderlich.' });

    const net  = parseFloat(netAmount)   || 0;
    const ust  = parseFloat(vatAmount)   || Math.round(net * vatRate / 100 * 100) / 100;
    const gross = parseFloat(grossAmount) || Math.round((net + ust) * 100) / 100;

    const r = await query(`
      INSERT INTO expenses (company_id, supplier_id, invoice_number, invoice_date, due_date,
        net_amount, vat_rate, vat_amount, gross_amount,
        category, description, payment_method, paid_date, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [req.user.company_id, supplierId||null, invoiceNumber||null, invoiceDate, dueDate||null,
       net, vatRate, ust, gross,
       category||null, description||null, paymentMethod||null, paidDate||null, status, req.user.id]);

    // Wenn Ware → Lager buchen
    if (addToStock && productId && quantity > 0) {
      await query(`
        UPDATE products SET stock_quantity = COALESCE(stock_quantity,0) + $1 WHERE id=$2 AND company_id=$3`,
        [quantity, productId, req.user.company_id]).catch(()=>{});
      await query(`
        INSERT INTO stock_movements (company_id, product_id, type, quantity, reference_type, reference_id, notes, created_by)
        VALUES ($1,$2,'in',$3,'expense',$4,'Eingangsrechnung',$5)`,
        [req.user.company_id, productId, quantity, r.rows[0].id, req.user.id]).catch(()=>{});
    }

    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── PUT /api/incoming-invoices/:id ──────────────────────────────────────────
router.put('/:id', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const { supplierId, invoiceNumber, invoiceDate, dueDate, netAmount, vatRate, vatAmount, grossAmount, category, description, paymentMethod, paidDate, status } = req.body;
    const net   = parseFloat(netAmount)||0;
    const ust   = parseFloat(vatAmount)||Math.round(net*(vatRate||20)/100*100)/100;
    const gross = parseFloat(grossAmount)||Math.round((net+ust)*100)/100;
    const r = await query(`
      UPDATE expenses SET supplier_id=$1, invoice_number=$2, invoice_date=$3, due_date=$4,
        net_amount=$5, vat_rate=$6, vat_amount=$7, gross_amount=$8,
        category=$9, description=$10, payment_method=$11, paid_date=$12, status=$13
      WHERE id=$14 AND company_id=$15 RETURNING *`,
      [supplierId||null, invoiceNumber||null, invoiceDate, dueDate||null, net, vatRate||20, ust, gross, category||null, description||null, paymentMethod||null, paidDate||null, status||'open', req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── DELETE /api/incoming-invoices/:id ───────────────────────────────────────
router.delete('/:id', authorize('admin','geschaeftsfuehrer'), async (req, res, next) => {
  try {
    await query('DELETE FROM expenses WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
