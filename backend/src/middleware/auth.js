// ─── JWT Authentifizierungs-Middleware ────────────────────────────────────────
const jwt = require('jsonwebtoken');
const { query } = require('../utils/db');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  // Token aus Header ODER Query-Param (für PDF-Links via window.open)
  let token;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  } else {
    return res.status(401).json({ error: 'Kein Authentifizierungs-Token angegeben.' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Benutzer aus DB laden, um aktuelle Daten zu haben
    const result = await query(
      'SELECT id, email, name, role, company_id FROM users WHERE id = $1 AND active = true',
      [decoded.userId]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Benutzer nicht gefunden oder deaktiviert.' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token abgelaufen. Bitte neu anmelden.' });
    }
    return res.status(401).json({ error: 'Ungültiger Token.' });
  }
};

// ─── Rollenbasierte Zugriffskontrolle ─────────────────────────────────────────
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      error: `Keine Berechtigung. Benötigt: ${roles.join(' oder ')}. Ihre Rolle: ${req.user.role}`,
    });
  }
  next();
};

// ─── Audit-Log Middleware ──────────────────────────────────────────────────────
const auditLog = (aktion) => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = async (body) => {
    if (res.statusCode < 400 && body && !body.error) {
      try {
        await query(
          `INSERT INTO audit_logs (company_id, user_id, entity_type, action, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user?.company_id, req.user?.id, aktion, aktion, req.ip]
        );
      } catch (e) { /* Audit-Fehler sollen Hauptanfrage nicht blockieren */ }
    }
    return originalJson(body);
  };
  next();
};

module.exports = { authenticate, authorize, auditLog };
