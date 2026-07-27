// ─── PDF-Generator für Rechnungen, Angebote, Mahnungen ───────────────────────
// Erzeugt professionelle PDFs nach österreichischem Recht (UGB/UStG)
// Nutzt Puppeteer (Headless Chrome)

const fs = require('fs');
const path = require('path');

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(n || 0);
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const esc = (s) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─── HTML-Template für Rechnung / Angebot ─────────────────────────────────────
function buildDocumentHtml(doc, company, settings) {
  const isInvoice = doc.type === 'invoice';
  const isOffer   = doc.type === 'offer';
  const accentColor = settings?.invoice_color || '#185fa5';

  // Logo laden – weißen Hintergrund via SVG-Filter entfernen (kein Extra-Package nötig)
  let logoHtml = `<span class="logo-text">${esc(company.name)}</span>`;
  if (company.logo_path && fs.existsSync(company.logo_path)) {
    try {
      const logoRaw = fs.readFileSync(company.logo_path).toString('base64');
      const ext     = path.extname(company.logo_path).toLowerCase().replace('.', '');
      const mime    = ext === 'png' ? 'image/png' : 'image/jpeg';
      // SVG-Filter macht weiße Pixel transparent (Chromium/Puppeteer unterstützt filter:url(#id))
      logoHtml = `
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden">
  <defs>
    <filter id="rm-white">
      <feColorMatrix type="matrix"
        values="1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
               -1 -1 -1 3 0"/>
    </filter>
  </defs>
</svg>
<img src="data:${mime};base64,${logoRaw}"
  style="max-height:85px;max-width:270px;object-fit:contain;filter:url(#rm-white);"
  alt="${esc(company.name)}"/>`;
    } catch(_) {}
  }

  // Briefpapier als Hintergrundbild (wenn hochgeladen)
  let letterheadStyle = '';
  if (company.letterhead_path && fs.existsSync(company.letterhead_path)) {
    try {
      const lhBase64 = fs.readFileSync(company.letterhead_path).toString('base64');
      letterheadStyle = `
        body::before {
          content: ''; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background-image: url('data:image/png;base64,${lhBase64}');
          background-size: 100% 100%; background-repeat: no-repeat; z-index: -1;
        }`;
    } catch(_) {}
  }

  // USt-Gruppen für Summenblock
  const ustGroups = {};
  (doc.items || []).forEach(p => {
    const k = parseFloat(p.vat_rate);
    if (!ustGroups[k]) ustGroups[k] = { netto: 0, ust: 0 };
    ustGroups[k].netto += parseFloat(p.net_amount || 0);
    ustGroups[k].ust   += parseFloat(p.vat_amount || 0);
  });

  // Positionen
  const positionenHtml = (doc.items || []).map((p, i) => `
    <tr class="${i % 2 === 1 ? 'stripe' : ''}">
      <td class="c">${i + 1}.</td>
      <td class="desc">${esc(p.description)}${p.description_detail ? `<br><span class="desc-detail">${esc(p.description_detail)}</span>` : ''}</td>
      <td class="r">${parseFloat(p.quantity).toLocaleString('de-AT', {maximumFractionDigits:2})}</td>
      <td class="c unit">${esc(p.unit || '')}</td>
      <td class="r">${fmt(p.unit_price_net)}</td>
      ${!settings?.small_business ? `<td class="r">${parseFloat(p.vat_rate).toFixed(0)} %</td>` : ''}
      <td class="r bold">${fmt(p.net_amount)}</td>
    </tr>`).join('');

  // Empfänger-Adresse
  const empfaengerName = doc.customer_company
    ? `<strong>${esc(doc.customer_company)}</strong>`
    : `<strong>${esc(doc.customer_first_name || '')} ${esc(doc.customer_last_name || '')}</strong>`;
  const kontaktPerson  = doc.customer_company && (doc.customer_first_name || doc.customer_last_name)
    ? `z. Hd. ${esc(doc.customer_first_name || '')} ${esc(doc.customer_last_name || '')}<br>` : '';

  // Meta-Tabelle rechts
  const dueDate = doc.due_date || (doc.document_date
    ? new Date(new Date(doc.document_date).getTime() + (doc.payment_days || 14) * 86400000).toISOString()
    : null);
  const metaRows = [
    ['Rechnungsnummer:', esc(doc.number)],
    ['Rechnungsdatum:', fmtDate(doc.document_date)],
    doc.service_date ? ['Leistungsdatum:', fmtDate(doc.service_date)] : null,
    doc.service_period_start ? ['Leistungszeitraum:', `${fmtDate(doc.service_period_start)} – ${fmtDate(doc.service_period_end)}`] : null,
    doc.customer_number ? ['Kundennummer:', esc(doc.customer_number)] : null,
    isInvoice ? ['Zahlungsziel:', `${doc.payment_days || 14} Tage netto`] : null,
    isInvoice && dueDate ? ['Fällig am:', `<strong>${fmtDate(dueDate)}</strong>`] : null,
    isOffer && doc.valid_until ? ['Gültig bis:', fmtDate(doc.valid_until)] : null,
    doc.customer_uid ? ['Kunden-UID:', esc(doc.customer_uid)] : null,
  ].filter(Boolean).map(([l, v]) => `<tr><td class="ml">${l}</td><td class="mv">${v}</td></tr>`).join('');

  const kleinunternehmer = settings?.small_business
    ? `<p class="legal">Umsatzsteuerfrei gemäß § 6 Abs. 1 Z 27 UStG (Kleinunternehmerregelung).</p>` : '';
  const reverseCharge = doc.reverse_charge
    ? `<p class="legal">Steuerschuld geht auf den Leistungsempfänger über (Reverse Charge).</p>` : '';

  const closingText = isInvoice
    ? (doc.closing_text || settings?.default_invoice_text || 'Zahlbar binnen ${doc.payment_days || 14} Tagen netto ohne Abzug. Die gelieferte Ware/Leistung bleibt bis zur vollständigen Bezahlung Eigentum des Auftragnehmers.')
    : (doc.closing_text || 'Dieses Angebot ist 30 Tage ab Ausstellungsdatum gültig. Preise verstehen sich netto zuzüglich gesetzlicher Umsatzsteuer.');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 18mm 18mm 24mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #222; line-height: 1.5; }

  /* ── HEADER ── */
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 4mm; margin-bottom: 5mm; border-bottom: 2.5pt solid ${accentColor}; }
  .logo-text { font-size: 22pt; font-weight: 700; color: ${accentColor}; }
  .hdr-right { text-align: right; font-size: 8pt; color: #555; line-height: 1.8; }
  .hdr-right .co-name { font-size: 9.5pt; font-weight: 700; color: #222; }

  /* ── ADRESSE + META NEBENEINANDER ── */
  .addr-meta { display: flex; gap: 6mm; margin-bottom: 6mm; }
  .addr-box { flex: 1; }
  .absender { font-size: 7.5pt; color: #888; border-bottom: 0.4pt solid #ccc; padding-bottom: 1mm; margin-bottom: 2mm; }
  .empfaenger { font-size: 9.5pt; line-height: 1.75; min-height: 28mm; }

  /* ── META-TABELLE ── */
  .meta-box { min-width: 68mm; }
  table.meta { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  table.meta td { padding: 1.2mm 2mm; vertical-align: top; }
  table.meta td.ml { color: #555; white-space: nowrap; }
  table.meta td.mv { font-weight: 600; text-align: right; color: #222; }

  /* ── TITEL ── */
  .doc-title { font-size: 17pt; font-weight: 700; color: ${accentColor}; margin-bottom: 5mm; letter-spacing: 0.5pt; }

  /* ── POSITIONSTABELLE ── */
  table.pos { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 0; }
  table.pos thead tr { background: ${accentColor}; color: #fff; }
  table.pos thead th { padding: 2.5mm 2.5mm; font-weight: 600; font-size: 8pt; }
  table.pos thead th.r { text-align: right; }
  table.pos thead th.c { text-align: center; }
  table.pos tbody td { padding: 2.2mm 2.5mm; border-bottom: 0.3pt solid #e0e0e0; vertical-align: top; }
  table.pos tbody tr.stripe td { background: #f7f7f7; }
  table.pos .desc { max-width: 80mm; }
  table.pos .desc-detail { font-size: 7.5pt; color: #777; }
  table.pos .unit { font-size: 8pt; color: #555; text-align: center; }
  table.pos .r { text-align: right; }
  table.pos .c { text-align: center; }
  table.pos .bold { font-weight: 600; }

  /* ── HINWEIS / LEISTUNGSBESCHREIBUNG ── */
  .hinweis { font-size: 8.5pt; color: #444; margin: 4mm 0; padding: 3mm 4mm; background: #fafafa; border-left: 2pt solid #ddd; }

  /* ── SUMMENBLOCK ── */
  .summen-wrap { display: flex; justify-content: flex-end; margin-top: 0; border-top: 1pt solid #ddd; }
  table.summen { width: 80mm; border-collapse: collapse; font-size: 9pt; }
  table.summen td { padding: 1.8mm 2.5mm; }
  table.summen td:last-child { text-align: right; }
  table.summen .ust-row td { color: #555; font-size: 8.5pt; }
  table.summen .netto-row td { border-top: 0.5pt solid #ccc; }
  table.summen .total-row td { border-top: 2pt solid ${accentColor}; font-size: 11.5pt; font-weight: 700; color: ${accentColor}; padding-top: 2.5mm; }

  /* ── ZAHLUNG ── */
  .zahlung { margin-top: 6mm; padding: 3.5mm 5mm; background: #f4f8ff; border-left: 3pt solid ${accentColor}; font-size: 8.5pt; line-height: 1.85; }
  .zahlung .zt { font-weight: 700; font-size: 9pt; margin-bottom: 1mm; }
  table.zinfo { border-collapse: collapse; font-size: 8.5pt; margin-top: 1.5mm; }
  table.zinfo td { padding: 0.5mm 5mm 0.5mm 0; }
  table.zinfo td:first-child { color: #555; white-space: nowrap; }
  table.zinfo td:last-child { font-weight: 600; }

  /* ── SCHLUSSTEXT ── */
  .closing { font-size: 8pt; color: #666; margin-top: 5mm; line-height: 1.65; }
  .legal { font-size: 7.5pt; color: #888; margin-top: 2mm; font-style: italic; }
  .danke { font-size: 9pt; font-weight: 600; color: #222; margin-top: 4mm; }

  /* ── FOOTER ── */
  .footer { position: fixed; bottom: 7mm; left: 0; right: 0; font-size: 7pt; color: #aaa;
    text-align: center; border-top: 0.5pt solid #e0e0e0; padding-top: 2mm; }
  .footer span { margin: 0 4mm; }

  ${letterheadStyle}
</style>
</head>
<body>

<!-- ══ HEADER ══ -->
<div class="hdr">
  <div>${logoHtml}${company.legal_form ? `<div style="font-size:7.5pt;color:#888;margin-top:1mm;">${esc(company.legal_form)}</div>` : ''}</div>
  <div class="hdr-right">
    <div class="co-name">${esc(company.name)}</div>
    ${esc(company.address || '')}<br>
    ${esc(company.zip || '')} ${esc(company.city || '')}<br>
    ${company.phone  ? `Tel: ${esc(company.phone)}<br>`    : ''}
    ${company.email  ? `${esc(company.email)}<br>`         : ''}
    ${company.website? `${esc(company.website)}<br>`       : ''}
    ${company.uid_number ? `UID: ${esc(company.uid_number)}`  : ''}
    ${company.company_register_nr ? `<br>FN: ${esc(company.company_register_nr)}` : ''}
  </div>
</div>

<!-- ══ TITEL ══ -->
<div class="doc-title">${isInvoice ? 'RECHNUNG' : isOffer ? 'ANGEBOT' : 'DOKUMENT'}</div>

<!-- ══ ADRESSE + META ══ -->
<div class="addr-meta">
  <div class="addr-box">
    <div class="absender">${esc(company.name)} · ${esc(company.address || '')} · ${esc(company.zip || '')} ${esc(company.city || '')}</div>
    <div class="empfaenger">
      ${empfaengerName}<br>
      ${kontaktPerson}
      ${doc.customer_address ? `${esc(doc.customer_address)}<br>` : ''}
      ${doc.customer_zip ? `${esc(doc.customer_zip)} ${esc(doc.customer_city || '')}<br>` : ''}
      ${doc.customer_country && doc.customer_country !== 'AT' ? esc(doc.customer_country) + '<br>' : ''}
      ${doc.customer_uid ? `UID: ${esc(doc.customer_uid)}` : ''}
    </div>
  </div>
  <div class="meta-box">
    <table class="meta"><tbody>${metaRows}</tbody></table>
  </div>
</div>

${doc.subject ? `<p style="font-weight:700;font-size:9.5pt;margin-bottom:4mm;">${esc(doc.subject)}</p>` : ''}
${doc.intro_text ? `<p style="font-size:9pt;color:#444;margin-bottom:4mm;">${esc(doc.intro_text)}</p>` : ''}

<!-- ══ POSITIONEN ══ -->
<table class="pos">
  <thead>
    <tr>
      <th class="c" style="width:8mm;">Pos.</th>
      <th style="text-align:left;">Beschreibung</th>
      <th class="r" style="width:16mm;">Menge</th>
      <th class="c" style="width:14mm;">Einheit</th>
      <th class="r" style="width:24mm;">Einzelpreis netto</th>
      ${!settings?.small_business ? '<th class="r" style="width:12mm;">USt</th>' : ''}
      <th class="r" style="width:24mm;">Gesamt netto</th>
    </tr>
  </thead>
  <tbody>${positionenHtml}</tbody>
</table>

${doc.notes ? `<div class="hinweis"><strong>Hinweis / Leistungsbeschreibung</strong><br>${esc(doc.notes)}</div>` : ''}

<!-- ══ SUMMEN ══ -->
<div class="summen-wrap">
  <table class="summen">
    <tr class="netto-row">
      <td>Zwischensumme netto</td>
      <td>${fmt(doc.net_total)}</td>
    </tr>
    ${!settings?.small_business
      ? Object.entries(ustGroups).map(([satz, v]) =>
          `<tr class="ust-row"><td>USt. ${parseFloat(satz).toFixed(0)} %</td><td>${fmt(v.ust)}</td></tr>`
        ).join('')
      : ''}
    <tr class="total-row">
      <td>Gesamtbetrag brutto</td>
      <td>${fmt(doc.gross_total)}</td>
    </tr>
  </table>
</div>

<!-- ══ ZAHLUNGSINFO (nur Rechnung) ══ -->
${isInvoice && (company.iban || company.bank_name) ? `
<div class="zahlung">
  <div class="zt">Bitte überweisen Sie den Rechnungsbetrag bis zum Fälligkeitsdatum auf folgendes Konto:</div>
  <table class="zinfo">
    ${company.iban      ? `<tr><td>IBAN:</td><td>${esc(company.iban)}</td></tr>` : ''}
    ${company.bic       ? `<tr><td>BIC:</td><td>${esc(company.bic)}</td></tr>`  : ''}
    ${company.bank_name ? `<tr><td>Bank:</td><td>${esc(company.bank_name)}</td></tr>` : ''}
    <tr><td>Verwendungszweck:</td><td>${esc(doc.number)}</td></tr>
  </table>
</div>` : ''}

<!-- ══ SCHLUSSTEXT ══ -->
<div class="closing">
  <p>${esc(closingText)}</p>
  ${kleinunternehmer}
  ${reverseCharge}
</div>
<div class="danke">Vielen Dank für Ihren Auftrag!</div>

<!-- ══ FOOTER ══ -->
<div class="footer">
  <span>${esc(company.name)}${company.legal_form ? ` ${esc(company.legal_form)}` : ''}</span>
  ${company.uid_number ? `<span>UID: ${esc(company.uid_number)}</span>` : ''}
  ${company.company_register_nr ? `<span>FN: ${esc(company.company_register_nr)}${company.company_register_court ? ` ${esc(company.company_register_court)}` : ''}</span>` : ''}
  ${company.iban ? `<span>IBAN: ${esc(company.iban)}</span>` : ''}
  ${company.email ? `<span>${esc(company.email)}</span>` : ''}
</div>

</body>
</html>`;
}

// ─── HTML → PDF via Puppeteer (Headless Chrome) ───────────────────────────────
async function htmlToPdf(html) {
  let puppeteer;
  try { puppeteer = require('puppeteer'); }
  catch(e) { throw new Error('puppeteer nicht installiert. Bitte "npm install" im backend-Ordner ausführen.'); }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--single-process',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

// ─── Haupt-Export: Rechnung/Angebot als PDF ────────────────────────────────────
async function generateInvoicePdf(doc, company, settings) {
  const html = buildDocumentHtml(doc, company, settings); // sync
  return htmlToPdf(html);
}

// ─── Mahnungs-PDF ─────────────────────────────────────────────────────────────
async function generateDunningPdf(dunning, invoice, company) {
  const accentColor = '#e24b4a';
  const stufeText = {
    1: 'Zahlungserinnerung',
    2: 'Erste Mahnung',
    3: 'Zweite Mahnung',
    4: 'Letzte Mahnung – Zahlungsaufforderung',
  }[dunning.dunning_level] || 'Mahnung';

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<style>
  @page { size: A4; margin: 20mm 18mm 22mm 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #1a1a18; }
  .header { border-bottom: 2pt solid ${accentColor}; padding-bottom: 4mm; margin-bottom: 8mm; display: flex; justify-content: space-between; }
  .title { font-size: 16pt; font-weight: 700; color: ${accentColor}; }
  .alert-box { background: #fdf0f0; border-left: 4pt solid ${accentColor}; padding: 4mm 5mm; margin: 6mm 0; font-size: 9.5pt; }
  table { width: 100%; border-collapse: collapse; margin: 5mm 0; font-size: 9pt; }
  th { background: ${accentColor}; color: white; padding: 2.5mm; text-align: left; }
  td { padding: 2.5mm; border-bottom: 0.3pt solid #ddd; }
  .total-row td { font-weight: 700; font-size: 11pt; border-top: 2pt solid ${accentColor}; }
  .right { text-align: right; }
  .footer { position: fixed; bottom: 8mm; font-size: 7.5pt; color: #999; border-top: 0.5pt solid #ddd; padding-top: 2mm; width: 100%; text-align: center; }
</style></head><body>
<div class="header">
  <div><div style="font-size:18pt;font-weight:700;color:${accentColor};">${esc(company.name)}</div></div>
  <div style="text-align:right;font-size:8pt;color:#666;">${esc(company.address || '')}<br>${esc(company.zip || '')} ${esc(company.city || '')}<br>UID: ${esc(company.uid_number || '')}</div>
</div>
<div style="margin-bottom:6mm;">
  ${invoice.customer_company ? `<strong>${esc(invoice.customer_company)}</strong><br>` : ''}
  ${invoice.customer_address ? `${esc(invoice.customer_address)}<br>` : ''}
  ${invoice.customer_zip ? `${esc(invoice.customer_zip)} ${esc(invoice.customer_city || '')}<br>` : ''}
</div>
<div class="title">${stufeText}</div>
<p style="margin:3mm 0;font-size:8.5pt;color:#666;">${esc(company.city || 'Wien')}, ${new Date().toLocaleDateString('de-AT')}</p>
<div class="alert-box">
  Trotz ${dunning.dunning_level === 1 ? 'Ablauf des Zahlungsziels' : 'unserer bisherigen Mahnungen'} haben wir bisher keinen Zahlungseingang für folgende Rechnung feststellen können.
  Wir bitten Sie dringend, den ausstehenden Betrag umgehend zu begleichen.
</div>
<table>
  <thead><tr><th>Rechnungsnummer</th><th>Rechnungsdatum</th><th>Fälligkeitsdatum</th><th class="right">Rechnungsbetrag</th></tr></thead>
  <tbody><tr><td><strong>${esc(invoice.number)}</strong></td><td>${new Date(invoice.document_date).toLocaleDateString('de-AT')}</td><td>${new Date(invoice.due_date).toLocaleDateString('de-AT')}</td><td class="right">${new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'}).format(invoice.gross_total)}</td></tr></tbody>
</table>
<table>
  <tbody>
    <tr><td>Offener Rechnungsbetrag</td><td class="right">${new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'}).format(dunning.due_amount)}</td></tr>
    ${dunning.dunning_fees > 0 ? `<tr><td>Mahnspesen</td><td class="right">${new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'}).format(dunning.dunning_fees)}</td></tr>` : ''}
    ${dunning.interest_amount > 0 ? `<tr><td>Verzugszinsen</td><td class="right">${new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'}).format(dunning.interest_amount)}</td></tr>` : ''}
    <tr class="total-row"><td>Zu zahlender Betrag</td><td class="right">${new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'}).format(parseFloat(dunning.due_amount)+parseFloat(dunning.dunning_fees||0)+parseFloat(dunning.interest_amount||0))}</td></tr>
  </tbody>
</table>
<p style="margin-top:5mm;font-size:9pt;">Bitte überweisen Sie den Gesamtbetrag bis spätestens <strong>${new Date(Date.now()+7*86400000).toLocaleDateString('de-AT')}</strong> auf folgendes Konto:</p>
<p style="margin-top:3mm;font-size:9pt;"><strong>${esc(company.bank_name || '')} · IBAN: ${esc(company.iban || '')}</strong><br>Verwendungszweck: ${esc(invoice.number)} – Mahnung</p>
<p style="margin-top:5mm;font-size:8.5pt;color:#666;">${dunning.text || 'Bei Fragen stehen wir Ihnen gerne zur Verfügung.'}</p>
<p style="margin-top:4mm;">Mit freundlichen Grüßen<br><strong>${esc(company.name)}</strong></p>
<div class="footer">${esc(company.name)} · ${esc(company.uid_number||'')} · ${esc(company.iban||'')}</div>
</body></html>`;

  return htmlToPdf(html);
}

// ─── E/A-Rechnung als PDF ──────────────────────────────────────────────────────
async function generateEAReportPdf(reportData, company) {
  const fmt2 = (n) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(n || 0);
  const katZeilen = Object.entries(reportData.ausgaben?.nachKategorie || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td style="padding-left:5mm;color:#555">${esc(k)}</td><td style="text-align:right;color:#a32d2d">${fmt2(v)}</td></tr>`)
    .join('');

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #1a1a18; }
  h1 { font-size: 16pt; color: #185fa5; margin-bottom: 2mm; }
  h2 { font-size: 11pt; color: #185fa5; margin: 5mm 0 2mm; border-bottom: 1pt solid #185fa5; padding-bottom: 1mm; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 3mm; font-size: 9pt; }
  td, th { padding: 2mm 2.5mm; border-bottom: 0.3pt solid #eee; }
  th { background: #185fa5; color: white; font-size: 8.5pt; }
  .total { font-weight: 700; border-top: 1.5pt solid #185fa5; }
  .right { text-align: right; }
  .green { color: #0f6e56; font-weight: 700; }
  .red { color: #a32d2d; }
  .big { font-size: 13pt; font-weight: 700; color: #185fa5; }
  .box { background: #f0f6ff; border-left: 3pt solid #185fa5; padding: 3mm 4mm; margin: 4mm 0; }
</style></head><body>
<table style="margin-bottom:6mm;border:none"><tr>
  <td style="border:none"><h1>Einnahmen-Ausgaben-Rechnung ${reportData.jahr}</h1><p style="font-size:8.5pt;color:#666;">Ist-Besteuerung · ${esc(company.name)} · UID: ${esc(company.uid_number||'')}</p></td>
  <td style="text-align:right;border:none;font-size:8pt;color:#888">${esc(company.address||'')} · ${esc(company.zip||'')} ${esc(company.city||'')}<br>Erstellt: ${new Date().toLocaleDateString('de-AT')}</td>
</tr></table>
<div class="box">
  <table style="margin:0;border:none"><tr>
    <td style="border:none"><span style="font-size:8.5pt;color:#666">Betriebseinnahmen (netto)</span><br><span class="big green">${fmt2(reportData.einnahmen?.summe)}</span></td>
    <td style="border:none"><span style="font-size:8.5pt;color:#666">Betriebsausgaben (netto)</span><br><span class="big red">${fmt2(reportData.ausgaben?.summe)}</span></td>
    <td style="border:none"><span style="font-size:8.5pt;color:#666">AfA Abschreibungen</span><br><span class="big" style="color:#854f0b">${fmt2(reportData.afa)}</span></td>
    <td style="border:none"><span style="font-size:8.5pt;color:#666">Gewinn / Verlust</span><br><span class="big" style="color:${reportData.gewinn>=0?'#185fa5':'#a32d2d'}">${fmt2(reportData.gewinn)}</span></td>
  </tr></table>
</div>
<h2>Betriebseinnahmen</h2>
<table><thead><tr><th>Rechnungsnummer</th><th>Datum</th><th>Kunde</th><th class="right">Netto</th><th class="right">USt</th></tr></thead>
<tbody>
  ${(reportData.einnahmen?.positionen || []).map(r => `<tr><td>${esc(r.number)}</td><td>${new Date(r.payment_date).toLocaleDateString('de-AT')}</td><td>${esc(r.kunde||'')}</td><td class="right">${fmt2(r.netto)}</td><td class="right">${fmt2(r.ust)}</td></tr>`).join('')}
  <tr class="total"><td colspan="3">Summe Einnahmen</td><td class="right green">${fmt2(reportData.einnahmen?.summe)}</td><td class="right">${fmt2(reportData.ust?.ausgang)}</td></tr>
</tbody></table>
<h2>Betriebsausgaben nach Kategorie</h2>
<table><thead><tr><th>Kategorie</th><th class="right">Netto (abzugsfähig)</th></tr></thead>
<tbody>
  ${katZeilen}
  ${reportData.afa > 0 ? `<tr><td style="padding-left:5mm;color:#555">AfA Abschreibungen</td><td style="text-align:right;color:#854f0b">${fmt2(reportData.afa)}</td></tr>` : ''}
  <tr class="total"><td>Summe Ausgaben + AfA</td><td class="right red">${fmt2((reportData.ausgaben?.summe||0)+(reportData.afa||0))}</td></tr>
</tbody></table>
<h2>Umsatzsteuer (Ist-Besteuerung)</h2>
<table><tbody>
  <tr><td>Ausgangsumsatzsteuer (bezahlte Rechnungen)</td><td class="right" style="color:#854f0b">${fmt2(reportData.ust?.ausgang)}</td></tr>
  <tr><td>Abziehbare Vorsteuer (bezahlte Ausgaben)</td><td class="right green">−${fmt2(reportData.ust?.vorsteuer)}</td></tr>
  <tr class="total"><td>Zahllast / Gutschrift</td><td class="right" style="color:${(reportData.ust?.zahllast||0)>0?'#a32d2d':'#0f6e56'}">${fmt2(reportData.ust?.zahllast)}</td></tr>
</tbody></table>
</body></html>`;

  return htmlToPdf(html);
}

// ─── Servicebericht PDF ────────────────────────────────────────────────────────
function buildServiceReportHtml(report, company) {
  const fmtDate = d => d ? new Date(d).toLocaleDateString('de-AT') : '—';
  const fmtNum  = n => parseFloat(n||0).toFixed(2).replace('.',',');
  const esc     = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');

  const typeLabels = { service:'Serviceeinsatz', maintenance:'Wartung', repair:'Reparatur', installation:'Inbetriebnahme', emergency:'Notfalleinsatz' };
  const statusLabels = { draft:'Entwurf', completed:'Abgeschlossen', signed:'Unterschrieben' };

  const materials = Array.isArray(report.materials_used) ? report.materials_used : [];
  const materialRows = materials.length ? materials.map(m => `
    <tr>
      <td>${esc(m.name)}</td>
      <td style="text-align:center">${esc(String(m.quantity||''))} ${esc(m.unit||'')}</td>
      <td style="text-align:right">${m.unit_price ? fmtNum(m.unit_price)+' €' : '—'}</td>
      <td style="text-align:right">${m.unit_price && m.quantity ? fmtNum(parseFloat(m.unit_price)*parseFloat(m.quantity))+' €' : '—'}</td>
    </tr>`).join('') : `<tr><td colspan="4" style="color:#999;font-style:italic">Kein Material verwendet</td></tr>`;

  const logoUrl = company?.logo_path
    ? `file://${company.logo_path}`
    : null;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1a1a1a; background: #fff; }
  .page { padding: 14mm 14mm 14mm 14mm; min-height: 297mm; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8mm; border-bottom: 2px solid #185fa5; padding-bottom: 5mm; }
  .logo img { max-height: 40px; max-width: 160px; }
  .logo-text { font-size: 18pt; font-weight: 700; color: #185fa5; }
  .company-info { text-align: right; font-size: 8pt; color: #555; line-height: 1.5; }

  .report-title { background: #185fa5; color: white; padding: 4mm 6mm; border-radius: 4px; margin-bottom: 6mm; display: flex; justify-content: space-between; align-items: center; }
  .report-title h1 { font-size: 14pt; font-weight: 700; }
  .report-title .nr { font-size: 11pt; opacity: 0.9; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 5mm; }
  .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 3mm 4mm; }
  .info-box h3 { font-size: 8pt; font-weight: 600; color: #185fa5; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2mm; }
  .info-row { display: flex; gap: 2mm; font-size: 9pt; margin-bottom: 1mm; }
  .info-label { color: #666; min-width: 60px; }

  .section { margin-bottom: 5mm; }
  .section-title { font-size: 9pt; font-weight: 700; color: #185fa5; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #e2e8f0; padding-bottom: 1.5mm; margin-bottom: 3mm; }
  .text-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 3mm 4mm; font-size: 9.5pt; line-height: 1.6; min-height: 12mm; }
  .text-empty { color: #aaa; font-style: italic; }

  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { background: #f1f5f9; text-align: left; padding: 2mm 3mm; font-weight: 600; font-size: 8pt; color: #555; border-bottom: 1px solid #e2e8f0; }
  td { padding: 2mm 3mm; border-bottom: 1px solid #f1f5f9; }

  .time-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3mm; margin-bottom: 5mm; }
  .time-box { text-align: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 3mm; }
  .time-value { font-size: 16pt; font-weight: 700; color: #185fa5; }
  .time-label { font-size: 8pt; color: #666; margin-top: 1mm; }

  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 8mm; }
  .sig-box { border-top: 1.5px solid #333; padding-top: 2mm; }
  .sig-label { font-size: 8pt; color: #666; }
  .sig-img { max-height: 30mm; max-width: 100%; }

  .status-badge { display: inline-block; padding: 1mm 3mm; border-radius: 3px; font-size: 8pt; font-weight: 600; }
  .status-draft     { background: #fef9c3; color: #854d0e; }
  .status-completed { background: #dcfce7; color: #166534; }
  .status-signed    { background: #dbeafe; color: #1e40af; }

  .footer { margin-top: 8mm; border-top: 1px solid #e2e8f0; padding-top: 3mm; font-size: 7.5pt; color: #888; display: flex; justify-content: space-between; }
</style></head><body><div class="page">

  <!-- Header -->
  <div class="header">
    <div class="logo">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo">` : `<div class="logo-text">${esc(company?.name||'')}</div>`}
    </div>
    <div class="company-info">
      ${esc(company?.name||'')} ${company?.legal_form?'| '+esc(company.legal_form):''}<br>
      ${esc(company?.address||'')}${company?.zip||company?.city ? ', '+esc((company.zip||'')+' '+(company.city||'')) : ''}<br>
      ${company?.phone ? 'Tel: '+esc(company.phone) : ''}${company?.email ? ' | '+esc(company.email) : ''}<br>
      ${company?.uid_number ? 'UID: '+esc(company.uid_number) : ''}
    </div>
  </div>

  <!-- Titel -->
  <div class="report-title">
    <h1>${typeLabels[report.report_type] || 'Servicebericht'}</h1>
    <div>
      <div class="nr">${esc(report.report_number)}</div>
      <div style="font-size:9pt;opacity:0.8">Datum: ${fmtDate(report.report_date)}</div>
    </div>
  </div>

  <!-- Info-Grid -->
  <div class="info-grid">
    <div class="info-box">
      <h3>Kunde</h3>
      <div class="info-row"><span class="info-label">Name:</span><strong>${esc(report.customer_name||'—')}</strong></div>
      ${report.customer_address ? `<div class="info-row"><span class="info-label">Adresse:</span>${esc(report.customer_address)}, ${esc((report.customer_zip||'')+' '+(report.customer_city||''))}</div>` : ''}
      ${report.customer_phone ? `<div class="info-row"><span class="info-label">Telefon:</span>${esc(report.customer_phone)}</div>` : ''}
      ${report.customer_email ? `<div class="info-row"><span class="info-label">E-Mail:</span>${esc(report.customer_email)}</div>` : ''}
    </div>
    <div class="info-box">
      <h3>Anlage &amp; Techniker</h3>
      ${report.equipment_name ? `<div class="info-row"><span class="info-label">Anlage:</span><strong>${esc(report.equipment_name)}</strong></div>` : ''}
      ${report.equipment_type ? `<div class="info-row"><span class="info-label">Typ:</span>${esc(report.equipment_type)}</div>` : ''}
      ${report.manufacturer ? `<div class="info-row"><span class="info-label">Hersteller:</span>${esc(report.manufacturer)} ${esc(report.model||'')}</div>` : ''}
      ${report.serial_number ? `<div class="info-row"><span class="info-label">Serie:</span>${esc(report.serial_number)}</div>` : ''}
      ${report.equipment_location ? `<div class="info-row"><span class="info-label">Standort:</span>${esc(report.equipment_location)}</div>` : ''}
      <div class="info-row"><span class="info-label">Techniker:</span>${esc(report.technician_name || report.technician_user_name || '—')}</div>
      ${report.project_name ? `<div class="info-row"><span class="info-label">Projekt:</span>${esc(report.project_name)}</div>` : ''}
    </div>
  </div>

  <!-- Zeiterfassung -->
  <div class="time-grid">
    <div class="time-box">
      <div class="time-value">${fmtNum(report.hours_worked)} h</div>
      <div class="time-label">Arbeitszeit</div>
    </div>
    <div class="time-box">
      <div class="time-value">${fmtNum(report.travel_hours)} h</div>
      <div class="time-label">Fahrtzeit</div>
    </div>
    <div class="time-box">
      <div class="time-value">${fmtNum(parseFloat(report.hours_worked||0)+parseFloat(report.travel_hours||0))} h</div>
      <div class="time-label">Gesamt</div>
    </div>
  </div>

  <!-- Durchgeführte Arbeiten -->
  <div class="section">
    <div class="section-title">Durchgeführte Arbeiten</div>
    <div class="text-box">${report.work_performed ? esc(report.work_performed) : '<span class="text-empty">Keine Angabe</span>'}</div>
  </div>

  <!-- Festgestellte Mängel -->
  <div class="section">
    <div class="section-title">Festgestellte Mängel</div>
    <div class="text-box">${report.defects_found ? esc(report.defects_found) : '<span class="text-empty">Keine Mängel festgestellt</span>'}</div>
  </div>

  <!-- Empfehlungen -->
  ${report.recommendations ? `
  <div class="section">
    <div class="section-title">Empfehlungen</div>
    <div class="text-box">${esc(report.recommendations)}</div>
  </div>` : ''}

  <!-- Material -->
  <div class="section">
    <div class="section-title">Verwendetes Material</div>
    <table>
      <thead><tr><th>Bezeichnung</th><th style="text-align:center">Menge</th><th style="text-align:right">Einzelpreis</th><th style="text-align:right">Gesamt</th></tr></thead>
      <tbody>${materialRows}</tbody>
    </table>
  </div>

  <!-- Unterschriften -->
  <div class="sig-grid">
    <div class="sig-box">
      ${report.signature_data ? `<img class="sig-img" src="${report.signature_data}" alt="Unterschrift Kunde">` : '<div style="height:20mm"></div>'}
      <div class="sig-label">Unterschrift Kunde: ${esc(report.signature_name||'')}</div>
    </div>
    <div class="sig-box">
      <div style="height:20mm"></div>
      <div class="sig-label">Unterschrift Techniker: ${esc(report.technician_name || report.technician_user_name || '')}</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>${esc(company?.name||'')} | ${esc(company?.address||'')} | ${esc((company?.zip||'')+' '+(company?.city||''))}</span>
    <span>Erstellt: ${fmtDate(new Date())} | Status: <span class="status-badge status-${report.status}">${statusLabels[report.status]||report.status}</span></span>
  </div>

</div></body></html>`;
}

async function generateServiceReportPdf(report) {
  return htmlToPdf(buildServiceReportHtml(report, report));
}

// ─── Wartungsvertrag PDF ──────────────────────────────────────────────────────
function buildMaintenanceContractHtml(contract, company, settings) {
  const fmtD = d => d ? new Date(d).toLocaleDateString('de-AT', {day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
  const fmtE = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fmtC = n => new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'}).format(n||0);
  const intervalLabels = { 1:'Monatlich', 2:'Zweimonatlich', 3:'Vierteljährlich', 6:'Halbjährlich', 12:'Jährlich', 24:'Alle 2 Jahre' };
  const accentColor = settings?.invoice_color || '#185fa5';

  // Logo (gleich wie Rechnung)
  let logoHtml = `<span class="logo-text">${fmtE(company?.name||'')}</span>`;
  if (company?.logo_path && fs.existsSync(company.logo_path)) {
    try {
      const logoRaw = fs.readFileSync(company.logo_path).toString('base64');
      const ext = path.extname(company.logo_path).toLowerCase().replace('.','');
      const mime = ext==='png'?'image/png':'image/jpeg';
      logoHtml = `
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden">
  <defs>
    <filter id="rm-white">
      <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 -1 -1 3 0"/>
    </filter>
  </defs>
</svg>
<img src="data:${mime};base64,${logoRaw}" style="max-height:85px;max-width:270px;object-fit:contain;filter:url(#rm-white);" alt="${fmtE(company?.name||'')}"/>`;
    } catch(_) {}
  }

  const metaRows = [
    ['Vertragsnummer:', fmtE(contract.order_number||contract.contract_number||'—')],
    ['Vertragsbezeichnung:', `<strong>${fmtE(contract.name||'')}</strong>`],
    ['Intervall:', intervalLabels[contract.interval_months]||(contract.interval_months+' Monate')],
    ['Vertragsbeginn:', fmtD(contract.contract_start)],
    contract.contract_end ? ['Vertragsende:', fmtD(contract.contract_end)] : null,
    ['Nächster Service:', `<strong>${fmtD(contract.next_service_date)}</strong>`],
    contract.reference_number ? ['Referenz:', fmtE(contract.reference_number)] : null,
    ['Status:', contract.status==='active'?'<span style="color:#166534;font-weight:600;">Aktiv</span>':'<span style="color:#854d0e;font-weight:600;">'+fmtE(contract.status)+'</span>'],
  ].filter(Boolean).map(([l,v])=>`<tr><td class="ml">${l}</td><td class="mv">${v}</td></tr>`).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 18mm 18mm 24mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #222; line-height: 1.5; }

  .hdr { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 4mm; margin-bottom: 5mm; border-bottom: 2.5pt solid ${accentColor}; }
  .logo-text { font-size: 22pt; font-weight: 700; color: ${accentColor}; }
  .hdr-right { text-align: right; font-size: 8pt; color: #555; line-height: 1.8; }
  .hdr-right .co-name { font-size: 9.5pt; font-weight: 700; color: #222; }

  .addr-meta { display: flex; gap: 6mm; margin-bottom: 6mm; }
  .addr-box { flex: 1; }
  .absender { font-size: 7.5pt; color: #888; border-bottom: 0.4pt solid #ccc; padding-bottom: 1mm; margin-bottom: 2mm; }
  .empfaenger { font-size: 9.5pt; line-height: 1.75; min-height: 28mm; }

  .meta-box { min-width: 72mm; }
  table.meta { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  table.meta td { padding: 1.2mm 2mm; vertical-align: top; }
  table.meta td.ml { color: #555; white-space: nowrap; }
  table.meta td.mv { font-weight: 600; text-align: right; color: #222; }

  .doc-title { font-size: 17pt; font-weight: 700; color: ${accentColor}; margin-bottom: 5mm; letter-spacing: 0.5pt; }

  .section-title { font-size: 8pt; font-weight: 700; color: ${accentColor}; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 0.5pt solid #ddd; padding-bottom: 1.5mm; margin: 5mm 0 2mm 0; }
  .text-block { font-size: 9pt; color: #333; line-height: 1.7; padding: 2.5mm 3mm; background: #fafafa; border-left: 2pt solid #ddd; }

  .price-table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 3mm; }
  .price-table thead tr { background: ${accentColor}; color: #fff; }
  .price-table thead th { padding: 2.5mm 3mm; font-weight: 600; font-size: 8.5pt; text-align: left; }
  .price-table thead th.r { text-align: right; }
  .price-table tbody td { padding: 2.2mm 3mm; border-bottom: 0.3pt solid #e0e0e0; }
  .price-table tbody td.r { text-align: right; font-weight: 600; }
  .price-table tfoot td { padding: 2.5mm 3mm; border-top: 2pt solid ${accentColor}; font-weight: 700; font-size: 10.5pt; color: ${accentColor}; }
  .price-table tfoot td.r { text-align: right; }

  .sig-wrap { display: flex; gap: 12mm; margin-top: 14mm; }
  .sig-box { flex: 1; }
  .sig-line { border-top: 1.5px solid #444; padding-top: 2mm; margin-top: 20mm; font-size: 8pt; color: #666; }

  .closing { font-size: 8pt; color: #666; margin-top: 5mm; line-height: 1.65; padding: 3mm 4mm; background: #fafafa; border-left: 2pt solid #ddd; }

  .footer { position: fixed; bottom: 7mm; left: 0; right: 0; font-size: 7pt; color: #aaa;
    text-align: center; border-top: 0.5pt solid #e0e0e0; padding-top: 2mm; }
  .footer span { margin: 0 4mm; }
</style>
</head>
<body>

<!-- HEADER -->
<div class="hdr">
  <div>${logoHtml}${company?.legal_form?`<div style="font-size:7.5pt;color:#888;margin-top:1mm;">${fmtE(company.legal_form)}</div>`:''}</div>
  <div class="hdr-right">
    <div class="co-name">${fmtE(company?.name||'')}</div>
    ${fmtE(company?.address||'')}<br>
    ${fmtE(company?.zip||'')} ${fmtE(company?.city||'')}<br>
    ${company?.phone?`Tel: ${fmtE(company.phone)}<br>`:''}
    ${company?.email?`${fmtE(company.email)}<br>`:''}
    ${company?.uid_number?`UID: ${fmtE(company.uid_number)}`:''}
  </div>
</div>

<!-- TITEL -->
<div class="doc-title">WARTUNGSVERTRAG</div>

<!-- ADRESSE + META -->
<div class="addr-meta">
  <div class="addr-box">
    <div class="absender">${fmtE(company?.name||'')} · ${fmtE(company?.address||'')} · ${fmtE(company?.zip||'')} ${fmtE(company?.city||'')}</div>
    <div class="empfaenger">
      <strong>${fmtE(contract.customer_name||'—')}</strong><br>
      ${contract.customer_address?fmtE(contract.customer_address)+'<br>':''}
      ${contract.customer_zip?fmtE(contract.customer_zip)+' '+fmtE(contract.customer_city||'')+'<br>':''}
      ${contract.customer_phone?'Tel: '+fmtE(contract.customer_phone)+'<br>':''}
      ${contract.customer_email?fmtE(contract.customer_email):''}
    </div>
  </div>
  <div class="meta-box">
    <table class="meta"><tbody>${metaRows}</tbody></table>
  </div>
</div>

<!-- BESCHREIBUNG -->
${contract.description?`
<div class="section-title">Leistungsbeschreibung</div>
<div class="text-block">${fmtE(contract.description).replace(/\n/g,'<br>')}</div>`:''}

<!-- PREISE -->
${(contract.price_per_service||contract.price_yearly)?`
<div class="section-title">Preise</div>
<table class="price-table">
  <thead><tr><th>Leistung</th><th class="r">Betrag (netto)</th></tr></thead>
  <tbody>
    ${contract.price_per_service?`<tr><td>Preis pro Serviceeinsatz (${intervalLabels[contract.interval_months]||''})</td><td class="r">${fmtC(contract.price_per_service)}</td></tr>`:''}
    ${contract.price_yearly?`<tr><td>Jahrespreis gesamt</td><td class="r">${fmtC(contract.price_yearly)}</td></tr>`:''}
  </tbody>
  ${contract.price_yearly?`<tfoot><tr><td>Jahresbetrag netto</td><td class="r">${fmtC(contract.price_yearly)}</td></tr></tfoot>`:''}
</table>`:''}

<!-- NOTIZEN -->
${contract.notes?`
<div class="section-title">Notizen / Besondere Vereinbarungen</div>
<div class="text-block">${fmtE(contract.notes).replace(/\n/g,'<br>')}</div>`:''}

<!-- SCHLUSSTEXT -->
<div class="closing">
  Dieser Wartungsvertrag wird zwischen <strong>${fmtE(contract.customer_name||'dem Kunden')}</strong> (Auftraggeber) und <strong>${fmtE(company?.name||'')}</strong> (Auftragnehmer) geschlossen. Er tritt mit Unterzeichnung in Kraft und verlängert sich automatisch, sofern er nicht schriftlich gekündigt wird.
</div>

<!-- UNTERSCHRIFTEN -->
<div class="sig-wrap">
  <div class="sig-box">
    <div class="sig-line">Ort, Datum &amp; Unterschrift Auftraggeber</div>
  </div>
  <div class="sig-box">
    <div class="sig-line">Ort, Datum &amp; Unterschrift ${fmtE(company?.name||'Auftragnehmer')}</div>
  </div>
</div>

<!-- FOOTER -->
<div class="footer">
  <span>${fmtE(company?.name||'')}${company?.legal_form?' '+fmtE(company.legal_form):''}</span>
  ${company?.uid_number?`<span>UID: ${fmtE(company.uid_number)}</span>`:''}
  ${company?.iban?`<span>IBAN: ${fmtE(company.iban)}</span>`:''}
  ${company?.email?`<span>${fmtE(company.email)}</span>`:''}
</div>

</body>
</html>`;
}

async function generateMaintenanceContractPdf(contract, company, settings) {
  return htmlToPdf(buildMaintenanceContractHtml(contract, company, settings));
}

module.exports = { generateInvoicePdf, generateDunningPdf, generateEAReportPdf, buildDocumentHtml, generateServiceReportPdf, generateMaintenanceContractPdf };
