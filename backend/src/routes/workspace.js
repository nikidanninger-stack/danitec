// ─── Workspace (Kanban, Notizen, To-dos, Schwarzes Brett) ─────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ─── Boards ───────────────────────────────────────────────────────────────────
router.get('/boards', async (req, res, next) => {
  try {
    const r = await query(
      'SELECT * FROM workspace_boards WHERE company_id=$1 ORDER BY position, created_at',
      [req.user.company_id]
    );
    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

router.post('/boards', async (req, res, next) => {
  try {
    const { title, type='kanban', icon, color } = req.body;
    if (!title) return res.status(400).json({ error: 'Titel ist Pflicht.' });
    const iconMap = { kanban:'ti-layout-kanban', notes:'ti-notes', todos:'ti-checklist', bulletin:'ti-speakerphone' };
    const r = await query(
      'INSERT INTO workspace_boards (company_id,title,type,icon,color,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user.company_id, title, type, icon||iconMap[type]||'ti-layout-kanban', color||'#2D9CDB', req.user.id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { next(err); }
});

router.put('/boards/:id', async (req, res, next) => {
  try {
    const { title, icon, color } = req.body;
    const r = await query(
      'UPDATE workspace_boards SET title=$1, icon=$2, color=$3 WHERE id=$4 AND company_id=$5 RETURNING *',
      [title, icon, color, req.params.id, req.user.company_id]
    );
    res.json({ data: r.rows[0] });
  } catch (err) { next(err); }
});

router.delete('/boards/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM workspace_boards WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Cards ────────────────────────────────────────────────────────────────────
router.get('/boards/:boardId/cards', async (req, res, next) => {
  try {
    const r = await query(
      `SELECT c.*, u.name AS assigned_name FROM workspace_cards c
       LEFT JOIN users u ON u.id = c.assigned_to
       WHERE c.board_id=$1 AND c.company_id=$2 ORDER BY c.position, c.created_at`,
      [req.params.boardId, req.user.company_id]
    );
    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

router.post('/boards/:boardId/cards', async (req, res, next) => {
  try {
    const { title, content, column_key='open', priority='normal', due_date, assigned_to } = req.body;
    if (!title) return res.status(400).json({ error: 'Titel ist Pflicht.' });
    const r = await query(
      `INSERT INTO workspace_cards (company_id,board_id,column_key,title,content,priority,due_date,assigned_to,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.company_id, req.params.boardId, column_key, title, content||null,
       priority, due_date||null, assigned_to||null, req.user.id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { next(err); }
});

router.put('/cards/:id', async (req, res, next) => {
  try {
    const { title, content, column_key, priority, due_date, start_date, assigned_to, done, position, category, status } = req.body;
    const r = await query(
      `UPDATE workspace_cards SET title=$1,content=$2,column_key=$3,priority=$4,
       due_date=$5,assigned_to=$6,done=$7,position=$8,category=$9,start_date=$10,status=$11,updated_at=NOW()
       WHERE id=$12 AND company_id=$13 RETURNING *`,
      [title,content||null,column_key||'open',priority,due_date||null,assigned_to||null,
       done||false,position||0,category||null,start_date||null,status||column_key||'open',
       req.params.id,req.user.company_id]
    );
    res.json({ data: r.rows[0] });
  } catch (err) { next(err); }
});

router.delete('/cards/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM workspace_cards WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
