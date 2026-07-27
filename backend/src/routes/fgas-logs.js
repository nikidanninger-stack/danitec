// ─── F-Gase-Dokumentation ────────────────────────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// ─── GET /api/fgas-logs ───────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { equipmentId, customerId, year } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE f.company_id = $1';

    if (equipmentId) { params.push(equipmentId); where += ` AND f.equipment_id = $${params.length}`; }
    if (customerId)  { params.push(customerId);  where += ` AND f.customer_id = $${params.length}`; }
    if (year)        { params.push(year);        where += ` AND EXTRACT(YEAR FROM f.log_date) = $${params.length}`; }

    const result = await query(`
      SELECT f.*,
        e.name AS equipment_name, e.equipment_type, e.serial_number,
        COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
        u.name AS technician_user_name
      FROM fgas_logs f
      LEFT JOIN customer_equipment e ON f.equipment_id = e.id
      LEFT JOIN customers c ON f.customer_id = c.id
      LEFT JOIN users u ON f.technician_id = u.id
      ${where}
      ORDER BY f.log_date DESC, f.created_at DESC
    `, params);

    res.json({ data: result.rows });
  } catch (err) { next(err); }
});

// ─── GET /api/fgas-logs/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT f.*,
        e.name AS equipment_name, e.equipment_type, e.manufacturer, e.model,
        e.serial_number, e.refrigerant AS equipment_refrigerant, e.refrigerant_amount_kg,
        COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
        c.address AS customer_address, c.city AS customer_city,
        u.name AS technician_user_name
      FROM fgas_logs f
      LEFT JOIN customer_equipment e ON f.equipment_id = e.id
      LEFT JOIN customers c ON f.customer_id = c.id
      LEFT JOIN users u ON f.technician_id = u.id
      WHERE f.id = $1 AND f.company_id = $2
    `, [req.params.id, req.user.company_id]);

    if (!r.rows[0]) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── POST /api/fgas-logs ──────────────────────────────────────────────────────
router.post('/', authorize('admin', 'geschaeftsfuehrer', 'buchhaltung', 'techniker'), async (req, res, next) => {
  try {
    const {
      equipmentId, customerId, logDate, technicianId, technicianName,
      workType, refrigerantType, amountAddedKg, amountRemovedKg,
      leakCheckDone = false, leakFound = false, leakRepaired = false,
      certificateNumber, notes
    } = req.body;

    if (!workType) return res.status(400).json({ error: 'Arbeitsart ist erforderlich.' });

    // Wenn keine customerId angegeben, aus Equipment holen
    let cId = customerId;
    if (!cId && equipmentId) {
      const eq = await query('SELECT customer_id FROM customer_equipment WHERE id=$1 AND company_id=$2', [equipmentId, req.user.company_id]);
      if (eq.rows[0]) cId = eq.rows[0].customer_id;
    }

    const r = await query(`
      INSERT INTO fgas_logs (
        company_id, equipment_id, customer_id, log_date, technician_id, technician_name,
        work_type, refrigerant_type, amount_added_kg, amount_removed_kg,
        leak_check_done, leak_found, leak_repaired, certificate_number, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      req.user.company_id, equipmentId || null, cId || null,
      logDate || new Date().toISOString().split('T')[0],
      technicianId || req.user.id, technicianName || req.user.name,
      workType, refrigerantType || null, amountAddedKg || null, amountRemovedKg || null,
      leakCheckDone, leakFound, leakRepaired,
      certificateNumber || null, notes || null, req.user.id
    ]);

    // Kältemittel-Menge der Anlage aktualisieren wenn befüllt
    if (equipmentId && (amountAddedKg || amountRemovedKg)) {
      const added  = parseFloat(amountAddedKg  || 0);
      const removed = parseFloat(amountRemovedKg || 0);
      if (added !== 0 || removed !== 0) {
        await query(`
          UPDATE customer_equipment
          SET refrigerant_amount_kg = COALESCE(refrigerant_amount_kg, 0) + $1 - $2,
              updated_at = NOW()
          WHERE id = $3 AND company_id = $4
        `, [added, removed, equipmentId, req.user.company_id]);
      }
    }

    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── PUT /api/fgas-logs/:id ───────────────────────────────────────────────────
router.put('/:id', authorize('admin', 'geschaeftsfuehrer', 'buchhaltung'), async (req, res, next) => {
  try {
    const {
      logDate, technicianId, technicianName, workType, refrigerantType,
      amountAddedKg, amountRemovedKg, leakCheckDone, leakFound, leakRepaired,
      certificateNumber, notes
    } = req.body;

    const r = await query(`
      UPDATE fgas_logs SET
        log_date=$1, technician_id=$2, technician_name=$3, work_type=$4,
        refrigerant_type=$5, amount_added_kg=$6, amount_removed_kg=$7,
        leak_check_done=$8, leak_found=$9, leak_repaired=$10,
        certificate_number=$11, notes=$12, updated_at=NOW()
      WHERE id=$13 AND company_id=$14 RETURNING *
    `, [
      logDate, technicianId || null, technicianName || null, workType,
      refrigerantType || null, amountAddedKg || null, amountRemovedKg || null,
      leakCheckDone || false, leakFound || false, leakRepaired || false,
      certificateNumber || null, notes || null,
      req.params.id, req.user.company_id
    ]);

    if (!r.rows[0]) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── DELETE /api/fgas-logs/:id ────────────────────────────────────────────────
router.delete('/:id', authorize('admin', 'geschaeftsfuehrer'), async (req, res, next) => {
  try {
    await query('DELETE FROM fgas_logs WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── GET /api/fgas-logs/stats/summary ────────────────────────────────────────
router.get('/stats/summary', async (req, res, next) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const r = await query(`
      SELECT
        COUNT(*) AS total_entries,
        SUM(amount_added_kg) AS total_added_kg,
        SUM(amount_removed_kg) AS total_removed_kg,
        COUNT(*) FILTER (WHERE leak_found) AS leak_incidents,
        COUNT(DISTINCT equipment_id) AS equipment_count,
        COUNT(DISTINCT refrigerant_type) AS refrigerant_types
      FROM fgas_logs
      WHERE company_id = $1 AND EXTRACT(YEAR FROM log_date) = $2
    `, [req.user.company_id, year]);

    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
