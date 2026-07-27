// ─── Utility-Funktionen (keine React-Komponenten) ────────────────────────────
import api from '../api/client';

export const DEFAULT_UST = 0.20;

export const fmt = (n) =>
  typeof n === 'number'
    ? n.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })
    : '–';

export const fmtPct = (n) => `${(n * 100).toFixed(1)} %`;

export function calcPos(p) {
  const ekGes    = p.aktiv ? p.menge * p.ek : 0;
  const vkJe     = p.ek * (1 + p.aufschlag);
  const vkGes    = p.aktiv ? p.menge * vkJe : 0;
  const ust      = vkGes * DEFAULT_UST;
  const vkBrutto = vkGes * (1 + DEFAULT_UST);
  return { ekGes, vkJe, vkGes, ust, vkBrutto };
}

export async function saveAsAngebot({ positionen, arbeit, projekt, datum, typ, customerId, validUntil: givenValidUntil, betreff }) {
  const today      = datum || new Date().toISOString().slice(0, 10);
  const validUntil = givenValidUntil || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const items = [];
  let posNr = 1;
  positionen.filter(p => p.aktiv).forEach(p => {
    const vkJe    = p.ek * (1 + p.aufschlag);
    const vkGes   = p.menge * vkJe;
    const ustBetrag = vkGes * DEFAULT_UST;
    items.push({
      position_number: posNr++,
      description: p.name,
      quantity: p.menge,
      unit: p.einheit,
      unit_price_net: parseFloat(vkJe.toFixed(4)),
      vat_rate: DEFAULT_UST,
      net_amount: parseFloat(vkGes.toFixed(2)),
      vat_amount: parseFloat(ustBetrag.toFixed(2)),
      gross_amount: parseFloat((vkGes + ustBetrag).toFixed(2)),
    });
  });

  if (arbeit && arbeit.stunden > 0) {
    const label = arbeit.techniker
      ? `Montage / Arbeitszeit – ${arbeit.techniker} (${arbeit.stunden}h × €${arbeit.stundensatz}/h)`
      : `Montage / Arbeitszeit (${arbeit.stunden}h × €${arbeit.stundensatz}/h)`;
    const netAmount = arbeit.betragNetto;
    const vatAmount = netAmount * DEFAULT_UST;
    items.push({
      position_number: posNr++,
      description: label + (arbeit.hinweis ? `\n${arbeit.hinweis}` : ''),
      quantity: arbeit.stunden,
      unit: 'h',
      unit_price_net: arbeit.stundensatz,
      vat_rate: DEFAULT_UST,
      net_amount: parseFloat(netAmount.toFixed(2)),
      vat_amount: parseFloat(vatAmount.toFixed(2)),
      gross_amount: parseFloat((netAmount + vatAmount).toFixed(2)),
    });
  }

  const netTotal   = items.reduce((s, i) => s + i.net_amount, 0);
  const vatTotal   = items.reduce((s, i) => s + i.vat_amount, 0);
  const grossTotal = items.reduce((s, i) => s + i.gross_amount, 0);
  const subject    = betreff || `${typ || 'Kalkulation'}${projekt ? ` – ${projekt}` : ''}`;

  return await api.createOffer({
    customerId:   customerId || null,
    documentDate: today,
    validUntil,
    subject,
    netTotal:   parseFloat(netTotal.toFixed(2)),
    vatTotal:   parseFloat(vatTotal.toFixed(2)),
    grossTotal: parseFloat(grossTotal.toFixed(2)),
    positions:  items,
  });
}

export function druckAngebot({ positionen, arbeit, projekt, datum, typ, totals }) {
  const today = datum || new Date().toISOString().slice(0, 10);
  const arbeitNetto  = arbeit ? arbeit.betragNetto : 0;
  const arbeitBrutto = arbeitNetto * (1 + DEFAULT_UST);
  const gesamtNetto  = totals.vkNetto + arbeitNetto;
  const gesamtUst    = totals.ust + arbeitNetto * DEFAULT_UST;
  const gesamtBrutto = totals.vkBrutto + arbeitBrutto;

  const rows = positionen.filter(p => p.aktiv).map(p => {
    const vkJe  = p.ek * (1 + p.aufschlag);
    const vkGes = p.menge * vkJe;
    return `<tr>
      <td>${p.kat || ''}</td>
      <td>${p.name}</td>
      <td style="text-align:right">${p.menge} ${p.einheit}</td>
      <td style="text-align:right">${fmt(vkJe)}</td>
      <td style="text-align:right">${fmt(vkGes)}</td>
      <td style="text-align:right">${fmt(vkGes * (1 + DEFAULT_UST))}</td>
    </tr>`;
  }).join('');

  const arbeitRow = arbeit && arbeit.stunden > 0 ? `<tr style="background:#f0f9ff">
    <td><strong>Arbeitszeit</strong></td>
    <td>${arbeit.techniker ? `${arbeit.techniker} – ` : ''}Montage &amp; Installation${arbeit.hinweis ? `<br><small>${arbeit.hinweis}</small>` : ''}</td>
    <td style="text-align:right">${arbeit.stunden} h</td>
    <td style="text-align:right">${fmt(arbeit.stundensatz)}/h</td>
    <td style="text-align:right">${fmt(arbeitNetto)}</td>
    <td style="text-align:right">${fmt(arbeitBrutto)}</td>
  </tr>` : '';

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<title>Angebot – ${projekt || typ || 'Kalkulation'}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #18181b; background: #fff; }
  .page { max-width: 800px; margin: 0 auto; padding: 30px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 3px solid #152248; }
  .company-name { font-size: 22px; font-weight: 700; color: #152248; }
  .company-sub  { font-size: 11px; color: #666; margin-top: 3px; }
  .doc-title { font-size: 18px; font-weight: 700; color: #2D9CDB; }
  .doc-date  { font-size: 11px; color: #666; margin-top: 4px; }
  .kunde-box { background: #f4f5f7; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; }
  .kunde-label { font-size: 10px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px; }
  .kunde-name { font-size: 14px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead th { background: #152248; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; }
  thead th:last-child, thead th:nth-last-child(-n+2) { text-align: right; }
  tbody td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f9fafb; }
  tbody td:last-child, tbody td:nth-last-child(-n+2) { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 300px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
  .totals-row { display: flex; justify-content: space-between; padding: 7px 14px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
  .totals-row:last-child { border-bottom: none; background: #152248; color: #fff; font-weight: 700; font-size: 15px; }
  .totals-row.ust { color: #854f0b; }
  .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #888; display: flex; justify-content: space-between; }
  @media print { body { padding: 0; } .page { padding: 15px; } }
</style>
</head>
<body><div class="page">
  <div class="header">
    <div>
      <div class="company-name">DANITEC</div>
      <div class="company-sub">Kälte &amp; Klimatechnik</div>
    </div>
    <div style="text-align:right">
      <div class="doc-title">ANGEBOT</div>
      <div class="doc-date">Datum: ${today}</div>
      <div class="doc-date">Gültig bis: ${new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)}</div>
    </div>
  </div>
  <div class="kunde-box">
    <div class="kunde-label">Projekt / Kunde</div>
    <div class="kunde-name">${projekt || '–'}</div>
    <div style="font-size:11px;color:#666;margin-top:3px;">${typ || ''}</div>
  </div>
  <table>
    <thead><tr>
      <th style="width:110px">Kategorie</th><th>Beschreibung</th>
      <th style="text-align:right;width:70px">Menge</th>
      <th style="text-align:right;width:90px">VK netto/Stk.</th>
      <th style="text-align:right;width:90px">VK netto ges.</th>
      <th style="text-align:right;width:100px">VK brutto ges.</th>
    </tr></thead>
    <tbody>${rows}${arbeitRow}</tbody>
  </table>
  <div class="totals">
    <div class="totals-row"><span>Netto gesamt</span><span>${fmt(gesamtNetto)}</span></div>
    <div class="totals-row ust"><span>USt. 20 %</span><span>${fmt(gesamtUst)}</span></div>
    <div class="totals-row"><span>GESAMT BRUTTO</span><span>${fmt(gesamtBrutto)}</span></div>
  </div>
  <div class="footer">
    <div>Alle Preise in EUR inkl. 20% MwSt. | Angebot freibleibend</div>
    <div>DANITEC Kälte &amp; Klimatechnik | danitec.com</div>
  </div>
</div></body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}
