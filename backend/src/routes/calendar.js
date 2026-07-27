// ─── Kalender ─────────────────────────────────────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ─── GET /api/calendar?from=&to= ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    let q = `
      SELECT e.*,
        c.company_name AS customer_name,
        u.name AS assigned_name
      FROM calendar_events e
      LEFT JOIN customers c ON c.id = e.customer_id
      LEFT JOIN users u ON u.id = e.assigned_to
      WHERE e.company_id = $1
    `;
    const params = [req.user.company_id];
    if (from) { params.push(from); q += ` AND e.start_at >= $${params.length}`; }
    if (to)   { params.push(to);   q += ` AND e.start_at <= $${params.length}`; }
    q += ' ORDER BY e.start_at ASC';
    const r = await query(q, params);
    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

// ─── POST /api/calendar ───────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { title, description, type='termin', color, start_at, end_at, all_day=false,
            location, customer_id, equipment_id, project_id, assigned_to } = req.body;
    if (!title || !start_at) return res.status(400).json({ error: 'Titel und Startzeit sind Pflicht.' });
    const r = await query(`
      INSERT INTO calendar_events (company_id,title,description,type,color,start_at,end_at,all_day,location,customer_id,equipment_id,project_id,assigned_to,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
    `, [req.user.company_id,title,description,type,color||typeColor(type),start_at,end_at||null,all_day,location||null,
        customer_id||null,equipment_id||null,project_id||null,assigned_to||null,req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { next(err); }
});

// ─── PUT /api/calendar/:id ────────────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const { title, description, type, color, start_at, end_at, all_day,
            location, customer_id, equipment_id, project_id, assigned_to } = req.body;
    const r = await query(`
      UPDATE calendar_events SET
        title=$1, description=$2, type=$3, color=$4, start_at=$5, end_at=$6,
        all_day=$7, location=$8, customer_id=$9, equipment_id=$10,
        project_id=$11, assigned_to=$12, updated_at=NOW()
      WHERE id=$13 AND company_id=$14 RETURNING *
    `, [title,description,type,color||typeColor(type),start_at,end_at||null,all_day||false,
        location||null,customer_id||null,equipment_id||null,project_id||null,assigned_to||null,
        req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Termin nicht gefunden.' });
    res.json({ data: r.rows[0] });
  } catch (err) { next(err); }
});

// ─── DELETE /api/calendar/:id ─────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM calendar_events WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

function typeColor(type) {
  return { baustelle:'#f59e0b', wartung:'#10b981', service:'#8b5cf6', termin:'#2D9CDB' }[type] || '#2D9CDB';
}

module.exports = router;
