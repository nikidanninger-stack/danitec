// documents.js – Belegverwaltung & Datei-Upload
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { query } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname,'../../uploads', String(req.user.company_id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf','.jpg','.jpeg','.png','.docx','.xlsx'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Nicht erlaubter Dateityp.'));
  },
});

router.get('/', async (req, res, next) => {
  try {
    const { entityType, entityId } = req.query;
    let where = 'WHERE company_id=$1';
    const params = [req.user.company_id];
    if (entityType) { params.push(entityType); where += ` AND entity_type=$${params.length}`; }
    if (entityId)   { params.push(entityId);   where += ` AND entity_id=$${params.length}`; }
    const r = await query(`SELECT * FROM files ${where} ORDER BY created_at DESC`, params);
    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei.' });
  try {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(req.file.path)).digest('hex');
    const r = await query(
      `INSERT INTO files (company_id,original_name,stored_name,mime_type,file_size,file_hash,storage_path,entity_type,entity_id,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.company_id, req.file.originalname, req.file.filename, req.file.mimetype,
       req.file.size, hash, req.file.path, req.body.entityType||null, req.body.entityId||null, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
