// ─── Gemeinsame React-Komponenten für Klima- & Kühlraum-Kalkulation ───────────
// Util-Funktionen (fmt, calcPos, etc.) kommen aus KalkulationUtils.js
import React, { useState } from 'react';
import { fmt, fmtPct, calcPos } from './KalkulationUtils';

// ─── Toggle Switch ────────────────────────────────────────────────────────────
export function Toggle({ on, onChange }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
        background: on ? 'var(--accent)' : 'var(--border-strong)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}

// ─── NumInput ─────────────────────────────────────────────────────────────────
export function NumInput({ value, onChange, step = 1, min = 0, prefix, suffix, small, wide }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {prefix && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{prefix}</span>}
      <input
        type="number"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        step={step} min={min}
        style={{
          width: wide ? 100 : small ? 60 : 80,
          padding: '4px 6px',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12, textAlign: 'right',
          background: '#fff', color: 'var(--text)',
        }}
      />
      {suffix && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 2 }}>{suffix}</span>}
    </div>
  );
}

// ─── Inline-Text-Input ────────────────────────────────────────────────────────
function InlineText({ value, onChange, placeholder = '…' }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%', fontSize: 13, fontWeight: 500,
        color: 'var(--text)', background: 'transparent',
        border: 'none', borderBottom: focused ? '1.5px solid var(--accent)' : '1.5px solid transparent',
        borderRadius: 0, padding: '2px 0', outline: 'none', cursor: 'text',
        transition: 'border-color 0.15s',
      }}
    />
  );
}

// ─── Positions-Zeile ──────────────────────────────────────────────────────────
const ROW_GRID = '36px 1fr 52px 68px 88px 70px 100px 26px';

export function PosRow({ pos, onChange, onDelete, showHinweis }) {
  const c = calcPos(pos);
  const inaktiv = !pos.aktiv;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: ROW_GRID,
      gap: 6, alignItems: 'center',
      padding: '7px 12px',
      borderBottom: '1px solid var(--border)',
      background: inaktiv ? 'var(--bg)' : '#fff',
      opacity: inaktiv ? 0.55 : 1,
      transition: 'opacity 0.15s, background 0.15s',
    }}>

      <Toggle on={pos.aktiv} onChange={v => onChange({ ...pos, aktiv: v })} />

      <div>
        <InlineText value={pos.name} onChange={v => onChange({ ...pos, name: v })} placeholder="Bezeichnung" />
        {showHinweis && pos.hinweis && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1, lineHeight: 1.3 }}>{pos.hinweis}</div>
        )}
      </div>

      {/* Einheit editierbar */}
      <input
        type="text"
        value={pos.einheit}
        onChange={e => onChange({ ...pos, einheit: e.target.value })}
        title="Einheit ändern (z. B. m, Stk., kg)"
        style={{
          width: '100%', padding: '3px 5px', fontSize: 11, textAlign: 'center',
          border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)',
          background: '#fff', color: 'var(--text)',
        }}
      />

      <NumInput value={pos.menge} onChange={v => onChange({ ...pos, menge: v })} step={0.5} min={0} small />
      <NumInput value={pos.ek} onChange={v => onChange({ ...pos, ek: v })} step={0.01} min={0} prefix="€" />
      <NumInput value={Math.round(pos.aufschlag * 100)} onChange={v => onChange({ ...pos, aufschlag: v / 100 })} step={1} min={0} suffix="%" small />

      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: inaktiv ? 'var(--text-tertiary)' : 'var(--accent)' }}>
        {fmt(c.vkBrutto)}
      </div>

      <button
        onClick={() => onDelete && onDelete(pos.id)}
        title="Position löschen"
        style={{
          width: 24, height: 24, borderRadius: 4, border: 'none',
          background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, fontSize: 13, transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#e53e3e'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
      >
        <i className="ti ti-trash" />
      </button>
    </div>
  );
}

// ─── Kategorie-Block ──────────────────────────────────────────────────────────
export function KatBlock({ kat, positionen, onChange, onDelete, onAdd, showHinweis, meta }) {
  const [collapsed, setCollapsed] = useState(false);
  const m = meta || { icon: 'ti-list', color: 'var(--accent)' };
  const aktiveAnzahl = positionen.filter(p => p.aktiv).length;
  const vkGesamt = positionen.reduce((s, p) => s + calcPos(p).vkBrutto, 0);

  return (
    <div className="card card-0" style={{ marginBottom: 12 }}>
      <div onClick={() => setCollapsed(c => !c)} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', cursor: 'pointer',
        background: `${m.color}12`,
        borderBottom: collapsed ? 'none' : '1px solid var(--border)',
      }}>
        <i className={`ti ${m.icon}`} style={{ color: m.color, fontSize: 18 }} />
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', flex: 1 }}>{kat}</span>
        <span style={{ fontSize: 11, background: m.color + '22', color: m.color, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
          {aktiveAnzahl} / {positionen.length} aktiv
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: m.color, minWidth: 90, textAlign: 'right' }}>{fmt(vkGesamt)}</span>
        <i className={`ti ${collapsed ? 'ti-chevron-down' : 'ti-chevron-up'}`} style={{ color: 'var(--text-tertiary)', fontSize: 14 }} />
      </div>

      {!collapsed && (
        <>
          <div className="kalkulation-scroll">
            <div>
              <div style={{
                display: 'grid', gridTemplateColumns: ROW_GRID,
                gap: 6, padding: '5px 12px',
                background: 'var(--bg)', borderBottom: '1px solid var(--border)',
              }}>
                {['', 'Material / Leistung', 'Einheit', 'Menge', 'EK netto/Stk.', 'Aufschl.', 'VK brutto ges.', ''].map((h, i) => (
                  <div key={i} style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    textAlign: i >= 6 ? 'right' : 'left',
                  }}>{h}</div>
                ))}
              </div>

              {positionen.map(p => (
                <PosRow key={p.id} pos={p} onChange={onChange} onDelete={onDelete} showHinweis={showHinweis} />
              ))}
            </div>
          </div>

          <div style={{ padding: '8px 12px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => onAdd && onAdd(kat)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', border: `1px dashed ${m.color}88`,
                borderRadius: 'var(--radius-md)', background: `${m.color}08`,
                color: m.color, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = `${m.color}18`}
              onMouseLeave={e => e.currentTarget.style.background = `${m.color}08`}
            >
              <i className="ti ti-plus" style={{ fontSize: 14 }} />
              Position hinzufügen
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────
export function SummaryBar({ totals }) {
  const db_pct = totals.vkNetto > 0 ? totals.db / totals.vkNetto : 0;
  return (
    <div className="summary-bar" style={{
      position: 'sticky', bottom: 0, zIndex: 30,
      background: 'var(--accent-dark)', borderTop: '2px solid var(--accent)',
      padding: '10px 24px', display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap',
    }}>
      {[
        { label: 'EK gesamt netto',  value: fmt(totals.ekGes),   color: '#fff' },
        { label: 'VK gesamt netto',  value: fmt(totals.vkNetto), color: '#fff' },
        { label: 'Deckungsbeitrag',  value: `${fmt(totals.db)} (${fmtPct(db_pct)})`, color: '#4ade80' },
        { label: 'USt. 20 %',        value: fmt(totals.ust),     color: '#fbbf24' },
        { label: 'VK gesamt brutto', value: fmt(totals.vkBrutto), color: '#60a5fa', big: true },
        { label: 'Aktive Pos.',      value: totals.aktivePos,    color: '#a5b4fc' },
      ].map(({ label, value, color, big }) => (
        <div key={label} className="summary-item" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</span>
          <span style={{ fontSize: big ? 18 : 14, fontWeight: big ? 700 : 600, color }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Projekt-Header ───────────────────────────────────────────────────────────
export function ProjektHeader({ projekt, setProjekt, datum, setDatum, globalAufschlag, setGlobalAufschlag, onApplyGlobal, showHinweis, setShowHinweis, onReset, onSaveOffer, onPrint }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
            <i className="ti ti-user" style={{ marginRight: 4 }} />Projekt / Kunde
          </label>
          <input type="text" value={projekt} onChange={e => setProjekt(e.target.value)}
            placeholder="z. B. Mustermann GmbH – Lager Wien"
            style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
            <i className="ti ti-calendar" style={{ marginRight: 4 }} />Datum
          </label>
          <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
            <i className="ti ti-percentage" style={{ marginRight: 4 }} />Aufschlag alle Pos.
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="number" value={globalAufschlag} onChange={e => setGlobalAufschlag(e.target.value)}
              placeholder="z. B. 40" min={0}
              style={{ width: 80, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14 }} />
            <button className="btn" style={{ background: 'var(--accent)', color: '#fff' }} onClick={onApplyGlobal}>
              <i className="ti ti-check" />
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', paddingBottom: 6 }}>
            <input type="checkbox" checked={showHinweis} onChange={e => setShowHinweis(e.target.checked)} style={{ width: 14, height: 14 }} />
            Hinweise
          </label>
          <button className="btn ghost" onClick={onReset}>
            <i className="ti ti-refresh" />Zurücksetzen
          </button>
          <button className="btn" style={{ background: 'var(--green)', color: '#fff' }} onClick={onSaveOffer}>
            <i className="ti ti-device-floppy" />Als Angebot speichern
          </button>
          <button className="btn" style={{ background: '#152248', color: '#fff' }} onClick={onPrint}>
            <i className="ti ti-printer" />PDF / Drucken
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Arbeitszeit Modal ────────────────────────────────────────────────────────
export function ArbeitsModal({ onConfirm, onCancel, mode = 'offer' }) {
  const [stunden, setStunden]         = useState(8);
  const [stundensatz, setStundensatz] = useState(65);
  const [techniker, setTechniker]     = useState('');
  const [hinweis, setHinweis]         = useState('');
  const betragNetto = stunden * stundensatz;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 'var(--radius-lg)', padding: 28,
        width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-md)',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-clock" style={{ color: 'var(--accent)' }} />
          Arbeitszeit erfassen
        </h2>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Stunden</label>
            <input type="number" value={stunden} onChange={e => setStunden(+e.target.value || 0)} min={0} step={0.5}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 15 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Stundensatz (€)</label>
            <input type="number" value={stundensatz} onChange={e => setStundensatz(+e.target.value || 0)} min={0} step={5}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 15 }} />
          </div>
        </div>

        <div style={{ background: 'var(--accent-light)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{stunden}h × {fmt(stundensatz)}/h</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{fmt(betragNetto)} netto</span>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Techniker / Mitarbeiter (optional)</label>
          <input type="text" value={techniker} onChange={e => setTechniker(e.target.value)} placeholder="z. B. M. Mustermann"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14 }} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Anmerkung (optional)</label>
          <textarea value={hinweis} onChange={e => setHinweis(e.target.value)} rows={2} placeholder="z. B. Erschwernis, Kernbohrung, ..."
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onCancel}>Abbrechen</button>
          <button className="btn" style={{ background: 'var(--green)', color: '#fff' }}
            onClick={() => onConfirm({ stunden, stundensatz, betragNetto, techniker, hinweis })}>
            <i className="ti ti-check" />
            {mode === 'offer' ? 'Angebot erstellen' : 'PDF erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}
