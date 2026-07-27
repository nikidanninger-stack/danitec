// ─── E-Mail Service – Nodemailer ──────────────────────────────────────────────
const nodemailer = require('nodemailer');
const { query } = require('../utils/db');
const logger = require('../utils/logger');

// ─── Transporter (SMTP) – liest aus DB, fällt zurück auf .env ────────────────
async function createTransporter(companyId) {
  let host, port, secure, user, pass, fromEmail, fromName;

  if (companyId) {
    try {
      const r = await query('SELECT smtp_host,smtp_port,smtp_secure,smtp_user,smtp_password,smtp_from_email,smtp_from_name FROM company_settings WHERE company_id=$1',[companyId]);
      const s = r.rows[0];
      if (s?.smtp_host && s?.smtp_user && s?.smtp_password) {
        host = s.smtp_host; port = s.smtp_port||587; secure = s.smtp_secure||false;
        user = s.smtp_user; pass = s.smtp_password;
        fromEmail = s.smtp_from_email || s.smtp_user;
        fromName  = s.smtp_from_name  || s.smtp_user;
      }
    } catch(_) {}
  }
  // Fallback auf .env
  if (!host) {
    host  = process.env.SMTP_HOST || 'smtp.gmail.com';
    port  = parseInt(process.env.SMTP_PORT) || 587;
    secure= process.env.SMTP_PORT === '465';
    user  = process.env.SMTP_USER;
    pass  = process.env.SMTP_PASS;
    fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
    fromName  = null;
  }
  return { fromEmail, fromName, transporter: nodemailer.createTransport({ host, port, secure, auth:{user,pass}, tls:{rejectUnauthorized:false} }) };
}

// ─── Rechnung per E-Mail versenden ────────────────────────────────────────────
async function sendInvoiceEmail({ toEmail, toName, subject, bodyText, pdfBuffer, pdfFileName, company, documentId, companyId, userId }) {
  const { transporter, fromEmail: smtpFrom, fromName: smtpFromName } = await createTransporter(companyId);
  const fromName  = smtpFromName || company.name;
  const fromEmail = smtpFrom;

  const htmlBody = `
<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#1a1a18;line-height:1.6}
.container{max-width:600px;margin:0 auto;padding:20px}
.header{background:#185fa5;color:white;padding:20px 24px;border-radius:8px 8px 0 0}
.header h1{font-size:18px;margin:0}
.body{background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none}
.footer{background:#f5f5f3;padding:14px 24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;font-size:12px;color:#888}
.attachment-note{background:#e6f1fb;border-left:4px solid #185fa5;padding:10px 14px;margin:16px 0;font-size:13px}
</style></head>
<body><div class="container">
  <div class="header"><h1>${fromName}</h1></div>
  <div class="body">
    <p>${bodyText.replace(/\n/g, '<br>')}</p>
    <div class="attachment-note">
      📎 <strong>Anhang:</strong> ${pdfFileName}
    </div>
  </div>
  <div class="footer">
    ${fromName}${company.address ? ` · ${company.address}` : ''}${company.zip ? `, ${company.zip} ${company.city}` : ''}<br>
    ${company.uid_number ? `UID: ${company.uid_number}` : ''}
    ${company.iban ? ` · IBAN: ${company.iban}` : ''}
  </div>
</div></body></html>`;

  const mailOptions = {
    from:    `"${fromName}" <${fromEmail}>`,
    to:      toName ? `"${toName}" <${toEmail}>` : toEmail,
    subject: subject,
    text:    bodyText,
    html:    htmlBody,
    attachments: pdfBuffer ? [{
      filename: pdfFileName,
      content:  pdfBuffer,
      contentType: 'application/pdf',
    }] : [],
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`E-Mail versendet: ${info.messageId} an ${toEmail}`);

    // Versand protokollieren
    if (documentId && companyId) {
      await query(
        `INSERT INTO email_logs (company_id, document_id, to_email, subject, status)
         VALUES ($1, $2, $3, $4, 'sent')`,
        [companyId, documentId, toEmail, subject]
      );
    }

    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`E-Mail-Fehler an ${toEmail}: ${err.message}`);

    if (documentId && companyId) {
      await query(
        `INSERT INTO email_logs (company_id, document_id, to_email, subject, status, error)
         VALUES ($1, $2, $3, $4, 'failed', $5)`,
        [companyId, documentId, toEmail, subject, err.message]
      );
    }

    throw err;
  }
}

// ─── Test-Verbindung prüfen ────────────────────────────────────────────────────
async function verifyConnection(companyId) {
  try {
    const { transporter } = await createTransporter(companyId);
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Standard-E-Mail-Texte ────────────────────────────────────────────────────
function getDefaultInvoiceEmailText(doc, company) {
  return `Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere Rechnung ${doc.number}.

Bitte überweisen Sie den Rechnungsbetrag von ${new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(doc.gross_total)} innerhalb des angegebenen Zahlungsziels auf das angeführte Bankkonto.

Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung.

Mit freundlichen Grüßen
${company.name}
${company.email || ''}
${company.phone || ''}`;
}

function getDefaultOfferEmailText(doc, company) {
  return `Sehr geehrte Damen und Herren,

anbei erhalten Sie unser Angebot ${doc.number}.

Wir freuen uns auf Ihre Rückmeldung und stehen für Rückfragen jederzeit zur Verfügung.

Mit freundlichen Grüßen
${company.name}
${company.email || ''}`;
}

module.exports = {
  sendInvoiceEmail,
  verifyConnection,
  getDefaultInvoiceEmailText,
  getDefaultOfferEmailText,
};
