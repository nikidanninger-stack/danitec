import React, { useState, useEffect } from 'react';
import { fmt, fmtPct, calcPos, saveAsAngebot, druckAngebot } from './KalkulationUtils';
import { KatBlock, SummaryBar, ProjektHeader, ArbeitsModal } from './KalkulationShared';
import api from '../api/client';

// ── IDs ───────────────────────────────────────────────────────────────────────
let _nextId = 3000;
const nextId = () => ++_nextId;

// ── Kategorie-Metadaten ───────────────────────────────────────────────────────
const KAT_META = {
  'Kupferleitungen':     { icon: 'ti-pipe',               color: '#b45309' },
  'Rohrisolierung':      { icon: 'ti-cylinder',           color: '#2D9CDB' },
  'Armaturen & Ventile': { icon: 'ti-adjustments',        color: '#7c3aed' },
  'Kältemittel':         { icon: 'ti-snowflake',          color: '#0e7490' },
  'Löttechnik':          { icon: 'ti-flame',              color: '#dc2626' },
  'Elektro & Steuerung': { icon: 'ti-bolt',               color: '#854f0b' },
  'Verdampfer':          { icon: 'ti-wind',               color: '#0f6e56' },
  'Kälteaggregat':       { icon: 'ti-air-conditioning',   color: '#152248' },
  'Kühlraumzelle':       { icon: 'ti-building-warehouse', color: '#374151' },
  'Befestigung':         { icon: 'ti-anchor',             color: '#64748b' },
};

// ── Angebot-Kundendaten Modal ─────────────────────────────────────────────────
function AngebotKundenModal({ projekt, datum, typ, onConfirm, onCancel }) {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    customerId: '',
    betreff: `${typ || 'Kalkulation'}${projekt ? ` – ${projekt}` : ''}`,
    documentDate: datum || new Date().toISOString().slice(0, 10),
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });

  useEffect(() => {
    api.customers({ limit: 500 }).then(r => setCustomers(r.data || [])).catch(() => {});
  }, []);

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  };
  const box = {
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
    padding: 28, width: 480, maxWidth: '95vw',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  };
  const label = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };
  const inp   = { width: '100%', boxSizing: 'border-box' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={box}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 20 }}>
          <i className="ti ti-clipboard-text" style={{ marginRight: 8, color: 'var(--primary)' }} />
          Angebot erstellen
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={label}>Kunde</label>
          <select value={form.customerId} onChange={e => sf('customerId', e.target.value)} style={inp}>
            <option value="">— Kein Kunde (intern) —</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={label}>Betreff / Projektbezeichnung</label>
          <input value={form.betreff} onChange={e => sf('betreff', e.target.value)} style={inp} placeholder="z.B. Kühlraum Montage – Muster GmbH" />
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Angebotsdatum</label>
            <input type="date" value={form.documentDate} onChange={e => sf('documentDate', e.target.value)} style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Gültig bis</label>
            <input type="date" value={form.validUntil} onChange={e => sf('validUntil', e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button className="btn" onClick={onCancel}>Abbrechen</button>
          <button className="btn primary" onClick={() => onConfirm(form)}>
            <i className="ti ti-arrow-right" /> Weiter zu Arbeitszeit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sicherungsberechnung ──────────────────────────────────────────────────────
function berechneAbsicherung({ leistungKW, phasen, cosPhi, anlaufFaktor }) {
  const U  = phasen === 3 ? 400 : 230;
  const P  = leistungKW * 1000;
  const IB = phasen === 3
    ? P / (Math.sqrt(3) * U * cosPhi)
    : P / (U * cosPhi);
  const IA = IB * anlaufFaktor;
  const lssStufen = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63];
  const lssNenn   = lssStufen.find(s => s * 10 >= IA && s >= IB) ?? 63;
  const fiStufen  = [16, 25, 40, 63, 80, 100];
  const fiNenn    = fiStufen.find(s => s >= lssNenn) ?? 63;
  return { IB: IB.toFixed(1), IA: IA.toFixed(1), lssNenn, fiNenn };
}

// ── Kleine Hilfskomponenten ───────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
function Kpi({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#166534', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#14532d' }}>{value}</div>
    </div>
  );
}
const INP = { width: '100%', padding: '7px 10px',
  border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14 };

// ── Sicherungsrechner-Modal ───────────────────────────────────────────────────
function SicherungsRechner({ onAdd, onCancel }) {
  const [leistungKW,   setLeistungKW]   = useState(2.5);
  const [phasen,       setPhasen]       = useState(3);
  const [cosPhi,       setCosPhi]       = useState(0.85);
  const [anlaufFaktor, setAnlaufFaktor] = useState(5);
  const [querschnitt,  setQuerschnitt]  = useState(2.5);
  const [kabelMeter,   setKabelMeter]   = useState(10);

  const { IB, IA, lssNenn, fiNenn } =
    berechneAbsicherung({ leistungKW, phasen, cosPhi, anlaufFaktor });

  const lssEK = lssNenn <= 10 ? 7.50 : lssNenn <= 16 ? 9.00 : lssNenn <= 25 ? 12.00
    : lssNenn <= 32 ? 15.00 : lssNenn <= 40 ? 22.00 : 35.00;
  const fiEK  = fiNenn  <= 16 ? 40.00 : fiNenn <= 25 ? 45.00 : fiNenn <= 40 ? 58.00
    : fiNenn  <= 63 ? 75.00 : 95.00;
  const kabelEK = querschnitt <= 1.5 ? 1.20 : querschnitt <= 2.5 ? 1.80
    : querschnitt <= 4 ? 2.60 : querschnitt <= 6 ? 3.80 : 5.50;
  const kabelBez = `NYM-J ${phasen === 3 ? '5' : '3'}×${querschnitt} mm²`;

  const handleAdd = () => {
    onAdd([
      { id: nextId(), kat: 'Elektro & Steuerung', aktiv: true, aufschlag: 0.40, menge: 1,
        name: `LSS ${lssNenn} A / C-Charakteristik (${phasen}-phasig)`, einheit: 'Stk.', ek: lssEK, hinweis: '' },
      { id: nextId(), kat: 'Elektro & Steuerung', aktiv: true, aufschlag: 0.40, menge: 1,
        name: `FI-Schutzschalter ${fiNenn} A / 30 mA / Typ A`, einheit: 'Stk.', ek: fiEK, hinweis: '' },
      { id: nextId(), kat: 'Elektro & Steuerung', aktiv: true, aufschlag: 0.40, menge: kabelMeter,
        name: kabelBez, einheit: 'm', ek: kabelEK, hinweis: '' },
    ]);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%',
        maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-bolt" style={{ color: '#854f0b' }} />
          Sicherung &amp; FI auslegen
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Eingaben eingeben &rarr; LSS &amp; FI werden automatisch ausgelegt
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <Field label="Leistung Aggregat (kW)">
            <input type="number" value={leistungKW} onChange={e => setLeistungKW(+e.target.value)}
              step={0.1} min={0.1} style={INP} />
          </Field>
          <Field label="Phasenzahl">
            <select value={phasen} onChange={e => setPhasen(+e.target.value)} style={INP}>
              <option value={1}>1-phasig (230 V)</option>
              <option value={3}>3-phasig (400 V)</option>
            </select>
          </Field>
          <Field label="cos φ (Leistungsfaktor)">
            <input type="number" value={cosPhi} onChange={e => setCosPhi(+e.target.value)}
              step={0.01} min={0.5} max={1} style={INP} />
          </Field>
          <Field label="Anlaufstromfaktor">
            <select value={anlaufFaktor} onChange={e => setAnlaufFaktor(+e.target.value)} style={INP}>
              <option value={3}>3× – Sanftanlasser / IE4</option>
              <option value={5}>5× – Direktanlauf (Standard)</option>
              <option value={7}>7× – Schwerer Anlauf</option>
            </select>
          </Field>
          <Field label="Kabelquerschnitt (mm²)">
            <select value={querschnitt} onChange={e => setQuerschnitt(+e.target.value)} style={INP}>
              <option value={1.5}>1,5 mm²</option>
              <option value={2.5}>2,5 mm²</option>
              <option value={4}>4 mm²</option>
              <option value={6}>6 mm²</option>
              <option value={10}>10 mm²</option>
            </select>
          </Field>
          <Field label="Kabellänge (m)">
            <input type="number" value={kabelMeter} onChange={e => setKabelMeter(+e.target.value)}
              step={1} min={1} style={INP} />
          </Field>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
          padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#166534',
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Auslegungsergebnis
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <Kpi label="Betriebsstrom I_B" value={`${IB} A`} />
            <Kpi label="Anlaufstrom I_A"   value={`${IA} A`} />
            <Kpi label="LSS (C-Char.)"     value={`${lssNenn} A`} />
          </div>
          <div style={{ padding: '8px 14px', background: '#dcfce7', borderRadius: 6,
            fontSize: 13, fontWeight: 700, color: '#14532d' }}>
            &rarr; LSS {lssNenn} A / C &nbsp;+&nbsp; FI {fiNenn} A / 30 mA Typ A
            &nbsp;+&nbsp; {kabelBez} ({kabelMeter} m)
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onCancel}>Abbrechen</button>
          <button className="btn" style={{ background: '#854f0b', color: '#fff' }} onClick={handleAdd}>
            <i className="ti ti-plus" /> Als Positionen hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Standardpositionen ────────────────────────────────────────────────────────
const DEFAULT_POSITIONEN = [
  // ── Kupferleitungen ────────────────────────────────────────────────────────
  { kat:'Kupferleitungen', name:'Kupferrohr 6 mm',  einheit:'m', ek: 3.50, aufschlag:0.40, menge:10, aktiv:true  },
  { kat:'Kupferleitungen', name:'Kupferrohr 8 mm',  einheit:'m', ek: 4.20, aufschlag:0.40, menge: 5, aktiv:false },
  { kat:'Kupferleitungen', name:'Kupferrohr 10 mm', einheit:'m', ek: 5.80, aufschlag:0.40, menge: 8, aktiv:true  },
  { kat:'Kupferleitungen', name:'Kupferrohr 12 mm', einheit:'m', ek: 7.50, aufschlag:0.40, menge: 6, aktiv:false },
  { kat:'Kupferleitungen', name:'Kupferrohr 16 mm', einheit:'m', ek:10.50, aufschlag:0.40, menge: 4, aktiv:false },
  { kat:'Kupferleitungen', name:'Kupferrohr 18 mm', einheit:'m', ek:14.00, aufschlag:0.40, menge: 4, aktiv:false },
  { kat:'Kupferleitungen', name:'Kupferrohr 22 mm', einheit:'m', ek:20.00, aufschlag:0.40, menge: 3, aktiv:false },
  { kat:'Kupferleitungen', name:'Kupferrohr 28 mm', einheit:'m', ek:31.00, aufschlag:0.40, menge: 2, aktiv:false },
  { kat:'Kupferleitungen', name:'Kupferrohr 35 mm', einheit:'m', ek:48.00, aufschlag:0.40, menge: 2, aktiv:false },
  { kat:'Kupferleitungen', name:'Kupferrohr 42 mm', einheit:'m', ek:62.00, aufschlag:0.40, menge: 2, aktiv:false },

  // ── Rohrisolierung (Kaimann, DI = Innendurchmesser) ──────────────────────
  { kat:'Rohrisolierung', name:'Kaimann DI 12 / 13 mm WS', einheit:'m', ek: 2.80, aufschlag:0.40, menge:10, aktiv:true  },
  { kat:'Rohrisolierung', name:'Kaimann DI 12 / 19 mm WS', einheit:'m', ek: 3.60, aufschlag:0.40, menge: 5, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 16 / 13 mm WS', einheit:'m', ek: 3.10, aufschlag:0.40, menge: 5, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 16 / 19 mm WS', einheit:'m', ek: 3.90, aufschlag:0.40, menge: 5, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 18 / 13 mm WS', einheit:'m', ek: 3.30, aufschlag:0.40, menge: 8, aktiv:true  },
  { kat:'Rohrisolierung', name:'Kaimann DI 18 / 19 mm WS', einheit:'m', ek: 4.20, aufschlag:0.40, menge: 5, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 22 / 13 mm WS', einheit:'m', ek: 3.70, aufschlag:0.40, menge: 5, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 22 / 19 mm WS', einheit:'m', ek: 4.60, aufschlag:0.40, menge: 5, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 28 / 13 mm WS', einheit:'m', ek: 4.50, aufschlag:0.40, menge: 5, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 28 / 19 mm WS', einheit:'m', ek: 5.60, aufschlag:0.40, menge: 5, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 35 / 13 mm WS', einheit:'m', ek: 5.80, aufschlag:0.40, menge: 3, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 35 / 19 mm WS', einheit:'m', ek: 7.20, aufschlag:0.40, menge: 3, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 42 / 13 mm WS', einheit:'m', ek: 7.40, aufschlag:0.40, menge: 3, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 42 / 19 mm WS', einheit:'m', ek: 9.10, aufschlag:0.40, menge: 3, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 54 / 13 mm WS', einheit:'m', ek: 9.50, aufschlag:0.40, menge: 2, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 54 / 19 mm WS', einheit:'m', ek:11.80, aufschlag:0.40, menge: 2, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 64 / 13 mm WS', einheit:'m', ek:11.50, aufschlag:0.40, menge: 2, aktiv:false },
  { kat:'Rohrisolierung', name:'Kaimann DI 64 / 19 mm WS', einheit:'m', ek:14.20, aufschlag:0.40, menge: 2, aktiv:false },
  { kat:'Rohrisolierung', name:'Iso-Klebeband (selbstklebend)', einheit:'Rolle', ek: 8.50, aufschlag:0.40, menge: 2, aktiv:true },

  // ── Armaturen & Ventile ───────────────────────────────────────────────────
  { kat:'Armaturen & Ventile', name:'Magnetventil 6 mm (NC)',  einheit:'Stk.', ek: 42.00, aufschlag:0.40, menge:1, aktiv:true  },
  { kat:'Armaturen & Ventile', name:'Magnetventil 8 mm (NC)',  einheit:'Stk.', ek: 48.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Magnetventil 10 mm (NC)', einheit:'Stk.', ek: 58.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Magnetventil 12 mm (NC)', einheit:'Stk.', ek: 72.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Magnetventil 16 mm (NC)', einheit:'Stk.', ek: 98.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Magnetventil 18 mm (NC)', einheit:'Stk.', ek:118.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Magnetventil 22 mm (NC)', einheit:'Stk.', ek:148.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Magnetventil 28 mm (NC)', einheit:'Stk.', ek:195.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'TXV 1,5 kW (Thermostat-Expansionsventil)', einheit:'Stk.', ek: 85.00, aufschlag:0.40, menge:1, aktiv:true  },
  { kat:'Armaturen & Ventile', name:'TXV 3 kW',   einheit:'Stk.', ek:105.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'TXV 5 kW',   einheit:'Stk.', ek:135.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'EEV (Elektronisches Expansionsventil)', einheit:'Stk.', ek:195.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Schauglas 6 mm',  einheit:'Stk.', ek: 18.00, aufschlag:0.40, menge:1, aktiv:true  },
  { kat:'Armaturen & Ventile', name:'Schauglas 10 mm', einheit:'Stk.', ek: 22.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Schauglas 12 mm', einheit:'Stk.', ek: 26.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Schauglas 16 mm', einheit:'Stk.', ek: 32.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Schauglas 22 mm', einheit:'Stk.', ek: 42.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Filtertrockner 6 mm',  einheit:'Stk.', ek: 12.00, aufschlag:0.40, menge:1, aktiv:true  },
  { kat:'Armaturen & Ventile', name:'Filtertrockner 10 mm', einheit:'Stk.', ek: 16.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Filtertrockner 12 mm', einheit:'Stk.', ek: 20.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Filtertrockner 16 mm', einheit:'Stk.', ek: 26.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Rückschlagventil 6 mm',  einheit:'Stk.', ek: 14.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Rückschlagventil 10 mm', einheit:'Stk.', ek: 18.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Rückschlagventil 16 mm', einheit:'Stk.', ek: 26.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'HD-Druckwächter', einheit:'Stk.', ek: 38.00, aufschlag:0.40, menge:1, aktiv:true  },
  { kat:'Armaturen & Ventile', name:'ND-Druckwächter', einheit:'Stk.', ek: 38.00, aufschlag:0.40, menge:1, aktiv:true  },
  { kat:'Armaturen & Ventile', name:'Kombipressostat HD/ND', einheit:'Stk.', ek: 68.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Absperrventil 6 mm',  einheit:'Stk.', ek: 18.00, aufschlag:0.40, menge:2, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Absperrventil 12 mm', einheit:'Stk.', ek: 26.00, aufschlag:0.40, menge:2, aktiv:false },
  { kat:'Armaturen & Ventile', name:'Absperrventil 22 mm', einheit:'Stk.', ek: 42.00, aufschlag:0.40, menge:2, aktiv:false },

  // ── Kältemittel ───────────────────────────────────────────────────────────
  { kat:'Kältemittel', name:'R134a (HFC, Normalkühlung)',         einheit:'kg',  ek: 8.00, aufschlag:0.40, menge:2, aktiv:false },
  { kat:'Kältemittel', name:'R32 (HFC, A2L, niedrig GWP)',        einheit:'kg',  ek: 7.50, aufschlag:0.40, menge:2, aktiv:false },
  { kat:'Kältemittel', name:'R290 Propan (HC, natürlich)',         einheit:'kg',  ek: 6.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Kältemittel', name:'R600a Isobutan (HC, natürlich)',      einheit:'kg',  ek: 5.50, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Kältemittel', name:'R448A (HFO/HFC)',                    einheit:'kg',  ek:19.00, aufschlag:0.40, menge:3, aktiv:true  },
  { kat:'Kältemittel', name:'R449A (Alternative zu R404A)',        einheit:'kg',  ek:17.00, aufschlag:0.40, menge:3, aktiv:false },
  { kat:'Kältemittel', name:'R452A (HFO/HFC)',                    einheit:'kg',  ek:21.00, aufschlag:0.40, menge:2, aktiv:false },
  { kat:'Kältemittel', name:'R404A (HFC, Auslauf GWP 3920)',      einheit:'kg',  ek:34.00, aufschlag:0.40, menge:3, aktiv:false },
  { kat:'Kältemittel', name:'R507A (HFC, ähnlich R404A)',          einheit:'kg',  ek:37.00, aufschlag:0.40, menge:3, aktiv:false },
  { kat:'Kältemittel', name:'R407C (HFC, Klimaanlagen)',           einheit:'kg',  ek:14.00, aufschlag:0.40, menge:2, aktiv:false },
  { kat:'Kältemittel', name:'R410A (HFC, Split-Klima)',            einheit:'kg',  ek: 9.00, aufschlag:0.40, menge:2, aktiv:false },
  { kat:'Kältemittel', name:'R744 / CO2 (natürlich, transkrit.)', einheit:'kg',  ek: 4.00, aufschlag:0.40, menge:5, aktiv:false },
  { kat:'Kältemittel', name:'R717 Ammoniak (Industrie)',           einheit:'kg',  ek: 3.50, aufschlag:0.40, menge:5, aktiv:false },
  { kat:'Kältemittel', name:'N2 Stickstoff – Drucktest / Spülen', einheit:'m3',  ek: 0.45, aufschlag:0.40, menge:10, aktiv:true },
  { kat:'Kältemittel', name:'Vakuumpumpe (Miete / Tag)',           einheit:'Tag', ek:35.00, aufschlag:0.40, menge:1, aktiv:true  },

  // ── Löttechnik ────────────────────────────────────────────────────────────
  { kat:'Löttechnik', name:'Silberlot L-Ag5 (Stab)',          einheit:'Stk.', ek:22.00, aufschlag:0.40, menge:2, aktiv:true  },
  { kat:'Löttechnik', name:'Silberlot L-Ag15 (höherer Ag)',   einheit:'Stk.', ek:32.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Löttechnik', name:'Kupferlot L-CuP6 / Silfos (Stab)', einheit:'Stk.', ek:14.00, aufschlag:0.40, menge:3, aktiv:true  },
  { kat:'Löttechnik', name:'Flussmittel für Silberlot (100g)', einheit:'Stk.', ek: 8.50, aufschlag:0.40, menge:1, aktiv:true  },
  { kat:'Löttechnik', name:'Sauerstoff O2 (Flasche 10 l)',     einheit:'Stk.', ek:28.00, aufschlag:0.40, menge:1, aktiv:true  },
  { kat:'Löttechnik', name:'Acetylen C2H2 (Flasche 5 l)',      einheit:'Stk.', ek:38.00, aufschlag:0.40, menge:1, aktiv:true  },
  { kat:'Löttechnik', name:'Stickstoff N2 (Schutzgas, Flasche)', einheit:'Stk.', ek:22.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Löttechnik', name:'Löt-Fitting Knie 6 mm',  einheit:'Stk.', ek: 1.20, aufschlag:0.40, menge:5, aktiv:false },
  { kat:'Löttechnik', name:'Löt-Fitting Knie 10 mm', einheit:'Stk.', ek: 1.80, aufschlag:0.40, menge:5, aktiv:false },
  { kat:'Löttechnik', name:'Löt-Fitting Reduktion',  einheit:'Stk.', ek: 2.20, aufschlag:0.40, menge:5, aktiv:false },

  // ── Elektro & Steuerung ───────────────────────────────────────────────────
  { kat:'Elektro & Steuerung', name:'NYM-J 5x1,5 mm2', einheit:'m', ek: 1.20, aufschlag:0.40, menge:15, aktiv:true  },
  { kat:'Elektro & Steuerung', name:'NYM-J 5x2,5 mm2', einheit:'m', ek: 1.80, aufschlag:0.40, menge:10, aktiv:false },
  { kat:'Elektro & Steuerung', name:'NYM-J 5x4 mm2',   einheit:'m', ek: 2.60, aufschlag:0.40, menge: 8, aktiv:false },
  { kat:'Elektro & Steuerung', name:'NYM-J 3x1,5 mm2 (1-phasig)', einheit:'m', ek: 0.85, aufschlag:0.40, menge:10, aktiv:false },
  { kat:'Elektro & Steuerung', name:'NYM-J 3x2,5 mm2 (1-phasig)', einheit:'m', ek: 1.20, aufschlag:0.40, menge:10, aktiv:false },
  { kat:'Elektro & Steuerung', name:'LSS 10 A / C-Charakteristik', einheit:'Stk.', ek: 8.50, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Elektro & Steuerung', name:'LSS 16 A / C-Charakteristik', einheit:'Stk.', ek: 9.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Elektro & Steuerung', name:'LSS 20 A / C-Charakteristik', einheit:'Stk.', ek:11.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Elektro & Steuerung', name:'LSS 25 A / C-Charakteristik', einheit:'Stk.', ek:12.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Elektro & Steuerung', name:'LSS 32 A / C-Charakteristik', einheit:'Stk.', ek:14.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Elektro & Steuerung', name:'FI 16 A / 30 mA Typ A', einheit:'Stk.', ek:42.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Elektro & Steuerung', name:'FI 25 A / 30 mA Typ A', einheit:'Stk.', ek:46.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Elektro & Steuerung', name:'FI 40 A / 30 mA Typ A', einheit:'Stk.', ek:58.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Elektro & Steuerung', name:'FI 63 A / 30 mA Typ A', einheit:'Stk.', ek:75.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Elektro & Steuerung', name:'Kuehlstellenregler (digital 230V)', einheit:'Stk.', ek:65.00, aufschlag:0.40, menge:1, aktiv:true  },
  { kat:'Elektro & Steuerung', name:'Abtau-Zeitschaltuhr / Regler',     einheit:'Stk.', ek:45.00, aufschlag:0.40, menge:1, aktiv:true  },
  { kat:'Elektro & Steuerung', name:'Abtauheizung Verdampfer (230V)',   einheit:'Stk.', ek:38.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Elektro & Steuerung', name:'Kondensatheizung Wanne',           einheit:'Stk.', ek:22.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Elektro & Steuerung', name:'Elektro-Kleinmaterial (psch.)',    einheit:'psch.', ek:35.00, aufschlag:0.40, menge:1, aktiv:true  },

  // ── Verdampfer ────────────────────────────────────────────────────────────
  { kat:'Verdampfer', name:'Verdampfer 200 W NK +2°C',   einheit:'Stk.', ek: 280.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Verdampfer', name:'Verdampfer 400 W NK +2°C',   einheit:'Stk.', ek: 360.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Verdampfer', name:'Verdampfer 700 W NK +2°C',   einheit:'Stk.', ek: 460.00, aufschlag:0.35, menge:1, aktiv:true  },
  { kat:'Verdampfer', name:'Verdampfer 1.000 W NK',      einheit:'Stk.', ek: 540.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Verdampfer', name:'Verdampfer 1.500 W NK',      einheit:'Stk.', ek: 680.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Verdampfer', name:'Verdampfer 2.500 W NK',      einheit:'Stk.', ek: 880.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Verdampfer', name:'Verdampfer 3.500 W NK',      einheit:'Stk.', ek:1150.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Verdampfer', name:'Verdampfer 5.000 W NK',      einheit:'Stk.', ek:1550.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Verdampfer', name:'Verdampfer 400 W TK -18°C',  einheit:'Stk.', ek: 420.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Verdampfer', name:'Verdampfer 700 W TK -18°C',  einheit:'Stk.', ek: 520.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Verdampfer', name:'Verdampfer 1.200 W TK -18°C', einheit:'Stk.', ek: 750.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Verdampfer', name:'Verdampfer 2.000 W TK -18°C', einheit:'Stk.', ek:1050.00, aufschlag:0.35, menge:1, aktiv:false },

  // ── Kälteaggregat ─────────────────────────────────────────────────────────
  { kat:'Kälteaggregat', name:'Danfoss Optyma Plus 1,0 kW NK R448A', einheit:'Stk.', ek: 650.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Danfoss Optyma Plus 1,6 kW NK R448A', einheit:'Stk.', ek: 790.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Danfoss Optyma Plus 2,2 kW NK R448A', einheit:'Stk.', ek: 940.00, aufschlag:0.30, menge:1, aktiv:true  },
  { kat:'Kälteaggregat', name:'Danfoss Optyma Plus 3,0 kW NK R448A', einheit:'Stk.', ek:1170.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Danfoss Optyma Plus 4,4 kW NK R448A', einheit:'Stk.', ek:1480.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Danfoss Optyma Plus 6,2 kW NK R448A', einheit:'Stk.', ek:1950.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Danfoss Optyma Plus 0,9 kW TK -25°C R452A', einheit:'Stk.', ek: 740.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Danfoss Optyma Plus 1,3 kW TK -25°C R452A', einheit:'Stk.', ek: 900.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Danfoss Optyma Plus 2,1 kW TK -25°C R452A', einheit:'Stk.', ek:1150.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Embraco Silensys 0,9 kW TK -25°C R290', einheit:'Stk.', ek: 590.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Embraco Silensys 1,4 kW TK -25°C R290', einheit:'Stk.', ek: 710.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Embraco Silensys 2,2 kW TK -25°C R290', einheit:'Stk.', ek: 850.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Embraco Silensys 1,2 kW NK +2°C R290',  einheit:'Stk.', ek: 640.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Embraco Silensys 2,0 kW NK +2°C R290',  einheit:'Stk.', ek: 780.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Monoblock 1,0 kW NK Wand 230V', einheit:'Stk.', ek: 820.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Monoblock 1,5 kW NK Wand 230V', einheit:'Stk.', ek: 980.00, aufschlag:0.30, menge:1, aktiv:false },
  { kat:'Kälteaggregat', name:'Monoblock 2,5 kW NK Wand 400V', einheit:'Stk.', ek:1350.00, aufschlag:0.30, menge:1, aktiv:false },

  // ── Kühlraumzelle ─────────────────────────────────────────────────────────
  { kat:'Kühlraumzelle', name:'Kuehlraumpaneel 100 mm PU',  einheit:'m2',  ek: 52.00, aufschlag:0.35, menge:20, aktiv:false },
  { kat:'Kühlraumzelle', name:'Tiefkuehlpaneel 150 mm PU',  einheit:'m2',  ek: 72.00, aufschlag:0.35, menge:20, aktiv:false },
  { kat:'Kühlraumzelle', name:'Drehtür NK 800x2000 mm',     einheit:'Stk.', ek:680.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Kühlraumzelle', name:'Drehtür TK 800x2000 mm',     einheit:'Stk.', ek:890.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Kühlraumzelle', name:'Schiebetür 1200x2000 mm',    einheit:'Stk.', ek:1250.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Kühlraumzelle', name:'Rampenblech / Bodenprofil',  einheit:'Stk.', ek: 85.00, aufschlag:0.35, menge:1, aktiv:false },
  { kat:'Kühlraumzelle', name:'Innenbeleuchtung LED',       einheit:'Stk.', ek: 95.00, aufschlag:0.35, menge:1, aktiv:false },

  // ── Befestigung ────────────────────────────────────────────────────────────
  { kat:'Befestigung', name:'Rohrschellen-Satz (diverse)',  einheit:'Satz', ek:28.00, aufschlag:0.40, menge:1, aktiv:true  },
  { kat:'Befestigung', name:'Gewindestangen M8 x 1m',       einheit:'Stk.', ek: 3.50, aufschlag:0.40, menge:4, aktiv:false },
  { kat:'Befestigung', name:'Dämmunterlage Rohrschellen',   einheit:'Satz', ek:12.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Befestigung', name:'Kondensatschlauch (5m)',        einheit:'Stk.', ek:14.00, aufschlag:0.40, menge:1, aktiv:true  },
  { kat:'Befestigung', name:'Kernbohrung bis 100 mm',        einheit:'Stk.', ek:95.00, aufschlag:0.40, menge:1, aktiv:false },
  { kat:'Befestigung', name:'Wandrosette / Abdeckblende',   einheit:'Stk.', ek:12.00, aufschlag:0.40, menge:2, aktiv:false },
  { kat:'Befestigung', name:'Montageschaum (Flasche)',       einheit:'Stk.', ek: 8.50, aufschlag:0.40, menge:2, aktiv:false },
].map((p, i) => ({ ...p, id: 3001 + i, hinweis: '' }));

const KAT_ORDER = Object.keys(KAT_META);

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function KuehlraumKalkulation() {
  const [positionen,      setPositionen]      = useState(DEFAULT_POSITIONEN);
  const [projekt,         setProjekt]         = useState('');
  const [datum,           setDatum]           = useState(new Date().toISOString().slice(0, 10));
  const [globalAufschlag, setGlobalAufschlag] = useState('');
  const [showHinweis,     setShowHinweis]     = useState(false);
  const [arbeitsModal,    setArbeitsModal]    = useState(null);
  const [sicherungsOpen,  setSicherungsOpen]  = useState(false);
  const [kundenModal,     setKundenModal]     = useState(false);
  const [angebotMeta,     setAngebotMeta]     = useState(null); // { customerId, betreff, documentDate, validUntil }

  const updatePos = (updated) =>
    setPositionen(ps => ps.map(p => p.id === updated.id ? updated : p));
  const deletePos = (id) =>
    setPositionen(ps => ps.filter(p => p.id !== id));
  const addPos = (kat) =>
    setPositionen(ps => [...ps, {
      id: nextId(), kat, name: 'Neue Position', einheit: 'Stk.',
      aktiv: true, menge: 1, ek: 0, aufschlag: 0.40, hinweis: '',
    }]);

  const addSicherungsPos = (newPos) => {
    setPositionen(ps => [...ps, ...newPos]);
    setSicherungsOpen(false);
  };

  const applyGlobal = () => {
    const v = parseFloat(globalAufschlag) / 100;
    if (!isNaN(v)) {
      setPositionen(ps => ps.map(p => ({ ...p, aufschlag: v })));
      setGlobalAufschlag('');
    }
  };

  // Schritt 1: "Als Angebot speichern" → Kundendaten erfassen
  const handleSaveOfferClick = () => {
    setKundenModal(true);
  };

  // Schritt 2: Kundendaten bestätigt → Arbeitszeit erfassen
  const handleKundenConfirm = (meta) => {
    setAngebotMeta(meta);
    setKundenModal(false);
    setArbeitsModal('offer');
  };

  // Schritt 3: Arbeitszeit bestätigt → Angebot speichern / drucken
  const handleArbeitsConfirm = async (arbeit) => {
    if (arbeitsModal === 'offer') {
      try {
        const result = await saveAsAngebot({
          positionen, arbeit, projekt,
          datum:      angebotMeta?.documentDate || datum,
          typ:        'Kühlraum Kalkulation',
          customerId: angebotMeta?.customerId  || null,
          validUntil: angebotMeta?.validUntil  || null,
          betreff:    angebotMeta?.betreff     || null,
        });
        setAngebotMeta(null);
        const token = localStorage.getItem('danitec_token');
        if (result?.id && window.confirm(`✅ Angebot ${result.number || ''} gespeichert!\n\nJetzt als PDF öffnen?`)) {
          window.open(`/api/pdf/${result.id}?token=${token}`, '_blank');
        }
      } catch (e) { alert('Fehler: ' + e.message); }
    } else {
      druckAngebot({ positionen, arbeit, projekt, datum, typ: 'Kühlraum Kalkulation', totals });
    }
    setArbeitsModal(null);
  };

  const totals = positionen.reduce((acc, p) => {
    const c = calcPos(p);
    return {
      ekGes:    acc.ekGes    + c.ekGes,
      vkNetto:  acc.vkNetto  + c.vkGes,
      db:       acc.db       + (c.vkGes - c.ekGes),
      ust:      acc.ust      + c.ust,
      vkBrutto: acc.vkBrutto + c.vkBrutto,
      aktivePos: acc.aktivePos + (p.aktiv ? 1 : 0),
    };
  }, { ekGes: 0, vkNetto: 0, db: 0, ust: 0, vkBrutto: 0, aktivePos: 0 });

  return (
    <div className="page-body" style={{ paddingBottom: 100 }}>
      <ProjektHeader
        projekt={projekt}             setProjekt={setProjekt}
        datum={datum}                 setDatum={setDatum}
        globalAufschlag={globalAufschlag} setGlobalAufschlag={setGlobalAufschlag}
        onApplyGlobal={applyGlobal}
        showHinweis={showHinweis}     setShowHinweis={setShowHinweis}
        onReset={() => { if (window.confirm('Alle Positionen zurücksetzen?')) setPositionen(DEFAULT_POSITIONEN); }}
        onSaveOffer={handleSaveOfferClick}
        onPrint={() => setArbeitsModal('print')}
      />

      {KAT_ORDER.map(kat => {
        const katPos = positionen.filter(p => p.kat === kat);
        if (katPos.length === 0) return null;
        return (
          <div key={kat}>
            {kat === 'Elektro & Steuerung' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <button
                  onClick={() => setSicherungsOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', background: '#854f0b', color: '#fff',
                    border: 'none', borderRadius: 'var(--radius-md)',
                    cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    boxShadow: '0 2px 8px rgba(133,79,11,0.25)',
                  }}>
                  <i className="ti ti-calculator" style={{ fontSize: 14 }} />
                  Sicherung &amp; FI auslegen
                </button>
              </div>
            )}
            <KatBlock
              kat={kat}
              positionen={katPos}
              onChange={updatePos}
              onDelete={deletePos}
              onAdd={addPos}
              showHinweis={showHinweis}
              meta={KAT_META[kat]}
            />
          </div>
        );
      })}

      <SummaryBar totals={totals} />

      {kundenModal && (
        <AngebotKundenModal
          projekt={projekt}
          datum={datum}
          typ="Kühlraum Kalkulation"
          onConfirm={handleKundenConfirm}
          onCancel={() => setKundenModal(false)}
        />
      )}

      {arbeitsModal && (
        <ArbeitsModal
          mode={arbeitsModal}
          onConfirm={handleArbeitsConfirm}
          onCancel={() => { setArbeitsModal(null); setAngebotMeta(null); }}
        />
      )}

      {sicherungsOpen && (
        <SicherungsRechner
          onAdd={addSicherungsPos}
          onCancel={() => setSicherungsOpen(false)}
        />
      )}
    </div>
  );
}
