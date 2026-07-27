// ─── Kundenanlagen ────────────────────────────────────────────────────────────
const router = require('express').Router();
const { query, withTransaction } = require('../utils/db');
const { nextOrderNumber } = require('../utils/orderNumber');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// ─── GET /api/equipment ───────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { customerId, status, dueSoon, search } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE e.company_id = $1';

    if (customerId) { params.push(customerId); where += ` AND e.customer_id = $${params.length}`; }
    if (status)     { params.push(status);     where += ` AND e.status = $${params.length}`; }
    if (dueSoon === 'true') {
      where += ` AND e.next_maintenance <= (CURRENT_DATE + INTERVAL '60 days')`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (e.name ILIKE $${params.length} OR e.order_number ILIKE $${params.length} OR COALESCE(c.company_name, c.first_name || ' ' || c.last_name) ILIKE $${params.length})`;
    }

    const result = await query(`
      SELECT e.*,
        COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
        c.address AS customer_address, c.city AS customer_city,
        c.phone AS customer_phone, c.email AS customer_email,
        CASE
          WHEN e.next_maintenance < CURRENT_DATE THEN 'overdue'
          WHEN e.next_maintenance <= (CURRENT_DATE + INTERVAL '30 days') THEN 'due_soon'
          ELSE 'ok'
        END AS maintenance_status
      FROM customer_equipment e
      LEFT JOIN customers c ON e.customer_id = c.id
      ${where}
      ORDER BY e.next_maintenance ASC NULLS LAST, e.name ASC
    `, params);

    res.json({ data: result.rows });
  } catch (err) { next(err); }
});

// ─── GET /api/equipment/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT e.*,
        COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
        CASE
          WHEN e.next_maintenance < CURRENT_DATE THEN 'overdue'
          WHEN e.next_maintenance <= (CURRENT_DATE + INTERVAL '30 days') THEN 'due_soon'
          ELSE 'ok'
        END AS maintenance_status
      FROM customer_equipment e
      LEFT JOIN customers c ON e.customer_id = c.id
      WHERE e.id = $1 AND e.company_id = $2
    `, [req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Anlage nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── POST /api/equipment ──────────────────────────────────────────────────────
router.post('/', authorize('admin', 'geschaeftsfuehrer', 'buchhaltung'), async (req, res, next) => {
  try {
    const {
      customerId, name, equipmentType, manufacturer, model, serialNumber,
      location, refrigerant, refrigerantAmountKg, yearBuilt, installDate,
      warrantyUntil, maintenanceIntervalMonths = 12, lastMaintenance, nextMaintenance,
      status = 'active', notes
    } = req.body;

    if (!customerId || !name) return res.status(400).json({ error: 'Kunde und Bezeichnung sind erforderlich.' });

    // Nächste Wartung automatisch berechnen wenn nicht angegeben
    let calcNextMaintenance = nextMaintenance;
    if (!calcNextMaintenance && lastMaintenance && maintenanceIntervalMonths) {
      const last = new Date(lastMaintenance);
      last.setMonth(last.getMonth() + parseInt(maintenanceIntervalMonths));
      calcNextMaintenance = last.toISOString().split('T')[0];
    }

    const result = await withTransaction(async (client) => {
      // A-Nummer generieren
      const orderNum = await nextOrderNumber(req.user.company_id, 'A', client);

      const r = await client.query(`
        INSERT INTO customer_equipment (
          company_id, customer_id, order_number, name, equipment_type,
          manufacturer, model, serial_number, location,
          refrigerant, refrigerant_amount_kg, year_built, install_date,
          warranty_until, maintenance_interval_months, last_maintenance, next_maintenance,
          status, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        RETURNING *`,
        [req.user.company_id, customerId, orderNum, name, equipmentType || null,
         manufacturer || null, model || null, serialNumber || null, location || null,
         refrigerant || null, refrigerantAmountKg || null, yearBuilt || null,
         installDate || null, warrantyUntil || null, maintenanceIntervalMonths,
         lastMaintenance || null, calcNextMaintenance || null, status, notes || null]
      );
      return r.rows[0];
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// ─── PUT /api/equipment/:id ───────────────────────────────────────────────────
router.put('/:id', authorize('admin', 'geschaeftsfuehrer', 'buchhaltung'), async (req, res, next) => {
  try {
    const {
      name, equipmentType, manufacturer, model, serialNumber, location,
      refrigerant, refrigerantAmountKg, yearBuilt, installDate, warrantyUntil,
      maintenanceIntervalMonths, lastMaintenance, nextMaintenance, status, notes
    } = req.body;

    let calcNextMaintenance = nextMaintenance;
    if (!calcNextMaintenance && lastMaintenance && maintenanceIntervalMonths) {
      const last = new Date(lastMaintenance);
      last.setMonth(last.getMonth() + parseInt(maintenanceIntervalMonths));
      calcNextMaintenance = last.toISOString().split('T')[0];
    }

    const r = await query(`
      UPDATE customer_equipment SET
        name=$1, equipment_type=$2, manufacturer=$3, model=$4, serial_number=$5,
        location=$6, refrigerant=$7, refrigerant_amount_kg=$8, year_built=$9,
        install_date=$10, warranty_until=$11, maintenance_interval_months=$12,
        last_maintenance=$13, next_maintenance=$14, status=$15, notes=$16, updated_at=NOW()
      WHERE id=$17 AND company_id=$18 RETURNING *`,
      [name, equipmentType || null, manufacturer || null, model || null, serialNumber || null,
       location || null, refrigerant || null, refrigerantAmountKg || null, yearBuilt || null,
       installDate || null, warrantyUntil || null, maintenanceIntervalMonths || 12,
       lastMaintenance || null, calcNextMaintenance || null, status || 'active',
       notes || null, req.params.id, req.user.company_id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Anlage nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── DELETE /api/equipment/:id ────────────────────────────────────────────────
router.delete('/:id', authorize('admin', 'geschaeftsfuehrer'), async (req, res, next) => {
  try {
    await query('DELETE FROM customer_equipment WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
