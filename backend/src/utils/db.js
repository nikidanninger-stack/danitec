// ─── PostgreSQL Datenbankverbindung ───────────────────────────────────────────
const { Pool } = require('pg');
const logger = require('./logger');

// Railway stellt DATABASE_URL bereit – lokal werden die einzelnen Variablen genutzt
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },  // Railway benötigt dies
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    }
  : {
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME     || 'danitec_db',
      user:     process.env.DB_USER     || 'danitec_user',
      password: process.env.DB_PASSWORD || '',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unerwarteter Datenbankfehler:', err);
});

// ─── Hilfsfunktion für Transaktionen ─────────────────────────────────────────
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Hilfsfunktion für einfache Queries ──────────────────────────────────────
async function query(sql, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(sql, params);
    const duration = Date.now() - start;
    if (duration > 1000) logger.warn(`Langsame Query (${duration}ms): ${sql.substring(0, 100)}`);
    return result;
  } catch (err) {
    logger.error(`Datenbankfehler: ${err.message}\nSQL: ${sql}`);
    throw err;
  }
}

module.exports = { pool, query, withTransaction };
