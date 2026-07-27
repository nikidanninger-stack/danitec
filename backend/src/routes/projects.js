// ─── Projekte / Baustellenakten ───────────────────────────────────────────────
const router = require('express').Router();
const { query, withTransaction } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { nextOrderNumber } = require('../utils/orderNumber');

router.use(authenticate);

// ─── GET /api/projects ────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { status, customerId, search } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE p.company_id = $1';

    if (status)     { params.push(status);     where += ` AND p.status = $${params.length}`; }
    if (customerId) { params.push(customerId); where += ` AND p.customer_id = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (p.name ILIKE $${params.length} OR p.project_number ILIKE $${params.length})`;
    }

    const result = await query(`
      SELECT p.*,
        COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.status != 'done') AS open_tasks,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id) AS total_tasks
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      ${where}
      ORDER BY p.created_at DESC
    `, params);

    res.json({ data: result.rows });
  } catch (err) { next(err); }
});

// ─── GET /api/projects/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const proj = await query(`
      SELECT p.*,
        COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
        c.address AS customer_address, c.zip AS customer_zip, c.city AS customer_city,
        c.email AS customer_email, c.phone AS customer_phone,
        off.number AS offer_number, off.gross_total AS offer_gross,
        inv.number AS invoice_number, inv.gross_total AS invoice_gross, inv.status AS invoice_status
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN documents off ON p.offer_id = off.id
      LEFT JOIN documents inv ON p.invoice_id = inv.id
      WHERE p.id = $1 AND p.company_id = $2
    `, [req.params.id, req.user.company_id]);

    if (!proj.rows[0]) return res.status(404).json({ error: 'Projekt nicht gefunden.' });

    const tasks = await query(
      `SELECT t.*, u.name AS assigned_name
       FROM project_tasks t LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.project_id = $1 ORDER BY t.created_at ASC`,
      [req.params.id]
    );
    const notes = await query(
      `SELECT n.*, u.name AS author
       FROM project_notes n LEFT JOIN users u ON n.created_by = u.id
       WHERE n.project_id = $1 ORDER BY n.created_at DESC`,
      [req.params.id]
    );
    const equipment = await query(
      'SELECT * FROM customer_equipment WHERE customer_id = $1 AND company_id = $2 ORDER BY name',
      [proj.rows[0].customer_id, req.user.company_id]
    );

    res.json({ ...proj.rows[0], tasks: tasks.rows, notes: notes.rows, equipment: equipment.rows });
  } catch (err) { next(err); }
});

// ─── POST /api/projects ───────────────────────────────────────────────────────
router.post('/', authorize('admin', 'geschaeftsfuehrer', 'buchhaltung'), async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const { name, description, status = 'active', customerId, siteStreet, siteHouseNumber, siteZip, siteCity,
              contactPerson, contactPhone, startDate, endDate, offerId, invoiceId, budgetNet,
              priority = 'normal', orderNumber } = req.body;
      const siteAddress = [siteStreet, siteHouseNumber].filter(Boolean).join(' ') || null;
      const orderNum = orderNumber || await nextOrderNumber(req.user.company_id, 'A', client);

      const r = await client.query(`
        INSERT INTO projects (company_id, order_number, name, description, status, customer_id,
          site_address, site_street, site_house_number, site_zip, site_city, contact_person, contact_phone,
          start_date, end_date, offer_id, invoice_id, budget_net, priority, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING *`,
        [req.user.company_id, orderNum, name, description || null, status,
         customerId || null, siteAddress, siteStreet||null, siteHouseNumber||null, siteZip || null, siteCity || null,
         contactPerson || null, contactPhone || null,
         startDate || null, endDate || null, offerId || null, invoiceId || null,
         budgetNet || null, priority, req.user.id]
      );
      return r.rows[0];
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// ─── PUT /api/projects/:id ────────────────────────────────────────────────────
router.put('/:id', authorize('admin', 'geschaeftsfuehrer', 'buchhaltung'), async (req, res, next) => {
  try {
    const { name, description, status, customerId, siteStreet, siteHouseNumber, siteZip, siteCity,
            inbetriebnahmedatum,
            contactPerson, contactPhone, startDate, endDate, offerId, invoiceId, budgetNet, priority } = req.body;
    const siteAddress = [siteStreet, siteHouseNumber].filter(Boolean).join(' ') || null;
    const r = await query(`
      UPDATE projects SET
        name=$1, description=$2, status=$3, customer_id=$4,
        site_address=$5, site_street=$6, site_house_number=$7, site_zip=$8, site_city=$9,
        contact_person=$10, contact_phone=$11,
        start_date=$12, end_date=$13, offer_id=$14, invoice_id=$15,
        inbetriebnahmedatum=$16, budget_net=$17, priority=$18, updated_at=NOW()
      WHERE id=$19 AND company_id=$20 RETURNING *`,
      [name, description || null, status, customerId || null,
       siteAddress, siteStreet||null, siteHouseNumber||null, siteZip || null, siteCity || null,
       contactPerson || null, contactPhone || null,
       startDate || null, endDate || null, offerId || null, invoiceId || null,
       inbetriebnahmedatum || null, budgetNet || null, priority || 'normal', req.params.id, req.user.company_id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Projekt nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── POST /api/projects/:id/commission ───────────────────────────────────────
// Projekt abschließen und als Kundenanlage übernehmen
router.post('/:id/commission', authorize('admin', 'geschaeftsfuehrer', 'buchhaltung'), async (req, res, next) => {
  try {
    const proj = await query(`
      SELECT p.*, COALESCE(c.company_name, c.first_name||' '||c.last_name) AS customer_name
      FROM projects p LEFT JOIN customers c ON p.customer_id = c.id
      WHERE p.id=$1 AND p.company_id=$2
    `, [req.params.id, req.user.company_id]);

    if (!proj.rows[0]) return res.status(404).json({ error: 'Projekt nicht gefunden.' });
    const p = proj.rows[0];
    if (!p.customer_id) return res.status(400).json({ error: 'Kein Kunde dem Projekt zugewiesen.' });

    const result = await withTransaction(async (client) => {
      const orderNum = await nextOrderNumber(req.user.company_id, 'A', client);
      const today = new Date().toISOString().split('T')[0];

      // Anlage erstellen
      const eq = await client.query(`
        INSERT INTO customer_equipment (
          company_id, customer_id, order_number, name, equipment_type,
          location, install_date, status, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8) RETURNING *`,
        [req.user.company_id, p.customer_id, orderNum,
         req.body.name || p.name,
         req.body.equipmentType || null,
         p.site_address || p.site_city || null,
         req.body.installDate || p.inbetriebnahmedatum || today,
         `Übernommen aus Planungsprojekt ${p.order_number || p.name}`
        ]
      );

      // Projekt als "commissioned" markieren und ausblenden
      await client.query(`
        UPDATE projects SET status='commissioned', inbetriebnahmedatum=$1, updated_at=NOW()
        WHERE id=$2 AND company_id=$3
      `, [req.body.installDate || today, req.params.id, req.user.company_id]);

      return eq.rows[0];
    });

    res.status(201).json({ equipment: result, message: 'Anlage erfolgreich übernommen.' });
  } catch (err) { next(err); }
});

// ─── DELETE /api/projects/:id ─────────────────────────────────────────────────
router.delete('/:id', authorize('admin', 'geschaeftsfuehrer'), async (req, res, next) => {
  try {
    await query('DELETE FROM projects WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── POST /api/projects/:id/tasks ─────────────────────────────────────────────
router.post('/:id/tasks', async (req, res, next) => {
  try {
    const { title, description, priority = 'normal', dueDate, assignedTo } = req.body;
    const r = await query(`
      INSERT INTO project_tasks (project_id, title, description, priority, due_date, assigned_to)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, title, description || null, priority, dueDate || null, assignedTo || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── PUT /api/projects/:id/tasks/:taskId ──────────────────────────────────────
router.put('/:id/tasks/:taskId', async (req, res, next) => {
  try {
    const { title, description, status, priority, dueDate, assignedTo } = req.body;
    const completedAt = status === 'done' ? 'NOW()' : 'NULL';
    const r = await query(`
      UPDATE project_tasks SET
        title=$1, description=$2, status=$3, priority=$4, due_date=$5, assigned_to=$6,
        completed_at = CASE WHEN $3='done' THEN NOW() ELSE NULL END
      WHERE id=$7 AND project_id=$8 RETURNING *`,
      [title, description || null, status || 'open', priority || 'normal',
       dueDate || null, assignedTo || null, req.params.taskId, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── DELETE /api/projects/:id/tasks/:taskId ───────────────────────────────────
router.delete('/:id/tasks/:taskId', async (req, res, next) => {
  try {
    await query('DELETE FROM project_tasks WHERE id=$1 AND project_id=$2', [req.params.taskId, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── POST /api/projects/:id/notes ─────────────────────────────────────────────
router.post('/:id/notes', async (req, res, next) => {
  try {
    const { note } = req.body;
    if (!note?.trim()) return res.status(400).json({ error: 'Notiz darf nicht leer sein.' });
    const r = await query(`
      INSERT INTO project_notes (project_id, note, created_by) VALUES ($1,$2,$3)
      RETURNING *, (SELECT name FROM users WHERE id=$3) AS author`,
      [req.params.id, note, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── DELETE /api/projects/:id/notes/:noteId ───────────────────────────────────
router.delete('/:id/notes/:noteId', authorize('admin', 'geschaeftsfuehrer'), async (req, res, next) => {
  try {
    await query('DELETE FROM project_notes WHERE id=$1 AND project_id=$2', [req.params.noteId, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
