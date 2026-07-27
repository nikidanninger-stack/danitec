// ─── Auth Routen ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query, withTransaction } = require('../utils/db');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/register – Erstregistrierung (Firma + Admin-User)
router.post('/register', [
  body('companyName').trim().notEmpty().withMessage('Firmenname erforderlich'),
  body('email').isEmail().normalizeEmail().withMessage('Gültige E-Mail erforderlich'),
  body('password').isLength({ min: 8 }).withMessage('Passwort mindestens 8 Zeichen'),
  body('name').trim().notEmpty().withMessage('Name erforderlich'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { companyName, email, password, name, uidNumber } = req.body;
  try {
    // Prüfen ob E-Mail bereits vorhanden
    const exists = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'E-Mail bereits registriert.' });
    }

    const result = await withTransaction(async (client) => {
      // Firma anlegen
      const companyRes = await client.query(
        `INSERT INTO companies (name, uid_number) VALUES ($1, $2) RETURNING id`,
        [companyName, uidNumber || null]
      );
      const companyId = companyRes.rows[0].id;

      // Standard-Einstellungen anlegen
      await client.query(
        `INSERT INTO company_settings (company_id) VALUES ($1)`,
        [companyId]
      );

      // Admin-User anlegen
      const hash = await bcrypt.hash(password, 12);
      const userRes = await client.query(
        `INSERT INTO users (company_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, 'admin') RETURNING id, email, name, role`,
        [companyId, email, hash, name]
      );
      return { company: { id: companyId, name: companyName }, user: userRes.rows[0] };
    });

    const token = jwt.sign(
      { userId: result.user.id, companyId: result.company.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({ token, user: result.user, company: result.company });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const result = await query(
      `SELECT u.id, u.email, u.name, u.role, u.password_hash, u.company_id, u.active,
              c.name AS company_name
       FROM users u JOIN companies c ON u.company_id = c.id
       WHERE u.email = $1`,
      [email]
    );
    const user = result.rows[0];
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Ungültige Anmeldedaten.' });

    // Letzten Login aktualisieren
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { userId: user.id, companyId: user.company_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      company: { id: user.company_id, name: user.company_name },
    });
  } catch (err) { next(err); }
});

// GET /api/auth/me – Aktuellen Benutzer abrufen
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout (Token wird clientseitig gelöscht, hier nur Log)
router.post('/logout', authenticate, async (req, res) => {
  res.json({ message: 'Erfolgreich abgemeldet.' });
});

// ─── GET /api/auth/users ── Alle Benutzer der Firma (für Dropdowns) ────────────
router.get('/users', authenticate, async (req, res, next) => {
  try {
    const r = await query(
      'SELECT id, name, email, role FROM users WHERE company_id=$1 AND active=TRUE ORDER BY name',
      [req.user.company_id]
    );
    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

module.exports = router;
