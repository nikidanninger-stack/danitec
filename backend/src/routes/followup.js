// ─── Angebot Follow-up Erinnerungen ──────────────────────────────────────────
// Wird täglich aufgerufen (intern oder via Render Cron)
const router = require('express').Router();
const { query } = require('../utils/db');
const { sendInternalNotification } = require('../services/emailService');
const logger = require('../utils/logger');

// POST /api/followup/run  — täglich per Render Cron oder manuell
// Auch intern aufrufbar ohne HTTP (direkt importieren)
async function runFollowups() {
  try {
    // Alle Companies mit E-Mail-Adresse
    const companies = await query(`
      SELECT c.id, c.email, c.name
      FROM companies c
      WHERE c.email IS NOT NULL AND c.email != ''
    `);

    let total = 0;

    for (const company of companies.rows) {
      // Angebote die seit 7 Tagen "sent" (versendet) aber noch nicht akzeptiert/abgelehnt sind
      const offersRes = await query(`
        SELECT o.id, o.subject, o.gross_total, o.document_date, o.valid_until,
               COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS kunde
        FROM offers o
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE o.company_id = $1
          AND o.status = 'sent'
          AND o.document_date <= CURRENT_DATE - INTERVAL '7 days'
          AND o.document_date >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY o.document_date ASC
      `, [company.id]);

      if (offersRes.rows.length === 0) continue;

      const fmt = (d) => d ? new Date(d).toLocaleDateString('de-AT') : '—';
      const fmtEur = (n) => new Intl.NumberFormat('de-AT', { style:'currency', currency:'EUR' }).format(n||0);

      const lines = [
        { label: 'Hinweis', value: `${offersRes.rows.length} Angebot(e) warten seit mehr als 7 Tagen auf Rückmeldung` },
        { divider: true },
        ...offersRes.rows.flatMap(o => [
          { label: 'Angebot', value: `#${o.id} – ${o.subject || 'Kein Betreff'}` },
          { label: 'Kunde', value: o.kunde || '—' },
          { label: 'Betrag', value: fmtEur(o.gross_total) },
          { label: 'Gesendet am', value: fmt(o.document_date) },
          { label: 'Gültig bis', value: fmt(o.valid_until) },
          { divider: true },
        ]),
        { label: 'Tipp', value: 'Jetzt kurz beim Kunden nachhaken — die meisten Angebote scheitern am fehlenden Follow-up!' },
      ];

      await sendInternalNotification({
        companyId: company.id,
        toEmail: company.email,
        subject: `⏰ Follow-up: ${offersRes.rows.length} offene Angebot(e) warten auf Antwort`,
        lines,
      });

      total += offersRes.rows.length;
      logger.info(`Follow-up: ${offersRes.rows.length} Angebote für ${company.name} (${company.email})`);
    }

    return { ok: true, processed: total };
  } catch (err) {
    logger.error('Follow-up Fehler: ' + err.message);
    return { ok: false, error: err.message };
  }
}

// HTTP-Endpunkt (für manuelles Auslösen aus der App)
router.post('/run', async (req, res) => {
  // Einfacher interner Token-Schutz
  const token = req.headers['x-internal-token'] || req.body?.token;
  if (token !== process.env.INTERNAL_TOKEN && token !== 'danitec-internal') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const result = await runFollowups();
  res.json(result);
});

module.exports = router;
module.exports.runFollowups = runFollowups;
