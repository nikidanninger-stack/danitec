// offers.js
const offerRouter = require('express').Router();
const { query, withTransaction } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { nextOrderNumber } = require('../utils/orderNumber');

offerRouter.use(authenticate);

offerRouter.get('/', async (req,res,next) => {
  try {
    const { search, orderNumber } = req.query;
    let where = 'WHERE d.company_id=$1 AND d.type=\'offer\'';
    const params = [req.user.company_id];
    if (orderNumber) { params.push(orderNumber); where += ` AND d.order_number=$${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (d.number ILIKE $${params.length} OR d.order_number ILIKE $${params.length} OR c.company_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length})`;
    }
    const r = await query(`SELECT d.*,od.offer_status,od.valid_until,COALESCE(c.company_name,c.first_name||' '||c.last_name) AS customer_name,c.email AS customer_email FROM documents d JOIN offer_details od ON od.document_id=d.id LEFT JOIN customers c ON d.customer_id=c.id ${where} ORDER BY d.document_date DESC`, params);
    res.json({ data: r.rows });
  } catch(err) { next(err); }
});

offerRouter.post('/', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req,res,next) => {
  try {
    const r = await withTransaction(async (client) => {
      const sq = await client.query('SELECT offer_prefix,next_offer_seq FROM company_settings WHERE company_id=$1 FOR UPDATE',[req.user.company_id]);
      const nr = `${sq.rows[0].offer_prefix}-${new Date().getFullYear()}-${String(sq.rows[0].next_offer_seq).padStart(4,'0')}`;
      await client.query('UPDATE company_settings SET next_offer_seq=next_offer_seq+1 WHERE company_id=$1',[req.user.company_id]);

      // A-Nummer generieren (wenn nicht mitgegeben)
      const orderNum = req.body.orderNumber || await nextOrderNumber(req.user.company_id, 'A', client);

      const { customerId,documentDate,validUntil,subject,netTotal=0,vatTotal=0,grossTotal=0,positions=[] } = req.body;
      const doc = await client.query(
        `INSERT INTO documents (company_id,type,number,order_number,status,customer_id,document_date,due_date,subject,net_total,vat_total,gross_total,created_by)
         VALUES ($1,'offer',$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [req.user.company_id,nr,orderNum,customerId||null,documentDate,validUntil||null,subject||null,netTotal,vatTotal,grossTotal,req.user.id]);
      const docId = doc.rows[0].id;
      await client.query('INSERT INTO offer_details (document_id,offer_status,valid_until) VALUES ($1,$2,$3)',[docId,'draft',validUntil||null]);
      for(let i=0;i<positions.length;i++) {
        const p=positions[i];
        await client.query(
          `INSERT INTO document_items (document_id,position_number,product_id,description,quantity,unit,unit_price_net,vat_rate,net_amount,vat_amount,gross_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [docId,i+1,p.product_id||null,p.description,p.quantity,p.unit,p.unit_price_net,p.vat_rate,p.net_amount,p.vat_amount,p.gross_amount]);
      }
      return doc.rows[0];
    });
    res.status(201).json(r);
  } catch(err) { next(err); }
});

offerRouter.post('/:id/send', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req,res,next) => {
  try {
    await query('UPDATE offer_details SET offer_status=$1 WHERE document_id=$2',['sent', req.params.id]);
    await query('UPDATE documents SET status=$1, sent_at=NOW() WHERE id=$2',['sent', req.params.id]);
    res.json({ message: 'Angebot als versendet markiert.' });
  } catch(err) { next(err); }
});

offerRouter.post('/:id/accept', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req,res,next) => {
  try {
    await query('UPDATE offer_details SET offer_status=$1 WHERE document_id=$2',['accepted', req.params.id]);
    await query('UPDATE documents SET status=$1 WHERE id=$2',['accepted', req.params.id]);
    res.json({ message: 'Angebot als angenommen markiert.' });
  } catch(err) { next(err); }
});

offerRouter.post('/:id/reject', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req,res,next) => {
  try {
    await query('UPDATE offer_details SET offer_status=$1 WHERE document_id=$2',['rejected', req.params.id]);
    await query('UPDATE documents SET status=$1 WHERE id=$2',['rejected', req.params.id]);
    res.json({ message: 'Angebot als abgelehnt markiert.' });
  } catch(err) { next(err); }
});

offerRouter.post('/:id/convert-to-invoice', authorize('admin','geschaeftsfuehrer'), async (req,res,next) => {
  try {
    const r = await withTransaction(async (client) => {
      const offer = await client.query(`SELECT d.*,od.valid_until FROM documents d JOIN offer_details od ON od.document_id=d.id WHERE d.id=$1 AND d.company_id=$2`,[req.params.id,req.user.company_id]);
      if (!offer.rows[0]) throw { status:404, message:'Angebot nicht gefunden.' };
      const o = offer.rows[0];
      const sq = await client.query('SELECT invoice_prefix,next_invoice_seq,COALESCE(invoice_year,EXTRACT(YEAR FROM NOW())::int) AS invoice_year FROM company_settings WHERE company_id=$1 FOR UPDATE',[req.user.company_id]);
      const curYear = new Date().getFullYear();
      let seq = parseInt(sq.rows[0].next_invoice_seq);
      if (curYear !== parseInt(sq.rows[0].invoice_year)) {
        seq = 1;
        await client.query('UPDATE company_settings SET next_invoice_seq=1,invoice_year=$1 WHERE company_id=$2',[curYear,req.user.company_id]);
      }
      const nr = `${sq.rows[0].invoice_prefix}-${curYear}-${String(seq).padStart(4,'0')}`;
      await client.query('UPDATE company_settings SET next_invoice_seq=next_invoice_seq+1 WHERE company_id=$1',[req.user.company_id]);
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now()+14*86400000).toISOString().split('T')[0];
      // A-Nummer vom Angebot auf Rechnung übernehmen
      const inv = await client.query(
        `INSERT INTO documents (company_id,type,number,order_number,status,locked,customer_id,document_date,due_date,subject,net_total,vat_total,gross_total,finalized_at,created_by)
         VALUES ($1,'invoice',$2,$3,'finalized',TRUE,$4,$5,$6,$7,$8,$9,$10,NOW(),$11) RETURNING *`,
        [req.user.company_id,nr,o.order_number,o.customer_id,today,dueDate,o.subject,o.net_total,o.vat_total,o.gross_total,req.user.id]);
      const invId = inv.rows[0].id;
      const items = await client.query('SELECT * FROM document_items WHERE document_id=$1 ORDER BY position_number',[req.params.id]);
      for(const item of items.rows) {
        await client.query(
          `INSERT INTO document_items (document_id,position_number,product_id,description,quantity,unit,unit_price_net,discount_percent,vat_rate,net_amount,vat_amount,gross_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [invId,item.position_number,item.product_id,item.description,item.quantity,item.unit,item.unit_price_net,item.discount_percent,item.vat_rate,item.net_amount,item.vat_amount,item.gross_amount]);
      }
      await client.query('UPDATE offer_details SET offer_status=$1,converted_to_id=$2,converted_at=NOW() WHERE document_id=$3',['converted',invId,req.params.id]);
      return { offer: o, invoice: inv.rows[0] };
    });
    res.json(r);
  } catch(err) { next(err); }
});

module.exports = offerRouter;
