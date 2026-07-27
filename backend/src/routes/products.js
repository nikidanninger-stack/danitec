// ─── Produkte & Leistungen + Lagerverwaltung ──────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);

// ─── GET /api/products ────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { type, lowStock } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE p.company_id=$1 AND p.active=TRUE';
    if (type) { params.push(type); where += ` AND product_type=$${params.length}`; }
    if (lowStock === 'true') {
      where += ` AND product_type='material' AND stock_quantity <= min_stock`;
    }
    const r = await query(`
      SELECT p.*, s.company_name AS supplier_name,
        CASE
          WHEN p.product_type='material' AND p.stock_quantity <= 0 THEN 'empty'
          WHEN p.product_type='material' AND p.stock_quantity <= p.min_stock THEN 'low'
          WHEN p.product_type='material' THEN 'ok'
          ELSE NULL
        END AS stock_status
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      ${where}
      ORDER BY p.product_type, p.name
    `, params);
    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

// ─── GET /api/products/low-stock ─────────────────────────────────────────────
router.get('/low-stock', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT *, CASE WHEN stock_quantity <= 0 THEN 'empty' ELSE 'low' END AS stock_status
      FROM products
      WHERE company_id=$1 AND active=TRUE AND product_type='material'
        AND stock_quantity <= min_stock
      ORDER BY stock_quantity ASC, name ASC
    `, [req.user.company_id]);
    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT p.*, s.company_name AS supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id=$1 AND p.company_id=$2
    `, [req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });

    // Letzte 20 Lagerbewegungen
    const movements = await query(`
      SELECT sm.*, u.name AS user_name
      FROM stock_movements sm
      LEFT JOIN users u ON sm.created_by = u.id
      WHERE sm.product_id=$1 AND sm.company_id=$2
      ORDER BY sm.created_at DESC LIMIT 20
    `, [req.params.id, req.user.company_id]);

    res.json({ ...r.rows[0], movements: movements.rows });
  } catch (err) { next(err); }
});

// ─── POST /api/products ───────────────────────────────────────────────────────
router.post('/', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const {
      sku, name, description, unit, netPrice, grossPrice, vatRate,
      category, notes, productType = 'service',
      stockQuantity = 0, minStock = 0, purchasePrice, supplierId,
    } = req.body;
    if (!name) return res.status(400).json({ error: 'Name erforderlich.' });

    const r = await query(`
      INSERT INTO products (
        company_id, sku, name, description, unit, net_price, gross_price, vat_rate,
        category, notes, product_type, stock_quantity, min_stock, purchase_price, supplier_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [
      req.user.company_id, sku||null, name, description||null,
      unit || (productType==='material'?'Stk':'Std'),
      netPrice||0, grossPrice||0, vatRate||20, category||null, notes||null,
      productType, stockQuantity, minStock, purchasePrice||null, supplierId||null,
    ]);
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── PUT /api/products/:id ────────────────────────────────────────────────────
router.put('/:id', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const {
      name, description, unit, netPrice, grossPrice, vatRate,
      category, notes, active, productType,
      stockQuantity, minStock, purchasePrice, supplierId,
    } = req.body;
    const r = await query(`
      UPDATE products SET
        name=$1, description=$2, unit=$3, net_price=$4, gross_price=$5, vat_rate=$6,
        category=$7, notes=$8, active=$9, product_type=$10,
        stock_quantity=$11, min_stock=$12, purchase_price=$13, supplier_id=$14,
        updated_at=NOW()
      WHERE id=$15 AND company_id=$16 RETURNING *
    `, [
      name, description||null, unit||'Stk', netPrice||0, grossPrice||0, vatRate||20,
      category||null, notes||null, active!==false, productType||'service',
      stockQuantity||0, minStock||0, purchasePrice||null, supplierId||null,
      req.params.id, req.user.company_id,
    ]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── POST /api/products/:id/stock-adjust ─────────────────────────────────────
// delta: positive = Wareneingang, negative = Verbrauch/Abgang, type: adjust/in/out
router.post('/:id/stock-adjust', authorize('admin','geschaeftsfuehrer','buchhaltung','techniker'), async (req, res, next) => {
  try {
    const { delta, note, movementType = 'adjust', unitPrice, referenceType, referenceId } = req.body;
    if (delta === undefined || delta === null) return res.status(400).json({ error: 'delta erforderlich.' });

    const d = parseFloat(delta);
    const product = await query('SELECT * FROM products WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    if (!product.rows[0]) return res.status(404).json({ error: 'Produkt nicht gefunden.' });

    const newQty = Math.max(0, parseFloat(product.rows[0].stock_quantity) + d);

    await query('UPDATE products SET stock_quantity=$1, updated_at=NOW() WHERE id=$2', [newQty, req.params.id]);
    await query(`
      INSERT INTO stock_movements (company_id, product_id, movement_type, quantity, unit_price, reference_type, reference_id, note, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [req.user.company_id, req.params.id, movementType, Math.abs(d), unitPrice||null, referenceType||null, referenceId||null, note||null, req.user.id]);

    res.json({ stock_quantity: newQty });
  } catch (err) { next(err); }
});

// ─── POST /api/products/bulk-stock-in ────────────────────────────────────────
// Masseneinbuchen aus Großhändler-Scan: [{productId, quantity, unitPrice, note}]
router.post('/bulk-stock-in', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const { items, supplierName, invoiceDate } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Keine Positionen.' });

    const results = [];
    for (const item of items) {
      if (!item.productId || !item.quantity) continue;
      const qty = parseFloat(item.quantity);
      const prod = await query('SELECT * FROM products WHERE id=$1 AND company_id=$2', [item.productId, req.user.company_id]);
      if (!prod.rows[0]) continue;

      const newQty = parseFloat(prod.rows[0].stock_quantity) + qty;
      await query('UPDATE products SET stock_quantity=$1, updated_at=NOW() WHERE id=$2', [newQty, item.productId]);
      await query(`
        INSERT INTO stock_movements (company_id, product_id, movement_type, quantity, unit_price, reference_type, note, created_by)
        VALUES ($1,$2,'in',$3,$4,'scan',$5,$6)
      `, [
        req.user.company_id, item.productId, qty,
        item.unitPrice||null,
        `Wareneingang${supplierName ? ` von ${supplierName}` : ''}${invoiceDate ? ` am ${invoiceDate}` : ''}`,
        req.user.id,
      ]);
      results.push({ productId: item.productId, newQuantity: newQty });
    }
    res.json({ updated: results.length, results });
  } catch (err) { next(err); }
});

module.exports = router;
