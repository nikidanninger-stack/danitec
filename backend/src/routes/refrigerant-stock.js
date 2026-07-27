// ─── Kältemittelflaschen-Lager ────────────────────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/refrigerant-stock  → alle Flaschen
router.get('/', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT b.*, s.company_name AS supplier_name
      FROM refrigerant_bottles b
      LEFT JOIN suppliers s ON b.supplier_id = s.id
      WHERE b.company_id=$1
      ORDER BY b.refrigerant_type, b.lagerort, b.created_at`,
      [req.user.company_id]
    );
    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

// POST /api/refrigerant-stock  → neue Flasche
router.post('/', async (req, res, next) => {
  try {
    const { refrigerantType, lagerort, currentWeightKg, supplierId, notes } = req.body;
    const r = await query(`
      INSERT INTO refrigerant_bottles (company_id, refrigerant_type, lagerort, current_weight_kg, supplier_id, notes)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, refrigerantType, lagerort||null, currentWeightKg||0, supplierId||null, notes||null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/refrigerant-stock/:id  → Flasche bearbeiten
router.put('/:id', async (req, res, next) => {
  try {
    const { refrigerantType, lagerort, currentWeightKg, supplierId, notes } = req.body;
    const r = await query(`
      UPDATE refrigerant_bottles SET
        refrigerant_type=$1, lagerort=$2, current_weight_kg=$3, supplier_id=$4, notes=$5, updated_at=NOW()
      WHERE id=$6 AND company_id=$7 RETURNING *`,
      [refrigerantType, lagerort||null, currentWeightKg||0, supplierId||null, notes||null, req.params.id, req.user.company_id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/refrigerant-stock/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM refrigerant_bottles WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
