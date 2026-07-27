// ─── Steuerberater-Export API ─────────────────────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);

// CSV-Zeile escapen
const csvEsc = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g,'""')}"`;
  return s;
};
const toCsv = (rows, headers) => {
  const head = headers.join(';');
  const body = rows.map(r => headers.map(h => csvEsc(r[h])).join(';')).join('\n');
  return `${head}\n${body}`;
};

// GET /api/exports/invoices?year=2025&format=csv
router.get('/invoices', authorize('admin','geschaeftsfuehrer','buchhaltung','steuerberater'), async (req, res, next) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const r = await query(`
      SELECT d.number, d.document_date, d.due_date,
             COALESCE(c.company_name,c.first_name||' '||c.last_name) AS kunde,
             c.uid_number AS kunde_uid, d.net_total, d.vat_total, d.gross_total,
             d.paid_total, d.open_total, d.status, d.sent_at
      FROM documents d LEFT JOIN customers c ON d.customer_id=c.id
      WHERE d.company_id=$1 AND d.type='invoice' AND d.locked=TRUE
      AND EXTRACT(YEAR FROM d.document_date)=$2
      ORDER BY d.document_date`, [req.user.company_id, year]);

    const headers = ['number','document_date','due_date','kunde','kunde_uid','net_total','vat_total','gross_total','paid_total','open_total','status'];
    const filename = `Danitec_Export_${year}_Ausgangsrechnungen.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + toCsv(r.rows, headers)); // BOM für Excel
  } catch (err) { next(err); }
});

// GET /api/exports/expenses?year=2025
router.get('/expenses', authorize('admin','geschaeftsfuehrer','buchhaltung','steuerberater'), async (req, res, next) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const r = await query(`
      SELECT e.expense_number, e.document_date, e.payment_date,
             COALESCE(s.company_name,'—') AS lieferant, ec.name AS kategorie,
             e.description, e.gross_amount, e.vat_rate, e.vat_amount, e.net_amount,
             e.private_share_percent, e.business_share_percent,
             e.deductible_net_amount, e.deductible_vat_amount, e.status
      FROM expenses e
      LEFT JOIN suppliers s ON e.supplier_id=s.id
      LEFT JOIN expense_categories ec ON e.category_id=ec.id
      WHERE e.company_id=$1 AND EXTRACT(YEAR FROM e.document_date)=$2
      ORDER BY e.document_date`, [req.user.company_id, year]);

    const headers = ['expense_number','document_date','payment_date','lieferant','kategorie','description','gross_amount','vat_rate','vat_amount','net_amount','private_share_percent','business_share_percent','deductible_net_amount','deductible_vat_amount','status'];
    const filename = `Danitec_Export_${year}_Ausgaben.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + toCsv(r.rows, headers));
  } catch (err) { next(err); }
});

// GET /api/exports/ea?year=2025 – E/A-Rechnung als JSON
router.get('/ea', authorize('admin','geschaeftsfuehrer','buchhaltung','steuerberater'), async (req, res, next) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    // Delegiere an /api/reports/ea
    const reportsRoute = require('./reports');
    req.query.year = year;
    reportsRoute.handle(req, res, next);
  } catch (err) { next(err); }
});

// GET /api/exports/audit-log?year=2025
router.get('/audit-log', authorize('admin','steuerberater'), async (req, res, next) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const r = await query(`
      SELECT al.created_at, u.name AS benutzer, al.entity_type, al.action, al.ip_address
      FROM audit_logs al LEFT JOIN users u ON al.user_id=u.id
      WHERE al.company_id=$1 AND EXTRACT(YEAR FROM al.created_at)=$2
      ORDER BY al.created_at DESC`, [req.user.company_id, year]);

    const headers = ['created_at','benutzer','entity_type','action','ip_address'];
    const filename = `Danitec_Export_${year}_AuditLog.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + toCsv(r.rows, headers));
  } catch (err) { next(err); }
});

module.exports = router;
