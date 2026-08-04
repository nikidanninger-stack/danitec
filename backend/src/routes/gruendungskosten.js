// ─── Gründungskosten ──────────────────────────────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('admin', 'geschaeftsfuehrer'));

// GET /api/gruendungskosten
router.get('/', async (req, res, next) => {
  try {
    const r = await query(
      `SELECT * FROM gruendungskosten WHERE company_id=$1 ORDER BY datum DESC, id DESC`,
      [req.user.company_id]
    );

    // Zusammenfassung pro Person
    const summary = {};
    for (const e of r.rows) {
      if (!summary[e.bezahlt_von]) summary[e.bezahlt_von] = 0;
      summary[e.bezahlt_von] += parseFloat(e.betrag);
    }
    const gesamt = r.rows.reduce((s, e) => s + parseFloat(e.betrag), 0);

    res.json({ data: r.rows, summary, gesamt });
  } catch (err) { next(err); }
});

// POST /api/gruendungskosten
router.post('/', async (req, res, next) => {
  try {
    const { datum, beschreibung, betrag, bezahlt_von, kategorie, beleg_nr } = req.body;
    if (!beschreibung || !betrag || !bezahlt_von)
      return res.status(400).json({ error: 'Beschreibung, Betrag und Bezahlt von sind erforderlich.' });

    const r = await query(
      `INSERT INTO gruendungskosten (company_id, datum, beschreibung, betrag, bezahlt_von, kategorie, beleg_nr)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.company_id, datum || new Date().toISOString().slice(0, 10),
       beschreibung, betrag, bezahlt_von, kategorie || null, beleg_nr || null]
    );
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/gruendungskosten/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await query(
      'DELETE FROM gruendungskosten WHERE id=$1 AND company_id=$2',
      [req.params.id, req.user.company_id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
