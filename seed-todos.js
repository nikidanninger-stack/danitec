// Seed-Skript: Gründungs-To-dos in Workspace eintragen
const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3001,
      path: `/api${path}`, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(opts, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(buf); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const TODOS = [
  // Organisation
  { title:'Alle bisherigen Gründungsdokumente sauber ablegen',        category:'Organisation',             due:'2026-09-30' },
  { title:'Ausweise von Niklas und Jonas speichern',                   category:'Organisation',             due:'2026-09-30' },
  { title:'Meldezettel / Wohnsitzdaten bereithalten',                  category:'Organisation',             due:'2026-09-30' },
  { title:'Doppelte Buchführung einrichten',                           category:'Finanzen/Buchhaltung',     due:null },
  // Technik
  { title:'Werkzeugliste erstellen',                                   category:'Technik/F-Gase/Lager',     due:'2026-09-30' },
  { title:'Was brauchen wir um Gas einzukaufen',                       category:'Technik/F-Gase/Lager',     due:'2026-09-30' },
  // Finanzen
  { title:'Investitionsliste erstellen',                               category:'Finanzen/Buchhaltung',     due:'2026-09-30' },
  { title:'Rechnungsvorlage erstellen',                                category:'Finanzen/Buchhaltung',     due:'2026-09-30' },
  { title:'Mahnprozess festlegen',                                     category:'Finanzen/Buchhaltung',     due:'2026-09-30' },
  { title:'Stundensatz und Notdienstzuschlag final kalkulieren',       category:'Finanzen/Preise',          due:'2026-09-30' },
  { title:'Anfahrtspauschalen final kalkulieren',                      category:'Finanzen/Preise',          due:'2026-09-30' },
  { title:'Buchhaltungsablauf mit Steuerberater klären',               category:'Finanzen/Buchhaltung',     due:'2026-10-15' },
  // GmbH / Notar
  { title:'Gesellschaftsvertrag intern durchgehen',                    category:'GmbH/Notar/Firmenbuch',    due:'2026-09-30' },
  { title:'Anteile, Geschäftsführer, Vertretung und Gewinnverteilung final klären', category:'GmbH/Notar/Firmenbuch', due:'2026-09-30' },
  { title:'Geschäftsführerregelung / Vertretungsbefugnisse festlegen — Ab wann darf wer was entscheiden?', category:'GmbH/Notar/Firmenbuch', due:'2026-09-30' },
  { title:'Notar auswählen',                                           category:'GmbH/Notar/Firmenbuch',    due:'2026-10-15' },
  { title:'Gesellschaftsvertrag an Notar schicken',                    category:'GmbH/Notar/Firmenbuch',    due:'2026-11-15' },
  { title:'Gesellschaftsvertrag final vom Notar prüfen lassen',        category:'GmbH/Notar/Firmenbuch',    due:'2026-11-15' },
  { title:'Stammkapital-Einzahlung mit Bank und Notar klären',         category:'Bank',                     due:'2027-01-15' },
  // Interne Verträge
  { title:'Ausstieg eines Gesellschafters regeln',                     category:'Interne Verträge',         due:'2026-09-30' },
  { title:'Krankheit / längere Arbeitsunfähigkeit regeln',             category:'Interne Verträge',         due:'2026-09-30' },
  { title:'Fahrzeug- und Werkzeugregelung intern festlegen',           category:'Interne Verträge',         due:'2026-09-30' },
  { title:'Allgemeine Preisliste (Material, Pauschalen, IBN Klima, Service usw.)', category:'Interne Verträge', due:'2026-09-30' },
  { title:'Interne Verträge finalisieren: Fahrzeug, Werkzeug, Ausstieg, Krankheit', category:'Interne Verträge', due:'2026-11-15' },
  // Website / Marketing
  { title:'Slogan entwickeln',                                         category:'Website/Marketing',        due:null },
  { title:'Visitenkarten / Arbeitskleidung / Fahrzeugbranding',        category:'Website/Marketing',        due:'2026-09-30' },
  { title:'Domain sichern',                                            category:'Website/Marketing',        due:'2026-11-15' },
  { title:'Professionelle E-Mail-Struktur planen',                     category:'Website/Marketing',        due:'2026-11-15' },
  { title:'Website finalisieren',                                      category:'Website/Marketing',        due:'2026-11-15' },
  { title:'Datenschutzerklärung finalisieren',                         category:'Website/Marketing',        due:'2027-01-15' },
  { title:'Cookie / Tracking-Entscheidungen treffen',                  category:'Website/Marketing',        due:'2027-01-15' },
  { title:'Google Business Profil vorbereiten',                        category:'Website/Marketing',        due:'2027-02-15' },
  { title:'Instagram / Social Media vorbereiten',                      category:'Website/Marketing',        due:'2027-02-15' },
  // Vertrieb / Vorlagen
  { title:'Angebotsvorlage erstellen',                                 category:'Vertrieb/Vorlagen',        due:'2026-09-30' },
  { title:'Auftragsbestätigung erstellen',                             category:'Vertrieb/Vorlagen',        due:'2026-09-30' },
  { title:'Rechnungsvorlage und Angebotsvorlage vorbereiten',          category:'Vertrieb/Vorlagen',        due:'2026-11-15' },
  // Betrieb / Vorlagen
  { title:'Regiebericht-Vorlage erstellen',                            category:'Betrieb/Vorlagen',         due:'2026-09-30' },
  { title:'Abnahmeprotokoll erstellen',                                category:'Betrieb/Vorlagen',         due:'2026-09-30' },
  // Recht
  { title:'AGB / Zahlungsbedingungen vorbereiten',                     category:'Recht/Vertrieb',           due:'2026-09-30' },
  // WKO
  { title:'WKO-Termin vereinbaren',                                    category:'WKO/Gewerbe',              due:'2026-10-15' },
  { title:'Gewerbewortlaut mit WKO klären',                            category:'WKO/Gewerbe',              due:'2026-10-15' },
  { title:'Prüfen ob mehrere Gewerbe nötig sind',                      category:'WKO/Gewerbe',              due:'2026-10-15' },
  { title:'NeuFÖG-Förderungen prüfen',                                 category:'WKO/Gewerbe',              due:'2026-11-15' },
  { title:'Gewerbeanmeldung vorbereiten (noch nicht einreichen)',       category:'WKO/Gewerbe',              due:'2027-01-31' },
  { title:'NeuFöG Formular vorbereiten falls nutzbar',                 category:'WKO/Gewerbe',              due:'2027-01-31' },
  // Bank
  { title:'Bankangebote für Firmenkonto einholen',                     category:'Bank',                     due:'2026-10-15' },
  { title:'Firmenkonto vorbereiten',                                   category:'Bank',                     due:'2026-11-15' },
  // Versicherungen
  { title:'Versicherungen vergleichen: Betriebshaftpflicht, Rechtsschutz, Fahrzeug/Werkzeug', category:'Versicherungen', due:'2026-10-15' },
  // Finanzamt
  { title:'Steuerberater auswählen',                                   category:'Finanzamt/Steuerberater',  due:'2026-10-15' },
  { title:'Steuerliche Erfassung vorbereiten',                         category:'Finanzamt/Steuerberater',  due:'2027-01-31' },
];

// Priorität nach Fälligkeit
function prio(due) {
  if (!due) return 'normal';
  const d = new Date(due);
  const now = new Date();
  const days = (d - now) / (1000*60*60*24);
  if (days < 30)  return 'urgent';
  if (days < 60)  return 'high';
  if (days < 120) return 'normal';
  return 'low';
}

async function main() {
  // Login
  console.log('🔐 Einloggen...');
  const login = await req('POST', '/auth/login', { email:'admin@danitec.at', password:'Danitec2025!' });
  if (!login.token) { console.error('❌ Login fehlgeschlagen:', login); process.exit(1); }
  const token = login.token;
  console.log('✅ Eingeloggt');

  // Board erstellen
  console.log('📋 Board erstellen...');
  const board = await req('POST', '/workspace/boards', { title:'Danitec GmbH – Gründungs-To-dos', type:'todos', icon:'ti-checklist', color:'#152248' }, token);
  if (!board.data?.id) { console.error('❌ Board-Fehler:', board); process.exit(1); }
  const boardId = board.data.id;
  console.log(`✅ Board erstellt (ID: ${boardId})`);

  // Alle Karten anlegen
  let ok = 0, fail = 0;
  for (const t of TODOS) {
    const card = await req('POST', `/workspace/boards/${boardId}/cards`, {
      title: `[${t.category}] ${t.title}`,
      priority: prio(t.due),
      due_date: t.due || null,
      column_key: 'open',
    }, token);
    if (card.data?.id) { ok++; process.stdout.write('.'); }
    else { fail++; console.error('\n❌', t.title, card); }
  }
  console.log(`\n✅ ${ok} To-dos eingetragen, ${fail} Fehler`);
}

main().catch(console.error);
