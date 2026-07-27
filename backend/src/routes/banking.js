// ─── Banking Route – Salt Edge Open Banking ───────────────────────────────────
// Doku: https://docs.saltedge.com/account_information/v6/
const router   = require('express').Router();
const { query } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');

const SE_BASE = 'https://www.saltedge.com/api/v6';

// ─── Salt Edge Hilfsfunktionen ────────────────────────────────────────────────
function seHeaders(customerSecret = null) {
  const h = {
    'Content-Type': 'application/json',
    'App-id':  process.env.SALTEDGE_APP_ID,
    'Secret':  process.env.SALTEDGE_SECRET,
  };
  if (customerSecret) h['Customer-secret'] = customerSecret;
  return h;
}

async function seGet(path, customerSecret = null) {
  const res  = await fetch(`${SE_BASE}${path}`, { headers: seHeaders(customerSecret) });
  const text = await res.text();
  let d;
  try { d = JSON.parse(text); } catch(_) {
    throw new Error(`Salt Edge API Fehler (${res.status}): ${text.slice(0,300)}`);
  }
  if (!res.ok) throw new Error(d.error?.message || d.error?.class || JSON.stringify(d));
  return d.data;
}

async function sePost(path, body, customerSecret = null) {
  const res  = await fetch(`${SE_BASE}${path}`, {
    method:  'POST',
    headers: seHeaders(customerSecret),
    body:    JSON.stringify({ data: body }),
  });
  const text = await res.text();
  let d;
  try { d = JSON.parse(text); } catch(_) {
    throw new Error(`Salt Edge API Fehler (${res.status}): ${text.slice(0,300)}`);
  }
  if (!res.ok) throw new Error(d.error?.message || d.error?.class || JSON.stringify(d));
  return d.data;
}

router.use(authenticate);

// ─── Verbindungsstatus ────────────────────────────────────────────────────────
router.get('/status', async (req, res, next) => {
  try {
    const r = await query(
      'SELECT id, status, institution_name, account_name, iban, last_synced_at FROM bank_connections WHERE company_id=$1',
      [req.user.company_id]
    );
    res.json(r.rows[0] || null);
  } catch(err) {
    if (err.code === '42P01') return res.json(null); // Tabelle existiert noch nicht
    next(err);
  }
});

// ─── Österreichische Banken laden ─────────────────────────────────────────────
router.get('/institutions', async (req, res, next) => {
  try {
    if (!process.env.SALTEDGE_APP_ID || !process.env.SALTEDGE_SECRET) {
      return res.json({ data: AT_BANKS_FALLBACK });
    }
    // Salt Edge liefert alle Provider für AT
    const data = await seGet('/providers?country_code=AT&include_fake_providers=false&mode=oauth');
    const banks = Array.isArray(data)
      ? data.map(p => ({ id: p.code, name: p.name, logo: p.logo_url }))
      : AT_BANKS_FALLBACK;
    res.json({ data: banks });
  } catch(err) {
    res.json({ data: AT_BANKS_FALLBACK });
  }
});

// Fallback – wichtigste österreichische Banken (Salt Edge provider codes)
const AT_BANKS_FALLBACK = [
  { id: 'raiffeisen_at_oauth',   name: 'Raiffeisen Bank' },
  { id: 'bawag_at_oauth',        name: 'BAWAG P.S.K.' },
  { id: 'erstebank_at_oauth',    name: 'Erste Bank / Sparkasse' },
  { id: 'bankaustria_at_oauth',  name: 'Bank Austria' },
  { id: 'volksbank_at_oauth',    name: 'Volksbank' },
];

// ─── Verbindung starten ───────────────────────────────────────────────────────
router.post('/connect', authorize('admin','geschaeftsfuehrer'), async (req, res, next) => {
  try {
    if (!process.env.SALTEDGE_APP_ID || !process.env.SALTEDGE_SECRET) {
      return res.status(400).json({ error: 'Salt Edge API-Keys fehlen. Bitte SALTEDGE_APP_ID und SALTEDGE_SECRET in der .env eintragen.' });
    }

    const { institutionId, institutionName } = req.body;
    if (!institutionId) return res.status(400).json({ error: 'Keine Bank ausgewählt.' });

    const redirectBase = process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:3000';

    // Bestehende Verbindung laden (für customer_secret)
    let conn = (await query('SELECT * FROM bank_connections WHERE company_id=$1', [req.user.company_id])).rows[0];

    // Customer bei Salt Edge anlegen (falls noch keiner existiert)
    let customerSecret = conn?.customer_secret;
    if (!customerSecret) {
      // Einmaligen Identifier generieren (Timestamp verhindert "already exists")
      let identifier = `danitec-co-${req.user.company_id}-${Date.now()}`;
      const customer = await sePost('/customers', { identifier });
      customerSecret = customer.secret;
    }

    // Connect Session erstellen
    const session = await sePost('/connect_sessions/create', {
      allowed_countries: ['AT'],
      provider_code:     institutionId,
      attempt: {
        return_to:          `${redirectBase}/banking-callback`,
        fetch_scopes:       ['accounts', 'transactions'],
        store_credentials:  true,
      },
    }, customerSecret);

    // In DB speichern
    await query(`
      INSERT INTO bank_connections
        (company_id, provider, institution_id, institution_name, customer_secret, status)
      VALUES ($1, 'saltedge', $2, $3, $4, 'pending')
      ON CONFLICT (company_id) DO UPDATE
        SET institution_id=$2, institution_name=$3, customer_secret=$4,
            connection_id=NULL, account_id=NULL, status='pending', last_synced_at=NULL
    `, [req.user.company_id, institutionId, institutionName || institutionId, customerSecret]);

    res.json({ link: session.connect_url });
  } catch(err) { next(err); }
});

// ─── Callback abschließen (wird nach Bank-Login aufgerufen) ──────────────────
// Frontend schickt connection_id aus der Callback-URL
router.post('/complete', authorize('admin','geschaeftsfuehrer'), async (req, res, next) => {
  try {
    const { connectionId } = req.body;
    const conn = (await query('SELECT * FROM bank_connections WHERE company_id=$1', [req.user.company_id])).rows[0];
    if (!conn?.customer_secret) return res.status(400).json({ error: 'Keine offene Verbindung gefunden.' });

    const cid = connectionId || conn.connection_id;
    if (!cid) return res.status(400).json({ error: 'connection_id fehlt.' });

    // Konten laden
    const accounts = await seGet(`/accounts?connection_id=${cid}`, conn.customer_secret);
    const account  = Array.isArray(accounts) ? accounts[0] : null;
    if (!account) return res.status(400).json({ error: 'Keine Konten gefunden.' });

    const iban = account.extra?.iban || account.extra?.account_number || null;
    const name = account.name || conn.institution_name || 'Konto';

    await query(`
      UPDATE bank_connections
        SET connection_id=$1, account_id=$2, iban=$3, account_name=$4, status='linked', last_synced_at=NOW()
      WHERE company_id=$5
    `, [cid, String(account.id), iban, name, req.user.company_id]);

    res.json({ success: true, iban, name });
  } catch(err) { next(err); }
});

// ─── Kontostand ───────────────────────────────────────────────────────────────
router.get('/balance', async (req, res, next) => {
  try {
    const conn = (await query('SELECT * FROM bank_connections WHERE company_id=$1 AND status=$2', [req.user.company_id, 'linked'])).rows[0];
    if (!conn) return res.status(404).json({ error: 'Keine Bankverbindung aktiv.' });

    const accounts = await seGet(`/accounts?connection_id=${conn.connection_id}`, conn.customer_secret);
    const account  = Array.isArray(accounts) ? accounts.find(a => String(a.id) === conn.account_id) || accounts[0] : null;

    res.json({
      amount:   account?.balance  ?? '0.00',
      currency: account?.currency_code ?? 'EUR',
      iban:     conn.iban,
      name:     conn.account_name,
      lastSync: conn.last_synced_at,
    });
  } catch(err) { next(err); }
});

// ─── Transaktionen synchronisieren + Auto-Matching ────────────────────────────
router.post('/sync', authorize('admin','geschaeftsfuehrer'), async (req, res, next) => {
  try {
    const conn = (await query('SELECT * FROM bank_connections WHERE company_id=$1 AND status=$2', [req.user.company_id, 'linked'])).rows[0];
    if (!conn) return res.status(404).json({ error: 'Keine Bankverbindung aktiv.' });

    // Transaktionen der letzten 90 Tage
    const from = new Date(); from.setDate(from.getDate() - 90);
    const txData = await seGet(
      `/transactions?account_id=${conn.account_id}&from_date=${from.toISOString().split('T')[0]}`,
      conn.customer_secret
    );
    const txList = Array.isArray(txData) ? txData : [];

    // Offene Rechnungen für Auto-Matching
    const openInv = await query(`
      SELECT d.id, d.number, d.gross_total, d.open_total,
             COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name
      FROM documents d
      LEFT JOIN customers c ON d.customer_id = c.id
      WHERE d.company_id=$1 AND d.type='invoice'
        AND d.status IN ('finalized','sent','partial_paid','overdue')
    `, [req.user.company_id]);

    let newCount = 0, matchedCount = 0;

    for (const tx of txList) {
      const txId   = String(tx.id);
      const amount = parseFloat(tx.amount || 0);
      const desc   = tx.description || tx.extra?.additional || '';
      const cName  = tx.extra?.payee || tx.extra?.payer || '';

      const exists = await query('SELECT 1 FROM bank_transactions WHERE company_id=$1 AND transaction_id=$2', [req.user.company_id, txId]);
      if (exists.rows.length > 0) continue;

      // Auto-Match
      let matchedId = null, confidence = 0;
      if (amount > 0) {
        for (const inv of openInv.rows) {
          const invAmount   = parseFloat(inv.open_total || inv.gross_total);
          const amountMatch = Math.abs(amount - invAmount) < 0.02;
          const numInDesc   = desc.toLowerCase().includes(inv.number.toLowerCase());
          const nameInDesc  = inv.customer_name && desc.toLowerCase().includes(inv.customer_name.split(' ')[0].toLowerCase());
          const score = (amountMatch ? 0.6 : 0) + (numInDesc ? 0.3 : 0) + (nameInDesc ? 0.1 : 0);
          if (score > confidence && score >= 0.6) { confidence = score; matchedId = inv.id; }
        }
      }

      await query(`
        INSERT INTO bank_transactions
          (company_id, bank_connection_id, transaction_id, booking_date, value_date,
           amount, currency, description, counterpart_name,
           matched_invoice_id, match_confidence, match_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (company_id, transaction_id) DO NOTHING
      `, [
        req.user.company_id, conn.id, txId,
        tx.made_on || new Date().toISOString().split('T')[0],
        tx.made_on || null,
        amount, tx.currency_code || 'EUR',
        desc, cName,
        matchedId, matchedId ? confidence : null,
        matchedId ? 'auto' : 'unmatched',
      ]);

      newCount++;
      if (matchedId) matchedCount++;
    }

    await query('UPDATE bank_connections SET last_synced_at=NOW() WHERE company_id=$1', [req.user.company_id]);
    res.json({ newTransactions: newCount, autoMatched: matchedCount });
  } catch(err) { next(err); }
});

// ─── Transaktionen abrufen ────────────────────────────────────────────────────
router.get('/transactions', async (req, res, next) => {
  try {
    const { limit = 30 } = req.query;
    const r = await query(`
      SELECT bt.*,
             d.number AS invoice_number,
             COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS invoice_customer
      FROM bank_transactions bt
      LEFT JOIN documents  d ON bt.matched_invoice_id = d.id
      LEFT JOIN customers  c ON d.customer_id = c.id
      WHERE bt.company_id = $1
      ORDER BY bt.booking_date DESC, bt.id DESC
      LIMIT $2
    `, [req.user.company_id, limit]);
    res.json({ data: r.rows });
  } catch(err) { next(err); }
});

// ─── Manuelle Zuordnung ───────────────────────────────────────────────────────
router.post('/transactions/:id/match', async (req, res, next) => {
  try {
    const { invoiceId } = req.body;
    if (invoiceId) {
      await query(`UPDATE bank_transactions SET matched_invoice_id=$1, match_status='manual', match_confidence=1.0 WHERE id=$2 AND company_id=$3`,
        [invoiceId, req.params.id, req.user.company_id]);
    } else {
      await query(`UPDATE bank_transactions SET matched_invoice_id=NULL, match_status='ignored', match_confidence=NULL WHERE id=$2 AND company_id=$3`,
        [req.params.id, req.user.company_id]);
    }
    res.json({ success: true });
  } catch(err) { next(err); }
});

// ─── Verbindung trennen ───────────────────────────────────────────────────────
router.delete('/connection', authorize('admin'), async (req, res, next) => {
  try {
    await query('DELETE FROM bank_connections WHERE company_id=$1', [req.user.company_id]);
    res.json({ success: true });
  } catch(err) { next(err); }
});

module.exports = router;
