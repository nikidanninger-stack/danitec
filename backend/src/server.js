// ─── Danitec Backend Server ───────────────────────────────────────────────────
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const logger = require('./utils/logger');
const { pool } = require('./utils/db');

const app = express();

// ─── Sicherheits-Middleware ──────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate Limiting – 200 Anfragen pro 15 Minuten pro IP
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 500 : 5000,
  message: { error: 'Zu viele Anfragen. Bitte warte 15 Minuten.' },
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1',
}));

// Statische Dateien (hochgeladene Belege)
app.use('/uploads', express.static(path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads')));

// ─── API-Routen ───────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/company',    require('./routes/company'));
app.use('/api/customers',  require('./routes/customers'));
app.use('/api/suppliers',  require('./routes/suppliers'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/invoices',   require('./routes/invoices'));
app.use('/api/offers',     require('./routes/offers'));
app.use('/api/expenses',   require('./routes/expenses'));
app.use('/api/assets',     require('./routes/assets'));
app.use('/api/documents',  require('./routes/documents'));
app.use('/api/payments',   require('./routes/payments'));
app.use('/api/reports',    require('./routes/reports'));
app.use('/api/exports',    require('./routes/exports'));
app.use('/api/pdf',        require('./routes/pdf'));
app.use('/api/ocr',        require('./routes/ocr'));
app.use('/api/projects',                require('./routes/projects'));
app.use('/api/equipment',               require('./routes/equipment'));
app.use('/api/service-reports',         require('./routes/service-reports'));
app.use('/api/maintenance-contracts',   require('./routes/maintenance-contracts'));
app.use('/api/fgas-logs',               require('./routes/fgas-logs'));
app.use('/api/time-entries',            require('./routes/time-entries'));
app.use('/api/banking',                 require('./routes/banking'));
app.use('/api/incoming-invoices',       require('./routes/incoming-invoices'));
app.use('/api/refrigerant-stock',       require('./routes/refrigerant-stock'));
app.use('/api/supplier-extract',        require('./routes/supplier-extract'));
app.use('/api/ai-text',                 require('./routes/ai-text'));
app.use('/api/plaud-analyse',           require('./routes/plaud-analyse'));
app.use('/api/drive',                   require('./routes/drive'));
app.use('/api/calendar',                require('./routes/calendar'));
app.use('/api/workspace',               require('./routes/workspace'));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', version: '1.0.0' });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

// ─── Frontend (Build) servieren ──────────────────────────────────────────────
const distPath = path.join(__dirname, '../../frontend/dist');
const fs = require('fs');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // ─── 404 Handler ─────────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: `Route nicht gefunden: ${req.method} ${req.path}` });
  });
}

// ─── Globaler Fehler-Handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`${err.status || 500} – ${err.message} – ${req.originalUrl}`);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Interner Serverfehler' : err.message,
  });
});

// ─── Server sofort starten, Migrationen im Hintergrund ──────────────────────
const PORT = process.env.PORT || 3001;

// Server startet SOFORT (Render-Timeout vermeiden)
app.listen(PORT, () => {
  logger.info(`Danitec Backend läuft auf Port ${PORT} (${process.env.NODE_ENV})`);
  // Migrationen asynchron im Hintergrund ausführen
  runMigrations().catch(err => logger.error('Migrations-Fehler: ' + err.message));
});

async function runMigrations() {
  try {
    const migFs   = require('fs');
    const migPath = require('path');
    const client  = await pool.connect();
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS _migrations (id SERIAL PRIMARY KEY, filename VARCHAR(200) UNIQUE NOT NULL, executed_at TIMESTAMPTZ DEFAULT NOW())`);
      const dir   = migPath.join(__dirname, 'migrations');
      const files = migFs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
      for (const file of files) {
        const already = await client.query('SELECT 1 FROM _migrations WHERE filename=$1', [file]);
        if (already.rows.length > 0) continue;
        logger.info(`Migration: ${file}`);
        const sql = migFs.readFileSync(migPath.join(dir, file), 'utf8');
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
          await client.query('COMMIT');
        } catch (migErr) {
          await client.query('ROLLBACK').catch(() => {});
          logger.error(`Migrations-Fehler: ${file}: ${migErr.message}`);
        }
      }
      logger.info('Migrationen abgeschlossen.');
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('DB-Verbindung fehlgeschlagen: ' + err.message);
  }
}

module.exports = app;
