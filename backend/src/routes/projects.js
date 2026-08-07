// ─── Projekte (Anlagen/Aufträge pro Kunde) ────────────────────────────────────
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../utils/db');

router.use(authenticate);

// ── Liste aller Projekte (mit Kunden-Info + Dokument-Counts) ─────────────────
router.get('/', async (req, res, next) => {
  try {
    const { customerId } = req.query;
    const rows = await query(
      `SELECT p.*,
              c.first_name, c.last_name, c.company_name,
              COUNT(DISTINCT d.id)  FILTER (WHERE d.type='offer')   AS offer_count,
              COUNT(DISTINCT d.id)  FILTER (WHERE d.type='invoice') AS invoice_count,
              COUNT(DISTINCT ph.id)                                  AS photo_count
         FROM projects p
         LEFT JOIN customers c  ON c.id = p.customer_id
         LEFT JOIN documents d  ON d.project_id = p.id AND d.company_id = p.company_id
         LEFT JOIN project_photos ph ON ph.project_id = p.id
        WHERE p.company_id = $1
          ${customerId ? 'AND p.customer_id = $2' : ''}
        GROUP BY p.id, c.first_name, c.last_name, c.company_name
        ORDER BY p.updated_at DESC`,
      customerId ? [req.user.company_id, customerId] : [req.user.company_id]
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

// ── Einzelnes Projekt mit Dokumenten + Fotos (ohne Bilddaten) ────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const proj = await query(
      `SELECT p.*, c.first_name, c.last_name, c.company_name, c.email, c.phone
         FROM projects p
         LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.id=$1 AND p.company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!proj.rows.length) return res.status(404).json({ error: 'Projekt nicht gefunden' });

    const docs = await query(
      `SELECT d.id, d.type, d.number, d.subject, d.status, d.document_date, d.gross_total,
              od.offer_status
         FROM documents d
         LEFT JOIN offer_details od ON od.document_id = d.id
        WHERE d.project_id=$1 AND d.company_id=$2
        ORDER BY d.document_date DESC`,
      [req.params.id, req.user.company_id]
    );

    const photos = await query(
      `SELECT id, filename, mimetype, created_at FROM project_photos WHERE project_id=$1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    res.json({ ...proj.rows[0], documents: docs.rows, photos: photos.rows });
  } catch (err) { next(err); }
});

// ── Projekt anlegen ──────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { customerId, name, description, status = 'aktiv' } = req.body;
    if (!name) return res.status(400).json({ error: 'Name fehlt' });

    const row = await query(
      `INSERT INTO projects (company_id, customer_id, name, description, status)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.company_id, customerId || null, name, description || null, status]
    );
    res.status(201).json(row.rows[0]);
  } catch (err) { next(err); }
});

// ── Projekt aktualisieren ────────────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const { name, description, status } = req.body;
    const row = await query(
      `UPDATE projects SET name=COALESCE($1,name), description=COALESCE($2,description),
              status=COALESCE($3,status), updated_at=NOW()
        WHERE id=$4 AND company_id=$5 RETURNING *`,
      [name || null, description || null, status || null, req.params.id, req.user.company_id]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(row.rows[0]);
  } catch (err) { next(err); }
});

// ── Dokument einem Projekt zuweisen ──────────────────────────────────────────
router.post('/:id/link-document', async (req, res, next) => {
  try {
    const { documentId } = req.body;
    await query(
      `UPDATE documents SET project_id=$1 WHERE id=$2 AND company_id=$3`,
      [req.params.id, documentId, req.user.company_id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Foto hochladen (base64 im Body) ─────────────────────────────────────────
router.post('/:id/photos', async (req, res, next) => {
  try {
    const { filename, mimetype = 'image/jpeg', dataBase64 } = req.body;
    if (!dataBase64) return res.status(400).json({ error: 'Kein Bild übergeben' });

    const check = await query('SELECT id FROM projects WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Projekt nicht gefunden' });

    const buf = Buffer.from(dataBase64, 'base64');
    const row = await query(
      `INSERT INTO project_photos (project_id, filename, mimetype, data)
       VALUES ($1,$2,$3,$4) RETURNING id, filename, mimetype, created_at`,
      [req.params.id, filename || `foto-${Date.now()}.jpg`, mimetype, buf]
    );
    res.status(201).json(row.rows[0]);
  } catch (err) { next(err); }
});

// ── Foto abrufen (als Bild) ──────────────────────────────────────────────────
router.get('/:id/photos/:photoId', async (req, res, next) => {
  try {
    const row = await query(
      `SELECT ph.filename, ph.mimetype, ph.data
         FROM project_photos ph
         JOIN projects p ON p.id = ph.project_id
        WHERE ph.id=$1 AND p.company_id=$2`,
      [req.params.photoId, req.user.company_id]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Foto nicht gefunden' });
    const { mimetype, data } = row.rows[0];
    res.set('Content-Type', mimetype);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(data);
  } catch (err) { next(err); }
});

// ── Foto löschen ─────────────────────────────────────────────────────────────
router.delete('/:id/photos/:photoId', async (req, res, next) => {
  try {
    await query(
      `DELETE FROM project_photos ph USING projects p
        WHERE ph.id=$1 AND ph.project_id=p.id AND p.company_id=$2`,
      [req.params.photoId, req.user.company_id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
