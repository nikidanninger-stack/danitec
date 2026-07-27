import React from 'react';

// ─── Formatierung ─────────────────────────────────────────────────────────────
export const fmt    = (n) => new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'}).format(n||0);
export const fmtDate= (d) => d ? new Date(d).toLocaleDateString('de-AT') : '—';
export const today  = () => new Date().toISOString().split('T')[0];
export const addDays= (d,n)=>{ const dt=new Date(d); dt.setDate(dt.getDate()+n); return dt.toISOString().split('T')[0]; };

// ─── Status Badge ─────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  Bezahlt:'green', paid:'green', active:'green', aktiv:'green', Angenommen:'green',
  Offen:'blue', open:'blue', draft:'blue', Entwurf:'gray',
  Überfällig:'red', overdue:'red', cancelled:'red', Storniert:'red', Abgelehnt:'red',
  Versendet:'amber', sent:'amber', Gemahnt:'amber', partial_paid:'amber', Teilbezahlt:'amber',
  finalized:'blue', 'In Rechnung':'purple',
};

export function StatusBadge({ status, label }) {
  const color = STATUS_COLORS[status] || 'gray';
  return <span className={`badge ${color}`}>{label || status}</span>;
}

// Status → deutsche Anzeige
export const STATUS_LABELS = {
  draft:'Entwurf', finalized:'Offen', sent:'Versendet', partial_paid:'Teilbezahlt',
  paid:'Bezahlt', overdue:'Überfällig', cancelled:'Storniert', dunned:'Gemahnt',
  active:'Aktiv', sold:'Verkauft', retired:'Ausgeschieden',
  open:'Offen',
};

// ─── Alert ────────────────────────────────────────────────────────────────────
export function Alert({ type='info', children, icon }) {
  const icons = { info:'ti-info-circle', warning:'ti-alert-triangle', success:'ti-check-circle', danger:'ti-alert-circle' };
  return (
    <div className={`alert ${type}`}>
      <i className={`ti ${icon||icons[type]}`}/>
      <div>{children}</div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer, maxWidth=700 }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth}}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn ghost icon sm" onClick={onClose}><i className="ti ti-x"/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel='Bestätigen', danger=false }) {
  return (
    <Modal open={open} onClose={onClose} title={title||'Bestätigen'} maxWidth={420}
      footer={<>
        <button className="btn" onClick={onClose}>Abbrechen</button>
        <button className={`btn ${danger?'danger':'primary'}`} onClick={()=>{onConfirm();onClose();}}>{confirmLabel}</button>
      </>}>
      <p style={{fontSize:14,color:'var(--text-secondary)'}}>{message}</p>
    </Modal>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({ icon='ti-inbox', title='Keine Daten', subtitle, action }) {
  return (
    <div className="empty-state">
      <i className={`ti ${icon}`}/>
      <p style={{fontWeight:500,marginBottom:4}}>{title}</p>
      {subtitle && <p style={{fontSize:12,marginBottom:12}}>{subtitle}</p>}
      {action}
    </div>
  );
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────
export function Spinner({ dark=false }) {
  return <span className={`spinner ${dark?'dark':''}`}/>;
}

// ─── Form Helpers ─────────────────────────────────────────────────────────────
export function FormGroup({ label, children, required }) {
  return (
    <div className="form-group">
      <label>{label}{required&&<span style={{color:'var(--red)',marginLeft:2}}>*</span>}</label>
      {children}
    </div>
  );
}

export function FormRow({ children, cols=2 }) {
  return (
    <div className={`form-row${cols===3?'-3':''}`} style={cols>3?{gridTemplateColumns:`repeat(${cols},1fr)`,gap:11,marginBottom:11}:{}}>
      {children}
    </div>
  );
}

// ─── Totals Box ───────────────────────────────────────────────────────────────
export function TotalsBox({ netto, ust, brutto, small_business=false }) {
  return (
    <div className="totals-box">
      <div className="totals-row"><span style={{color:'var(--text-secondary)'}}>Netto gesamt</span><span>{fmt(netto)}</span></div>
      {!small_business && <div className="totals-row"><span style={{color:'var(--text-secondary)'}}>Umsatzsteuer</span><span>{fmt(ust)}</span></div>}
      <div className="totals-row total"><span>Brutto gesamt</span><span>{fmt(brutto)}</span></div>
    </div>
  );
}

// ─── Positions Editor ─────────────────────────────────────────────────────────
export function calcPos(p) {
  const n = (parseFloat(p.quantity)||0)*(parseFloat(p.unit_price_net)||0);
  const rab = n*(parseFloat(p.discount_percent)||0)/100;
  const nR = n - rab;
  const u = nR*(parseFloat(p.vat_rate)||0)/100;
  return {...p, net_amount: Math.round(nR*100)/100, vat_amount: Math.round(u*100)/100, gross_amount: Math.round((nR+u)*100)/100};
}

export function calcTotals(positions) {
  const ps = positions.map(calcPos);
  return {
    net_total:   Math.round(ps.reduce((s,p)=>s+(p.net_amount||0),0)*100)/100,
    vat_total:   Math.round(ps.reduce((s,p)=>s+(p.vat_amount||0),0)*100)/100,
    gross_total: Math.round(ps.reduce((s,p)=>s+(p.gross_amount||0),0)*100)/100,
  };
}

export function PositionsEditor({ positions, onChange, products=[], disabled=false }) {
  const update = (i, field, val) => {
    const next = positions.map((p,j) => j===i ? {...p,[field]:val} : p);
    onChange(next);
  };
  const add = () => onChange([...positions, {description:'',quantity:1,unit:'Std',unit_price_net:0,discount_percent:0,vat_rate:20}]);
  const remove = (i) => onChange(positions.filter((_,j)=>j!==i));

  return (
    <>
      <table className="pos-table">
        <thead>
          <tr>
            <th style={{width:'34%'}}>Beschreibung</th>
            <th style={{width:'9%'}}>Menge</th>
            <th style={{width:'9%'}}>Einheit</th>
            <th style={{width:'12%'}}>Netto €</th>
            <th style={{width:'7%'}}>Rab%</th>
            <th style={{width:'7%'}}>USt%</th>
            <th style={{width:'11%',textAlign:'right'}}>Netto</th>
            <th style={{width:'11%',textAlign:'right'}}>Brutto</th>
            {!disabled && <th style={{width:'0'}}/>}
          </tr>
        </thead>
        <tbody>
          {positions.map((p,i) => {
            const cp = calcPos(p);
            return (
              <tr key={i}>
                <td>
                  {disabled ? <span style={{fontSize:12}}>{p.description}</span> :
                  <select value={p.description} onChange={e=>{
                    const pr = products.find(x=>x.name===e.target.value);
                    if (pr) {
                      // Alle Felder in einem einzigen onChange-Aufruf setzen (sonst überschreibt jedes update das vorherige)
                      onChange(positions.map((pos,j) => j===i
                        ? {...pos, description:pr.name, unit_price_net:parseFloat(pr.net_price)||0, vat_rate:pr.vat_rate, unit:pr.unit}
                        : pos));
                    } else {
                      update(i,'description',e.target.value);
                    }
                  }}>
                    <option value="">Auswählen oder eingeben...</option>
                    {products.map(pr=><option key={pr.id} value={pr.name}>{pr.name}</option>)}
                  </select>}
                </td>
                <td>{disabled?<span style={{fontSize:12}}>{p.quantity}</span>:<input type="number" value={p.quantity} min="0" step="0.5" onChange={e=>update(i,'quantity',e.target.value)}/>}</td>
                <td>{disabled?<span style={{fontSize:12}}>{p.unit}</span>:
  <select value={p.unit||'Std'} onChange={e=>update(i,'unit',e.target.value)}>
    <option value="Std">Std</option>
    <option value="Stück">Stück</option>
    <option value="m²">m²</option>
    <option value="m">m</option>
    <option value="kg">kg</option>
    <option value="Pauschal">Pauschal</option>
    <option value="km">km</option>
    <option value="l">l</option>
  </select>}</td>
                <td>{disabled?<span style={{fontSize:12}}>{p.unit_price_net}</span>:<input type="number" value={p.unit_price_net} min="0" step="0.01" onChange={e=>update(i,'unit_price_net',e.target.value)}/>}</td>
                <td>{disabled?<span style={{fontSize:12}}>{p.discount_percent||0}%</span>:<input type="number" value={p.discount_percent||0} min="0" max="100" step="1" onChange={e=>update(i,'discount_percent',e.target.value)}/>}</td>
                <td>{disabled?<span style={{fontSize:12}}>{p.vat_rate}%</span>:
                  <select value={p.vat_rate} onChange={e=>update(i,'vat_rate',e.target.value)}>
                    <option value="20">20%</option><option value="10">10%</option><option value="13">13%</option><option value="0">0%</option>
                  </select>}
                </td>
                <td style={{textAlign:'right',padding:'3px 8px',fontSize:12}}>{fmt(cp.net_amount)}</td>
                <td style={{textAlign:'right',padding:'3px 8px',fontSize:12,fontWeight:500}}>{fmt(cp.gross_amount)}</td>
                {!disabled && <td><button className="btn xs danger" style={{padding:'2px 5px'}} onClick={()=>remove(i)}><i className="ti ti-trash"/></button></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!disabled && <button className="btn sm" onClick={add} style={{marginBottom:8}}><i className="ti ti-plus"/>Position</button>}
    </>
  );
}

// ─── Email Modal ──────────────────────────────────────────────────────────────
export function EmailModal({ open, onClose, doc, onSend }) {
  const [to,   setTo]   = React.useState(doc?.customer_email || '');
  const [subj, setSubj] = React.useState('');
  const [body, setBody] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [sent,    setSent]    = React.useState(false);

  React.useEffect(() => {
    if (doc) {
      setTo(doc.customer_email || '');
      setSubj(`${doc.type==='invoice'?'Rechnung':'Angebot'} ${doc.number}`);
      setBody(`Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie unser${doc.type==='invoice'?'e Rechnung':' Angebot'} ${doc.number}.\n\nMit freundlichen Grüßen`);
    }
  }, [doc]);

  const handleSend = async () => {
    setSending(true);
    try { await onSend({ toEmail:to, subject:subj, bodyText:body }); setSent(true); setTimeout(onClose,1500); }
    catch(e) { alert('Fehler beim Senden: '+e.message); }
    finally { setSending(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Per E-Mail senden" maxWidth={500}
      footer={!sent && <>
        <button className="btn" onClick={onClose}>Abbrechen</button>
        <button className="btn primary" onClick={handleSend} disabled={!to||sending}>
          {sending ? <Spinner/> : <><i className="ti ti-send"/>Jetzt senden</>}
        </button>
      </>}>
      {sent
        ? <Alert type="success">E-Mail erfolgreich versendet!</Alert>
        : <>
          <FormGroup label="An"><input value={to} onChange={e=>setTo(e.target.value)} type="email"/></FormGroup>
          <FormGroup label="Betreff"><input value={subj} onChange={e=>setSubj(e.target.value)}/></FormGroup>
          <FormGroup label="Nachricht"><textarea rows={6} value={body} onChange={e=>setBody(e.target.value)}/></FormGroup>
          <div style={{fontSize:12,color:'var(--text-secondary)',display:'flex',alignItems:'center',gap:6}}>
            <i className="ti ti-paperclip"/>{doc?.number}.pdf (wird automatisch angehängt)
          </div>
        </>}
    </Modal>
  );
}
