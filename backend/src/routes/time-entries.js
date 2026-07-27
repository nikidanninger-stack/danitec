// ─── Arbeitszeit-Erfassung ────────────────────────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// Hilfsfunktion: Stunden aus Start/Ende berechnen
function calcHours(start, end, breakMin) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin   = eh * 60 + em;
  const net = endMin - startMin - (breakMin || 0);
  return Math.max(0, Math.round(net * 100 / 60) / 100);
}

// ─── GET /api/time-entries ────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { userId, month, year, status } = req.query;

    // Techniker sehen nur eigene Einträge; Admin/Chef sehen alle
    const isAdmin = ['admin','geschaeftsfuehrer'].includes(req.user.role);
    const targetUserId = isAdmin && userId ? parseInt(userId) : req.user.id;

    const params = [req.user.company_id, targetUserId];
    let where = 'WHERE t.company_id = $1 AND t.user_id = $2';

    if (month && year) {
      params.push(parseInt(year), parseInt(month));
      where += ` AND EXTRACT(YEAR FROM t.entry_date) = $${params.length-1} AND EXTRACT(MONTH FROM t.entry_date) = $${params.length}`;
    } else if (year) {
      params.push(parseInt(year));
      where += ` AND EXTRACT(YEAR FROM t.entry_date) = $${params.length}`;
    }
    if (status) { params.push(status); where += ` AND t.status = $${params.length}`; }

    const result = await query(`
      SELECT t.*,
        u.name AS user_name,
        COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
        p.name AS project_name,
        sr.report_number AS service_report_number,
        ab.name AS approved_by_name
      FROM time_entries t
      LEFT JOIN users u  ON t.user_id = u.id
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p  ON t.project_id = p.id
      LEFT JOIN service_reports sr ON t.service_report_id = sr.id
      LEFT JOIN users ab ON t.approved_by = ab.id
      ${where}
      ORDER BY t.entry_date DESC, t.start_time DESC
    `, params);

    res.json({ data: result.rows });
  } catch (err) { next(err); }
});

// ─── GET /api/time-entries/summary ───────────────────────────────────────────
// Monatsübersicht: Stunden pro Tag + Wochensummen + Monatssumme
router.get('/summary', async (req, res, next) => {
  try {
    const { month = new Date().getMonth() + 1, year = new Date().getFullYear(), userId } = req.query;
    const isAdmin = ['admin','geschaeftsfuehrer'].includes(req.user.role);
    const targetUserId = isAdmin && userId ? parseInt(userId) : req.user.id;

    // Alle Einträge des Monats
    const entries = await query(`
      SELECT t.*, u.name AS user_name,
        COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
        p.name AS project_name
      FROM time_entries t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p  ON t.project_id = p.id
      WHERE t.company_id = $1 AND t.user_id = $2
        AND EXTRACT(YEAR FROM t.entry_date) = $3
        AND EXTRACT(MONTH FROM t.entry_date) = $4
      ORDER BY t.entry_date ASC, t.start_time ASC
    `, [req.user.company_id, targetUserId, year, month]);

    // Aggregation pro Tag
    const byDay = {};
    for (const e of entries.rows) {
      const d = e.entry_date.toISOString().split('T')[0];
      if (!byDay[d]) byDay[d] = { date: d, entries: [], total_hours: 0, work_hours: 0, travel_hours: 0 };
      byDay[d].entries.push(e);
      const h = parseFloat(e.total_hours || 0);
      byDay[d].total_hours  = Math.round((byDay[d].total_hours + h) * 100) / 100;
      if (e.work_type === 'work')   byDay[d].work_hours   = Math.round((byDay[d].work_hours + h) * 100) / 100;
      if (e.work_type === 'travel') byDay[d].travel_hours = Math.round((byDay[d].travel_hours + h) * 100) / 100;
    }

    // Gesamtsummen
    const totals = await query(`
      SELECT
        COALESCE(SUM(total_hours), 0) AS total_hours,
        COALESCE(SUM(total_hours) FILTER (WHERE work_type='work'), 0) AS work_hours,
        COALESCE(SUM(total_hours) FILTER (WHERE work_type='travel'), 0) AS travel_hours,
        COALESCE(SUM(total_hours) FILTER (WHERE work_type='sick'), 0) AS sick_hours,
        COALESCE(SUM(total_hours) FILTER (WHERE work_type='vacation'), 0) AS vacation_hours,
        COUNT(*) AS entry_count,
        COUNT(DISTINCT entry_date) AS working_days
      FROM time_entries
      WHERE company_id = $1 AND user_id = $2
        AND EXTRACT(YEAR FROM entry_date) = $3
        AND EXTRACT(MONTH FROM entry_date) = $4
    `, [req.user.company_id, targetUserId, year, month]);

    // Liste aller Mitarbeiter (für Admin-Dropdown)
    let users = [];
    if (isAdmin) {
      const u = await query(`SELECT id, name, role FROM users WHERE company_id = $1 ORDER BY name`, [req.user.company_id]);
      users = u.rows;
    }

    res.json({
      days: Object.values(byDay),
      totals: totals.rows[0],
      users,
      month: parseInt(month),
      year:  parseInt(year),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/time-entries/:id ────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT t.*, u.name AS user_name,
        COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
        p.name AS project_name, sr.report_number AS service_report_number
      FROM time_entries t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p  ON t.project_id = p.id
      LEFT JOIN service_reports sr ON t.service_report_id = sr.id
      WHERE t.id = $1 AND t.company_id = $2
    `, [req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── POST /api/time-entries ───────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const {
      entryDate, startTime, endTime, breakMinutes = 0,
      workType = 'work', customerId, projectId, serviceReportId,
      description, totalHours: manualHours,
    } = req.body;

    const computed = calcHours(startTime, endTime, parseInt(breakMinutes));
    const hours = computed !== null ? computed : (manualHours ? parseFloat(manualHours) : null);

    const r = await query(`
      INSERT INTO time_entries (
        company_id, user_id, entry_date, start_time, end_time, break_minutes,
        total_hours, work_type, customer_id, project_id, service_report_id, description
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      req.user.company_id, req.user.id, entryDate || new Date().toISOString().split('T')[0],
      startTime || null, endTime || null, parseInt(breakMinutes),
      hours, workType, customerId || null, projectId || null,
      serviceReportId || null, description || null,
    ]);

    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── PUT /api/time-entries/:id ────────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    // Nur eigene Einträge oder Admin
    const existing = await query('SELECT * FROM time_entries WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });

    const isAdmin = ['admin','geschaeftsfuehrer'].includes(req.user.role);
    if (!isAdmin && existing.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Kein Zugriff.' });
    if (existing.rows[0].status === 'approved' && !isAdmin) return res.status(400).json({ error: 'Genehmigte Einträge können nicht bearbeitet werden.' });

    const {
      entryDate, startTime, endTime, breakMinutes = 0,
      workType, customerId, projectId, serviceReportId,
      description, totalHours: manualHours,
    } = req.body;

    const computed = calcHours(startTime, endTime, parseInt(breakMinutes));
    const hours = computed !== null ? computed : (manualHours ? parseFloat(manualHours) : null);

    const r = await query(`
      UPDATE time_entries SET
        entry_date=$1, start_time=$2, end_time=$3, break_minutes=$4,
        total_hours=$5, work_type=$6, customer_id=$7, project_id=$8,
        service_report_id=$9, description=$10, updated_at=NOW()
      WHERE id=$11 AND company_id=$12 RETURNING *
    `, [
      entryDate, startTime || null, endTime || null, parseInt(breakMinutes),
      hours, workType || 'work', customerId || null, projectId || null,
      serviceReportId || null, description || null,
      req.params.id, req.user.company_id,
    ]);

    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── POST /api/time-entries/:id/submit ───────────────────────────────────────
router.post('/:id/submit', async (req, res, next) => {
  try {
    const r = await query(`
      UPDATE time_entries SET status='submitted', updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND user_id=$3 AND status='draft' RETURNING *
    `, [req.params.id, req.user.company_id, req.user.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Eintrag nicht gefunden oder bereits eingereicht.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── POST /api/time-entries/:id/approve ──────────────────────────────────────
router.post('/:id/approve', authorize('admin', 'geschaeftsfuehrer'), async (req, res, next) => {
  try {
    const r = await query(`
      UPDATE time_entries SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW()
      WHERE id=$2 AND company_id=$3 RETURNING *
    `, [req.user.id, req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── POST /api/time-entries/submit-month ─────────────────────────────────────
// Alle Draft-Einträge eines Monats auf "submitted" setzen
router.post('/submit-month', async (req, res, next) => {
  try {
    const { month, year } = req.body;
    const r = await query(`
      UPDATE time_entries SET status='submitted', updated_at=NOW()
      WHERE company_id=$1 AND user_id=$2 AND status='draft'
        AND EXTRACT(YEAR FROM entry_date)=$3 AND EXTRACT(MONTH FROM entry_date)=$4
      RETURNING id
    `, [req.user.company_id, req.user.id, year, month]);
    res.json({ updated: r.rows.length });
  } catch (err) { next(err); }
});

// ─── DELETE /api/time-entries/:id ────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const isAdmin = ['admin','geschaeftsfuehrer'].includes(req.user.role);
    const r = await query(`
      SELECT * FROM time_entries WHERE id=$1 AND company_id=$2
    `, [req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
    if (!isAdmin && r.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Kein Zugriff.' });
    if (r.rows[0].status === 'approved' && !isAdmin) return res.status(400).json({ error: 'Genehmigte Einträge können nicht gelöscht werden.' });

    await query('DELETE FROM time_entries WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
