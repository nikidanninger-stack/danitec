// ─── Automatisches Datenbank-Backup → Google Drive ───────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { google } = require('googleapis');
const { Readable } = require('stream');
const logger = require('../utils/logger');

router.use(authenticate);

// Hilfsfunktion: Drive-Client aufbauen (selbe Logik wie in drive.js)
async function getDriveClient(companyId) {
  const res = await query('SELECT * FROM google_drive_tokens WHERE company_id=$1', [companyId]);
  if (!res.rows[0]) throw new Error('Google Drive nicht verbunden.');
  const tokens = res.rows[0];
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date:   tokens.expiry_date,
  });
  auth.on('tokens', async (t) => {
    await query(
      'UPDATE google_drive_tokens SET access_token=$1, expiry_date=$2 WHERE company_id=$3',
      [t.access_token, t.expiry_date, companyId]
    );
  });
  return google.drive({ version: 'v3', auth });
}

// Backup-Ordner in Drive suchen oder erstellen
async function getOrCreateBackupFolder(drive) {
  const search = await drive.files.list({
    q: `name='Danitec Backup' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
  });
  if (search.data.files.length > 0) return search.data.files[0].id;
  const folder = await drive.files.create({
    requestBody: { name: 'Danitec Backup', mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return folder.data.id;
}

// Alle wichtigen Tabellen exportieren
async function exportAllData(companyId) {
  const tables = [
    { name: 'customers',             sql: 'SELECT * FROM customers WHERE company_id=$1 ORDER BY created_at DESC' },
    { name: 'offers',                sql: 'SELECT * FROM offers WHERE company_id=$1 ORDER BY created_at DESC' },
    { name: 'offer_positions',       sql: `SELECT op.* FROM offer_positions op JOIN offers o ON op.offer_id=o.id WHERE o.company_id=$1` },
    { name: 'invoices',              sql: 'SELECT * FROM invoices WHERE company_id=$1 ORDER BY created_at DESC' },
    { name: 'expenses',              sql: 'SELECT * FROM expenses WHERE company_id=$1 ORDER BY created_at DESC' },
    { name: 'incoming_invoices',     sql: 'SELECT * FROM incoming_invoices WHERE company_id=$1 ORDER BY created_at DESC' },
    { name: 'service_reports',       sql: 'SELECT * FROM service_reports WHERE company_id=$1 ORDER BY created_at DESC' },
    { name: 'equipment',             sql: 'SELECT * FROM equipment WHERE company_id=$1 ORDER BY created_at DESC' },
    { name: 'maintenance_contracts', sql: 'SELECT * FROM maintenance_contracts WHERE company_id=$1 ORDER BY created_at DESC' },
    { name: 'fgas_logs',             sql: 'SELECT * FROM fgas_logs WHERE company_id=$1 ORDER BY created_at DESC' },
    { name: 'time_entries',          sql: 'SELECT * FROM time_entries WHERE company_id=$1 ORDER BY created_at DESC' },
    { name: 'products',              sql: 'SELECT * FROM products WHERE company_id=$1 ORDER BY name' },
    { name: 'workspace_boards',      sql: 'SELECT * FROM workspace_boards WHERE company_id=$1' },
    { name: 'workspace_cards',       sql: `SELECT wc.* FROM workspace_cards wc JOIN workspace_boards wb ON wc.board_id=wb.id WHERE wb.company_id=$1` },
    { name: 'calendar_events',       sql: 'SELECT * FROM calendar_events WHERE company_id=$1 ORDER BY start_at DESC' },
  ];

  const backup = {
    exported_at: new Date().toISOString(),
    company_id: companyId,
    tables: {}
  };

  for (const t of tables) {
    try {
      const r = await query(t.sql, [companyId]);
      backup.tables[t.name] = r.rows;
    } catch (_) {
      backup.tables[t.name] = [];
    }
  }

  return backup;
}

// POST /api/backup/run  — manuell oder per Scheduled Task auslösen
router.post('/run', authorize('admin', 'geschaeftsfuehrer'), async (req, res, next) => {
  try {
    const companyId = req.user.company_id;

    // Google Drive verbunden?
    let drive;
    try {
      drive = await getDriveClient(companyId);
    } catch (_) {
      return res.status(400).json({ error: 'Google Drive nicht verbunden. Bitte zuerst unter Google Drive verbinden.' });
    }

    // Daten exportieren
    const backup = await exportAllData(companyId);
    const json = JSON.stringify(backup, null, 2);
    const bytes = Buffer.byteLength(json, 'utf8');

    // Dateiname mit Datum
    const date = new Date().toISOString().slice(0, 10);
    const filename = `danitec-backup-${date}.json`;

    // Backup-Ordner
    const folderId = await getOrCreateBackupFolder(drive);

    // Alte Backups > 30 Tage löschen
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString();
      const old = await drive.files.list({
        q: `'${folderId}' in parents and name contains 'danitec-backup-' and createdTime < '${thirtyDaysAgo}' and trashed=false`,
        fields: 'files(id)',
      });
      for (const f of old.data.files || []) {
        await drive.files.delete({ fileId: f.id }).catch(() => {});
      }
    } catch (_) {}

    // Backup hochladen
    const stream = Readable.from([json]);
    await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: 'application/json',
        parents: [folderId],
      },
      media: { mimeType: 'application/json', body: stream },
    });

    logger.info(`Backup erstellt: ${filename} (${Math.round(bytes / 1024)} KB)`);

    res.json({
      success: true,
      filename,
      size_kb: Math.round(bytes / 1024),
      records: Object.entries(backup.tables).reduce((sum, [, rows]) => sum + rows.length, 0),
      message: `Backup gespeichert in Google Drive → "Danitec Backup/${filename}"`,
    });

  } catch (err) {
    next(err);
  }
});

// GET /api/backup/status  — letztes Backup anzeigen
router.get('/status', authorize('admin', 'geschaeftsfuehrer'), async (req, res, next) => {
  try {
    let drive;
    try {
      drive = await getDriveClient(req.user.company_id);
    } catch (_) {
      return res.json({ connected: false, lastBackup: null });
    }

    const search = await drive.files.list({
      q: `name contains 'danitec-backup-' and trashed=false`,
      orderBy: 'createdTime desc',
      pageSize: 1,
      fields: 'files(id, name, createdTime, size)',
    });

    const last = search.data.files?.[0] || null;
    res.json({
      connected: true,
      lastBackup: last ? {
        name: last.name,
        date: last.createdTime,
        size_kb: Math.round((last.size || 0) / 1024),
      } : null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
