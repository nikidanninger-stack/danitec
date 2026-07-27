// ─── Google Drive Integration ─────────────────────────────────────────────────
const router = require('express').Router();
const { google } = require('googleapis');
const multer = require('multer');
const { Readable } = require('stream');
const { query, withTransaction } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Callback braucht kein JWT (kommt direkt von Google)
// Alle anderen Routen erfordern Authentifizierung
router.use((req, res, next) => {
  if (req.path === '/callback') return next();
  return authenticate(req, res, next);
});

// OAuth2 Client erstellen
function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/drive/callback'
  );
}

// Gespeicherte Tokens laden und Client auffrischen
async function getDriveClient(companyId) {
  const res = await query('SELECT * FROM google_drive_tokens WHERE company_id=$1', [companyId]);
  if (!res.rows[0]) throw new Error('Google Drive nicht verbunden.');
  const tokens = res.rows[0];
  const auth = getOAuth2Client();
  auth.setCredentials({
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date:   tokens.expiry_date,
  });
  // Token automatisch auffrischen
  auth.on('tokens', async (t) => {
    await query(
      'UPDATE google_drive_tokens SET access_token=$1, expiry_date=$2, updated_at=NOW() WHERE company_id=$3',
      [t.access_token, t.expiry_date, companyId]
    );
  });
  return { auth, driveFolder: tokens.drive_folder_id };
}

// ─── GET /api/drive/status ────────────────────────────────────────────────────
router.get('/status', async (req, res, next) => {
  try {
    const r = await query('SELECT connected_at, drive_folder_id FROM google_drive_tokens WHERE company_id=$1', [req.user.company_id]);
    res.json({ connected: r.rows.length > 0, connectedAt: r.rows[0]?.connected_at, folderId: r.rows[0]?.drive_folder_id });
  } catch (err) { next(err); }
});

// ─── GET /api/drive/connect ───────────────────────────────────────────────────
router.get('/connect', authorize('admin', 'geschaeftsfuehrer'), (req, res) => {
  const auth = getOAuth2Client();
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive'],
    state: String(req.user.company_id),
  });
  res.json({ url });
});

// ─── GET /api/drive/callback ──────────────────────────────────────────────────
router.get('/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    const companyId = parseInt(state);
    const auth = getOAuth2Client();
    const { tokens } = await auth.getToken(code);
    auth.setCredentials(tokens);

    // Haupt-Ordner nur einmal erstellen (prüfen ob schon vorhanden)
    const drive = google.drive({ version: 'v3', auth });
    let folderId;
    const existing = await drive.files.list({
      q: `name='Danitec Anlagenfotos' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      pageSize: 1,
    });
    if (existing.data.files.length > 0) {
      folderId = existing.data.files[0].id;
    } else {
      const folder = await drive.files.create({
        requestBody: { name: 'Danitec Anlagenfotos', mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id',
      });
      folderId = folder.data.id;
    }

    await query(`
      INSERT INTO google_drive_tokens (company_id, access_token, refresh_token, expiry_date, drive_folder_id)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (company_id) DO UPDATE SET
        access_token=$2, refresh_token=$3, expiry_date=$4, drive_folder_id=$5, updated_at=NOW()
    `, [companyId, tokens.access_token, tokens.refresh_token, tokens.expiry_date, folderId]);

    // Zurück zur App (Einstellungen)
    res.send(`<html><body><script>window.close();opener.postMessage('drive-connected','*');</script><p>✅ Google Drive verbunden! Dieses Fenster schließt sich automatisch.</p></body></html>`);
  } catch (err) { next(err); }
});

// ─── DELETE /api/drive/disconnect ────────────────────────────────────────────
router.delete('/disconnect', authorize('admin', 'geschaeftsfuehrer'), async (req, res, next) => {
  try {
    await query('DELETE FROM google_drive_tokens WHERE company_id=$1', [req.user.company_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── POST /api/drive/equipment/:id/photos ────────────────────────────────────
router.post('/equipment/:id/photos', upload.array('photos', 10), async (req, res, next) => {
  try {
    const { auth, driveFolder } = await getDriveClient(req.user.company_id);
    const drive = google.drive({ version: 'v3', auth });

    // Unterordner für die Anlage
    const equip = await query('SELECT name, order_number FROM customer_equipment WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    if (!equip.rows[0]) return res.status(404).json({ error: 'Anlage nicht gefunden.' });
    const folderName = `${equip.rows[0].order_number || equip.rows[0].name}`;

    // Prüfen ob Unterordner schon existiert
    let subfolderId;
    const existing = await drive.files.list({
      q: `name='${folderName}' and '${driveFolder}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });
    if (existing.data.files.length > 0) {
      subfolderId = existing.data.files[0].id;
    } else {
      const sub = await drive.files.create({
        requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [driveFolder] },
        fields: 'id',
      });
      subfolderId = sub.data.id;
    }

    const uploaded = [];
    for (const file of req.files) {
      const stream = new Readable();
      stream.push(file.buffer);
      stream.push(null);

      const driveFile = await drive.files.create({
        requestBody: { name: file.originalname, parents: [subfolderId] },
        media: { mimeType: file.mimetype, body: stream },
        fields: 'id, webViewLink',
      });

      // Öffentlich lesbar machen für Vorschau
      await drive.permissions.create({
        fileId: driveFile.data.id,
        requestBody: { role: 'reader', type: 'anyone' },
      });

      const thumbUrl = `https://drive.google.com/thumbnail?id=${driveFile.data.id}&sz=w800`;

      const r = await query(
        'INSERT INTO equipment_photos (company_id, equipment_id, filename, original_name, drive_file_id, drive_url, caption, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [req.user.company_id, req.params.id, file.originalname, file.originalname, driveFile.data.id, thumbUrl, req.body.caption || null, req.user.id]
      );
      uploaded.push(r.rows[0]);
    }

    res.status(201).json({ photos: uploaded });
  } catch (err) { next(err); }
});

// ─── GET /api/drive/equipment/:id/photos ─────────────────────────────────────
router.get('/equipment/:id/photos', async (req, res, next) => {
  try {
    const r = await query(
      'SELECT * FROM equipment_photos WHERE equipment_id=$1 AND company_id=$2 ORDER BY created_at DESC',
      [req.params.id, req.user.company_id]
    );
    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

// ─── DELETE /api/drive/photos/:photoId ───────────────────────────────────────
router.delete('/photos/:photoId', async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM equipment_photos WHERE id=$1 AND company_id=$2', [req.params.photoId, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Foto nicht gefunden.' });
    const photo = r.rows[0];

    // Aus Drive löschen
    try {
      const { auth } = await getDriveClient(req.user.company_id);
      const drive = google.drive({ version: 'v3', auth });
      await drive.files.delete({ fileId: photo.drive_file_id });
    } catch (_) {}

    await query('DELETE FROM equipment_photos WHERE id=$1', [req.params.photoId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── GET /api/drive/files ─────────────────────────────────────────────────────
// Alle Dateien auflisten – startet vom Drive-Root, optional ?folderId=xyz
router.get('/files', async (req, res, next) => {
  try {
    const { auth } = await getDriveClient(req.user.company_id);
    const drive = google.drive({ version: 'v3', auth });
    const folderId = req.query.folderId || 'root';

    const r = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,size,modifiedTime,thumbnailLink,webViewLink,parents)',
      orderBy: 'folder,name',
      pageSize: 500,
    });

    res.json({ files: r.data.files });
  } catch (err) { next(err); }
});

// ─── POST /api/drive/upload-pdf ───────────────────────────────────────────────
// Wird intern aufgerufen um PDFs automatisch in Drive zu speichern
router.post('/upload-pdf', async (req, res, next) => {
  try {
    const { pdfBuffer, filename, subfolder } = req.body;
    if (!pdfBuffer) return res.status(400).json({ error: 'Kein PDF.' });
    const { auth, driveFolder } = await getDriveClient(req.user.company_id);
    const drive = google.drive({ version: 'v3', auth });

    // Unterordner suchen/erstellen
    let folderId = driveFolder;
    if (subfolder) {
      const existing = await drive.files.list({
        q: `name='${subfolder}' and '${driveFolder}' in parents and trashed=false`,
        fields: 'files(id)',
      });
      if (existing.data.files.length > 0) {
        folderId = existing.data.files[0].id;
      } else {
        const sub = await drive.files.create({
          requestBody: { name: subfolder, mimeType: 'application/vnd.google-apps.folder', parents: [driveFolder] },
          fields: 'id',
        });
        folderId = sub.data.id;
      }
    }

    const buf = Buffer.from(pdfBuffer, 'base64');
    const stream = new Readable();
    stream.push(buf);
    stream.push(null);

    const file = await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType: 'application/pdf', body: stream },
      fields: 'id, webViewLink',
    });

    res.json({ fileId: file.data.id, url: file.data.webViewLink });
  } catch (err) { next(err); }
});

module.exports = router;
