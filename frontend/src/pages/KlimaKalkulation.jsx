// ─── Klimamontage Kalkulation ─────────────────────────────────────────────────
import React, { useState, useMemo, useEffect } from 'react';
import { fmt, fmtPct, calcPos, saveAsAngebot, druckAngebot } from './KalkulationUtils';
import { KatBlock, SummaryBar, ProjektHeader, ArbeitsModal } from './KalkulationShared';
import api from '../api/client';

// ── Angebot-Kundendaten Modal (shared logic) ──────────────────────────────────
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
  const overlay = { position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999 };
  const box = { background:'var(--surface)',borderRadius:'var(--radius-lg)',padding:28,width:480,maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.25)' };
  const label = { fontSize:12,fontWeight:600,color:'var(--text-secondary)',marginBottom:4,display:'block' };
  const inp = { width:'100%',boxSizing:'border-box' };
  return (
    <div style={overlay} onClick={e => e.target===e.currentTarget && onCancel()}>
      <div style={box}>
        <div style={{fontWeight:700,fontSize:17,marginBottom:20}}>
          <i className="ti ti-clipboard-text" style={{marginRight:8,color:'var(--primary)'}}/> Angebot erstellen
        </div>
        <div style={{marginBottom:14}}>
          <label style={label}>Kunde</label>
          <select value={form.customerId} onChange={e=>sf('customerId',e.target.value)} style={inp}>
            <option value="">— Kein Kunde (intern) —</option>
            {customers.map(c=><option key={c.id} value={c.id}>{c.company_name||`${c.first_name||''} ${c.last_name||''}`.trim()}</option>)}
          </select>
        </div>
        <div style={{marginBottom:14}}>
          <label style={label}>Betreff / Projektbezeichnung</label>
          <input value={form.betreff} onChange={e=>sf('betreff',e.target.value)} style={inp} placeholder="z.B. Klimaanlage – Muster GmbH"/>
        </div>
        <div style={{display:'flex',gap:12,marginBottom:14}}>
          <div style={{flex:1}}>
            <label style={label}>Angebotsdatum</label>
            <input type="date" value={form.documentDate} onChange={e=>sf('documentDate',e.target.value)} style={inp}/>
          </div>
          <div style={{flex:1}}>
            <label style={label}>Gültig bis</label>
            <input type="date" value={form.validUntil} onChange={e=>sf('validUntil',e.target.value)} style={inp}/>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:24}}>
          <button className="btn" onClick={onCancel}>Abbrechen</button>
          <button className="btn primary" onClick={()=>onConfirm(form)}>
            <i className="ti ti-arrow-right"/> Weiter zu Arbeitszeit
          </button>
        </div>
      </div>
    </div>
  );
}

let _nextId = 2000;
const nextId = () => ++_nextId;

// ─── Standardpositionen aus Excel ────────────────────────────────────────────
const DEFAULT_POSITIONEN = [
  // KÄLTEMITTELKREIS
  { id: 1,  kat: 'Kältemittelkreis', name: 'Kupfer-Doppelleitung isoliert 6/10 mm',               einheit: 'm',    aktiv: true,  menge: 1, ek: 11.60, aufschlag: 0.35, hinweis: 'Typische Dim. für Singlesplit; Herstellerangabe prüfen.' },
  { id: 2,  kat: 'Kältemittelkreis', name: 'Kupfer-Doppelleitung isoliert 6/12 mm',               einheit: 'm',    aktiv: false, menge: 1, ek: 14.50, aufschlag: 0.35, hinweis: 'Alternative Dim.; nicht gleichzeitig mit 6/10 oder 6/16.' },
  { id: 3,  kat: 'Kältemittelkreis', name: 'Kupfer-Doppelleitung isoliert 6/16 mm',               einheit: 'm',    aktiv: false, menge: 1, ek: 20.50, aufschlag: 0.35, hinweis: 'Alternative für größere Geräte; Herstellerangabe prüfen.' },
  { id: 4,  kat: 'Kältemittelkreis', name: 'R32 Kältemittel – Preis je 1 kg',                    einheit: 'kg',   aktiv: false, menge: 1, ek: 37.50, aufschlag: 0.45, hinweis: 'Nur bei Nachfüllung; Menge laut Hersteller pro Meter.' },
  { id: 5,  kat: 'Kältemittelkreis', name: 'R410A Kältemittel – Preis je 1 kg',                  einheit: 'kg',   aktiv: false, menge: 1, ek: 39.90, aufschlag: 0.45, hinweis: 'Nur bei geeigneten Bestandsanlagen; Vorgaben prüfen.' },
  { id: 6,  kat: 'Kältemittelkreis', name: 'Stickstoff Druckprobe/Spülung – 1 Verbrauchseinheit', einheit: 'Stk.', aktiv: true, menge: 1, ek: 14.00, aufschlag: 0.50, hinweis: 'Verbrauchsanteil inkl. Flaschen-/Beschaffungskosten.' },
  { id: 7,  kat: 'Kältemittelkreis', name: 'UV-Schutzband / Wickelband – 1 Rolle',               einheit: 'Stk.', aktiv: true,  menge: 1, ek:  8.50, aufschlag: 0.45, hinweis: 'Schutz der Isolierung im Außenbereich.' },
  { id: 8,  kat: 'Kältemittelkreis', name: 'Isolierband / Armaflex-Klebeband – 1 Rolle',         einheit: 'Stk.', aktiv: true,  menge: 1, ek:  6.50, aufschlag: 0.45, hinweis: 'Für Anschlüsse, Nachisolierung und beschädigte Stellen.' },
  // KONDENSAT
  { id: 9,  kat: 'Kondensat', name: 'Kondensatschlauch 16–20 mm',                               einheit: 'm',    aktiv: true,  menge: 1, ek:  1.50, aufschlag: 0.40, hinweis: 'Dim. passend zum Innengerät; gleichmäßiges Gefälle.' },
  { id: 10, kat: 'Kondensat', name: 'Kondensat-Kleinmaterialpaket: Formteile, Verbinder, Schellen', einheit: 'Stk.', aktiv: true, menge: 1, ek: 9.00, aufschlag: 0.50, hinweis: 'Verbinder, Reduzierungen, Schellen und Befestigung.' },
  { id: 11, kat: 'Kondensat', name: 'Kondensatpumpe Sauermann SI-10 oder gleichwertig',          einheit: 'Stk.', aktiv: false, menge: 1, ek: 109.00, aufschlag: 0.35, hinweis: 'Nur wenn freier Ablauf mit Gefälle nicht möglich.' },
  { id: 12, kat: 'Kondensat', name: 'Druckschlauch 6 mm für Kondensatpumpe',                     einheit: 'm',    aktiv: false, menge: 1, ek:  1.10, aufschlag: 0.45, hinweis: 'Nur bei Kondensatpumpe; Förderhöhe beachten.' },
  { id: 13, kat: 'Kondensat', name: 'Kondensat-Zubehörset: Siphon, Rückschlagventil',            einheit: 'Stk.', aktiv: false, menge: 1, ek: 16.00, aufschlag: 0.45, hinweis: 'Je nach Leitungsführung und Entwässerungssituation.' },
  // ELEKTRO
  { id: 14, kat: 'Elektro', name: 'Gerätezuleitung NYM-J 3 × 1,5 mm²',                          einheit: 'm',    aktiv: false, menge: 1, ek:  0.58, aufschlag: 0.35, hinweis: 'Querschnitt nur nach Leistung, Länge und Verlegeart.' },
  { id: 15, kat: 'Elektro', name: 'Gerätezuleitung NYM-J 3 × 2,5 mm²',                          einheit: 'm',    aktiv: true,  menge: 1, ek:  1.22, aufschlag: 0.35, hinweis: 'Beispielwert; Herstellerangabe und Spannungsfall prüfen.' },
  { id: 16, kat: 'Elektro', name: 'Gerätezuleitung NYM-J 5 × 1,5 mm²',                          einheit: 'm',    aktiv: false, menge: 1, ek:  1.22, aufschlag: 0.35, hinweis: 'Alternative bei mehrphasiger Versorgung.' },
  { id: 17, kat: 'Elektro', name: 'Gerätezuleitung NYM-J 5 × 2,5 mm²',                          einheit: 'm',    aktiv: false, menge: 1, ek:  1.63, aufschlag: 0.35, hinweis: 'Alternative bei größerer Leistung / mehrphasig.' },
  { id: 18, kat: 'Elektro', name: 'Verbindungs-/Kommunikationsleitung Innen–Außen',              einheit: 'm',    aktiv: true,  menge: 1, ek:  1.60, aufschlag: 0.40, hinweis: 'Aderzahl und Querschnitt exakt nach Schaltplan.' },
  { id: 19, kat: 'Elektro', name: 'Reparatur-/Lasttrennschalter beim Außengerät',                einheit: 'Stk.', aktiv: true,  menge: 1, ek: 28.00, aufschlag: 0.35, hinweis: 'Ausführung und Schutzart entsprechend Aufstellort.' },
  { id: 20, kat: 'Elektro', name: 'Leitungsschutzschalter 1+N B/C16',                           einheit: 'Stk.', aktiv: true,  menge: 1, ek:  7.50, aufschlag: 0.35, hinweis: 'Charakteristik und Nennstrom nach Herstellerangabe.' },
  { id: 21, kat: 'Elektro', name: 'Leitungsschutzschalter 3+N B/C16–20',                        einheit: 'Stk.', aktiv: false, menge: 1, ek: 25.00, aufschlag: 0.35, hinweis: 'Nur bei dreiphasiger Versorgung.' },
  { id: 22, kat: 'Elektro', name: 'Fehlerstromschutzschalter Typ A 40 A / 30 mA',               einheit: 'Stk.', aktiv: false, menge: 1, ek: 37.00, aufschlag: 0.35, hinweis: 'Nur wenn nicht vorhanden; Typ nach Norm prüfen.' },
  { id: 23, kat: 'Elektro', name: 'FI/LS Kombination 1+N C16 Typ A / 30 mA',                   einheit: 'Stk.', aktiv: false, menge: 1, ek: 32.00, aufschlag: 0.35, hinweis: 'Alternative Kombination FI + LS.' },
  { id: 24, kat: 'Elektro', name: 'Kleinverteiler / Aufputzgehäuse',                            einheit: 'Stk.', aktiv: false, menge: 1, ek: 22.00, aufschlag: 0.40, hinweis: 'Nur bei erforderlicher Erweiterung.' },
  { id: 25, kat: 'Elektro', name: 'Elektro-Kleinmaterialpaket: Hülsen, Klemmen, Kabelbinder',   einheit: 'Stk.', aktiv: true,  menge: 1, ek: 14.00, aufschlag: 0.50, hinweis: 'Elektrisches Klein- und Anschlussmaterial.' },
  // LEITUNGSFÜHRUNG
  { id: 26, kat: 'Leitungsführung', name: 'Klimakanal 80 × 60 mm, UV-beständig',                einheit: 'm',    aktiv: true,  menge: 1, ek:  6.45, aufschlag: 0.40, hinweis: 'Kanalgröße nach Rohrpaket und Leitungsanzahl.' },
  { id: 27, kat: 'Leitungsführung', name: 'Klimakanal-Formteile: Innen-/Außenecken',            einheit: 'Stk.', aktiv: true,  menge: 1, ek:  6.50, aufschlag: 0.45, hinweis: 'Anzahl entsprechend Leitungsweg.' },
  { id: 28, kat: 'Leitungsführung', name: 'Klimakanal-Wandabschluss / Endstück',                einheit: 'Stk.', aktiv: true,  menge: 1, ek:  5.50, aufschlag: 0.45, hinweis: 'Für saubere Ein- und Austritte.' },
  { id: 29, kat: 'Leitungsführung', name: 'Durchführungshülse / Schutzrohr',                    einheit: 'Stk.', aktiv: true,  menge: 1, ek:  4.00, aufschlag: 0.50, hinweis: 'Für Kernbohrung; leicht mit Gefälle nach außen.' },
  { id: 30, kat: 'Leitungsführung', name: 'Rosetten-/Abdeckungsset innen und außen',            einheit: 'Stk.', aktiv: true,  menge: 1, ek:  8.00, aufschlag: 0.45, hinweis: 'Optischer und konstruktiver Abschluss der Durchführung.' },
  { id: 31, kat: 'Leitungsführung', name: 'Dichtstoffpaket: Silikon, Acryl und PU-Schaum',      einheit: 'Stk.', aktiv: true,  menge: 1, ek: 18.00, aufschlag: 0.50, hinweis: 'Witterungsbeständiges Material im Außenbereich.' },
  { id: 32, kat: 'Leitungsführung', name: 'Brandschutzabschottung',                             einheit: 'Stk.', aktiv: false, menge: 1, ek: 75.00, aufschlag: 0.40, hinweis: 'Nur bei Durchdringung brandschutztechnisch relevanter Bauteile.' },
  // BEFESTIGUNG
  { id: 33, kat: 'Befestigung', name: 'Befestigungspaket: Schrauben und Standarddübel',         einheit: 'Stk.', aktiv: true,  menge: 1, ek: 12.00, aufschlag: 0.50, hinweis: 'Passend zu Beton, Vollziegel oder Lochziegel.' },
  { id: 34, kat: 'Befestigung', name: 'WDVS-/Vollwärmeschutz-Abstandsmontageset',              einheit: 'Stk.', aktiv: false, menge: 1, ek: 75.00, aufschlag: 0.40, hinweis: 'Statisch geeignete, wärmebrückenarme Befestigung.' },
  { id: 35, kat: 'Befestigung', name: 'Wandkonsole Außengerät 450 mm',                          einheit: 'Stk.', aktiv: true,  menge: 1, ek: 31.00, aufschlag: 0.40, hinweis: 'Traglast, Tiefe und Untergrund prüfen.' },
  { id: 36, kat: 'Befestigung', name: 'Edelstahl-Wandkonsole Außengerät',                       einheit: 'Stk.', aktiv: false, menge: 1, ek: 123.00,aufschlag: 0.35, hinweis: 'Optional bei erhöhter Korrosionsbelastung.' },
  { id: 37, kat: 'Befestigung', name: 'Schwingungsdämpfersatz – 4 Stück',                       einheit: 'Stk.', aktiv: true,  menge: 1, ek:  8.00, aufschlag: 0.50, hinweis: 'Für Wandkonsole oder Montagerahmen.' },
  { id: 38, kat: 'Befestigung', name: 'Big-Foot-/Dämpfungssockel-Satz 600 mm',                 einheit: 'Stk.', aktiv: false, menge: 1, ek: 55.00, aufschlag: 0.40, hinweis: 'Alternative bei Boden- oder Dachaufstellung.' },
  { id: 39, kat: 'Befestigung', name: 'Unterlagenset für Bodenmontage',                         einheit: 'Stk.', aktiv: false, menge: 1, ek: 18.00, aufschlag: 0.45, hinweis: 'Nur bei Bodenaufstellung; Tragfähigkeit beachten.' },
  { id: 40, kat: 'Befestigung', name: 'Kondensatwanne / Ablauf Außengerät',                     einheit: 'Stk.', aktiv: false, menge: 1, ek: 85.00, aufschlag: 0.40, hinweis: 'Bei kritischer Entwässerung im Heizbetrieb.' },
  { id: 41, kat: 'Befestigung', name: 'Begleitheizung für Kondensatwanne/Ablauf',               einheit: 'Stk.', aktiv: false, menge: 1, ek: 110.00,aufschlag: 0.35, hinweis: 'Nur bei Frostgefahr und geeignetem Gerät.' },
  // KERNBOHRUNG
  { id: 42, kat: 'Kernbohrung', name: 'Durchbruch durch Gipskarton / Holz',                     einheit: 'Stk.', aktiv: false, menge: 1, ek: 25.00, aufschlag: 0.50, hinweis: 'Preis je Bohrung; Menge und Aufschlag frei änderbar.' },
  { id: 43, kat: 'Kernbohrung', name: 'Kernbohrung durch Ziegel / Mauerwerk',                   einheit: 'Stk.', aktiv: false, menge: 1, ek: 55.00, aufschlag: 0.50, hinweis: 'Preis je Bohrung; Menge und Aufschlag frei änderbar.' },
];

const KAT_META = {
  'Kältemittelkreis': { icon: 'ti-pipe',        color: '#2D9CDB' },
  'Kondensat':        { icon: 'ti-droplet',      color: '#3c3489' },
  'Elektro':          { icon: 'ti-bolt',         color: '#854f0b' },
  'Leitungsführung':  { icon: 'ti-route',        color: '#0f6e56' },
  'Befestigung':      { icon: 'ti-anchor',       color: '#152248' },
  'Kernbohrung':      { icon: 'ti-drill',        color: '#a32d2d' },
};

const ORDER = ['Kältemittelkreis','Kondensat','Elektro','Leitungsführung','Befestigung','Kernbohrung'];

export default function KlimaKalkulation() {
  const [positionen, setPositionen] = useState(DEFAULT_POSITIONEN);
  const [projekt, setProjekt]       = useState('');
  const [datum, setDatum]           = useState(new Date().toISOString().slice(0, 10));
  const [showHinweis, setShowHinweis] = useState(false);
  const [globalAufschlag, setGlobalAufschlag] = useState('');
  const [showArbeitsModal, setShowArbeitsModal] = useState(false);
  const [arbeitsModalMode, setArbeitsModalMode] = useState('offer');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(null);
  const [kundenModal, setKundenModal] = useState(false);
  const [angebotMeta, setAngebotMeta] = useState(null);

  const applyGlobal = () => {
    const v = parseFloat(globalAufschlag);
    if (!isNaN(v) && v >= 0) {
      setPositionen(ps => ps.map(p => ({ ...p, aufschlag: v / 100 })));
      setGlobalAufschlag('');
    }
  };

  const updatePos = (updated) => setPositionen(ps => ps.map(p => p.id === updated.id ? updated : p));
  const deletePos = (id) => setPositionen(ps => ps.filter(p => p.id !== id));
  const addPos = (kat) => setPositionen(ps => [...ps, {
    id: nextId(), kat, name: 'Neue Position', einheit: 'Stk.', aktiv: true, menge: 1, ek: 0, aufschlag: 0.35, hinweis: '',
  }]);

  const reset = () => {
    if (window.confirm('Alle Positionen auf Standardwerte zurücksetzen?')) setPositionen(DEFAULT_POSITIONEN);
  };

  const totals = useMemo(() => {
    let ekGes = 0, vkNetto = 0, ust = 0, vkBrutto = 0, aktivePos = 0;
    for (const p of positionen) {
      const c = calcPos(p);
      ekGes    += c.ekGes;
      vkNetto  += c.vkGes;
      ust      += c.ust;
      vkBrutto += c.vkBrutto;
      if (p.aktiv) aktivePos++;
    }
    return { ekGes, vkNetto, db: vkNetto - ekGes, ust, vkBrutto, aktivePos };
  }, [positionen]);

  const kategorien = useMemo(() =>
    ORDER.map(kat => ({ kat, positionen: positionen.filter(p => p.kat === kat) })),
    [positionen]
  );

  const handleSaveOffer = () => { setKundenModal(true); };
  const handlePrint     = () => { setArbeitsModalMode('print'); setShowArbeitsModal(true); };

  const handleKundenConfirm = (meta) => {
    setAngebotMeta(meta);
    setKundenModal(false);
    setArbeitsModalMode('offer');
    setShowArbeitsModal(true);
  };

  const handleArbeitsConfirm = async (arbeit) => {
    setShowArbeitsModal(false);
    if (arbeitsModalMode === 'print') {
      druckAngebot({ positionen, arbeit, projekt, datum, typ: 'Klimaanlage-Montage', totals });
    } else {
      setSaving(true);
      try {
        const r = await saveAsAngebot({
          positionen, arbeit, projekt,
          datum:      angebotMeta?.documentDate || datum,
          typ:        'Klimaanlage-Montage',
          customerId: angebotMeta?.customerId   || null,
          validUntil: angebotMeta?.validUntil   || null,
          betreff:    angebotMeta?.betreff      || null,
        });
        setAngebotMeta(null);
        setSaved({ id: r.id, number: r.number });
        const token = localStorage.getItem('danitec_token');
        if (window.confirm(`✅ Angebot ${r.number} gespeichert!\n\nJetzt als PDF öffnen?`)) {
          window.open(`/api/pdf/${r.id}?token=${token}`, '_blank');
        }
      } catch (e) {
        alert('Fehler beim Speichern: ' + e.message);
      }
      setSaving(false);
    }
  };

  return (
    <div className="page-body" style={{ paddingBottom: 80 }}>

      {saved && (
        <div style={{
          background: 'var(--green-light)', border: '1px solid var(--green)',
          borderRadius: 'var(--radius-md)', padding: '10px 16px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
        }}>
          <i className="ti ti-circle-check" style={{ color: 'var(--green)', fontSize: 18 }} />
          <span>Angebot <strong>{saved.number}</strong> gespeichert — öffne „Angebote" in der Sidebar um es zu bearbeiten oder als Rechnung umzuwandeln.</span>
          <button className="btn ghost" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => setSaved(null)}>✕</button>
        </div>
      )}

      <ProjektHeader
        projekt={projekt} setProjekt={setProjekt}
        datum={datum} setDatum={setDatum}
        globalAufschlag={globalAufschlag} setGlobalAufschlag={setGlobalAufschlag}
        onApplyGlobal={applyGlobal}
        showHinweis={showHinweis} setShowHinweis={setShowHinweis}
        onReset={reset}
        onSaveOffer={handleSaveOffer}
        onPrint={handlePrint}
      />

      {/* Schnellübersicht */}
      <div className="metric-grid" style={{ marginBottom: 16 }}>
        {[
          { label: 'EK gesamt netto',  value: fmt(totals.ekGes),    cls: '' },
          { label: 'VK gesamt netto',  value: fmt(totals.vkNetto),  cls: 'blue' },
          { label: 'Deckungsbeitrag',  value: fmt(totals.db),       cls: 'green' },
          { label: 'DB %',             value: fmtPct(totals.vkNetto > 0 ? totals.db / totals.vkNetto : 0), cls: 'green' },
          { label: 'USt. 20 %',        value: fmt(totals.ust),      cls: 'amber' },
          { label: 'VK gesamt brutto', value: fmt(totals.vkBrutto), cls: 'blue' },
          { label: 'Aktive Positionen',value: totals.aktivePos,     cls: '' },
        ].map(({ label, value, cls }) => (
          <div className="metric-card" key={label}>
            <div className="metric-label">{label}</div>
            <div className={`metric-value ${cls}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Kategorien */}
      {kategorien.map(({ kat, positionen: pos }) => (
        <KatBlock key={kat} kat={kat} positionen={pos} onChange={updatePos} onDelete={deletePos} onAdd={addPos} showHinweis={showHinweis} meta={KAT_META[kat]} />
      ))}

      <SummaryBar totals={totals} />

      {kundenModal && (
        <AngebotKundenModal
          projekt={projekt}
          datum={datum}
          typ="Klimaanlage-Montage"
          onConfirm={handleKundenConfirm}
          onCancel={() => setKundenModal(false)}
        />
      )}

      {showArbeitsModal && (
        <ArbeitsModal
          mode={arbeitsModalMode}
          onConfirm={handleArbeitsConfirm}
          onCancel={() => { setShowArbeitsModal(false); setAngebotMeta(null); }}
        />
      )}
    </div>
  );
}
