// ─── Auswertungen & Berichte API ─────────────────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ─── GET /api/reports/dashboard ──────────────────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const cId = req.user.company_id;
    const year = new Date().getFullYear();

    const [offene, bezahlt, ausgaben, ueberfaellig, angebote, aktuellerMonat] = await Promise.all([
      // Offene Rechnungen
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(open_total),0) AS summe
             FROM documents WHERE company_id=$1 AND type='invoice' AND status IN ('finalized','sent','partial_paid')`, [cId]),
      // Bezahlte Rechnungen YTD
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(gross_total),0) AS summe,
                    COALESCE(SUM(vat_total),0) AS ust
             FROM documents WHERE company_id=$1 AND type='invoice' AND status='paid'
             AND EXTRACT(YEAR FROM document_date)=$2`, [cId, year]),
      // Ausgaben YTD
      query(`SELECT COALESCE(SUM(gross_amount),0) AS brutto, COALESCE(SUM(deductible_vat_amount),0) AS vorsteuer,
                    COALESCE(SUM(deductible_net_amount),0) AS netto
             FROM expenses WHERE company_id=$1 AND status='paid'
             AND EXTRACT(YEAR FROM document_date)=$2`, [cId, year]),
      // Überfällige Rechnungen
      query(`SELECT COUNT(*) AS count FROM documents
             WHERE company_id=$1 AND type='invoice' AND due_date < CURRENT_DATE
             AND status NOT IN ('paid','cancelled','draft')`, [cId]),
      // Offene Angebote
      query(`SELECT COUNT(*) AS count FROM offer_details od
             JOIN documents d ON od.document_id = d.id
             WHERE d.company_id=$1 AND od.offer_status IN ('sent','accepted')`, [cId]),
      // Aktueller Monat Umsatz
      query(`SELECT COALESCE(SUM(dp.amount),0) AS einnahmen
             FROM document_payments dp JOIN documents d ON dp.document_id=d.id
             WHERE d.company_id=$1 AND d.type='invoice'
             AND EXTRACT(YEAR FROM dp.payment_date)=$2 AND EXTRACT(MONTH FROM dp.payment_date)=EXTRACT(MONTH FROM CURRENT_DATE)`, [cId, year]),
    ]);

    const ustAusgang = parseFloat(bezahlt.rows[0].ust);
    const vorsteuer  = parseFloat(ausgaben.rows[0].vorsteuer);

    res.json({
      offeneRechnungen: { count: parseInt(offene.rows[0].count), summe: parseFloat(offene.rows[0].summe) },
      bezahlteRechnungen: { count: parseInt(bezahlt.rows[0].count), umsatz: parseFloat(bezahlt.rows[0].summe) },
      ausgaben: { brutto: parseFloat(ausgaben.rows[0].brutto), netto: parseFloat(ausgaben.rows[0].netto) },
      ueberfaellig: parseInt(ueberfaellig.rows[0].count),
      offeneAngebote: parseInt(angebote.rows[0].count),
      monatsumsatz: parseFloat(aktuellerMonat.rows[0].einnahmen),
      ustZahllast: Math.round((ustAusgang - vorsteuer) * 100) / 100,
      geschaetzterGewinn: Math.round((parseFloat(bezahlt.rows[0].summe) - parseFloat(ausgaben.rows[0].brutto)) * 100) / 100,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/reports/ea – Einnahmen-Ausgaben-Rechnung ────────────────────────
router.get('/ea', async (req, res, next) => {
  try {
    const { from, to, year } = req.query;
    const cId = req.user.company_id;
    const filterYear = year || new Date().getFullYear();

    const einnahmen = await query(`
      SELECT dp.payment_date, d.number, d.net_total AS netto, d.vat_total AS ust, dp.amount AS brutto,
             COALESCE(c.company_name, c.first_name||' '||c.last_name) AS kunde
      FROM document_payments dp
      JOIN documents d ON dp.document_id = d.id
      LEFT JOIN customers c ON d.customer_id = c.id
      WHERE d.company_id = $1 AND d.type = 'invoice'
      AND EXTRACT(YEAR FROM dp.payment_date) = $2
      ORDER BY dp.payment_date`, [cId, filterYear]);

    const ausgaben = await query(`
      SELECT e.payment_date, e.expense_number, e.description,
             e.deductible_net_amount AS netto, e.deductible_vat_amount AS ust,
             e.gross_amount * (e.business_share_percent/100) AS brutto,
             ec.name AS kategorie, s.company_name AS lieferant
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN suppliers s ON e.supplier_id = s.id
      WHERE e.company_id = $1 AND e.status = 'paid'
      AND EXTRACT(YEAR FROM e.payment_date) = $2
      ORDER BY e.payment_date`, [cId, filterYear]);

    const afaResult = await query(`
      SELECT COALESCE(SUM(ad.amount),0) AS afa_gesamt
      FROM asset_depreciations ad
      JOIN assets a ON ad.asset_id = a.id
      WHERE a.company_id = $1 AND ad.year = $2`, [cId, filterYear]);

    const einnahmenSum = einnahmen.rows.reduce((s, r) => s + parseFloat(r.netto), 0);
    const ausgabenSum  = ausgaben.rows.reduce((s, r) => s + parseFloat(r.netto), 0);
    const afaGesamt    = parseFloat(afaResult.rows[0].afa_gesamt);
    const ustAusgang   = einnahmen.rows.reduce((s, r) => s + parseFloat(r.ust), 0);
    const vorsteuer    = ausgaben.rows.reduce((s, r) => s + parseFloat(r.ust), 0);

    // Ausgaben nach Kategorie gruppieren
    const katMap = {};
    ausgaben.rows.forEach(r => {
      if (!katMap[r.kategorie]) katMap[r.kategorie] = 0;
      katMap[r.kategorie] += parseFloat(r.netto);
    });

    res.json({
      jahr: filterYear,
      einnahmen: { summe: Math.round(einnahmenSum * 100) / 100, positionen: einnahmen.rows },
      ausgaben: { summe: Math.round(ausgabenSum * 100) / 100, positionen: ausgaben.rows, nachKategorie: katMap },
      afa: afaGesamt,
      gewinn: Math.round((einnahmenSum - ausgabenSum - afaGesamt) * 100) / 100,
      ust: { ausgang: Math.round(ustAusgang * 100) / 100, vorsteuer: Math.round(vorsteuer * 100) / 100, zahllast: Math.round((ustAusgang - vorsteuer) * 100) / 100 },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/reports/vat – USt-Übersicht ────────────────────────────────────
router.get('/vat', async (req, res, next) => {
  try {
    const { year, month, quarter } = req.query;
    const cId = req.user.company_id;
    const filterYear = year || new Date().getFullYear();

    const ustAusgang = await query(`
      SELECT di.vat_rate, SUM(di.net_amount) AS netto, SUM(di.vat_amount) AS ust
      FROM document_items di
      JOIN documents d ON di.document_id = d.id
      JOIN document_payments dp ON dp.document_id = d.id
      WHERE d.company_id = $1 AND d.type = 'invoice' AND d.status = 'paid'
      AND EXTRACT(YEAR FROM dp.payment_date) = $2
      GROUP BY di.vat_rate ORDER BY di.vat_rate DESC`, [cId, filterYear]);

    const vorsteuer = await query(`
      SELECT e.vat_rate, SUM(e.deductible_net_amount) AS netto, SUM(e.deductible_vat_amount) AS ust
      FROM expenses e
      WHERE e.company_id = $1 AND e.status = 'paid'
      AND EXTRACT(YEAR FROM e.payment_date) = $2
      GROUP BY e.vat_rate ORDER BY e.vat_rate DESC`, [cId, filterYear]);

    const totalUstOut  = ustAusgang.rows.reduce((s, r) => s + parseFloat(r.ust), 0);
    const totalVorst   = vorsteuer.rows.reduce((s, r) => s + parseFloat(r.ust), 0);
    const totalNettoOut = ustAusgang.rows.reduce((s, r) => s + parseFloat(r.netto), 0);

    // Quartalsdaten
    const quartale = await query(`
      SELECT
        EXTRACT(QUARTER FROM dp.payment_date)::int AS quartal,
        COALESCE(SUM(di.net_amount),0)  AS netto_out,
        COALESCE(SUM(di.vat_amount),0)  AS ust_out
      FROM document_payments dp
      JOIN documents d ON dp.document_id = d.id
      JOIN document_items di ON di.document_id = d.id
      WHERE d.company_id=$1 AND d.type='invoice' AND EXTRACT(YEAR FROM dp.payment_date)=$2
      GROUP BY quartal ORDER BY quartal`, [cId, filterYear]);

    const quartaleVorst = await query(`
      SELECT
        EXTRACT(QUARTER FROM payment_date)::int AS quartal,
        COALESCE(SUM(deductible_vat_amount),0) AS vorsteuer
      FROM expenses
      WHERE company_id=$1 AND status='paid' AND EXTRACT(YEAR FROM payment_date)=$2
      GROUP BY quartal ORDER BY quartal`, [cId, filterYear]);

    const qMap = {};
    for (let q=1;q<=4;q++) qMap[q] = { ust_out:0, vorsteuer:0, netto_out:0 };
    quartale.rows.forEach(r => { qMap[r.quartal].ust_out = parseFloat(r.ust_out); qMap[r.quartal].netto_out = parseFloat(r.netto_out); });
    quartaleVorst.rows.forEach(r => { qMap[r.quartal].vorsteuer = parseFloat(r.vorsteuer); });
    const quartalsData = [1,2,3,4].map(q => ({
      quartal: q,
      ustAusgang: Math.round(qMap[q].ust_out * 100) / 100,
      vorsteuer:  Math.round(qMap[q].vorsteuer * 100) / 100,
      zahllast:   Math.round((qMap[q].ust_out - qMap[q].vorsteuer) * 100) / 100,
      nettoUmsatz: Math.round(qMap[q].netto_out * 100) / 100,
      faellig: ['30. April','31. Juli','31. Oktober','31. Jänner'][q-1],
    }));

    res.json({
      jahr: filterYear,
      ustAusgang:  { positionen: ustAusgang.rows, gesamt: Math.round(totalUstOut * 100) / 100 },
      vorsteuer:   { positionen: vorsteuer.rows,  gesamt: Math.round(totalVorst * 100) / 100 },
      zahllast:    Math.round((totalUstOut - totalVorst) * 100) / 100,
      nettoUmsatz: Math.round(totalNettoOut * 100) / 100,
      quartale:    quartalsData,
      uva: {
        KZ_000: Math.round(totalNettoOut * 100) / 100,
        KZ_022: Math.round((ustAusgang.rows.find(r => r.vat_rate == 20)?.ust || 0) * 100) / 100,
        KZ_010: Math.round((ustAusgang.rows.find(r => r.vat_rate == 10)?.ust || 0) * 100) / 100,
        KZ_060: Math.round(totalVorst * 100) / 100,
        KZ_095: Math.round((totalUstOut - totalVorst) * 100) / 100,
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/reports/monthly – Monatliche Einnahmen & Ausgaben ───────────────
router.get('/monthly', async (req, res, next) => {
  try {
    const cId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const einnahmen = await query(`
      SELECT EXTRACT(MONTH FROM dp.payment_date)::int AS monat,
             COALESCE(SUM(d.net_total),0) AS netto,
             COALESCE(SUM(dp.amount),0) AS brutto
      FROM document_payments dp
      JOIN documents d ON dp.document_id = d.id
      WHERE d.company_id = $1 AND d.type = 'invoice'
        AND EXTRACT(YEAR FROM dp.payment_date) = $2
      GROUP BY monat ORDER BY monat`, [cId, year]);

    const ausgaben = await query(`
      SELECT EXTRACT(MONTH FROM payment_date)::int AS monat,
             COALESCE(SUM(gross_amount * business_share_percent / 100),0) AS brutto
      FROM expenses
      WHERE company_id = $1 AND status = 'paid'
        AND EXTRACT(YEAR FROM payment_date) = $2
      GROUP BY monat ORDER BY monat`, [cId, year]);

    const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    const eMap = {}; einnahmen.rows.forEach(r => { eMap[r.monat] = parseFloat(r.brutto); });
    const aMap = {}; ausgaben.rows.forEach(r => { aMap[r.monat] = parseFloat(r.brutto); });

    const months = MONTHS.map((name, i) => ({
      name,
      einnahmen: Math.round((eMap[i+1] || 0) * 100) / 100,
      ausgaben:  Math.round((aMap[i+1] || 0) * 100) / 100,
    }));

    res.json({ jahr: year, months });
  } catch (err) { next(err); }
});

module.exports = router;
