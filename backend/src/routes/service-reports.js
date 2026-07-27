// ─── Serviceberichte API ──────────────────────────────────────────────────────
const router = require('express').Router();
const { query, withTransaction } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { nextOrderNumber } = require('../utils/orderNumber');

router.use(authenticate);

// ─── GET /api/service-reports ─────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { customerId, status, from, to } = req.query;
    let where = 'WHERE sr.company_id=$1';
    const params = [req.user.company_id];
    if (customerId) { params.push(customerId); where += ` AND sr.customer_id=$${params.length}`; }
    if (status)     { params.push(status);     where += ` AND sr.status=$${params.length}`; }
    if (from)       { params.push(from);        where += ` AND sr.report_date>=$${params.length}`; }
    if (to)         { params.push(to);          where += ` AND sr.report_date<=$${params.length}`; }

    const r = await query(`
      SELECT sr.*,
        COALESCE(c.company_name, c.first_name||' '||c.last_name) AS customer_name,
        e.name AS equipment_name, e.equipment_type,
        p.name AS project_name,
        u.name AS technician_user_name
      FROM service_reports sr
      LEFT JOIN customers c         ON sr.customer_id  = c.id
      LEFT JOIN customer_equipment e ON sr.equipment_id = e.id
      LEFT JOIN projects p           ON sr.project_id   = p.id
      LEFT JOIN users u              ON sr.technician_id = u.id
      ${where}
      ORDER BY sr.report_date DESC, sr.id DESC`, params);

    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

// ─── GET /api/service-reports/:id ────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT sr.*,
        COALESCE(c.company_name, c.first_name||' '||c.last_name) AS customer_name,
        c.address AS customer_address, c.zip AS customer_zip, c.city AS customer_city,
        c.email AS customer_email, c.phone AS customer_phone,
        e.name AS equipment_name, e.equipment_type, e.manufacturer, e.model,
        e.serial_number, e.refrigerant, e.location AS equipment_location,
        p.name AS project_name,
        u.name AS technician_user_name,
        co.name AS company_name_full, co.address AS company_address,
        co.zip AS company_zip, co.city AS company_city,
        co.phone AS company_phone, co.email AS company_email,
        co.uid_number, co.logo_path
      FROM service_reports sr
      LEFT JOIN customers c           ON sr.customer_id  = c.id
      LEFT JOIN customer_equipment e  ON sr.equipment_id = e.id
      LEFT JOIN projects p            ON sr.project_id   = p.id
      LEFT JOIN users u               ON sr.technician_id = u.id
      LEFT JOIN companies co          ON sr.company_id   = co.id
      WHERE sr.id=$1 AND sr.company_id=$2`, [req.params.id, req.user.company_id]);

    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── POST /api/service-reports ───────────────────────────────────────────────
router.post('/', authorize('admin','geschaeftsfuehrer','buchhaltung','techniker'), async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const sq = await client.query(
        'SELECT service_report_prefix, next_service_report_seq FROM company_settings WHERE company_id=$1 FOR UPDATE',
        [req.user.company_id]);
      const prefix = sq.rows[0]?.service_report_prefix || 'SB';
      const seq    = sq.rows[0]?.next_service_report_seq || 1;
      const nr     = `${prefix}-${new Date().getFullYear()}-${String(seq).padStart(4,'0')}`;
      await client.query('UPDATE company_settings SET next_service_report_seq=next_service_report_seq+1 WHERE company_id=$1', [req.user.company_id]);

      const {
        customerId, equipmentId, projectId, reportDate, technicianId, technicianName,
        reportType='service', workPerformed, defectsFound, recommendations,
        materialsUsed=[], hoursWorked=0, travelHours=0,
        timeFrom, timeTo,
        status='draft', signatureData, signatureName, photos=[], internalNotes,
        orderNumber,
      } = req.body;

      // S-Nummer für Serviceberichte (wenn nicht mitgegeben)
      const orderNum = orderNumber || await nextOrderNumber(req.user.company_id, 'S', client);

      const r = await client.query(`
        INSERT INTO service_reports (
          company_id, report_number, order_number, customer_id, equipment_id, project_id,
          report_date, technician_id, technician_name, report_type,
          work_performed, defects_found, recommendations,
          materials_used, hours_worked, travel_hours,
          time_from, time_to,
          status, signature_data, signature_name, photos, internal_notes, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
        RETURNING *`,
        [req.user.company_id, nr, orderNum, customerId||null, equipmentId||null, projectId||null,
         reportDate||new Date().toISOString().split('T')[0],
         technicianId||null, technicianName||null, reportType,
         workPerformed||null, defectsFound||null, recommendations||null,
         JSON.stringify(materialsUsed), hoursWorked, travelHours,
         timeFrom||null, timeTo||null,
         status, signatureData||null, signatureName||null,
         JSON.stringify(photos), internalNotes||null, req.user.id]);
      return r.rows[0];
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// ─── PUT /api/service-reports/:id ────────────────────────────────────────────
router.put('/:id', authorize('admin','geschaeftsfuehrer','buchhaltung','techniker'), async (req, res, next) => {
  try {
    const {
      customerId, equipmentId, projectId, reportDate, technicianId, technicianName,
      reportType, workPerformed, defectsFound, recommendations,
      materialsUsed, hoursWorked, travelHours,
      timeFrom, timeTo,
      status, signatureData, signatureName, photos, internalNotes,
    } = req.body;

    const r = await query(`
      UPDATE service_reports SET
        customer_id=$1, equipment_id=$2, project_id=$3, report_date=$4,
        technician_id=$5, technician_name=$6, report_type=$7,
        work_performed=$8, defects_found=$9, recommendations=$10,
        materials_used=$11, hours_worked=$12, travel_hours=$13,
        time_from=$14, time_to=$15,
        status=$16, signature_data=$17, signature_name=$18,
        photos=$19, internal_notes=$20, updated_at=NOW()
      WHERE id=$21 AND company_id=$22 RETURNING *`,
      [customerId||null, equipmentId||null, projectId||null,
       reportDate, technicianId||null, technicianName||null, reportType||'service',
       workPerformed||null, defectsFound||null, recommendations||null,
       JSON.stringify(materialsUsed||[]), hoursWorked||0, travelHours||0,
       timeFrom||null, timeTo||null,
       status||'draft', signatureData||null, signatureName||null,
       JSON.stringify(photos||[]), internalNotes||null,
       req.params.id, req.user.company_id]);

    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── DELETE /api/service-reports/:id ─────────────────────────────────────────
router.delete('/:id', authorize('admin','geschaeftsfuehrer'), async (req, res, next) => {
  try {
    await query('DELETE FROM service_reports WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ message: 'Servicebericht gelöscht.' });
  } catch (err) { next(err); }
});

// ─── POST /api/service-reports/:id/complete ──────────────────────────────────
router.post('/:id/complete', authorize('admin','geschaeftsfuehrer','buchhaltung','techniker'), async (req, res, next) => {
  try {
    await query('UPDATE service_reports SET status=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3',
      ['completed', req.params.id, req.user.company_id]);
    res.json({ message: 'Bericht abgeschlossen.' });
  } catch (err) { next(err); }
});

module.exports = router;
