// ─── Anlagenverzeichnis API ────────────────────────────────────────────────────
const router = require('express').Router();
const { query } = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);

function calcAfa(nettoKP, nutzungJahre, methode) {
  if (methode === 'linear')    return Math.round(nettoKP / nutzungJahre * 100) / 100;
  if (methode === 'degressive') return Math.round(nettoKP * (2 / nutzungJahre) * 100) / 100;
  return 0;
}

router.get('/', async (req, res, next) => {
  try {
    const r = await query(`SELECT * FROM assets WHERE company_id=$1 ORDER BY purchase_date DESC`, [req.user.company_id]);
    res.json({ data: r.rows });
  } catch (err) { next(err); }
});

router.post('/', authorize('admin','geschaeftsfuehrer','buchhaltung'), async (req, res, next) => {
  try {
    const countRes = await query('SELECT COUNT(*)+1 AS seq FROM assets WHERE company_id=$1', [req.user.company_id]);
    const nr = `ANL-${String(parseInt(countRes.rows[0].seq)).padStart(4,'0')}`;
    const { name,supplierName,purchaseDate,startUseDate,purchaseGrossAmount,vatRate=20,usefulLifeYears=5,depreciationMethod='linear',location,notes } = req.body;
    const gross  = parseFloat(purchaseGrossAmount)||0;
    const vat    = parseFloat(vatRate)||0;
    const netto  = vat > 0 ? Math.round(gross/(1+vat/100)*100)/100 : gross;
    const ustBetrag = Math.round((gross-netto)*100)/100;
    const afa    = calcAfa(netto, usefulLifeYears, depreciationMethod);
    const r = await query(`
      INSERT INTO assets (company_id,asset_number,name,supplier_name,purchase_date,start_use_date,purchase_net_amount,vat_amount,purchase_gross_amount,useful_life_years,depreciation_method,annual_depreciation,book_value,location,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [req.user.company_id,nr,name,supplierName||null,purchaseDate,startUseDate||purchaseDate,netto,ustBetrag,gross,usefulLifeYears,depreciationMethod,afa,netto,location||null,notes||null]);
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
