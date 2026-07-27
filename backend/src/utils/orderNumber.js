// ─── Auftrags- und Service-Nummer Generator ───────────────────────────────────
// A-2026-0001 = Auftragsnummer (Projekte, Angebote, Rechnungen)
// S-2026-0001 = Service-Nummer (Serviceeinsätze, Notfälle, Ersatzteile)
const { query } = require('./db');

/**
 * Nächste Nummer generieren.
 * @param {number} companyId
 * @param {'A'|'S'} prefix  – 'A' für Auftrag, 'S' für Service
 * @param {*} client        – optional: DB-Client für Transaktionen
 */
async function nextOrderNumber(companyId, prefix = 'A', client = null) {
  const q = client
    ? (sql, p) => client.query(sql, p)
    : query;

  const year = new Date().getFullYear();

  // Eintrag sicherstellen
  await q(
    `INSERT INTO order_number_seq (company_id, prefix, year, last_number)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (company_id, prefix, year) DO NOTHING`,
    [companyId, prefix, year]
  );

  const r = await q(
    `UPDATE order_number_seq
        SET last_number = last_number + 1
      WHERE company_id = $1 AND prefix = $2 AND year = $3
     RETURNING last_number`,
    [companyId, prefix, year]
  );

  const num = r.rows[0].last_number;
  return `${prefix}-${year}-${String(num).padStart(4, '0')}`;
}

module.exports = { nextOrderNumber };
