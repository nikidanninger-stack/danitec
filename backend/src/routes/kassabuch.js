// ─── Kassabuch ────────────────────────────────────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/kassabuch?von=YYYY-MM-DD&bis=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    const { von, bis } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE company_id=$1';
    if (von) { params.push(von); where += ` AND datum>=$${params.length}`; }
    if (bis) { params.push(bis); where += ` AND datum<=$${params.length}`; }

    const r = await query(
      `SELECT * FROM kassabuch ${where} ORDER BY datum DESC, id DESC`,
      params
    );

    // Saldo berechnen
    const einnahmen = r.rows.filter(e => e.typ === 'einnahme').reduce((s, e) => s + parseFloat(e.betrag), 0);
    const ausgaben  = r.rows.filter(e => e.typ === 'ausgabe').reduce((s, e) => s + parseFloat(e.betrag), 0);

    res.json({ data: r.rows, einnahmen, ausgaben, saldo: einnahmen - ausgaben });
  } catch(err) { next(err); }
});

// POST /api/kassabuch
router.post('/', async (req, res, next) => {
  try {
    const { datum, typ, betrag, beschreibung, belegNr, kunde } = req.body;
    if (!betrag || !beschreibung) return res.status(400).json({ error: 'Betrag und Beschreibung sind erforderlich.' });
    const r = await query(
      `INSERT INTO kassabuch (company_id, datum, typ, betrag, beschreibung, beleg_nr, kunde, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.company_id, datum || new Date().toISOString().slice(0,10),
       typ || 'einnahme', betrag, beschreibung, belegNr || null, kunde || null, req.user.id]
    );
    res.json(r.rows[0]);
  } catch(err) { next(err); }
});

// DELETE /api/kassabuch/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM kassabuch WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch(err) { next(err); }
});

module.exports = router;
