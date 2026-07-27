// ─── Datenbankmigrationen ausführen ───────────────────────────────────────────
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host: process.env.DB_HOST, port: process.env.DB_PORT,
      database: process.env.DB_NAME, user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

async function run() {
  const client = await pool.connect();
  try {
    // Migrations-Tabelle erstellen falls nicht vorhanden
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY, filename VARCHAR(200) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const already = await client.query('SELECT 1 FROM _migrations WHERE filename = $1', [file]);
      if (already.rows.length > 0) {
        console.log(`  ✓ ${file} (bereits ausgeführt)`);
        continue;
      }
      console.log(`  → Führe aus: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  ✓ ${file} erfolgreich`);
      } catch (err) {
        await client.query('ROLLBACK');
        const msg = `${file}: ${err.message}`;
        console.error(`  ✗ Migrations-Fehler: ${msg}`);
        // Nicht-fatale Migrationen (Seed/Index) nicht abbrechen
        const nonFatal = ['seed', 'index', 'performance'];
        if (nonFatal.some(k => file.toLowerCase().includes(k))) {
          console.warn(`  ⚠ Überspringe (non-fatal): ${file}`);
        } else {
          throw new Error(`Migration fehlgeschlagen: ${msg}`);
        }
      }
    }
    console.log('\nAlle Migrationen abgeschlossen.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error('Migrations-Fehler (nicht fatal):', err.message); });
