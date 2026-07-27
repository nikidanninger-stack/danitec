// ─── Wartungsverträge ─────────────────────────────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { nextOrderNumber } = require('../utils/orderNumber');

router.use(authenticate);

// ─── GET /api/maintenance-contracts ──────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { customerId, status, dueSoon } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE mc.company_id = $1';

    if (customerId) { params.push(customerId); where += ` AND mc.customer_id = $${params.length}`; }
    if (status)     { params.push(status);     where += ` AND mc.status = $${params.length}`; }
    if (dueSoon === 'true') {
      where += ` AND mc.next_service_date <= (CURRENT_DATE + INTERVAL '60 days') AND mc.status = 'active'`;
    }

    const result = await query(`
      SELECT mc.*,
        COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
        u.name AS technician_name_user,
        CASE
          WHEN mc.next_service_date < CURRENT_DATE THEN 'overdue'
          WHEN mc.next_service_date <= (CURRENT_DATE + INTERVAL '30 days') THEN 'due_soon'
          ELSE 'ok'
        END AS service_status
      FROM maintenance_contracts mc
      LEFT JOIN customers c ON mc.customer_id = c.id
      LEFT JOIN users u ON mc.technician_id = u.id
      ${where}
      ORDER BY mc.next_service_date ASC NULLS LAST, mc.name ASC
    `, params);

    res.json({ data: result.rows });
  } catch (err) { next(err); }
});

// ─── GET /api/maintenance-contracts/:id ──────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT mc.*,
        COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
        c.email AS customer_email, c.phone AS customer_phone,
        c.address AS customer_address, c.city AS customer_city,
        u.name AS technician_name_user,
        CASE
          WHEN mc.next_service_date < CURRENT_DATE THEN 'overdue'
          WHEN mc.next_service_date <= (CURRENT_DATE + INTERVAL '30 days') THEN 'due_soon'
          ELSE 'ok'
        END AS service_status
      FROM maintenance_contracts mc
      LEFT JOIN customers c ON mc.customer_id = c.id
      LEFT JOIN users u ON mc.technician_id = u.id
      WHERE mc.id = $1 AND mc.company_id = $2
    `, [req.params.id, req.user.company_id]);

    if (!r.rows[0]) return res.status(404).json({ error: 'Wartungsvertrag nicht gefunden.' });

    // Anlagen für diesen Vertrag laden
    const contract = r.rows[0];
    const equipIds = contract.equipment_ids || [];
    let equipment = [];
    if (equipIds.length > 0) {
      const eq = await query(`
        SELECT id, name, equipment_type, manufacturer, model, serial_number, location, refrigerant, next_maintenance
        FROM customer_equipment
        WHERE id = ANY($1::int[]) AND company_id = $2
      `, [equipIds, req.user.company_id]);
      equipment = eq.rows;
    }

    res.json({ ...contract, equipment });
  } catch (err) { next(err); }
});

// ─── POST /api/maintenance-contracts ─────────────────────────────────────────
router.post('/', authorize('admin', 'geschaeftsfuehrer', 'buchhaltung'), async (req, res, next) => {
  try {
    const {
      customerId, name, description, status = 'active',
      contractStart, contractEnd, intervalMonths = 12,
      pricePerService, priceYearly, lastServiceDate, nextServiceDate,
      equipmentIds = [], technicianId, notes, referenceNumber
    } = req.body;

    if (!customerId || !name) return res.status(400).json({ error: 'Kunde und Bezeichnung sind erforderlich.' });

    // Vertragsnummer generieren
    const seqR = await query(`
      UPDATE company_settings SET next_maintenance_contract_seq = next_maintenance_contract_seq + 1
      WHERE company_id = $1
      RETURNING maintenance_contract_prefix, next_maintenance_contract_seq - 1 AS seq
    `, [req.user.company_id]);
    const { maintenance_contract_prefix: prefix, seq } = seqR.rows[0] || { maintenance_contract_prefix: 'WV', seq: 1 };
    const contractNumber = `${prefix}-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

    // Nächsten Servicetermin berechnen falls nicht angegeben
    let calcNext = nextServiceDate;
    if (!calcNext && lastServiceDate) {
      const d = new Date(lastServiceDate);
      d.setMonth(d.getMonth() + parseInt(intervalMonths));
      calcNext = d.toISOString().split('T')[0];
    } else if (!calcNext && contractStart) {
      const d = new Date(contractStart);
      d.setMonth(d.getMonth() + parseInt(intervalMonths));
      calcNext = d.toISOString().split('T')[0];
    }

    const orderNum = req.body.orderNumber || await nextOrderNumber(req.user.company_id, 'W');

    const r = await query(`
      INSERT INTO maintenance_contracts (
        company_id, contract_number, order_number, customer_id, name, description, status,
        contract_start, contract_end, interval_months, price_per_service, price_yearly,
        last_service_date, next_service_date, equipment_ids, technician_id, notes, reference_number, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *
    `, [
      req.user.company_id, contractNumber, orderNum, customerId, name, description || null, status,
      contractStart || null, contractEnd || null, intervalMonths,
      pricePerService || null, priceYearly || null,
      lastServiceDate || null, calcNext || null,
      JSON.stringify(equipmentIds), technicianId || null, notes || null, referenceNumber || null, req.user.id
    ]);

    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── PUT /api/maintenance-contracts/:id ──────────────────────────────────────
router.put('/:id', authorize('admin', 'geschaeftsfuehrer', 'buchhaltung'), async (req, res, next) => {
  try {
    const {
      name, description, status, contractStart, contractEnd,
      intervalMonths, pricePerService, priceYearly,
      lastServiceDate, nextServiceDate, equipmentIds, technicianId, notes, referenceNumber
    } = req.body;

    let calcNext = nextServiceDate;
    if (!calcNext && lastServiceDate && intervalMonths) {
      const d = new Date(lastServiceDate);
      d.setMonth(d.getMonth() + parseInt(intervalMonths));
      calcNext = d.toISOString().split('T')[0];
    }

    const r = await query(`
      UPDATE maintenance_contracts SET
        name=$1, description=$2, status=$3,
        contract_start=$4, contract_end=$5, interval_months=$6,
        price_per_service=$7, price_yearly=$8,
        last_service_date=$9, next_service_date=$10,
        equipment_ids=$11, technician_id=$12, notes=$13, reference_number=$14, updated_at=NOW()
      WHERE id=$15 AND company_id=$16 RETURNING *
    `, [
      name, description || null, status || 'active',
      contractStart || null, contractEnd || null, intervalMonths || 12,
      pricePerService || null, priceYearly || null,
      lastServiceDate || null, calcNext || null,
      JSON.stringify(equipmentIds || []), technicianId || null, notes || null, referenceNumber || null,
      req.params.id, req.user.company_id
    ]);

    if (!r.rows[0]) return res.status(404).json({ error: 'Wartungsvertrag nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── POST /api/maintenance-contracts/:id/record-service ──────────────────────
// Wartung als durchgeführt markieren → next_service_date weitersetzen
router.post('/:id/record-service', authorize('admin', 'geschaeftsfuehrer', 'buchhaltung', 'techniker'), async (req, res, next) => {
  try {
    const { serviceDate, notes } = req.body;
    const date = serviceDate || new Date().toISOString().split('T')[0];

    // Vertrag laden um Intervall zu kennen
    const existing = await query(
      'SELECT * FROM maintenance_contracts WHERE id=$1 AND company_id=$2',
      [req.params.id, req.user.company_id]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Wartungsvertrag nicht gefunden.' });

    const { interval_months } = existing.rows[0];
    const d = new Date(date);
    d.setMonth(d.getMonth() + interval_months);
    const nextDate = d.toISOString().split('T')[0];

    const r = await query(`
      UPDATE maintenance_contracts SET
        last_service_date=$1, next_service_date=$2, updated_at=NOW(),
        notes=CASE WHEN $3::text IS NOT NULL THEN $3 ELSE notes END
      WHERE id=$4 AND company_id=$5 RETURNING *
    `, [date, nextDate, notes || null, req.params.id, req.user.company_id]);

    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── DELETE /api/maintenance-contracts/:id ────────────────────────────────────
router.delete('/:id', authorize('admin', 'geschaeftsfuehrer'), async (req, res, next) => {
  try {
    await query('DELETE FROM maintenance_contracts WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
