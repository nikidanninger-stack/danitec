// ─── Alle Seiten ──────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../api/client';
import {
  fmt, fmtDate, today, addDays,
  StatusBadge, STATUS_LABELS,
  Alert, Modal, ConfirmModal, EmptyState, Spinner,
  FormGroup, FormRow,
  PositionsEditor, calcPos, calcTotals,
  TotalsBox, EmailModal,
} from '../components/shared';

// ─── Globale Konstanten ───────────────────────────────────────────────────────
const STATUS_PROJEKT = {
  active:       { label:'Aktiv',           color:'var(--green)' },
  paused:       { label:'Pausiert',        color:'var(--amber)' },
  completed:    { label:'Abgeschlossen',   color:'#152248'      },
  commissioned: { label:'In Betrieb',      color:'#2D9CDB'      },
  cancelled:    { label:'Storniert',       color:'var(--red)'   },
};
const PRIO_LABEL = { low:'Niedrig', normal:'Normal', high:'Hoch', urgent:'Dringend' };
const PRIO_COLOR = { low:'gray', normal:'blue', high:'amber', urgent:'red' };
const MAINT_STATUS = {
  overdue:  { label:'Überfällig',  color:'var(--red)',   icon:'ti-alert-circle' },
  due_soon: { label:'Bald fällig', color:'var(--amber)', icon:'ti-clock' },
  ok:       { label:'OK',          color:'var(--green)', icon:'ti-circle-check' },
};

// ─── Globaler In-Memory Cache (30s TTL) ──────────────────────────────────────
const _cache = new Map();
const CACHE_TTL = 30_000;
function cacheGet(key) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return e.data;
}
function cacheSet(key, data) { _cache.set(key, { data, ts: Date.now() }); }
function cacheBust(prefix) {
  for (const k of _cache.keys()) { if (!prefix || k.startsWith(prefix)) _cache.delete(k); }
}

// ─── useData hook (mit Cache) ─────────────────────────────────────────────────
function useData(fetcher, deps=[]) {
  const key = useRef(fetcher.toString()).current;
  const cached = cacheGet(key);
  const [data,    setData]    = useState(cached);
  const [loading, setLoading] = useState(cached === null);
  const [error,   setError]   = useState(null);
  const load = useCallback(async (force = false) => {
    if (!force) {
      const c = cacheGet(key);
      if (c !== null) { setData(c); setLoading(false); return; }
    }
    setLoading(true); setError(null);
    try {
      const result = await fetcher();
      cacheSet(key, result);
      setData(result);
    }
    catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, deps); // eslint-disable-line
  useEffect(() => { load(); }, [load]);
  // reload() always forces fresh fetch + busts cache
  const reload = useCallback(() => { _cache.delete(key); load(true); }, [key, load]);
  return { data, loading, error, reload };
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const DASH_TOOLTIP = {
  background:'#ffffff', border:'1px solid rgba(0,0,0,0.1)',
  borderRadius:10, fontSize:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)',
};
function EuroTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={DASH_TOOLTIP}>
      <div style={{fontWeight:700, padding:'8px 12px 4px', color:'var(--text-secondary)', letterSpacing:'0.06em', fontSize:10}}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{padding:'3px 12px', color:p.color, fontWeight:600}}>
          <span style={{opacity:0.6, fontWeight:400, fontSize:11}}>{p.name} </span>{fmt(p.value)}
        </div>
      ))}
      <div style={{height:6}}/>
    </div>
  );
}

function DashGradients() {
  return (
    <defs>
      {/* Area fills */}
      <linearGradient id="areaEin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%"  stopColor="#2D9CDB" stopOpacity={0.35}/>
        <stop offset="95%" stopColor="#2D9CDB" stopOpacity={0}/>
      </linearGradient>
      <linearGradient id="areaAus" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25}/>
        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
      </linearGradient>
      <linearGradient id="areaGew" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%"  stopColor="#152248" stopOpacity={0.3}/>
        <stop offset="95%" stopColor="#152248" stopOpacity={0}/>
      </linearGradient>
      {/* Bar fills */}
      <linearGradient id="gradUstOut" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fbbf24" stopOpacity={1}/>
        <stop offset="100%" stopColor="#d97706" stopOpacity={0.6}/>
      </linearGradient>
      <linearGradient id="gradVorsteuer" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#34d399" stopOpacity={1}/>
        <stop offset="100%" stopColor="#059669" stopOpacity={0.6}/>
      </linearGradient>
      <linearGradient id="gradZahllast" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f87171" stopOpacity={1}/>
        <stop offset="100%" stopColor="#dc2626" stopOpacity={0.6}/>
      </linearGradient>
    </defs>
  );
}

export function Dashboard({ onNavigate }) {
  const { data, loading }     = useData(() => api.dashboard());
  const { data: projData }    = useData(() => api.projects({ status:'active' }));
  const { data: equipData }   = useData(() => api.equipment({ dueSoon:'true' }));
  const { data: monthlyData } = useData(() => api.reportMonthly());
  const { data: vatData }     = useData(() => api.reportVAT());
  const { data: openInvData } = useData(() => api.invoices({ limit: 100 }));
  const { user, company }     = React.useContext ? React.createContext ? (() => { try { const {useAuth} = require('../hooks/useAuth'); return useAuth(); } catch(e) { return {}; } })() : {} : {};

  const { user: authUser, company: authCompany } = (() => {
    try { const h = require('../hooks/useAuth'); return h.useAuth?.() || {}; } catch(e) { return {}; }
  })();

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',flexDirection:'column',gap:16}}>
      <div style={{width:48,height:48,border:'3px solid #e5e7eb',borderTopColor:'#152248',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <span style={{color:'var(--text-secondary)',fontSize:13}}>Dashboard wird geladen...</span>
    </div>
  );
  if (!data) return null;

  const d              = data;
  const activeProjects = projData?.data || [];
  const dueMaintenance = equipData?.data || [];
  const overdueEquip   = dueMaintenance.filter(e => e.maintenance_status === 'overdue');
  const dueSoon        = dueMaintenance.filter(e => e.maintenance_status === 'due_soon');
  const openTasks      = activeProjects.reduce((s,p) => s + parseInt(p.open_tasks||0), 0);
  const months         = monthlyData?.months || [];
  const quartale       = vatData?.quartale || [];
  const OPEN_STATUSES  = ['finalized','sent','partial_paid','overdue'];
  const openInvoices   = (openInvData?.data || []).filter(i => OPEN_STATUSES.includes(i.status));

  const areaData = months.map(m => ({
    ...m,
    gewinn: Math.round((m.einnahmen - m.ausgaben) * 100) / 100,
  }));

  const qData = quartale.map(q => ({
    name: `Q${q.quartal}`,
    'USt-Ausgang': q.ustAusgang,
    'Vorsteuer':   q.vorsteuer,
    'Zahllast':    q.zahllast,
  }));

  const tickFmt = v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`;

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Guten Morgen' : now.getHours() < 18 ? 'Guten Tag' : 'Guten Abend';
  const dayNames = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const dateStr = `${dayNames[now.getDay()]}, ${now.toLocaleDateString('de-AT',{day:'2-digit',month:'long',year:'numeric'})}`;

  const DN = '#152248'; // Danitec Dunkelblau
  const LB = '#2D9CDB'; // Danitec Hellblau

  const KPICard = ({icon, label, value, sub, color, onClick, accent}) => (
    <div onClick={onClick} className="kpi-card" style={{
      background:'#fff', borderRadius:14, padding:'20px 22px',
      boxShadow:'0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)',
      cursor:onClick?'pointer':'default',
      borderTop:`3.5px solid ${accent||color||LB}`,
      transition:'box-shadow 0.15s,transform 0.15s',
      display:'flex',flexDirection:'column',gap:6,
      userSelect:'none',
    }}
    onMouseEnter={e=>{ if(onClick){e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.13)'; e.currentTarget.style.transform='translateY(-2px)'; }}}
    onMouseLeave={e=>{ e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)'; e.currentTarget.style.transform=''; }}
    >
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
        <div style={{width:34,height:34,borderRadius:9,background:`${accent||color||LB}18`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <i className={`ti ${icon}`} style={{fontSize:17,color:accent||color||LB}}/>
        </div>
        <span style={{fontSize:11.5,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:0.5}}>{label}</span>
      </div>
      <div style={{fontSize:26,fontWeight:800,color:color||DN,letterSpacing:-0.5,lineHeight:1}}>{value}</div>
      {sub && <div style={{fontSize:11.5,color:'var(--text-tertiary)',lineHeight:1.4}}>{sub}</div>}
    </div>
  );

  const SectionCard = ({children, style={}}) => (
    <div style={{background:'#fff',borderRadius:14,padding:'20px 22px',boxShadow:'0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)',...style}}>
      {children}
    </div>
  );

  const SectionTitle = ({icon, children, action}) => (
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <i className={`ti ${icon}`} style={{fontSize:15,color:LB}}/>
      <span style={{fontSize:13,fontWeight:700,color:DN}}>{children}</span>
      {action && <div style={{marginLeft:'auto'}}>{action}</div>}
    </div>
  );

  const NavBtn = ({label, page}) => (
    <button onClick={()=>onNavigate?.(page)} style={{background:'none',border:`1px solid #e5e7eb`,borderRadius:6,padding:'3px 10px',fontSize:11,color:'var(--text-secondary)',cursor:'pointer',fontWeight:600}}>
      {label} →
    </button>
  );

  return (
    <div style={{padding:'20px 24px',background:'#f4f6fa',minHeight:'100%'}}>

      {/* ── HERO BANNER ── */}
      <div style={{
        background:`linear-gradient(135deg, ${DN} 0%, #1e4d8c 60%, ${LB} 100%)`,
        borderRadius:16, padding:'22px 28px', marginBottom:22,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        boxShadow:'0 4px 24px rgba(21,34,72,0.30)',
        position:'relative', overflow:'hidden',
      }}>
        <div style={{position:'absolute',top:-30,right:120,width:200,height:200,borderRadius:'50%',background:'rgba(255,255,255,0.04)'}}/>
        <div style={{position:'absolute',bottom:-40,right:40,width:140,height:140,borderRadius:'50%',background:'rgba(255,255,255,0.05)'}}/>
        <div style={{position:'relative'}}>
          <div style={{fontSize:13,color:'rgba(255,255,255,0.65)',marginBottom:3}}>{dateStr}</div>
          <div style={{fontSize:22,fontWeight:800,color:'#fff',letterSpacing:-0.3}}>{greeting}! 👋</div>
          <div style={{fontSize:13,color:'rgba(255,255,255,0.7)',marginTop:4}}>
            {d.ueberfaellig>0
              ? <span style={{color:'#fca5a5',fontWeight:600}}>⚠ {d.ueberfaellig} überfällige Rechnung{d.ueberfaellig>1?'n':''}</span>
              : overdueEquip.length>0
              ? <span style={{color:'#fca5a5',fontWeight:600}}>⚠ {overdueEquip.length} überfällige Wartung{overdueEquip.length>1?'en':''}</span>
              : <span style={{color:'#86efac',fontWeight:600}}>✓ Alles im grünen Bereich</span>
            }
          </div>
        </div>
        <div style={{position:'relative',textAlign:'right'}}>
          <img src="/logo.png" alt="DANITEC" style={{height:52,objectFit:'contain',filter:'brightness(0) invert(1)',opacity:0.9}}
            onError={e=>{ e.target.style.display='none'; }}/>
        </div>
      </div>

      {/* ── KPI ZEILE 1: FINANZEN ── */}
      <div className="dash-grid-4" style={{gap:14,marginBottom:14}}>
        <KPICard icon="ti-trending-up" label="Einnahmen (bezahlt)" accent="#16a34a" color="#16a34a"
          value={fmt(d.bezahlteRechnungen?.umsatz)}
          sub={`${d.bezahlteRechnungen?.count||0} Rechnungen · Netto ${fmt(d.bezahlteRechnungen?.netto||0)}`}
          onClick={()=>onNavigate?.('invoices')}/>
        <KPICard icon="ti-clock-dollar" label="Ausstehend (offen)" accent={d.ueberfaellig>0?'#ef4444':'#f59e0b'} color={d.ueberfaellig>0?'#ef4444':'#d97706'}
          value={fmt(d.offeneRechnungen?.summe)}
          sub={d.ueberfaellig>0 ? `${d.offeneRechnungen?.count||0} Rechnungen · ${d.ueberfaellig} überfällig!` : `${d.offeneRechnungen?.count||0} offene Rechnungen`}
          onClick={()=>onNavigate?.('invoices')}/>
        <KPICard icon="ti-trending-down" label="Ausgaben (brutto)" accent="#ef4444" color="#dc2626"
          value={fmt(d.ausgaben?.brutto)}
          sub={`Netto ${fmt(d.ausgaben?.netto)} · MwSt ${fmt((d.ausgaben?.brutto||0)-(d.ausgaben?.netto||0))}`}
          onClick={()=>onNavigate?.('expenses')}/>
        <KPICard icon="ti-report-money" label="Geschätzter Gewinn" accent={d.geschaetzterGewinn>=0?'#16a34a':'#ef4444'} color={d.geschaetzterGewinn>=0?'#15803d':'#dc2626'}
          value={fmt(d.geschaetzterGewinn)}
          sub={`↑ ${fmt(d.bezahlteRechnungen?.umsatz)} − ↓ ${fmt(d.ausgaben?.brutto)}`}/>
      </div>

      {/* ── KPI ZEILE 2: BETRIEB ── */}
      <div className="dash-grid-4" style={{gap:14,marginBottom:22}}>
        <KPICard icon="ti-percentage" label="USt-Zahllast (Quartal)" accent={d.ustZahllast>0?'#ef4444':'#16a34a'} color={d.ustZahllast>0?'#dc2626':'#15803d'}
          value={fmt(d.ustZahllast)}
          sub={`USt ${fmt(d.ustAusgang)} − Vorsteuer ${fmt(d.vorsteuer)}`}
          onClick={()=>onNavigate?.('vat')}/>
        <KPICard icon="ti-alert-circle" label="Überfällige Rechnungen" accent={d.ueberfaellig>0?'#ef4444':'#16a34a'} color={d.ueberfaellig>0?'#dc2626':'#15803d'}
          value={String(d.ueberfaellig||0)}
          sub={d.ueberfaellig===0 ? 'Alle Rechnungen pünktlich ✓' : `von ${d.offeneRechnungen?.count||0} offenen Rechnungen`}
          onClick={()=>onNavigate?.('invoices')}/>
        <KPICard icon="ti-hammer" label="Planungsprojekte (aktiv)" accent={LB} color={DN}
          value={String(activeProjects.length)}
          sub={openTasks>0 ? `${openTasks} offene Aufgaben` : 'Keine offenen Aufgaben ✓'}
          onClick={()=>onNavigate?.('projects')}/>
        <KPICard icon="ti-tool" label="Wartungen fällig" accent={overdueEquip.length>0?'#ef4444':dueSoon.length>0?'#f59e0b':'#16a34a'} color={overdueEquip.length>0?'#dc2626':dueSoon.length>0?'#d97706':'#15803d'}
          value={String(dueMaintenance.length)}
          sub={`${overdueEquip.length} überfällig · ${dueSoon.length} in 30 Tagen`}
          onClick={()=>onNavigate?.('equipment')}/>
      </div>

      {/* ── MITTELSEKTION: Offene Rechnungen + Fällige Wartungen ── */}
      <div className="dash-mid-section" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>

        <SectionCard>
          <SectionTitle icon="ti-file-invoice" action={<NavBtn label="Alle" page="invoices"/>}>Offene Rechnungen</SectionTitle>
          {openInvoices.length===0
            ? <div style={{textAlign:'center',padding:'24px 0',color:'var(--text-tertiary)'}}>
                <i className="ti ti-circle-check" style={{fontSize:28,color:'#22c55e',display:'block',marginBottom:8}}/>
                <span style={{fontSize:13}}>Alle Rechnungen bezahlt</span>
              </div>
            : <>
              {openInvoices.slice(0,5).map(inv=>{
                const isOver = inv.status==='overdue';
                return (
                  <div key={inv.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',marginBottom:4,borderRadius:9,background:isOver?'#fef2f2':'#f9fafb',border:`1px solid ${isOver?'#fecaca':'#e5e7eb'}`}}>
                    <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:isOver?'#ef4444':'#94a3b8'}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:12.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text)'}}>{inv.customer_name||'—'}</div>
                      <div style={{fontSize:11,color:'var(--text-tertiary)'}}>{inv.number}{inv.due_date?` · fällig ${fmtDate(inv.due_date)}`:''}</div>
                    </div>
                    <div style={{fontWeight:700,fontSize:13,color:isOver?'#ef4444':'#374151',flexShrink:0}}>{fmt(inv.gross_total)}</div>
                  </div>
                );
              })}
              {openInvoices.length>5&&<div style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',paddingTop:4}}>+{openInvoices.length-5} weitere</div>}
              <div style={{display:'flex',justifyContent:'space-between',marginTop:10,paddingTop:10,borderTop:'1px solid #f3f4f6',fontSize:12}}>
                <span style={{color:'var(--text-secondary)'}}>Gesamt offen</span>
                <span style={{fontWeight:700,color:DN}}>{fmt(openInvoices.reduce((s,i)=>s+parseFloat(i.gross_total||0),0))}</span>
              </div>
            </>
          }
        </SectionCard>

        <SectionCard>
          <SectionTitle icon="ti-tool" action={<NavBtn label="Alle" page="equipment"/>}>Fällige Wartungen</SectionTitle>
          {dueMaintenance.length===0
            ? <div style={{textAlign:'center',padding:'24px 0',color:'var(--text-tertiary)'}}>
                <i className="ti ti-circle-check" style={{fontSize:28,color:'#22c55e',display:'block',marginBottom:8}}/>
                <span style={{fontSize:13}}>Keine fälligen Wartungen</span>
              </div>
            : dueMaintenance.slice(0,5).map(e=>{
                const isOver = e.maintenance_status==='overdue';
                return (
                  <div key={e.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',marginBottom:4,borderRadius:9,background:isOver?'#fef2f2':'#fffbeb',border:`1px solid ${isOver?'#fecaca':'#fde68a'}`}}>
                    <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:isOver?'#ef4444':'#f59e0b'}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:12.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text)'}}>{e.name}</div>
                      <div style={{fontSize:11,color:'var(--text-tertiary)'}}>{e.customer_name||'—'}</div>
                    </div>
                    <div style={{fontWeight:700,fontSize:12,color:isOver?'#ef4444':'#d97706',flexShrink:0}}>{e.next_maintenance?fmtDate(e.next_maintenance):'—'}</div>
                  </div>
                );
              })
          }
        </SectionCard>
      </div>

      {/* ── CHART: Einnahmen / Ausgaben ── */}
      <SectionCard style={{marginBottom:14}}>
        <SectionTitle icon="ti-chart-area-line" action={<span style={{fontSize:11,color:'var(--text-tertiary)'}}>{monthlyData?.jahr||new Date().getFullYear()}</span>}>
          Einnahmen &amp; Ausgaben
        </SectionTitle>
        {areaData.every(m=>m.einnahmen===0&&m.ausgaben===0)
          ? <div style={{textAlign:'center',padding:'32px 0',color:'var(--text-tertiary)',fontSize:13}}>Noch keine Daten für dieses Jahr</div>
          : <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={areaData} margin={{top:8,right:8,left:0,bottom:0}}>
                <DashGradients/>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
                <XAxis dataKey="name" tick={{fontSize:11,fill:'#9ca3af'}} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={tickFmt} tick={{fontSize:11,fill:'#9ca3af'}} axisLine={false} tickLine={false} width={44}/>
                <Tooltip content={<EuroTooltip/>} cursor={{stroke:'rgba(0,0,0,0.06)',strokeWidth:1}}/>
                <Legend wrapperStyle={{fontSize:11,paddingTop:10}} formatter={v=><span style={{color:'var(--text-secondary)'}}>{v}</span>}/>
                <Area type="monotone" dataKey="einnahmen" name="Einnahmen" stroke={LB} strokeWidth={2.5} fill="url(#areaEin)" dot={false} activeDot={{r:4,fill:LB,strokeWidth:0}}/>
                <Area type="monotone" dataKey="ausgaben"  name="Ausgaben"  stroke="#ef4444" strokeWidth={2.5} fill="url(#areaAus)" dot={false} activeDot={{r:4,fill:'#ef4444',strokeWidth:0}}/>
                <Area type="monotone" dataKey="gewinn"    name="Gewinn"    stroke="#22c55e" strokeWidth={2.5} fill="url(#areaGew)" dot={false} activeDot={{r:4,fill:'#22c55e',strokeWidth:0}}/>
              </AreaChart>
            </ResponsiveContainer>
        }
      </SectionCard>

      {/* ── UNTEN: USt-Chart + Projekte + Status ── */}
      <div className="dash-bottom-3" style={{gap:14,marginBottom:14}}>

        <SectionCard>
          <SectionTitle icon="ti-percentage" action={<NavBtn label="Details" page="vat"/>}>USt-Zahllast nach Quartal</SectionTitle>
          {qData.every(q=>q['USt-Ausgang']===0)
            ? <div style={{textAlign:'center',padding:'24px 0',color:'var(--text-tertiary)',fontSize:13}}>Noch keine Daten</div>
            : <ResponsiveContainer width="100%" height={180}>
                <BarChart data={qData} margin={{top:4,right:4,left:0,bottom:0}} barCategoryGap="30%" barGap={3}>
                  <DashGradients/>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
                  <XAxis dataKey="name" tick={{fontSize:11,fill:'#9ca3af'}} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={tickFmt} tick={{fontSize:11,fill:'#9ca3af'}} axisLine={false} tickLine={false} width={40}/>
                  <Tooltip content={<EuroTooltip/>} cursor={{fill:'rgba(0,0,0,0.03)'}}/>
                  <Legend wrapperStyle={{fontSize:11,paddingTop:8}} formatter={v=><span style={{color:'var(--text-secondary)'}}>{v}</span>}/>
                  <Bar dataKey="USt-Ausgang" fill={LB} radius={[4,4,0,0]}/>
                  <Bar dataKey="Vorsteuer" fill="#93c5fd" radius={[4,4,0,0]}/>
                  <Bar dataKey="Zahllast" fill={DN} radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
          }
        </SectionCard>

        <SectionCard>
          <SectionTitle icon="ti-hammer" action={<NavBtn label="Alle" page="projects"/>}>Planungsprojekte</SectionTitle>
          {activeProjects.length===0
            ? <div style={{textAlign:'center',padding:'20px 0',color:'var(--text-tertiary)',fontSize:13}}>Keine aktiven Projekte</div>
            : activeProjects.slice(0,5).map(p=>(
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,marginBottom:4,background:'var(--bg)',border:'1px solid #e5e7eb'}}>
                <div style={{width:7,height:7,borderRadius:'50%',background:LB,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:12,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</div>
                  {p.customer_name&&<div style={{fontSize:11,color:'var(--text-tertiary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.customer_name}</div>}
                </div>
                {p.open_tasks>0&&<span style={{fontSize:10,color:'#f59e0b',fontWeight:700,background:'#fef3c7',padding:'2px 6px',borderRadius:4,flexShrink:0}}>{p.open_tasks}</span>}
              </div>
            ))
          }
        </SectionCard>

        <SectionCard>
          <SectionTitle icon="ti-radar-2">System-Status</SectionTitle>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {[
              { label:'Überfällige Rechnungen', val:d.ueberfaellig||0, ok:d.ueberfaellig===0, icon:'ti-file-invoice' },
              { label:'Wartungen überfällig', val:overdueEquip.length, ok:overdueEquip.length===0, icon:'ti-tool' },
              { label:'Wartungen in 30 Tagen', val:dueSoon.length, ok:dueSoon.length===0, warn:true, icon:'ti-clock' },
              { label:'Aktive Projekte', val:activeProjects.length, ok:true, neutral:true, icon:'ti-hammer' },
            ].map(item=>(
              <div key={item.label} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,background:item.ok?'#f0fdf4':item.warn&&item.val>0?'#fffbeb':'#fef2f2',border:`1px solid ${item.ok?'#bbf7d0':item.warn&&item.val>0?'#fde68a':item.neutral?'#e5e7eb':'#fecaca'}`}}>
                <i className={`ti ${item.icon}`} style={{fontSize:14,color:item.ok?'#22c55e':item.warn&&item.val>0?'#f59e0b':'#ef4444',flexShrink:0}}/>
                <span style={{flex:1,fontSize:11.5,color:'var(--text-secondary)'}}>{item.label}</span>
                <span style={{fontWeight:700,fontSize:12,color:item.ok?'#22c55e':item.warn&&item.val>0?'#f59e0b':'#ef4444'}}>{item.ok&&!item.neutral?'✓':item.val}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ── Banking Widget ── */}
      <BankingWidget onNavigate={onNavigate}/>

    </div>
  );
}

// ─── BANKING WIDGET (Dashboard) ──────────────────────────────────────────────
function BankingWidget({ onNavigate }) {
  const { data: status, loading: statusLoading } = useData(() => api.bankingStatus());
  const [balance, setBalance] = useState(null);
  const [txs, setTxs]        = useState([]);
  const [syncing, setSyncing] = useState(false);

  const isLinked = status?.status === 'linked';

  useEffect(() => {
    if (isLinked) {
      api.bankingBalance().then(setBalance).catch(()=>{});
      api.bankingTransactions({ limit: 8 }).then(d => setTxs(d?.data||[])).catch(()=>{});
    }
  }, [isLinked]);

  const sync = async () => {
    setSyncing(true);
    try {
      await api.bankingSync();
      const [b, t] = await Promise.all([api.bankingBalance(), api.bankingTransactions({ limit: 8 })]);
      setBalance(b); setTxs(t?.data||[]);
    } catch(e) { alert(e.message); }
    finally { setSyncing(false); }
  };

  if (statusLoading) return null;

  if (!isLinked) {
    return (
      <div className="dash-card" style={{display:'flex',alignItems:'center',gap:16,padding:'16px 20px'}}>
        <div style={{width:44,height:44,borderRadius:12,background:'rgba(0,229,255,0.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <i className="ti ti-building-bank" style={{fontSize:22,color:'var(--accent)'}}/>
        </div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>BAWAG Konto verbinden</div>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>Kontostand in Echtzeit sehen · Zahlungseingänge automatisch zuordnen</div>
        </div>
        <button className="btn primary sm" onClick={()=>onNavigate?.('settings')}>
          <i className="ti ti-link"/> Konto verknüpfen
        </button>
      </div>
    );
  }

  return (
    <div className="dash-card">
      <div className="dash-title" style={{marginBottom:12}}>
        <i className="ti ti-building-bank" style={{color:'#2D9CDB'}}/>
        BAWAG Konto
        {balance?.iban && <span style={{fontSize:11,color:'var(--text-secondary)',fontWeight:400,marginLeft:4}}>{balance.iban}</span>}
        <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
          {balance?.lastSync && <span style={{fontSize:10,color:'var(--text-secondary)'}}>Sync {new Date(balance.lastSync).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'})}</span>}
          <button className="btn xs ghost" onClick={sync} disabled={syncing}>
            <i className={`ti ${syncing?'ti-loader-2':'ti-refresh'}`}/> {syncing?'Lädt...':'Aktualisieren'}
          </button>
          <button className="btn xs ghost" onClick={()=>onNavigate?.('settings')}>Einstellungen →</button>
        </div>
      </div>

      {/* Kontostand */}
      {balance && (
        <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:16,padding:'12px 16px',borderRadius:10,background:'rgba(0,229,255,0.06)',border:'1px solid rgba(0,229,255,0.15)'}}>
          <span style={{fontSize:32,fontWeight:800,color:'#2D9CDB',letterSpacing:-1}}>
            {parseFloat(balance.amount).toLocaleString('de-AT',{minimumFractionDigits:2,maximumFractionDigits:2})}
          </span>
          <span style={{fontSize:18,color:'var(--text-secondary)',fontWeight:600}}>{balance.currency}</span>
          <span style={{fontSize:11,color:'var(--text-secondary)',marginLeft:'auto'}}>Kontostand</span>
        </div>
      )}

      {/* Transaktionen */}
      {txs.length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:3}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:.7,marginBottom:4}}>Letzte Buchungen</div>
          {txs.map(tx => {
            const isIn  = parseFloat(tx.amount) > 0;
            const color = isIn ? '#0f6e56' : '#f87171';
            const MS    = { unmatched:'#fbbf24', auto:'#0f6e56', manual:'#0f6e56', ignored:'#6b7280' };
            return (
              <div key={tx.id} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 8px',borderRadius:7,background:'rgba(255,255,255,0.02)',border:'1px solid var(--border)'}}>
                <div style={{width:7,height:7,borderRadius:'50%',background:color,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {tx.counterpart_name || tx.description || '—'}
                  </div>
                  {tx.description && tx.counterpart_name && <div style={{fontSize:11,color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tx.description}</div>}
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontWeight:700,fontSize:13,color}}>{isIn?'+':''}{parseFloat(tx.amount).toLocaleString('de-AT',{minimumFractionDigits:2,maximumFractionDigits:2})} €</div>
                  <div style={{fontSize:10,color:'var(--text-secondary)'}}>{tx.booking_date ? new Date(tx.booking_date).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit'}) : '—'}</div>
                </div>
                <div style={{flexShrink:0}}>
                  {tx.match_status === 'unmatched' && isIn && (
                    <span style={{fontSize:9,padding:'2px 5px',borderRadius:3,background:'rgba(251,191,36,0.15)',color:'#fbbf24',fontWeight:700}}>OFFEN</span>
                  )}
                  {(tx.match_status === 'auto' || tx.match_status === 'manual') && (
                    <span style={{fontSize:9,padding:'2px 5px',borderRadius:3,background:'rgba(74,222,128,0.15)',color:'var(--green)',fontWeight:700}} title={tx.invoice_number}>✓ {tx.invoice_number||'zugeordnet'}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── RECHNUNGEN ───────────────────────────────────────────────────────────────
function InvoicesInner({ onNavigate }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showEmail, setShowEmail] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const { data: invData, loading, reload } = useData(() => api.invoices());
  const { data: customers } = useData(() => api.customers());
  const { data: products  } = useData(() => api.products());

  const [form, setForm] = useState({ customerId:'', subject:'', documentDate:today(), paymentDays:14 });
  const [positions, setPositions] = useState([{description:'',quantity:1,unit:'Std',unit_price_net:0,discount_percent:0,vat_rate:20}]);
  const totals = useMemo(() => calcTotals(positions), [positions]);

  const invoices = invData?.data || [];
  const STATUSES = [
    {id:'all',label:'Alle'},
    {id:'finalized',label:'Offen'},
    {id:'sent',label:'Versendet'},
    {id:'partial_paid',label:'Teilbezahlt'},
    {id:'paid',label:'Bezahlt'},
    {id:'overdue',label:'Überfällig'},
    {id:'cancelled',label:'Storniert'},
  ];

  const filtered = invoices.filter(inv => {
    const matchF = filter==='all' || inv.status===filter;
    const q = search.toLowerCase();
    const matchS = !search || inv.number?.toLowerCase().includes(q) || inv.customer_name?.toLowerCase().includes(q) || inv.order_number?.toLowerCase().includes(q);
    return matchF && matchS;
  });

  const saveInvoice = async (finalize) => {
    try {
      await api.createInvoice({
        customerId: parseInt(form.customerId),
        documentDate: form.documentDate,
        dueDate: addDays(form.documentDate, parseInt(form.paymentDays)||14),
        subject: form.subject,
        orderNumber: form.orderNumber || undefined,
        positions: positions.map(calcPos),
        ...totals,
        finalize,
      });
      setShowNew(false);
      setForm({customerId:'',subject:'',documentDate:today(),paymentDays:14,orderNumber:''});
      setPositions([{description:'',quantity:1,unit:'Std',unit_price_net:0,discount_percent:0,vat_rate:20}]);
      reload();
    } catch(e) { alert('Fehler: '+e.message); }
  };

  const markPaid = async (id) => {
    try { await api.payInvoice(id, { paymentDate: today(), amount: invoices.find(i=>i.id===id)?.gross_total }); reload(); }
    catch(e) { alert(e.message); }
  };

  const finalize = async (id) => {
    try { await api.finalizeInvoice(id); reload(); }
    catch(e) { alert(e.message); }
  };

  const openPdf = (id) => window.open(`/api/pdf/invoice/${id}?token=${localStorage.getItem('danitec_token')}`, '_blank');

  return (
    <div className="page-body">
      <div className="toolbar">
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <input className="search-input" placeholder="Nr. oder Kunde..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <div className="filter-pills">
            {STATUSES.map(s => <button key={s.id} className={`btn xs ${filter===s.id?'primary':''}`} onClick={()=>setFilter(s.id)}>{s.label}</button>)}
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {onNavigate && (
            <button className="btn" onClick={()=>onNavigate('scan')} title="Eingangsrechnung scannen → Ausgangsrechnung erstellen">
              <i className="ti ti-camera"/> Rechnung scannen
            </button>
          )}
          <button className="btn primary" onClick={()=>setShowNew(true)}><i className="ti ti-plus"/>Neue Rechnung</button>
        </div>
      </div>

      <div className="card card-0">
        {loading ? <div style={{padding:32,textAlign:'center'}}><Spinner dark/></div> :
         filtered.length===0 ? <EmptyState icon="ti-file-invoice" title="Keine Rechnungen gefunden"/> :
        <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Nr.</th><th>A-Nr.</th><th>Kunde</th><th>Datum</th><th>Fällig</th>
            <th className="right">Brutto</th>
            <th>Status</th><th>Aktionen</th>
          </tr></thead>
          <tbody>{filtered.map(inv => (
            <tr key={inv.id}>
              <td>
                <span style={{fontWeight:500,cursor:'pointer',color:'var(--accent)'}} onClick={()=>setShowDetail(inv)}>
                  {inv.number}
                </span>
                {inv.locked && <i className="ti ti-lock" style={{marginLeft:4,fontSize:9,color:'var(--text-tertiary)'}}/>}
              </td>
              <td><span style={{fontSize:11,fontWeight:600,color:'var(--accent)',background:'rgba(0,229,255,.08)',padding:'2px 6px',borderRadius:4}}>{inv.order_number||'–'}</span></td>
              <td style={{fontSize:12}}>{inv.customer_name}</td>
              <td style={{fontSize:12}}>{fmtDate(inv.document_date)}</td>
              <td style={{fontSize:12,color: inv.status==='overdue'?'var(--red)':undefined}}>{fmtDate(inv.due_date)}</td>
              <td className="right" style={{fontWeight:500}}>{fmt(inv.gross_total)}</td>
              <td><StatusBadge status={inv.status} label={STATUS_LABELS[inv.status]||inv.status}/></td>
              <td>
                <div className="btn-group">
                  <button className="btn xs ghost icon" title="PDF öffnen" onClick={()=>openPdf(inv.id)}><i className="ti ti-file-type-pdf"/></button>
                  {inv.status==='draft' && <button className="btn xs primary" onClick={()=>finalize(inv.id)}><i className="ti ti-lock"/>Festschr.</button>}
                  {['finalized','sent'].includes(inv.status) && <button className="btn xs" onClick={()=>setShowEmail(inv)}><i className="ti ti-mail"/></button>}
                  {['finalized','sent','overdue','dunned','partial_paid'].includes(inv.status) && <button className="btn xs success" onClick={()=>markPaid(inv.id)}><i className="ti ti-check"/></button>}
                  {inv.locked && !['paid','cancelled'].includes(inv.status) && <button className="btn xs danger" onClick={()=>setConfirmCancel(inv.id)}><i className="ti ti-ban"/></button>}
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
        </div>}
      </div>

      {/* Neue Rechnung */}
      <Modal open={showNew} onClose={()=>setShowNew(false)} title="Neue Ausgangsrechnung" maxWidth={760}
        footer={<>
          <button className="btn" onClick={()=>saveInvoice(false)} disabled={!form.customerId}><i className="ti ti-device-floppy"/>Entwurf</button>
          <button className="btn primary" onClick={()=>saveInvoice(true)} disabled={!form.customerId}><i className="ti ti-lock"/>Festschreiben</button>
        </>}>
        <FormRow>
          <FormGroup label="Kunde" required>
            <select value={form.customerId} onChange={e=>setForm(f=>({...f,customerId:e.target.value}))}>
              <option value="">Bitte wählen...</option>
              {(customers?.data||[]).map(c=><option key={c.id} value={c.id}>{c.company_name||c.first_name+' '+c.last_name}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="A-Nummer (leer = automatisch)">
            <input value={form.orderNumber||''} onChange={e=>setForm(f=>({...f,orderNumber:e.target.value}))} placeholder="z.B. A-2026-0001"/>
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Betreff"><input value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))} placeholder="z.B. Wartung Kälteanlage Mai"/></FormGroup>
          <FormGroup label="Rechnungsdatum"><input type="date" value={form.documentDate} onChange={e=>setForm(f=>({...f,documentDate:e.target.value}))}/></FormGroup>
        </FormRow>
        <div style={{fontWeight:500,fontSize:13,marginBottom:8}}>Positionen</div>
        <PositionsEditor positions={positions} onChange={setPositions} products={products?.data||[]}/>
        <TotalsBox netto={totals.net_total} ust={totals.vat_total} brutto={totals.gross_total}/>
      </Modal>

      {/* Detail */}
      {showDetail && <Modal open={!!showDetail} onClose={()=>setShowDetail(null)} title={`${showDetail.number}${showDetail.subject?' · '+showDetail.subject:''}`} maxWidth={680}>
        {showDetail.locked && <div style={{background:'var(--amber-light)',border:'0.5px solid rgba(133,79,11,.25)',borderRadius:'var(--radius-md)',padding:'8px 12px',fontSize:12,color:'var(--amber)',display:'flex',alignItems:'center',gap:6,marginBottom:12}}><i className="ti ti-lock"/>Festgeschrieben – Änderungen nur über Storno möglich</div>}
        <FormRow><div><label>Kunde</label><div style={{fontSize:13,marginTop:2}}>{showDetail.customer_name}</div></div>
        <div><label>Zeitraum</label><div style={{fontSize:12}}>Datum: {fmtDate(showDetail.document_date)}</div><div style={{fontSize:12}}>Fällig: {fmtDate(showDetail.due_date)}</div><div style={{marginTop:4}}><StatusBadge status={showDetail.status} label={STATUS_LABELS[showDetail.status]}/></div></div></FormRow>
        <div className="divider"/>
        <div style={{fontWeight:500,fontSize:13,marginBottom:8}}>Positionen</div>
        <PositionsEditor positions={showDetail.items||[]} onChange={()=>{}} products={[]} disabled/>
        <TotalsBox netto={showDetail.net_total} ust={showDetail.vat_total} brutto={showDetail.gross_total}/>
        <div style={{marginTop:12,display:'flex',gap:8}}>
          <button className="btn primary" onClick={()=>openPdf(showDetail.id)}><i className="ti ti-file-type-pdf"/>PDF öffnen</button>
          {['finalized','sent'].includes(showDetail.status) && <button className="btn" onClick={()=>{setShowEmail(showDetail);setShowDetail(null);}}><i className="ti ti-mail"/>Per E-Mail senden</button>}
        </div>
      </Modal>}

      {/* E-Mail */}
      <EmailModal open={!!showEmail} onClose={()=>setShowEmail(null)} doc={showEmail}
        onSend={async(body)=>{ await fetch(`/api/pdf/send/${showEmail.id}`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${localStorage.getItem('danitec_token')}`},body:JSON.stringify(body)}); reload(); }}/>

      <ConfirmModal open={!!confirmCancel} onClose={()=>setConfirmCancel(null)} danger
        title="Rechnung stornieren" message="Diese Rechnung wird unwiderruflich storniert. Fortfahren?"
        confirmLabel="Stornieren"
        onConfirm={async()=>{ try{ await api.cancelInvoice(confirmCancel); reload(); }catch(e){alert(e.message);} }}/>
    </div>
  );
}

// ─── ANGEBOTE ─────────────────────────────────────────────────────────────────
export function Offers() {
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [showEmail, setShowEmail] = useState(null);
  const { data, loading, reload } = useData(() => api.offers());
  const { data: customers } = useData(() => api.customers());
  const { data: products  } = useData(() => api.products());
  const [form, setForm] = useState({customerId:'',subject:'',documentDate:today(),validUntil:addDays(today(),30)});
  const [positions, setPositions] = useState([{description:'',quantity:1,unit:'Std',unit_price_net:0,discount_percent:0,vat_rate:20}]);
  const totals = useMemo(()=>calcTotals(positions),[positions]);
  const offers = data?.data || [];
  const STATUSES=[{id:'all',label:'Alle'},{id:'draft',label:'Entwurf'},{id:'sent',label:'Versendet'},{id:'accepted',label:'Angenommen'},{id:'rejected',label:'Abgelehnt'},{id:'converted',label:'In Rechnung'}];
  const filtered = offers.filter(o=>filter==='all'||o.offer_status===filter);

  const save = async () => {
    try {
      await api.createOffer({
        customerId:  parseInt(form.customerId),
        documentDate: form.documentDate,
        validUntil:  form.validUntil,
        subject:     form.subject,
        orderNumber: form.orderNumber || undefined,
        positions:   totals.positions,
        netTotal:    totals.net_total,
        vatTotal:    totals.vat_total,
        grossTotal:  totals.gross_total,
      });
      setShowNew(false);
      setPositions([{description:'',quantity:1,unit:'Std',unit_price_net:0,discount_percent:0,vat_rate:20}]);
      reload();
    } catch(e){ alert(e.message); }
  };
  const sendOffer   = async(id)=>{ try{ await fetch(`/api/offers/${id}/send`,{method:'POST',headers:{'Authorization':`Bearer ${localStorage.getItem('danitec_token')}`}}); reload(); }catch(e){alert(e.message);} };
  const accept      = async(id)=>{ try{ await api.acceptOffer(id); reload(); }catch(e){alert(e.message);} };
  const reject      = async(id)=>{ try{ await fetch(`/api/offers/${id}/reject`,{method:'POST',headers:{'Authorization':`Bearer ${localStorage.getItem('danitec_token')}`}}); reload(); }catch(e){alert(e.message);} };
  const convert     = async(id)=>{ try{ await api.convertOffer(id); reload(); }catch(e){alert(e.message);} };

  return (
    <div className="page-body">
      <div className="toolbar">
        <div className="filter-pills">{STATUSES.map(s=><button key={s.id} className={`btn xs ${filter===s.id?'primary':''}`} onClick={()=>setFilter(s.id)}>{s.label}</button>)}</div>
        <button className="btn primary" onClick={()=>setShowNew(true)}><i className="ti ti-plus"/>Neues Angebot</button>
      </div>
      <div className="card card-0">
        {loading?<div style={{padding:32,textAlign:'center'}}><Spinner dark/></div>:
         filtered.length===0?<EmptyState icon="ti-clipboard" title="Keine Angebote gefunden"/>:
        <div className="table-wrap"><table>
          <thead><tr><th>Nr.</th><th>A-Nr.</th><th>Kunde</th><th>Datum</th><th>Gültig bis</th><th>Betreff</th><th className="right">Brutto</th><th>Status</th><th>Aktionen</th></tr></thead>
          <tbody>{filtered.map(o=>(
            <tr key={o.id}>
              <td style={{fontWeight:500}}>{o.number}</td>
              <td><span style={{fontSize:11,fontWeight:600,color:'var(--accent)',background:'rgba(0,229,255,.08)',padding:'2px 6px',borderRadius:4}}>{o.order_number||'–'}</span></td>
              <td style={{fontSize:12}}>{o.customer_name}</td>
              <td style={{fontSize:12}}>{fmtDate(o.document_date)}</td>
              <td style={{fontSize:12}}>{fmtDate(o.valid_until)}</td>
              <td style={{fontSize:12,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.subject}</td>
              <td className="right" style={{fontWeight:500}}>{fmt(o.gross_total)}</td>
              <td><StatusBadge status={o.offer_status} label={STATUS_LABELS[o.offer_status]||o.offer_status}/></td>
              <td><div className="btn-group">
                {/* Entwurf → per E-Mail versenden (markiert gleichzeitig als "versendet") */}
                {o.offer_status==='draft'    && <button className="btn xs amber"   title="Per E-Mail an Kunden senden"  onClick={()=>setShowEmail(o)}><i className="ti ti-mail"/>Per Mail senden</button>}
                {/* Versendet → Angenommen oder Abgelehnt */}
                {o.offer_status==='sent'     && <button className="btn xs ghost icon" title="Erneut senden" onClick={()=>setShowEmail(o)}><i className="ti ti-mail"/></button>}
                {o.offer_status==='sent'     && <button className="btn xs success" title="Angenommen"        onClick={()=>accept(o.id)}><i className="ti ti-check"/>Angenommen</button>}
                {o.offer_status==='sent'     && <button className="btn xs danger"  title="Abgelehnt"         onClick={()=>reject(o.id)}><i className="ti ti-x"/>Abgelehnt</button>}
                {/* Angenommen → In Rechnung umwandeln */}
                {o.offer_status==='accepted' && <button className="btn xs primary" title="In Rechnung umwandeln" onClick={()=>convert(o.id)}><i className="ti ti-file-invoice"/>→ Rechnung</button>}
                {/* immer: PDF */}
                <button className="btn xs ghost icon" title="PDF" onClick={()=>{ const t=localStorage.getItem('danitec_token'); window.open(`/api/pdf/${o.id}?token=${t}`,'_blank'); }}><i className="ti ti-file-type-pdf"/></button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>}
      </div>
      <Modal open={showNew} onClose={()=>setShowNew(false)} title="Neues Angebot" maxWidth={760}
        footer={<><button className="btn" onClick={()=>setShowNew(false)}>Abbrechen</button><button className="btn primary" onClick={save} disabled={!form.customerId}><i className="ti ti-send"/>Angebot erstellen</button></>}>
        <FormRow>
          <FormGroup label="Kunde" required><select value={form.customerId} onChange={e=>setForm(f=>({...f,customerId:e.target.value}))}><option value="">Bitte wählen...</option>{(customers?.data||[]).map(c=><option key={c.id} value={c.id}>{c.company_name||c.first_name+' '+c.last_name}</option>)}</select></FormGroup>
          <FormGroup label="A-Nummer (leer = automatisch)">
            <input value={form.orderNumber||''} onChange={e=>setForm(f=>({...f,orderNumber:e.target.value}))} placeholder="z.B. A-2026-0001"/>
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Betreff"><input value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))}/></FormGroup>
          <FormGroup label="Angebotsdatum"><input type="date" value={form.documentDate} onChange={e=>setForm(f=>({...f,documentDate:e.target.value}))}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Gültig bis"><input type="date" value={form.validUntil} onChange={e=>setForm(f=>({...f,validUntil:e.target.value}))}/></FormGroup>
        </FormRow>
        <div style={{fontWeight:500,fontSize:13,marginBottom:8}}>Positionen</div>
        <PositionsEditor positions={positions} onChange={setPositions} products={products?.data||[]}/>
        <TotalsBox netto={totals.net_total} ust={totals.vat_total} brutto={totals.gross_total}/>
      </Modal>

      <EmailModal open={!!showEmail} onClose={()=>setShowEmail(null)} doc={showEmail}
        onSend={async(body)=>{
          await api.sendEmailDoc(showEmail.id, body);
          reload();
        }}/>
    </div>
  );
}

// ─── KUNDEN DETAIL – Mini-Dashboard ──────────────────────────────────────────
function CustomerDetail({ custId, onBack, onReloadCustomers, onNavigate }) {
  const [tab, setTab] = useState('anlagen');
  const [showEditCust, setShowEditCust] = useState(false);
  const [showEquipModal, setShowEquipModal] = useState(false);
  const [editEquip, setEditEquip] = useState(null);
  const [custSaving, setCustSaving] = useState(false);
  const [equipSaving, setEquipSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [cf, setCf] = useState({});

  const { data: ov, loading, reload } = useData(() => api.customerOverview(custId), [custId]);
  const [phones, setPhones] = useState([]);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [editPhone, setEditPhone] = useState(null);
  const [pf, setPf] = useState({ label:'Standard', phone:'' });
  const [phoneSaving, setPhoneSaving] = useState(false);

  // Quick-create modals from CustomerDetail tabs
  const [showQuickSvc, setShowQuickSvc]       = useState(false);
  const [showQuickContract, setShowQuickContract] = useState(false);
  const [showQuickProject, setShowQuickProject]   = useState(false);
  const [quickSaving, setQuickSaving]         = useState(false);
  const today2 = () => new Date().toISOString().split('T')[0];
  const [qSvc, setQSvc] = useState({});
  const [qContract, setQContract] = useState({});
  const [qProject, setQProject] = useState({});
  const { data: usersDataCd } = useData(() => api.users());

  const saveQuickSvc = async () => {
    setQuickSaving(true);
    try {
      await api.createServiceReport({ ...qSvc, customerId: custId, reportDate: qSvc.reportDate||today2(), status:'draft' });
      setShowQuickSvc(false); reload();
    } catch(e) { setAlert({type:'error',msg:e.message}); }
    finally { setQuickSaving(false); }
  };
  const saveQuickContract = async () => {
    setQuickSaving(true);
    try {
      await api.createMaintenanceContract({ ...qContract, customerId: custId, startDate: qContract.startDate||today2(), status:'active' });
      setShowQuickContract(false); reload();
    } catch(e) { setAlert({type:'error',msg:e.message}); }
    finally { setQuickSaving(false); }
  };
  const saveQuickProject = async () => {
    setQuickSaving(true);
    try {
      await api.createProject({ ...qProject, customerId: custId, startDate: qProject.startDate||today2(), status:'active', priority:'normal' });
      setShowQuickProject(false); reload();
    } catch(e) { setAlert({type:'error',msg:e.message}); }
    finally { setQuickSaving(false); }
  };

  React.useEffect(()=>{ if(custId) api.customerPhones(custId).then(r=>setPhones(r?.data||[])).catch(()=>{}); },[custId,ov]);
  const customer = ov?.customer || {};
  const custName = customer.company_name || `${customer.first_name||''} ${customer.last_name||''}`.trim() || '—';
  const equipment   = ov?.equipment || [];
  const contracts   = ov?.contracts || [];
  const svcReports  = ov?.serviceReports || [];
  const invoices    = ov?.invoices || [];
  const projects    = ov?.projects || [];
  const summary     = ov?.summary || {};

  // ── Anlagen-Formular ──────────────────────────────────────────────────────
  const emptyEf = { customerId:custId, name:'', equipmentType:'Klimaanlage', manufacturer:'', model:'', serialNumber:'', location:'', refrigerant:'R410A', refrigerantCustom:'', refrigerantAmountKg:'', yearBuilt:'', installDate:'', warrantyUntil:'', maintenanceIntervalMonths:12, lastMaintenance:'', nextMaintenance:'', status:'active', notes:'' };
  const [ef, setEf] = useState(emptyEf);
  const sef = (k,v) => setEf(f=>({...f,[k]:v}));
  const calcNext = (d,m) => { if(!d||!m) return ''; const dt=new Date(d); dt.setMonth(dt.getMonth()+parseInt(m)); return dt.toISOString().split('T')[0]; };

  function openEditEquip(e) {
    setEditEquip(e);
    const refKnown = REFRIGERANTS.slice(0,-1).includes(e.refrigerant);
    setEf({ customerId:custId, name:e.name, equipmentType:e.equipment_type||'Klimaanlage', manufacturer:e.manufacturer||'', model:e.model||'', serialNumber:e.serial_number||'', location:e.location||'', refrigerant:refKnown?e.refrigerant:'Sonstiges', refrigerantCustom:refKnown?'':e.refrigerant||'', refrigerantAmountKg:e.refrigerant_amount_kg||'', yearBuilt:e.year_built||'', installDate:e.install_date?.split('T')[0]||'', warrantyUntil:e.warranty_until?.split('T')[0]||'', maintenanceIntervalMonths:e.maintenance_interval_months||12, lastMaintenance:e.last_maintenance?.split('T')[0]||'', nextMaintenance:e.next_maintenance?.split('T')[0]||'', status:e.status||'active', notes:e.notes||'' });
    setShowEquipModal(true);
  }
  async function saveEquip() {
    if (!ef.name) { setAlert({ type:'error', msg:'Bezeichnung erforderlich.' }); return; }
    setEquipSaving(true);
    try {
      const efPayload = {...ef, refrigerant: ef.refrigerant==='Sonstiges'?ef.refrigerantCustom:ef.refrigerant};
      if (editEquip) await api.updateEquipment(editEquip.id, efPayload);
      else           await api.createEquipment(efPayload);
      setShowEquipModal(false); setEditEquip(null); setEf(emptyEf); reload();
    } catch(e) { setAlert({ type:'error', msg:e.message }); }
    finally { setEquipSaving(false); }
  }

  // ── Kunde bearbeiten ──────────────────────────────────────────────────────
  function openEditCust() {
    setCf({ type:customer.type||'business', company_name:customer.company_name||'', first_name:customer.first_name||'', last_name:customer.last_name||'', street:customer.street||'', house_number:customer.house_number||'', zip:customer.zip||'', city:customer.city||'', country:customer.country||'AT', email:customer.email||'', phone:customer.phone||'', uid_number:customer.uid_number||'', payment_days:customer.payment_days||14 });
    setShowEditCust(true);
  }
  async function saveCust() {
    setCustSaving(true);
    try {
      await api.updateCustomer(custId, { type:cf.type, companyName:cf.company_name, firstName:cf.first_name, lastName:cf.last_name, street:cf.street, houseNumber:cf.house_number, zip:cf.zip, city:cf.city, country:cf.country, email:cf.email, phone:cf.phone, uidNumber:cf.type==='private'?'':cf.uid_number, paymentDays:cf.payment_days });
      setShowEditCust(false); onReloadCustomers(); reload();
    } catch(e) { setAlert({ type:'error', msg:e.message }); }
    finally { setCustSaving(false); }
  }

  const INV_STATUS_COLOR = { finalized:'var(--amber)', sent:'var(--blue)', partial_paid:'var(--purple)', paid:'var(--green)', overdue:'var(--red)', cancelled:'var(--text-tertiary)' };
  const INV_STATUS_LABEL = { finalized:'Offen', sent:'Versendet', partial_paid:'Teilbez.', paid:'Bezahlt', overdue:'Überfällig', cancelled:'Storniert' };
  const PROJ_STATUS_COLOR = { active:'var(--green)', paused:'var(--amber)', completed:'var(--blue)', cancelled:'var(--text-tertiary)' };
  const PROJ_STATUS_LABEL = { active:'Aktiv', paused:'Pausiert', completed:'Abgeschlossen', cancelled:'Storniert' };

  if (loading) return <div className="page"><Spinner/></div>;

  const TABS = [
    { id:'anlagen',    label:`Anlagen (${equipment.length})`,            icon:'ti-air-conditioning' },
    { id:'wartung',    label:`Wartungsverträge (${contracts.length})`,   icon:'ti-file-certificate' },
    { id:'service',    label:`Serviceberichte (${svcReports.length})`,   icon:'ti-clipboard-check' },
    { id:'rechnungen', label:`Rechnungen (${invoices.length})`,          icon:'ti-file-invoice' },
    { id:'projekte',   label:`Planungsprojekte (${projects.length})`,            icon:'ti-hammer' },
    { id:'telefon',    label:`Telefon (${phones.length})`,               icon:'ti-phone' },
  ];

  return (
    <div className="page">
      {alert && <Alert type={alert.type}>{alert.msg}</Alert>}

      {/* Breadcrumb */}
      <button className="btn" style={{marginBottom:14}} onClick={onBack}>
        <i className="ti ti-arrow-left"/> Alle Kunden
      </button>

      {/* Kunden-Header-Karte */}
      <div className="card" style={{marginBottom:16,padding:'16px 20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10,marginBottom:14}}>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <div style={{width:42,height:42,borderRadius:10,background:'rgba(0,229,255,0.12)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <i className={`ti ${customer.type==='business'?'ti-building':'ti-user'}`} style={{fontSize:20,color:'var(--accent)'}}/>
            </div>
            <div>
              <h2 style={{margin:0,fontSize:18,fontWeight:700}}>{custName}</h2>
              <div style={{display:'flex',gap:6,marginTop:3}}>
                <span style={{fontSize:10,padding:'1px 6px',borderRadius:3,background:'rgba(0,229,255,0.15)',color:'var(--accent)',fontWeight:600}}>{customer.customer_number}</span>
                <span style={{fontSize:10,padding:'1px 6px',borderRadius:3,background:customer.type==='business'?'rgba(59,130,246,0.15)':'rgba(100,116,139,0.15)',color:customer.type==='business'?'var(--blue)':'var(--text-secondary)',fontWeight:600}}>{customer.type==='business'?'Unternehmen':'Privatkunde'}</span>
              </div>
            </div>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {customer.phone && <a href={`tel:${customer.phone}`} className="btn"><i className="ti ti-phone"/> {customer.phone}</a>}
            {customer.email && <a href={`mailto:${customer.email}`} className="btn"><i className="ti ti-mail"/> E-Mail</a>}
            <button className="btn" onClick={openEditCust}><i className="ti ti-edit"/> Bearbeiten</button>
          </div>
        </div>

        {/* Kontaktdaten */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:12,fontSize:12}}>
          {[
            { label:'Adresse', val: [customer.address, [customer.zip,customer.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—' },
            { label:'Telefon', val: customer.phone||'—' },
            { label:'E-Mail',  val: customer.email||'—' },
            { label:'UID',     val: customer.uid_number||'—' },
            { label:'Zahlungsziel', val: `${customer.payment_days||14} Tage` },
          ].map(f => (
            <div key={f.label}>
              <div style={{fontSize:9,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:.6,marginBottom:2}}>{f.label}</div>
              <div style={{color:'var(--text)'}}>{f.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Zusammenfassung – 4 Kacheln */}
      <div className="dash-grid-4" style={{marginBottom:16}}>
        {[
          {
            label: 'Anlagen', val: summary.equipment_count||0, icon:'ti-air-conditioning', color:'var(--accent)',
            sub: summary.overdue_count > 0 ? `${summary.overdue_count} überfällig` : summary.due_soon_count > 0 ? `${summary.due_soon_count} bald fällig` : 'alle OK',
            subColor: summary.overdue_count > 0 ? 'var(--red)' : summary.due_soon_count > 0 ? 'var(--amber)' : 'var(--green)',
          },
          {
            label:'Wartungsverträge', val: summary.active_contracts||0, icon:'ti-file-certificate', color:'var(--blue)',
            sub: contracts.filter(c=>c.service_status==='overdue').length > 0 ? `${contracts.filter(c=>c.service_status==='overdue').length} überfällig` : 'alle OK',
            subColor: contracts.filter(c=>c.service_status==='overdue').length > 0 ? 'var(--red)' : 'var(--green)',
          },
          {
            label:'Offene Rechnungen', val: summary.open_invoices||0, icon:'ti-file-invoice', color:'var(--amber)',
            sub: summary.open_invoice_total > 0 ? `${parseFloat(summary.open_invoice_total).toFixed(2)} €` : '—',
            subColor: 'var(--text-secondary)',
          },
          {
            label:'Serviceberichte', val: svcReports.length, icon:'ti-clipboard-check', color:'var(--purple)',
            sub: svcReports[0] ? fmtDate(svcReports[0].report_date) : '—',
            subColor: 'var(--text-secondary)',
          },
        ].map(s => (
          <div key={s.label} className="card metric-card" style={{cursor:'default'}}>
            <i className={`ti ${s.icon}`} style={{fontSize:22,color:s.color,marginBottom:4}}/>
            <div className="metric-value" style={{color:s.color}}>{s.val}</div>
            <div className="metric-label">{s.label}</div>
            {s.sub && <div style={{fontSize:10,color:s.subColor,marginTop:2,fontWeight:600}}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:14,borderBottom:'1px solid var(--border)',paddingBottom:0}}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{display:'flex',alignItems:'center',gap:5,padding:'7px 14px',fontSize:12,fontWeight:tab===t.id?700:500,
              color:tab===t.id?'var(--accent)':'var(--text-secondary)',background:'transparent',border:'none',
              borderBottom:tab===t.id?'2px solid var(--accent)':'2px solid transparent',cursor:'pointer',marginBottom:-1}}>
            <i className={`ti ${t.icon}`}/>{t.label}
          </button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center',paddingBottom:4}}>
          {tab==='anlagen'   && <button className="btn primary xs" onClick={()=>{setEditEquip(null);setEf(emptyEf);setShowEquipModal(true);}}><i className="ti ti-plus"/> Anlage</button>}
          {tab==='telefon'   && <button className="btn primary xs" onClick={()=>{setEditPhone(null);setPf({label:'Standard',phone:''});setShowPhoneModal(true);}}><i className="ti ti-plus"/> Nummer</button>}
          {tab==='service'   && <button className="btn primary xs" onClick={()=>{setQSvc({reportType:'service',reportDate:today2(),workPerformed:'',defectsFound:[''],recommendations:'',hoursWorked:'',travelHours:'',timeFrom:'',timeTo:'',technicianId:'',status:'draft'});setShowQuickSvc(true);}}><i className="ti ti-plus"/> Servicebericht</button>}
          {tab==='wartung'   && <button className="btn primary xs" onClick={()=>{setQContract({name:'',intervalMonths:12,startDate:today2(),priceYearly:''});setShowQuickContract(true);}}><i className="ti ti-plus"/> Wartungsvertrag</button>}
          {tab==='projekte'  && <button className="btn primary xs" onClick={()=>{setQProject({name:'',description:'',startDate:today2()});setShowQuickProject(true);}}><i className="ti ti-plus"/> Projekt</button>}
          {tab==='rechnungen'&& <button className="btn primary xs" onClick={()=>onNavigate('invoices')}><i className="ti ti-plus"/> Rechnung</button>}
        </div>
      </div>

      {/* Tab: Anlagen */}
      {tab === 'anlagen' && (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {equipment.length === 0
            ? <EmptyState icon="ti-air-conditioning" title="Keine Anlagen" subtitle="Füge Klimaanlagen, Kühlstellen und andere Geräte hinzu."/>
            : <table>
                <thead><tr><th>A-Nr.</th><th>Bezeichnung</th><th>Typ</th><th>Standort</th><th>Kältemittel</th><th>Letzte Wartung</th><th>Nächste Wartung</th><th>Status</th><th/></tr></thead>
                <tbody>{equipment.map(e => {
                  const ms = MAINT_STATUS[e.maintenance_status] || MAINT_STATUS.ok;
                  return (
                    <tr key={e.id}>
                      <td style={{whiteSpace:'nowrap'}}>
                        {e.order_number && <div style={{fontSize:10,fontWeight:700,color:'var(--accent)'}}>{e.order_number}</div>}
                      </td>
                      <td>
                        <strong style={{fontSize:13}}>{e.name}</strong>
                        {(e.manufacturer||e.model) && <div style={{fontSize:11,color:'var(--text-secondary)'}}>{[e.manufacturer,e.model].filter(Boolean).join(' ')}</div>}
                      </td>
                      <td style={{fontSize:12}}>{e.equipment_type||'—'}</td>
                      <td style={{fontSize:12}}>{e.location||'—'}</td>
                      <td style={{fontSize:12}}>{e.refrigerant||'—'}{e.refrigerant_amount_kg&&<span style={{color:'var(--text-tertiary)'}}> {e.refrigerant_amount_kg} kg</span>}</td>
                      <td style={{fontSize:12}}>{e.last_maintenance ? fmtDate(e.last_maintenance) : '—'}</td>
                      <td>
                        <span style={{fontWeight:700,fontSize:12,color:ms.color}}>
                          <i className={`ti ${ms.icon}`} style={{marginRight:3}}/>{e.next_maintenance ? fmtDate(e.next_maintenance) : '—'}
                        </span>
                      </td>
                      <td><span style={{fontSize:11,fontWeight:600,color:ms.color}}>{ms.label}</span></td>
                      <td><button className="btn xs" onClick={()=>openEditEquip(e)}><i className="ti ti-edit"/></button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
          }
        </div>
      )}

      {/* Tab: Wartungsverträge */}
      {tab === 'wartung' && (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {contracts.length === 0
            ? <EmptyState icon="ti-file-certificate" title="Keine Wartungsverträge" subtitle="Erstelle einen Wartungsvertrag für diesen Kunden."/>
            : <table>
                <thead><tr><th>Vertrag</th><th>Intervall</th><th>Letzter Service</th><th>Nächster Service</th><th>Preis</th><th>Status</th></tr></thead>
                <tbody>{contracts.map(c => {
                  const ss = SERVICE_STATUS[c.service_status] || SERVICE_STATUS.ok;
                  const cs = CONTRACT_STATUS[c.status] || CONTRACT_STATUS.active;
                  return (
                    <tr key={c.id}>
                      <td>
                        {c.order_number && <div style={{fontSize:10,fontWeight:700,color:'var(--accent)'}}>{c.order_number}</div>}
                        <strong style={{fontSize:13}}>{c.name}</strong>
                        <div style={{fontSize:10,color:'var(--text-tertiary)'}}>{c.contract_number}</div>
                      </td>
                      <td style={{fontSize:12}}>{INTERVAL_LABELS[c.interval_months]||`${c.interval_months} Mo.`}</td>
                      <td style={{fontSize:12}}>{c.last_service_date ? fmtDate(c.last_service_date) : '—'}</td>
                      <td><span style={{fontWeight:700,fontSize:12,color:ss.color}}><i className={`ti ${ss.icon}`} style={{marginRight:3}}/>{c.next_service_date ? fmtDate(c.next_service_date) : '—'}</span></td>
                      <td style={{fontSize:12}}>{c.price_yearly ? `${parseFloat(c.price_yearly).toFixed(0)} €/J.` : c.price_per_service ? `${parseFloat(c.price_per_service).toFixed(0)} €/Service` : '—'}</td>
                      <td><span style={{fontSize:11,fontWeight:600,color:cs.color}}>{cs.label}</span></td>
                    </tr>
                  );
                })}</tbody>
              </table>
          }
        </div>
      )}

      {/* Tab: Serviceberichte */}
      {tab === 'service' && (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {svcReports.length === 0
            ? <EmptyState icon="ti-clipboard-check" title="Keine Serviceberichte" subtitle="Noch kein Serviceeinsatz bei diesem Kunden dokumentiert."/>
            : <table>
                <thead><tr><th>Nr.</th><th>Datum</th><th>Typ</th><th>Anlage</th><th>Techniker</th><th>Std.</th><th>Status</th></tr></thead>
                <tbody>{svcReports.map(r => (
                  <tr key={r.id}>
                    <td style={{fontSize:11,color:'var(--text-secondary)'}}>{r.report_number}</td>
                    <td style={{fontSize:12}}>{fmtDate(r.report_date)}</td>
                    <td style={{fontSize:12}}>{r.report_type}</td>
                    <td style={{fontSize:12}}>{r.equipment_name||'—'}</td>
                    <td style={{fontSize:12}}>{r.technician_name||'—'}</td>
                    <td style={{fontSize:12}}>{parseFloat(r.hours_worked||0)+parseFloat(r.travel_hours||0)} h</td>
                    <td><span style={{fontSize:11,padding:'1px 6px',borderRadius:3,background:'var(--surface-2)',color:r.status==='completed'?'var(--green)':'var(--amber)',fontWeight:600}}>{r.status==='completed'?'Abgeschlossen':'Entwurf'}</span></td>
                  </tr>
                ))}</tbody>
              </table>
          }
        </div>
      )}

      {/* Tab: Rechnungen */}
      {tab === 'rechnungen' && (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {invoices.length === 0
            ? <EmptyState icon="ti-file-invoice" title="Keine Rechnungen" subtitle="Noch keine Rechnung für diesen Kunden erstellt."/>
            : <table>
                <thead><tr><th>Nr.</th><th>Datum</th><th>Fällig</th><th style={{textAlign:'right'}}>Betrag</th><th>Status</th></tr></thead>
                <tbody>{invoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{fontSize:11,fontWeight:600}}>{inv.number}</td>
                    <td style={{fontSize:12}}>{fmtDate(inv.document_date)}</td>
                    <td style={{fontSize:12,color:inv.status==='overdue'?'var(--red)':undefined}}>{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                    <td style={{textAlign:'right',fontWeight:600,fontSize:13}}>{fmt(inv.gross_total)}</td>
                    <td><span style={{fontSize:11,fontWeight:600,color:INV_STATUS_COLOR[inv.status]||'var(--text-secondary)'}}>{INV_STATUS_LABEL[inv.status]||inv.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
          }
        </div>
      )}

      {/* Tab: Projekte */}
      {tab === 'projekte' && (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {projects.length === 0
            ? <EmptyState icon="ti-hammer" title="Keine Planungsprojekte" subtitle="Noch kein Planungsprojekt für diesen Kunden angelegt."/>
            : <table>
                <thead><tr><th>Nr.</th><th>Projektname</th><th>Start</th><th>Status</th></tr></thead>
                <tbody>{projects.map(p => (
                  <tr key={p.id}>
                    <td style={{fontSize:11,color:'var(--text-secondary)'}}>{p.project_number}</td>
                    <td style={{fontWeight:600,fontSize:13}}>{p.name}</td>
                    <td style={{fontSize:12}}>{p.start_date ? fmtDate(p.start_date) : '—'}</td>
                    <td><span style={{fontSize:11,fontWeight:600,color:PROJ_STATUS_COLOR[p.status]||'var(--text-secondary)'}}>{PROJ_STATUS_LABEL[p.status]||p.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
          }
        </div>
      )}

      {/* Quick: Servicebericht */}
      <Modal open={showQuickSvc} onClose={()=>setShowQuickSvc(false)} title="Neuer Servicebericht" maxWidth={480}
        footer={<><button className="btn" onClick={()=>setShowQuickSvc(false)}>Abbrechen</button><button className="btn primary" onClick={saveQuickSvc} disabled={quickSaving}><i className="ti ti-check"/> Speichern</button></>}>
        <FormRow>
          <FormGroup label="Art"><select value={qSvc.reportType||'service'} onChange={e=>setQSvc(f=>({...f,reportType:e.target.value}))}><option value="service">Serviceeinsatz</option><option value="maintenance">Wartung</option><option value="repair">Reparatur</option><option value="emergency">Notfalleinsatz</option></select></FormGroup>
          <FormGroup label="Datum"><input type="date" value={qSvc.reportDate||today2()} onChange={e=>setQSvc(f=>({...f,reportDate:e.target.value}))}/></FormGroup>
        </FormRow>
        <FormGroup label="Techniker"><select value={qSvc.technicianId||''} onChange={e=>setQSvc(f=>({...f,technicianId:e.target.value}))}><option value="">— kein —</option>{(usersDataCd?.data||[]).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></FormGroup>
        <FormGroup label="Durchgeführte Arbeiten"><textarea rows={3} value={qSvc.workPerformed||''} onChange={e=>setQSvc(f=>({...f,workPerformed:e.target.value}))} placeholder="Was wurde gemacht?"/></FormGroup>
      </Modal>

      {/* Quick: Wartungsvertrag */}
      <Modal open={showQuickContract} onClose={()=>setShowQuickContract(false)} title="Neuer Wartungsvertrag" maxWidth={440}
        footer={<><button className="btn" onClick={()=>setShowQuickContract(false)}>Abbrechen</button><button className="btn primary" onClick={saveQuickContract} disabled={quickSaving||!qContract.name}><i className="ti ti-check"/> Speichern</button></>}>
        <FormGroup label="Bezeichnung *">
          <select value={!(qContract.name||'')?'':WARTUNG_TYPEN.filter(t=>t!=='Sonstiges').includes(qContract.name||'')?qContract.name:'__custom__'} onChange={e=>{ if(e.target.value==='__custom__') setQContract(f=>({...f,name:'__'})); else setQContract(f=>({...f,name:e.target.value})); }}>
            <option value="">— Bitte wählen —</option>
            {WARTUNG_TYPEN.filter(t=>t!=='Sonstiges').map(t=><option key={t} value={t}>{t}</option>)}
            <option value="__custom__">Sonstiges (Freitext)</option>
          </select>
          {((qContract.name||'') && !WARTUNG_TYPEN.filter(t=>t!=='Sonstiges').includes(qContract.name||'')) && <input value={qContract.name==='__'?'':qContract.name||''} onChange={e=>setQContract(f=>({...f,name:e.target.value||'__'}))} placeholder="Bezeichnung eingeben..." style={{marginTop:6}}/>}
        </FormGroup>
        <FormRow>
          <FormGroup label="Start"><input type="date" value={qContract.startDate||today2()} onChange={e=>setQContract(f=>({...f,startDate:e.target.value}))}/></FormGroup>
          <FormGroup label="Intervall"><select value={qContract.intervalMonths||12} onChange={e=>setQContract(f=>({...f,intervalMonths:parseInt(e.target.value)}))}><option value={1}>Monatlich</option><option value={3}>Quartalsweise</option><option value={6}>Halbjährlich</option><option value={12}>Jährlich</option><option value={24}>Alle 2 Jahre</option></select></FormGroup>
        </FormRow>
        <FormGroup label="Preis/Jahr (€)"><input type="number" value={qContract.priceYearly||''} onChange={e=>setQContract(f=>({...f,priceYearly:e.target.value}))} placeholder="0.00"/></FormGroup>
      </Modal>

      {/* Quick: Projekt */}
      <Modal open={showQuickProject} onClose={()=>setShowQuickProject(false)} title="Neues Planungsprojekt" maxWidth={440}
        footer={<><button className="btn" onClick={()=>setShowQuickProject(false)}>Abbrechen</button><button className="btn primary" onClick={saveQuickProject} disabled={quickSaving||!qProject.name}><i className="ti ti-check"/> Speichern</button></>}>
        <FormGroup label="Projektname *"><input value={qProject.name||''} onChange={e=>setQProject(f=>({...f,name:e.target.value}))} placeholder="z.B. Klimaanlage Umbau"/></FormGroup>
        <FormGroup label="Beschreibung"><textarea rows={2} value={qProject.description||''} onChange={e=>setQProject(f=>({...f,description:e.target.value}))}/></FormGroup>
        <FormRow>
          <FormGroup label="Start"><input type="date" value={qProject.startDate||today2()} onChange={e=>setQProject(f=>({...f,startDate:e.target.value}))}/></FormGroup>
          <FormGroup label="Priorität"><select value={qProject.priority||'normal'} onChange={e=>setQProject(f=>({...f,priority:e.target.value}))}><option value="low">Niedrig</option><option value="normal">Normal</option><option value="high">Hoch</option></select></FormGroup>
        </FormRow>
      </Modal>

      {/* Modal: Anlage bearbeiten/neu */}
      <Modal open={showEquipModal} title={editEquip?'Anlage bearbeiten':'Neue Anlage'} onClose={()=>{setShowEquipModal(false);setEditEquip(null);}} maxWidth={560}>
        <FormRow>
          <FormGroup label="Bezeichnung *"><input value={ef.name} onChange={e=>sef('name',e.target.value)} placeholder="z.B. Klimaanlage Büro EG"/></FormGroup>
          <FormGroup label="Typ"><select value={ef.equipmentType} onChange={e=>sef('equipmentType',e.target.value)}>{EQUIP_TYPES.map(t=><option key={t}>{t}</option>)}</select></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Hersteller"><input value={ef.manufacturer} onChange={e=>sef('manufacturer',e.target.value)} placeholder="z.B. Daikin"/></FormGroup>
          <FormGroup label="Modell"><input value={ef.model} onChange={e=>sef('model',e.target.value)}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Seriennummer"><input value={ef.serialNumber} onChange={e=>sef('serialNumber',e.target.value)}/></FormGroup>
          <FormGroup label="Baujahr"><input type="number" value={ef.yearBuilt} onChange={e=>sef('yearBuilt',e.target.value)} placeholder="2020" min="1990" max="2030"/></FormGroup>
        </FormRow>
        <FormGroup label="Standort beim Kunden"><input value={ef.location} onChange={e=>sef('location',e.target.value)} placeholder="z.B. Büro 2. OG, Serverraum"/></FormGroup>
        <FormRow>
          <FormGroup label="Kältemittel">
            <input list="refrigerant-list-cd" value={ef.refrigerant} onChange={e=>sef('refrigerant',e.target.value)}/>
            {ef.refrigerant==='Sonstiges'&&<input value={ef.refrigerantCustom||''} onChange={e=>sef('refrigerantCustom',e.target.value)} placeholder="Kältemittel eingeben..." style={{marginTop:6}}/>}
          </FormGroup>
          <FormGroup label="Füllmenge (kg)"><input type="number" value={ef.refrigerantAmountKg} onChange={e=>sef('refrigerantAmountKg',e.target.value)} step="0.001" min="0"/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Letzte Wartung"><input type="date" value={ef.lastMaintenance} onChange={e=>sef('lastMaintenance',e.target.value)}/></FormGroup>
          <FormGroup label="Intervall (Monate)"><input type="number" value={ef.maintenanceIntervalMonths} onChange={e=>{const v=e.target.value;setEf(f=>({...f,maintenanceIntervalMonths:v,nextMaintenance:calcNext(f.lastMaintenance,v)}));}} min="1" max="60"/></FormGroup>
        </FormRow>
        <FormGroup label="Nächste Wartung"><input type="date" value={ef.nextMaintenance} onChange={e=>sef('nextMaintenance',e.target.value)}/></FormGroup>
        <FormRow>
          <FormGroup label="Inbetriebnahme"><input type="date" value={ef.installDate} onChange={e=>sef('installDate',e.target.value)}/></FormGroup>
          <FormGroup label="Garantie bis"><input type="date" value={ef.warrantyUntil} onChange={e=>sef('warrantyUntil',e.target.value)}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Status"><select value={ef.status} onChange={e=>sef('status',e.target.value)}><option value="active">Aktiv</option><option value="defective">Defekt</option><option value="decommissioned">Außer Betrieb</option></select></FormGroup>
        </FormRow>
        <FormGroup label="Notizen"><textarea value={ef.notes} onChange={e=>sef('notes',e.target.value)} rows={2}/></FormGroup>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
          <button className="btn" onClick={()=>{setShowEquipModal(false);setEditEquip(null);}}>Abbrechen</button>
          <button className="btn primary" onClick={saveEquip} disabled={equipSaving}><i className="ti ti-check"/> Speichern</button>
        </div>
      </Modal>

      {/* Modal: Kunde bearbeiten */}
      <Modal open={showEditCust} title="Kunde bearbeiten" onClose={()=>setShowEditCust(false)} maxWidth={520}>
        {cf.type==='business'&&<FormGroup label="Firma *"><input value={cf.company_name||''} onChange={e=>setCf(f=>({...f,company_name:e.target.value}))}/></FormGroup>}
        <FormRow><FormGroup label="Vorname"><input value={cf.first_name||''} onChange={e=>setCf(f=>({...f,first_name:e.target.value}))}/></FormGroup><FormGroup label="Nachname"><input value={cf.last_name||''} onChange={e=>setCf(f=>({...f,last_name:e.target.value}))}/></FormGroup></FormRow>
        <FormRow><FormGroup label="Straße"><input value={cf.street||''} onChange={e=>setCf(f=>({...f,street:e.target.value}))}/></FormGroup><FormGroup label="Nr." style={{maxWidth:90}}><input value={cf.house_number||''} onChange={e=>setCf(f=>({...f,house_number:e.target.value}))}/></FormGroup></FormRow>
        <FormRow><FormGroup label="PLZ"><input value={cf.zip||''} onChange={e=>setCf(f=>({...f,zip:e.target.value}))}/></FormGroup><FormGroup label="Ort"><input value={cf.city||''} onChange={e=>setCf(f=>({...f,city:e.target.value}))}/></FormGroup></FormRow>
        <FormRow><FormGroup label="E-Mail"><input type="email" value={cf.email||''} onChange={e=>setCf(f=>({...f,email:e.target.value}))}/></FormGroup><FormGroup label="Telefon"><input value={cf.phone||''} onChange={e=>setCf(f=>({...f,phone:e.target.value}))}/></FormGroup></FormRow>
        <FormRow>{cf.type!=='private'&&<FormGroup label="UID-Nummer"><input value={cf.uid_number||''} onChange={e=>setCf(f=>({...f,uid_number:e.target.value}))} placeholder="ATU..."/></FormGroup>}<FormGroup label="Zahlungsziel (Tage)"><input type="number" value={cf.payment_days||14} onChange={e=>setCf(f=>({...f,payment_days:parseInt(e.target.value)||14}))}/></FormGroup></FormRow>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
          <button className="btn" onClick={()=>setShowEditCust(false)}>Abbrechen</button>
          <button className="btn primary" onClick={saveCust} disabled={custSaving}><i className="ti ti-check"/> Speichern</button>
        </div>
      </Modal>
    </div>
  );
}

export function Customers() {
  const [search,   setSearch]      = useState('');
  const [showNew,  setShowNew]     = useState(false);
  const [editId,   setEditId]      = useState(null);
  const [saving,   setSaving]      = useState(false);
  const [modalErr, setModalErr]    = useState('');
  const [selectedId, setSelectedId]= useState(null);
  const [sel, setSel] = useState(new Set());
  const { data, loading, reload }  = useData(()=>api.customers());
  const EMPTY = {type:'business',company_name:'',first_name:'',last_name:'',street:'',house_number:'',zip:'',city:'',country:'AT',email:'',phone:'',uid_number:'',payment_days:14};
  const [form, setForm] = useState(EMPTY);
  const allCustomers = data?.data||[];
  const customers = allCustomers.filter(c=>!search||(c.company_name||c.first_name+' '+c.last_name).toLowerCase().includes(search.toLowerCase())||c.customer_number?.toLowerCase().includes(search.toLowerCase()));

  const openNew  = () => { setForm(EMPTY); setModalErr(''); setShowNew(true); };
  const openEdit = (c,ev) => { ev.stopPropagation(); setEditId(c.id); setForm({type:c.type,company_name:c.company_name||'',first_name:c.first_name||'',last_name:c.last_name||'',street:c.street||'',house_number:c.house_number||'',zip:c.zip||'',city:c.city||'',country:c.country||'AT',email:c.email||'',phone:c.phone||'',uid_number:c.uid_number||'',payment_days:c.payment_days||14}); setModalErr(''); setShowNew(true); };
  const closeModal = () => { setShowNew(false); setEditId(null); setModalErr(''); };
  const toggleOneCust = id => setSel(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAllCust = () => setSel(s=>s.size===customers.length?new Set():new Set(customers.map(c=>c.id)));
  const bulkDeleteCust = async()=>{ if(!confirm(`${sel.size} Kunden löschen?`))return; await Promise.all([...sel].map(id=>api.deleteCustomer(id).catch(()=>{}))); setSel(new Set()); reload(); };

  const save = async () => {
    setSaving(true); setModalErr('');
    try {
      if (!form.phone) { setModalErr('Bitte Telefonnummer eingeben.'); setSaving(false); return; }
      if (editId) {
        await api.updateCustomer(editId, {type:form.type,companyName:form.company_name,firstName:form.first_name,lastName:form.last_name,street:form.street,houseNumber:form.house_number,zip:form.zip,city:form.city,country:form.country,email:form.email,phone:form.phone,uidNumber:form.type==='private'?'':form.uid_number,paymentDays:form.payment_days});
      } else {
        await api.createCustomer({type:form.type,companyName:form.company_name,firstName:form.first_name,lastName:form.last_name,street:form.street,houseNumber:form.house_number,zip:form.zip,city:form.city,country:form.country,email:form.email,phone:form.phone,uidNumber:form.type==='private'?'':form.uid_number,paymentDays:form.payment_days});
      }
      closeModal(); reload();
    } catch(e) { setModalErr(e.message); }
    finally { setSaving(false); }
  };

  if (selectedId) {
    return <CustomerDetail custId={selectedId} allCustomers={allCustomers} onBack={()=>setSelectedId(null)} onReloadCustomers={reload}/>;
  }

  return (
    <div className="page-body">
      <div className="toolbar">
        <input className="search-input" placeholder="Name oder Nummer..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <button className="btn primary" onClick={openNew}><i className="ti ti-plus"/>Neuer Kunde</button>
      </div>
      <div className="card card-0">
        {loading?<div style={{padding:32,textAlign:'center'}}><Spinner dark/></div>:<>
        {sel.size>0&&<div className="bulk-bar"><span className="bulk-bar-count">{sel.size} ausgewählt</span><button className="btn xs bulk-cancel" onClick={()=>setSel(new Set())}>Auswahl aufheben</button><button className="btn xs bulk-delete" onClick={bulkDeleteCust}><i className="ti ti-trash"/> Löschen</button></div>}
        <div className="table-wrap"><table>
          <thead><tr>
            <th className="cb-col"><input type="checkbox" checked={sel.size===customers.length&&customers.length>0} onChange={toggleAllCust}/></th>
            <th>Nr.</th><th>Typ</th><th>Name/Firma</th><th>Ort</th><th>E-Mail</th><th>UID</th><th>Zahlungsziel</th><th/>
          </tr></thead>
          <tbody>{customers.map(c=>(
            <tr key={c.id} className={sel.has(c.id)?'row-selected':''} style={{cursor:'pointer'}} onClick={()=>setSelectedId(c.id)}>
              <td className="cb-col" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={sel.has(c.id)} onChange={()=>toggleOneCust(c.id)}/></td>
              <td style={{fontWeight:500}}>{c.customer_number}</td>
              <td><span className={`badge ${c.type==='business'?'blue':'gray'}`}>{c.type==='business'?'Unternehmen':'Privatkunde'}</span></td>
              <td style={{fontWeight:500}}>{c.company_name||c.first_name+' '+c.last_name}</td>
              <td style={{fontSize:12}}>{c.zip} {c.city}</td>
              <td style={{fontSize:12}}>{c.email||'—'}</td>
              <td style={{fontSize:12}}>{c.uid_number||<span style={{color:'var(--text-tertiary)'}}>—</span>}</td>
              <td style={{fontSize:12}}>{c.payment_days} Tage</td>
              <td onClick={e=>e.stopPropagation()}>
                <div style={{display:'flex',gap:4}}>
                  <button className="btn xs ghost icon" title="Bearbeiten" onClick={(ev)=>openEdit(c,ev)}><i className="ti ti-edit"/></button>
                  <button className="btn xs danger icon" title="Löschen" onClick={async(ev)=>{ev.stopPropagation();if(confirm(`Kunde "${c.company_name||c.first_name+' '+c.last_name}" löschen?`)){try{await api.deleteCustomer(c.id);reload();}catch(e){alert(e.message);}}}}><i className="ti ti-trash"/></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table></div></>}
      </div>
      <Modal open={showNew} onClose={closeModal} title={editId?'Kunde bearbeiten':'Neuer Kunde'} maxWidth={520}
        footer={<><button className="btn" onClick={closeModal}>Abbrechen</button><button className="btn primary" onClick={save} disabled={saving||(!form.company_name&&!form.last_name)}>{saving?<><i className="ti ti-loader-2"/>Speichern...</>:<><i className="ti ti-check"/>Speichern</>}</button></>}>
        {modalErr&&<div style={{marginBottom:12}}><Alert type="danger">{modalErr}</Alert></div>}
        {!editId&&<FormGroup label="Kundentyp"><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}><option value="business">Unternehmen</option><option value="private">Privatkunde</option></select></FormGroup>}
        {form.type==='business'&&<FormGroup label="Firma" required><input value={form.company_name} onChange={e=>setForm(f=>({...f,company_name:e.target.value}))}/></FormGroup>}
        <FormRow><FormGroup label="Vorname"><input value={form.first_name} onChange={e=>setForm(f=>({...f,first_name:e.target.value}))}/></FormGroup><FormGroup label="Nachname"><input value={form.last_name} onChange={e=>setForm(f=>({...f,last_name:e.target.value}))}/></FormGroup></FormRow>
        <FormRow><FormGroup label="Straße"><input value={form.street} onChange={e=>setForm(f=>({...f,street:e.target.value}))}/></FormGroup><FormGroup label="Nr." style={{maxWidth:90}}><input value={form.house_number} onChange={e=>setForm(f=>({...f,house_number:e.target.value}))}/></FormGroup></FormRow>
        <FormRow><FormGroup label="PLZ"><input value={form.zip} onChange={e=>setForm(f=>({...f,zip:e.target.value}))}/></FormGroup><FormGroup label="Ort"><input value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/></FormGroup></FormRow>
        <FormRow><FormGroup label="E-Mail"><input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></FormGroup><FormGroup label="Telefon" required><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="+43..." style={!form.phone?{borderColor:'var(--red)'}:{}}/></FormGroup></FormRow>
        {form.type!=='private'&&<FormGroup label="UID-Nummer"><input value={form.uid_number} onChange={e=>setForm(f=>({...f,uid_number:e.target.value}))} placeholder="ATU..."/></FormGroup>}
        <FormGroup label="Zahlungsziel (Tage)"><input type="number" value={form.payment_days} onChange={e=>setForm(f=>({...f,payment_days:parseInt(e.target.value)||14}))}/></FormGroup>
      </Modal>
    </div>
  );
}

// ─── LIEFERANTEN ──────────────────────────────────────────────────────────────
export function Suppliers() {
  const [showNew,  setShowNew] = useState(false);
  const [editId,   setEditId]  = useState(null);
  const [saving,   setSaving]  = useState(false);
  const [modalErr, setModalErr]= useState('');
  const { data, loading, reload } = useData(()=>api.suppliers());
  const KATS=['Wareneinkauf','Treibstoff','Versicherung','Telefon und Internet','Software','Steuerberatung','Fahrzeugkosten','Sonstige'];
  const EMPTY = {company_name:'',street:'',house_number:'',zip:'',city:'',country:'AT',email:'',phone:'',uid_number:'',iban:'',defaultCategory:'Wareneinkauf'};
  const [form, setForm] = useState(EMPTY);

  const [extractName, setExtractName] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [selSup, setSelSup] = useState(new Set());
  const supList = data?.data||[];
  const toggleOneSup = id=>setSelSup(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAllSup = ()=>setSelSup(s=>s.size===supList.length?new Set():new Set(supList.map(x=>x.id)));
  const bulkDeleteSup = async()=>{if(!confirm(`${selSup.size} Lieferanten löschen?`))return;await Promise.all([...selSup].map(id=>api.deleteSupplier(id).catch(()=>{})));setSelSup(new Set());reload();};

  const extractFromName = async () => {
    if (!extractName.trim()) return;
    setExtracting(true); setModalErr('');
    try {
      const res = await api.supplierLookupByName(extractName.trim());
      const d = res.data;
      setForm(f => ({
        ...f,
        company_name:   d.name           || f.company_name,
        street:         d.street         || f.street,
        house_number:   d.houseNumber    || f.house_number,
        zip:            d.zip            || f.zip,
        city:           d.city           || f.city,
        country:        d.country        || f.country,
        email:          d.email          || f.email,
        phone:          d.phone          || f.phone,
        contact_person: d.contactPerson  || f.contact_person,
        atu_uid:        d.atuUid         || f.atu_uid,
        iban:           d.iban           || f.iban,
        bic:            d.bic            || f.bic,
      }));
    } catch(e) { setModalErr('KI-Fehler: ' + e.message); }
    finally { setExtracting(false); }
  };

  const openNew = () => { setForm(EMPTY); setModalErr(''); setExtractName(''); setShowNew(true); };
  const openEdit = (s) => { setEditId(s.id); setForm({company_name:s.company_name||'',street:s.street||'',house_number:s.house_number||'',zip:s.zip||'',city:s.city||'',country:s.country||'AT',email:s.email||'',phone:s.phone||'',uid_number:s.uid_number||'',iban:s.iban||'',defaultCategory:s.default_category||'Wareneinkauf'}); setModalErr(''); setShowNew(true); };
  const closeModal = () => { setShowNew(false); setEditId(null); setModalErr(''); };

  const save = async () => {
    setSaving(true); setModalErr('');
    try {
      const payload = { companyName:form.company_name, contactPerson:form.contact_person, contactPhone:form.contact_phone, street:form.street, houseNumber:form.house_number, zip:form.zip, city:form.city, country:form.country||'AT', email:form.email, phone:form.phone, uidNumber:form.uid_number, atuUid:form.atu_uid, iban:form.iban, bic:form.bic, defaultCategory:form.defaultCategory };
      if (editId) { await api.updateSupplier(editId, payload); }
      else { await api.createSupplier(payload); }
      closeModal(); reload();
    } catch(e) { setModalErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="page-body">
      <div className="toolbar"><div/><button className="btn primary" onClick={openNew}><i className="ti ti-plus"/>Neuer Lieferant</button></div>
      <div className="card card-0">
        {loading?<div style={{padding:32,textAlign:'center'}}><Spinner dark/></div>:<>
        {selSup.size>0&&<div className="bulk-bar"><span className="bulk-bar-count">{selSup.size} ausgewählt</span><button className="btn xs bulk-cancel" onClick={()=>setSelSup(new Set())}>Auswahl aufheben</button><button className="btn xs bulk-delete" onClick={bulkDeleteSup}><i className="ti ti-trash"/> Löschen</button></div>}
        <div className="table-wrap"><table>
          <thead><tr>
            <th className="cb-col"><input type="checkbox" checked={selSup.size===supList.length&&supList.length>0} onChange={toggleAllSup}/></th>
            <th>Nr.</th><th>Firma</th><th>Ort</th><th>E-Mail</th><th>UID</th><th>Std-Kategorie</th><th/>
          </tr></thead>
          <tbody>{supList.map(s=>(
            <tr key={s.id} className={selSup.has(s.id)?'row-selected':''}>
              <td className="cb-col"><input type="checkbox" checked={selSup.has(s.id)} onChange={()=>toggleOneSup(s.id)}/></td>
              <td style={{fontWeight:500}}>{s.supplier_number}</td>
              <td>{s.company_name}</td>
              <td style={{fontSize:12}}>{s.zip} {s.city}</td>
              <td style={{fontSize:12}}>{s.email||'—'}</td>
              <td style={{fontSize:12}}>{s.uid_number||'—'}</td>
              <td><span className="tag">{s.default_category||'—'}</span></td>
              <td>
                <div style={{display:'flex',gap:4}}>
                  <button className="btn xs ghost icon" title="Bearbeiten" onClick={()=>openEdit(s)}><i className="ti ti-edit"/></button>
                  <button className="btn xs danger icon" title="Löschen" onClick={async()=>{if(confirm(`Lieferant "${s.company_name}" löschen?`)){try{await api.deleteSupplier(s.id);reload();}catch(e){alert(e.message);}}}}><i className="ti ti-trash"/></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table></div></>}
      </div>
      <Modal open={showNew} onClose={closeModal} title={editId?'Lieferant bearbeiten':'Neuer Lieferant'} maxWidth={500}
        footer={<><button className="btn" onClick={closeModal}>Abbrechen</button><button className="btn primary" onClick={save} disabled={saving||!form.company_name}>{saving?<><i className="ti ti-loader-2"/>Speichern...</>:<><i className="ti ti-check"/>Speichern</>}</button></>}>
        {modalErr&&<div style={{marginBottom:12}}><Alert type="danger">{modalErr}</Alert></div>}
        {!editId && (
          <div style={{background:'rgba(0,229,255,0.06)',border:'1px solid rgba(0,229,255,0.2)',borderRadius:8,padding:'10px 12px',marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--accent)',marginBottom:6,textTransform:'uppercase',letterSpacing:.5}}><i className="ti ti-sparkles"/> KI – Automatisch ausfüllen</div>
            <div style={{display:'flex',gap:8}}>
              <input value={extractName} onChange={e=>setExtractName(e.target.value)} placeholder="z.B. Hauser GmbH" style={{flex:1}} onKeyDown={e=>e.key==='Enter'&&extractFromName()}/>
              <button className="btn primary" onClick={extractFromName} disabled={extracting||!extractName.trim()} style={{whiteSpace:'nowrap'}}>
                {extracting ? <><i className="ti ti-loader-2" style={{animation:'spin 1s linear infinite'}}/> Suche...</> : <><i className="ti ti-search"/> Suchen</>}
              </button>
            </div>
            <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:5}}>Firmenname eingeben → KI sucht Adresse, E-Mail, Telefon und UID automatisch</div>
          </div>
        )}
        <FormGroup label="Firma" required><input value={form.company_name} onChange={e=>setForm(f=>({...f,company_name:e.target.value}))}/></FormGroup>
        <FormRow>
          <FormGroup label="Ansprechpartner"><input value={form.contact_person||''} onChange={e=>setForm(f=>({...f,contact_person:e.target.value}))} placeholder="Max Mustermann"/></FormGroup>
          <FormGroup label="Tel. Ansprechpartner"><input value={form.contact_phone||''} onChange={e=>setForm(f=>({...f,contact_phone:e.target.value}))} placeholder="+43..."/></FormGroup>
        </FormRow>
        <FormRow><FormGroup label="Straße"><input value={form.street||''} onChange={e=>setForm(f=>({...f,street:e.target.value}))}/></FormGroup><FormGroup label="Nr." style={{maxWidth:90}}><input value={form.house_number||''} onChange={e=>setForm(f=>({...f,house_number:e.target.value}))}/></FormGroup></FormRow>
        <FormRow><FormGroup label="PLZ"><input value={form.zip} onChange={e=>setForm(f=>({...f,zip:e.target.value}))}/></FormGroup><FormGroup label="Ort"><input value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/></FormGroup></FormRow>
        <FormRow><FormGroup label="E-Mail"><input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></FormGroup><FormGroup label="Telefon"><input value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></FormGroup></FormRow>
        <FormRow>
          <FormGroup label="ATU/UID-Nummer"><input value={form.atu_uid||form.uid_number||''} onChange={e=>setForm(f=>({...f,atu_uid:e.target.value}))} placeholder="ATU..."/></FormGroup>
          <FormGroup label="IBAN"><input value={form.iban||''} onChange={e=>setForm(f=>({...f,iban:e.target.value}))} placeholder="AT..."/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="BIC"><input value={form.bic||''} onChange={e=>setForm(f=>({...f,bic:e.target.value}))}/></FormGroup>
          <FormGroup label="Standard-Kategorie"><select value={form.defaultCategory||''} onChange={e=>setForm(f=>({...f,defaultCategory:e.target.value}))}>{KATS.map(k=><option key={k}>{k}</option>)}</select></FormGroup>
        </FormRow>
      </Modal>
    </div>
  );
}

// ─── PRODUKTE & LEISTUNGEN ────────────────────────────────────────────────────
const STOCK_STATUS = {
  empty: { label:'Leer',        color:'var(--red)',   bg:'rgba(239,68,68,0.12)',  icon:'ti-alert-circle' },
  low:   { label:'Niedrig',     color:'var(--amber)', bg:'rgba(245,158,11,0.12)', icon:'ti-alert-triangle' },
  ok:    { label:'Auf Lager',   color:'var(--green)', bg:'rgba(16,185,129,0.12)', icon:'ti-circle-check' },
};
const UNITS_SERVICE  = ['Std','pauschal','km','Tag'];
const UNITS_MATERIAL = ['Stk','m','m²','kg','l','Pkg','Rolle','Satz','Paar'];

export function Products({ defaultTab }) {
  const [tab, setTab] = useState(defaultTab || 'materials'); // services | materials
  const [showNew,  setShowNew]  = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showAdjust, setShowAdjust] = useState(null);  // product for stock adjust
  const [showScan, setShowScan]   = useState(false);   // Grosshändler scan flow
  const [alert, setAlert] = useState(null);
  const { data: suppliers } = useData(() => api.suppliers());

  const { data: svcData, loading: svcLoading, reload: svcReload } = useData(() => api.products({ type: 'service' }));
  const { data: matData, loading: matLoading, reload: matReload } = useData(() => api.products({ type: 'material' }));
  const reload = () => { svcReload(); matReload(); };

  const services  = svcData?.data || [];
  const materials = matData?.data || [];

  const matStats = {
    total:  materials.length,
    ok:     materials.filter(m=>m.stock_status==='ok').length,
    low:    materials.filter(m=>m.stock_status==='low').length,
    empty:  materials.filter(m=>m.stock_status==='empty').length,
  };

  const EMPTY_SVC = { productType:'service', name:'', description:'', unit:'Std', netPrice:0, vatRate:20 };
  const EMPTY_MAT = { productType:'material', name:'', sku:'', description:'', unit:'Stk', netPrice:0, purchasePrice:0, vatRate:20, minStock:0, supplierId:'' };
  const [form, setForm] = useState(EMPTY_SVC);
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));

  function openNew() {
    setEditItem(null);
    setForm(tab === 'services' ? EMPTY_SVC : EMPTY_MAT);
    setShowNew(true);
  }

  function openEdit(p) {
    setEditItem(p);
    setForm({
      productType: p.product_type,
      name: p.name, sku: p.sku||'', description: p.description||'',
      unit: p.unit, netPrice: p.net_price, purchasePrice: p.purchase_price||0,
      vatRate: p.vat_rate, minStock: p.min_stock||0, supplierId: p.supplier_id||'',
    });
    setShowNew(true);
  }

  async function save() {
    try {
      const body = {
        ...form,
        grossPrice: parseFloat(form.netPrice||0) * (1 + parseFloat(form.vatRate||20)/100),
        stockQuantity: editItem?.stock_quantity || 0,
      };
      if (editItem) await api.updateProduct(editItem.id, body);
      else          await api.createProduct(body);
      setShowNew(false); setEditItem(null); reload();
    } catch(e) { setAlert({ type:'error', msg: e.message }); }
  }

  // ─── Lagerbestand manuell anpassen ──────────────────────────────────────────
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustNote, setAdjustNote]   = useState('');
  async function doAdjust() {
    if (!adjustDelta) return;
    try {
      await api.stockAdjust(showAdjust.id, {
        delta: parseFloat(adjustDelta),
        note: adjustNote || 'Manuelle Anpassung',
        movementType: parseFloat(adjustDelta) >= 0 ? 'in' : 'out',
      });
      setShowAdjust(null); setAdjustDelta(''); setAdjustNote('');
      setAlert({ type:'success', msg:'Lagerbestand aktualisiert.' });
      reload();
    } catch(e) { setAlert({ type:'error', msg: e.message }); }
  }

  // ─── Großhändler-Scan Flow ───────────────────────────────────────────────────
  const [scanStep, setScanStep]     = useState('upload');   // upload | scanning | match | done
  const [scanFile, setScanFile]     = useState(null);
  const [scanResult, setScanResult] = useState(null);  // OCR result
  const [matchedItems, setMatchedItems] = useState([]); // [{...ocrItem, selectedProductId, quantity}]
  const [scanSupplier, setScanSupplier] = useState('');

  async function doScan() {
    if (!scanFile) return;
    setScanStep('scanning');
    try {
      const fd = new FormData(); fd.append('image', scanFile);
      const ocr = await api.scanReceipt(fd);
      setScanSupplier(ocr.lieferant || '');
      // Produkt-Matching
      const matched = await api.matchProducts({ items: ocr.items || [] });
      setMatchedItems((matched.items || []).map(item => ({
        ...item,
        selectedProductId: item.matched_product?.id || '',
        qty: item.quantity || 1,
      })));
      setScanResult(ocr);
      setScanStep('match');
    } catch(e) {
      setAlert({ type:'error', msg: e.message });
      setScanStep('upload');
    }
  }

  async function confirmStockIn() {
    const items = matchedItems
      .filter(i => i.selectedProductId)
      .map(i => ({ productId: parseInt(i.selectedProductId), quantity: parseFloat(i.qty||1), unitPrice: i.unit_price_net }));
    if (items.length === 0) { setAlert({ type:'error', msg: 'Keine Produkte ausgewählt.' }); return; }
    try {
      await api.bulkStockIn({ items, supplierName: scanSupplier, invoiceDate: scanResult?.rechnungsdatum });
      setScanStep('done');
      reload();
    } catch(e) { setAlert({ type:'error', msg: e.message }); }
  }

  function closeScan() {
    setShowScan(false); setScanStep('upload'); setScanFile(null);
    setScanResult(null); setMatchedItems([]); setScanSupplier('');
  }

  const loading = tab==='services' ? svcLoading : matLoading;
  const items   = tab==='services' ? services   : materials;

  return (
    <div className="page">
      {alert && <Alert type={alert.type} msg={alert.msg} onClose={()=>setAlert(null)}/>}

      {/* Tabs */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',gap:4,background:'var(--surface-2)',padding:4,borderRadius:8}}>
          <button className={`btn${tab==='services'?' primary':''}`} onClick={()=>setTab('services')} style={{minWidth:130}}>
            <i className="ti ti-briefcase"/> Leistungen
          </button>
          <button className={`btn${tab==='materials'?' primary':''}`} onClick={()=>setTab('materials')} style={{minWidth:130}}>
            <i className="ti ti-package"/> Material & Lager
          </button>
        </div>

        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          {tab==='materials' && (
            <button className="btn" onClick={()=>{closeScan();setShowScan(true);}}>
              <i className="ti ti-camera-plus"/> Bestellung einbuchen
            </button>
          )}
          <button className="btn primary" onClick={openNew}>
            <i className="ti ti-plus"/> {tab==='services'?'Neue Leistung':'Neues Material'}
          </button>
        </div>
      </div>

      {/* Lager-Stats (nur im Material-Tab) */}
      {tab === 'materials' && (
        <div className="dash-grid-4" style={{marginBottom:16}}>
          {[
            { label:'Materialien gesamt', val:matStats.total,  icon:'ti-package',        color:'var(--accent)' },
            { label:'Auf Lager',          val:matStats.ok,     icon:'ti-circle-check',   color:'var(--green)'  },
            { label:'Niedriger Bestand',  val:matStats.low,    icon:'ti-alert-triangle', color:'var(--amber)'  },
            { label:'Lager leer',         val:matStats.empty,  icon:'ti-alert-circle',   color:'var(--red)'    },
          ].map(s=>(
            <div key={s.label} className="card metric-card">
              <i className={`ti ${s.icon}`} style={{fontSize:22,color:s.color,marginBottom:4}}/>
              <div className="metric-value" style={{color:s.color}}>{s.val}</div>
              <div className="metric-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabelle */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        {loading ? <Spinner/> : items.length === 0 ? (
          <EmptyState
            icon={tab==='services'?'ti-briefcase':'ti-package'}
            title={tab==='services'?'Keine Leistungen':'Keine Materialien'}
            subtitle={tab==='services'?'Füge Stundensätze und Leistungen hinzu.':'Füge Materialien mit Lagerbestand hinzu.'}
          />
        ) : (
          <table>
            <thead>
              {tab === 'services' ? (
                <tr><th>Art.-Nr.</th><th>Bezeichnung</th><th>Einheit</th><th style={{textAlign:'right'}}>Netto</th><th style={{textAlign:'right'}}>Brutto</th><th>USt</th><th/></tr>
              ) : (
                <tr><th>Art.-Nr.</th><th>Bezeichnung</th><th>Einheit</th><th style={{textAlign:'right'}}>EK-Preis</th><th style={{textAlign:'right'}}>VK-Preis</th><th style={{textAlign:'center'}}>Lagerbestand</th><th style={{textAlign:'center'}}>Status</th><th/></tr>
              )}
            </thead>
            <tbody>
              {items.map(p => {
                if (tab === 'services') {
                  return (
                    <tr key={p.id}>
                      <td style={{fontSize:11,color:'var(--text-secondary)'}}>{p.sku||'—'}</td>
                      <td><strong>{p.name}</strong>{p.description&&<div style={{fontSize:11,color:'var(--text-secondary)'}}>{p.description}</div>}</td>
                      <td><span style={{fontSize:11,padding:'2px 7px',borderRadius:4,background:'var(--surface-2)'}}>{p.unit}</span></td>
                      <td style={{textAlign:'right',fontSize:13}}>{fmt(p.net_price)}</td>
                      <td style={{textAlign:'right',fontSize:13,fontWeight:600}}>{fmt(p.net_price*(1+p.vat_rate/100))}</td>
                      <td><span style={{fontSize:11,padding:'2px 6px',borderRadius:4,background:'rgba(245,158,11,0.15)',color:'var(--amber)'}}>{p.vat_rate}%</span></td>
                      <td><button className="btn xs" onClick={()=>openEdit(p)}><i className="ti ti-edit"/></button></td>
                    </tr>
                  );
                } else {
                  const ss = STOCK_STATUS[p.stock_status] || STOCK_STATUS.ok;
                  return (
                    <tr key={p.id}>
                      <td style={{fontSize:11,color:'var(--text-secondary)'}}>{p.sku||'—'}</td>
                      <td>
                        <strong>{p.name}</strong>
                        {p.supplier_name&&<div style={{fontSize:10,color:'var(--text-secondary)'}}><i className="ti ti-truck" style={{marginRight:3}}/>{p.supplier_name}</div>}
                      </td>
                      <td><span style={{fontSize:11,padding:'2px 7px',borderRadius:4,background:'var(--surface-2)'}}>{p.unit}</span></td>
                      <td style={{textAlign:'right',fontSize:12,color:'var(--text-secondary)'}}>{p.purchase_price ? fmt(p.purchase_price) : '—'}</td>
                      <td style={{textAlign:'right',fontSize:13,fontWeight:600}}>{fmt(p.net_price)}</td>
                      <td style={{textAlign:'center'}}>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                          <span style={{fontWeight:700,fontSize:14,color:ss.color}}>{parseFloat(p.stock_quantity||0).toFixed(p.unit==='Stk'?0:2)}</span>
                          {p.min_stock > 0 && <span style={{fontSize:10,color:'var(--text-tertiary)'}}>Min: {parseFloat(p.min_stock)}</span>}
                        </div>
                      </td>
                      <td style={{textAlign:'center'}}>
                        <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,padding:'2px 8px',borderRadius:4,background:ss.bg,color:ss.color,fontWeight:600}}>
                          <i className={`ti ${ss.icon}`}/>{ss.label}
                        </span>
                      </td>
                      <td>
                        <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                          <button className="btn xs" title="Bestand anpassen" onClick={()=>{setShowAdjust(p);setAdjustDelta('');setAdjustNote('');}}>
                            <i className="ti ti-adjustments-horizontal"/>
                          </button>
                          <button className="btn xs" onClick={()=>openEdit(p)}><i className="ti ti-edit"/></button>
                        </div>
                      </td>
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Neue Leistung / Neues Material */}
      <Modal open={showNew} title={editItem ? 'Bearbeiten' : (tab==='services'?'Neue Leistung':'Neues Material')} onClose={()=>{setShowNew(false);setEditItem(null);}} maxWidth={500}>
        <FormRow>
          <FormGroup label="Bezeichnung *">
            <input value={form.name} onChange={e=>sf('name',e.target.value)} placeholder={tab==='services'?'z.B. Montagestunde':'z.B. Kompressor R410A'}/>
          </FormGroup>
          <FormGroup label="Art.-Nr. (SKU)">
            <input value={form.sku||''} onChange={e=>sf('sku',e.target.value)} placeholder="optional"/>
          </FormGroup>
        </FormRow>

        <FormGroup label="Beschreibung">
          <input value={form.description} onChange={e=>sf('description',e.target.value)} placeholder="Kurzbeschreibung"/>
        </FormGroup>

        <FormRow>
          <FormGroup label="Einheit">
            <select value={form.unit} onChange={e=>sf('unit',e.target.value)}>
              {(tab==='services'?UNITS_SERVICE:UNITS_MATERIAL).map(u=><option key={u}>{u}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="USt-Satz">
            <select value={form.vatRate} onChange={e=>sf('vatRate',parseInt(e.target.value))}>
              <option value="20">20%</option><option value="10">10%</option><option value="13">13%</option><option value="0">0%</option>
            </select>
          </FormGroup>
        </FormRow>

        <FormRow>
          {tab==='materials' && (
            <FormGroup label="Einkaufspreis Netto (€)">
              <input type="number" value={form.purchasePrice||''} onChange={e=>sf('purchasePrice',e.target.value)} step="0.01" min="0" placeholder="0.00"/>
            </FormGroup>
          )}
          <FormGroup label="Verkaufspreis Netto (€)">
            <input type="number" value={form.netPrice} onChange={e=>sf('netPrice',parseFloat(e.target.value)||0)} step="0.01" min="0"/>
          </FormGroup>
        </FormRow>

        {form.netPrice > 0 && (
          <div style={{background:'var(--surface-2)',borderRadius:8,padding:'8px 12px',fontSize:12,marginBottom:12,display:'flex',justifyContent:'space-between'}}>
            <span style={{color:'var(--text-secondary)'}}>Bruttopreis</span>
            <strong>{fmt(parseFloat(form.netPrice||0)*(1+parseFloat(form.vatRate||20)/100))}</strong>
          </div>
        )}

        {tab === 'materials' && (
          <FormRow>
            <FormGroup label="Mindestbestand">
              <input type="number" value={form.minStock||0} onChange={e=>sf('minStock',parseFloat(e.target.value)||0)} min="0" step="0.5" placeholder="0"/>
            </FormGroup>
            <FormGroup label="Bevorzugter Lieferant">
              <select value={form.supplierId||''} onChange={e=>sf('supplierId',e.target.value)}>
                <option value="">— kein Lieferant —</option>
                {(suppliers?.data||[]).map(s=><option key={s.id} value={s.id}>{s.company_name}</option>)}
              </select>
            </FormGroup>
          </FormRow>
        )}

        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
          <button className="btn" onClick={()=>{setShowNew(false);setEditItem(null);}}>Abbrechen</button>
          <button className="btn primary" onClick={save} disabled={!form.name}><i className="ti ti-check"/> Speichern</button>
        </div>
      </Modal>

      {/* Modal: Lagerbestand anpassen */}
      <Modal open={!!showAdjust} title={`Lagerbestand: ${showAdjust?.name||''}`} onClose={()=>setShowAdjust(null)} maxWidth={420}>
        {showAdjust && (
          <>
            <div style={{background:'var(--surface-2)',borderRadius:8,padding:'10px 14px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{color:'var(--text-secondary)',fontSize:12}}>Aktueller Bestand</span>
              <strong style={{fontSize:18}}>{parseFloat(showAdjust.stock_quantity||0)} {showAdjust.unit}</strong>
            </div>
            <FormGroup label="Änderung (positiv = Zugang, negativ = Abgang)">
              <input type="number" value={adjustDelta} onChange={e=>setAdjustDelta(e.target.value)} step="0.5" placeholder="+5 oder -2" autoFocus/>
            </FormGroup>
            {adjustDelta && (
              <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:8}}>
                Neuer Bestand: <strong style={{color: parseFloat(adjustDelta)<0?'var(--amber)':'var(--green)'}}>{Math.max(0,parseFloat(showAdjust.stock_quantity||0)+parseFloat(adjustDelta||0)).toFixed(2)} {showAdjust.unit}</strong>
              </div>
            )}
            <FormGroup label="Notiz (optional)">
              <input value={adjustNote} onChange={e=>setAdjustNote(e.target.value)} placeholder="z.B. Inventurkorrektur"/>
            </FormGroup>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
              <button className="btn" onClick={()=>setShowAdjust(null)}>Abbrechen</button>
              <button className="btn primary" onClick={doAdjust} disabled={!adjustDelta}><i className="ti ti-check"/> Speichern</button>
            </div>
          </>
        )}
      </Modal>

      {/* Modal: Großhändler-Rechnung scannen → Lager einbuchen */}
      <Modal open={showScan} title="Bestellung einbuchen – Rechnung scannen" onClose={closeScan} maxWidth={780}>
        {/* Step: upload */}
        {scanStep === 'upload' && (
          <>
            <p style={{color:'var(--text-secondary)',fontSize:13,marginBottom:16}}>
              Lade die Rechnung vom Großhändler hoch. KI erkennt automatisch die Materialien und gleicht sie mit deinem Lager ab.
            </p>
            <FormGroup label="Rechnung (Foto, PDF oder DOCX)">
              <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.docx" onChange={e=>setScanFile(e.target.files[0])}/>
            </FormGroup>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:12}}>
              <button className="btn" onClick={closeScan}>Abbrechen</button>
              <button className="btn primary" onClick={doScan} disabled={!scanFile}><i className="ti ti-scan"/> Scannen</button>
            </div>
          </>
        )}

        {/* Step: scanning */}
        {scanStep === 'scanning' && (
          <div style={{textAlign:'center',padding:'40px 20px'}}>
            <Spinner/>
            <div style={{marginTop:16,color:'var(--text-secondary)'}}>KI analysiert die Rechnung...</div>
          </div>
        )}

        {/* Step: match – Items zuordnen */}
        {scanStep === 'match' && (
          <>
            <div style={{marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:12,color:'var(--text-secondary)'}}>Lieferant:</span>
              <strong style={{fontSize:13}}>{scanSupplier||'Unbekannt'}</strong>
            </div>
            <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:12}}>
              Wähle für jede Position das passende Material aus deinem Lager. Grau hinterlegte wurden automatisch erkannt.
            </p>
            <div style={{overflowX:'auto'}}>
              <table style={{fontSize:12}}>
                <thead>
                  <tr>
                    <th>Gescannte Position</th><th style={{width:60,textAlign:'right'}}>Menge</th><th>Material im Lager</th><th style={{width:50}}>Einb.</th>
                  </tr>
                </thead>
                <tbody>
                  {matchedItems.map((item,i) => (
                    <tr key={i} style={{background: item.matched_product ? 'rgba(16,185,129,0.04)' : undefined}}>
                      <td>
                        <div style={{fontWeight:500}}>{item.description}</div>
                        {item.unit_price_net && <div style={{color:'var(--text-secondary)',fontSize:10}}>{fmt(item.unit_price_net)} / {item.unit}</div>}
                      </td>
                      <td style={{textAlign:'right'}}>
                        <input type="number" value={item.qty} min="0" step="0.5"
                          onChange={e=>setMatchedItems(m=>m.map((x,j)=>j===i?{...x,qty:e.target.value}:x))}
                          style={{width:55,textAlign:'right'}}/>
                      </td>
                      <td>
                        <select value={item.selectedProductId}
                          onChange={e=>setMatchedItems(m=>m.map((x,j)=>j===i?{...x,selectedProductId:e.target.value}:x))}>
                          <option value="">— nicht einbuchen —</option>
                          {materials.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td style={{textAlign:'center'}}>
                        <input type="checkbox" checked={!!item.selectedProductId}
                          onChange={e=>{ if(!e.target.checked) setMatchedItems(m=>m.map((x,j)=>j===i?{...x,selectedProductId:''}:x)); }}/>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
              <button className="btn" onClick={()=>setScanStep('upload')}>Zurück</button>
              <button className="btn primary" onClick={confirmStockIn}>
                <i className="ti ti-arrow-bar-to-down"/> {matchedItems.filter(i=>i.selectedProductId).length} Positionen einbuchen
              </button>
            </div>
          </>
        )}

        {/* Step: done */}
        {scanStep === 'done' && (
          <div style={{textAlign:'center',padding:'32px 20px'}}>
            <i className="ti ti-circle-check" style={{fontSize:48,color:'var(--green)',display:'block',marginBottom:12}}/>
            <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Lager aktualisiert!</div>
            <div style={{color:'var(--text-secondary)',fontSize:13,marginBottom:20}}>
              {matchedItems.filter(i=>i.selectedProductId).length} Materialien wurden eingebucht.
            </div>
            <button className="btn primary" onClick={closeScan}>Schließen</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── AUSGABEN ─────────────────────────────────────────────────────────────────
export function Expenses() {
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const { data, loading, reload } = useData(()=>api.expenses());
  const { data: suppliers } = useData(()=>api.suppliers());
  const KATS=['Wareneinkauf','Werkzeug','Fahrzeugkosten','Treibstoff','Versicherung','Telefon und Internet','Software','Steuerberatung','Bürobedarf','Werbung','Miete','Bankspesen','Sonstige Betriebsausgaben'];
  const [form, setForm] = useState({supplierId:'',lieferant:'',documentDate:today(),paymentDate:'',categoryId:'',kategorie:'Wareneinkauf',description:'',grossAmount:0,vatRate:20,privateSharePercent:0,status:'open'});

  const calcFromBrutto=(b,ust)=>{const br=parseFloat(b)||0;const r=parseFloat(ust)||0;const n=r>0?Math.round(br/(1+r/100)*100)/100:br;return{netto:n,ust:Math.round((br-n)*100)/100}};
  const {netto:fn,ust:fu}=calcFromBrutto(form.grossAmount,form.vatRate);
  const ba=100-(parseInt(form.privateSharePercent)||0);
  const abzugNetto=Math.round(fn*ba/100*100)/100;
  const abzugUst  =Math.round(fu*ba/100*100)/100;

  const save = async()=>{
    try{ await api.createExpense({...form,grossAmount:parseFloat(form.grossAmount)||0}); setShowNew(false); reload(); }
    catch(e){alert(e.message);}
  };
  const markPaid = async(id)=>{ try{ await api.markExpensePaid(id,{paymentDate:today()}); reload(); }catch(e){alert(e.message);} };

  const expenses = (data?.data||[]).filter(e=>filter==='all'||e.status===filter);
  const totBrutto=expenses.reduce((s,e)=>s+parseFloat(e.gross_amount||0),0);
  const totAbzug =expenses.reduce((s,e)=>s+(parseFloat(e.gross_amount||0)*(1-(parseFloat(e.private_share_percent)||0)/100)),0);

  return (
    <div className="page-body">
      <div className="toolbar">
        <div className="filter-pills">{[{id:'all',label:'Alle'},{id:'open',label:'Offen'},{id:'paid',label:'Bezahlt'}].map(s=><button key={s.id} className={`btn xs ${filter===s.id?'primary':''}`} onClick={()=>setFilter(s.id)}>{s.label}</button>)}</div>
        <button className="btn primary" onClick={()=>setShowNew(true)}><i className="ti ti-plus"/>Neue Ausgabe</button>
      </div>
      <div className="metric-grid metric-grid-3">
        <div className="metric-card"><div className="metric-label">Brutto gesamt</div><div className="metric-value red">{fmt(totBrutto)}</div></div>
        <div className="metric-card"><div className="metric-label">Davon abzugsfähig</div><div className="metric-value green">{fmt(totAbzug)}</div></div>
        <div className="metric-card"><div className="metric-label">Privatanteil</div><div className="metric-value amber">{fmt(totBrutto-totAbzug)}</div></div>
      </div>
      <div className="card card-0">
        {loading?<div style={{padding:32,textAlign:'center'}}><Spinner dark/></div>:
         expenses.length===0?<EmptyState icon="ti-receipt-2" title="Keine Ausgaben gefunden"/>:
        <div className="table-wrap"><table>
          <thead><tr><th>Nr.</th><th>Lieferant</th><th>Datum</th><th>Kategorie</th><th className="right">Brutto</th><th>Privatanteil</th><th className="right">Abzugsfähig</th><th>Beleg</th><th>Status</th><th/></tr></thead>
          <tbody>{expenses.map(e=>{
            const ba=100-(parseFloat(e.private_share_percent)||0);
            const abzug=parseFloat(e.gross_amount||0)*(ba/100);
            return(
              <tr key={e.id}>
                <td style={{fontSize:11,fontWeight:500}}>{e.expense_number}</td>
                <td style={{fontSize:12}}>{e.supplier_name||e.lieferant}</td>
                <td style={{fontSize:12}}>{fmtDate(e.document_date)}</td>
                <td><span className="tag">{e.category_name||e.kategorie||'—'}</span></td>
                <td className="right" style={{fontWeight:500}}>{fmt(e.gross_amount)}</td>
                <td>{parseFloat(e.private_share_percent||0)>0?<><div style={{fontSize:11,color:'var(--text-secondary)'}}>{e.private_share_percent}% privat</div><div className="bar-bg" style={{width:80}}><div className="bar-fill" style={{width:`${ba}%`,background:'var(--green)'}}/></div></>:<span className="badge green">100% betriebl.</span>}</td>
                <td className="right">{fmt(abzug)}</td>
                <td>{e.file_id?<span className="badge green"><i className="ti ti-paperclip" style={{fontSize:10}}/>Ja</span>:<span className="badge red">Fehlt</span>}</td>
                <td><StatusBadge status={e.status} label={STATUS_LABELS[e.status]||e.status}/></td>
                <td>{e.status!=='paid'&&<button className="btn xs success" onClick={()=>markPaid(e.id)}><i className="ti ti-check"/></button>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>}
      </div>
      <Modal open={showNew} onClose={()=>setShowNew(false)} title="Ausgabe erfassen" maxWidth={560}
        footer={<><button className="btn" onClick={()=>setShowNew(false)}>Abbrechen</button><button className="btn primary" onClick={save} disabled={!(form.supplierId||form.lieferant)||!form.grossAmount}><i className="ti ti-check"/>Speichern</button></>}>
        <FormRow>
          <FormGroup label="Lieferant">
            <select value={form.supplierId} onChange={e=>{const s=(suppliers?.data||[]).find(x=>x.id===parseInt(e.target.value));setForm(f=>({...f,supplierId:e.target.value,lieferant:s?.company_name||'',kategorie:s?.default_category||f.kategorie}));}}>
              <option value="">Freitext / manuell</option>
              {(suppliers?.data||[]).map(s=><option key={s.id} value={s.id}>{s.company_name}</option>)}
            </select>
            {!form.supplierId&&<input value={form.lieferant} onChange={e=>setForm(f=>({...f,lieferant:e.target.value}))} placeholder="Lieferant eingeben..." style={{marginTop:4}}/>}
          </FormGroup>
          <FormGroup label="Belegdatum"><input type="date" value={form.documentDate} onChange={e=>setForm(f=>({...f,documentDate:e.target.value}))}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Kategorie"><select value={form.kategorie} onChange={e=>setForm(f=>({...f,kategorie:e.target.value}))}>{KATS.map(k=><option key={k}>{k}</option>)}</select></FormGroup>
          <FormGroup label="USt-Satz"><select value={form.vatRate} onChange={e=>setForm(f=>({...f,vatRate:e.target.value}))}><option value="20">20%</option><option value="10">10%</option><option value="13">13%</option><option value="0">0%</option></select></FormGroup>
        </FormRow>
        <FormGroup label="Beschreibung"><input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></FormGroup>
        <FormRow>
          <FormGroup label="Brutto-Betrag (€)" required><input type="number" value={form.grossAmount} onChange={e=>setForm(f=>({...f,grossAmount:e.target.value}))} step="0.01" min="0"/></FormGroup>
          <FormGroup label="Zahlungsdatum"><input type="date" value={form.paymentDate} onChange={e=>setForm(f=>({...f,paymentDate:e.target.value,status:e.target.value?'paid':'open'}))}/></FormGroup>
        </FormRow>
        <FormGroup label={`Privatanteil: ${form.privateSharePercent}%`}>
          <input type="range" min="0" max="100" step="5" value={form.privateSharePercent} onChange={e=>setForm(f=>({...f,privateSharePercent:parseInt(e.target.value)}))}/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-tertiary)',marginTop:2}}><span>0% (100% betrieblich)</span><span>100% privat</span></div>
        </FormGroup>
        {form.grossAmount>0&&<div className="totals-box">
          <div className="totals-row"><span style={{color:'var(--text-secondary)'}}>Brutto</span><span>{fmt(parseFloat(form.grossAmount)||0)}</span></div>
          <div className="totals-row"><span style={{color:'var(--text-secondary)'}}>Privatanteil ({form.privateSharePercent}%)</span><span style={{color:'var(--red)'}}>−{fmt((parseFloat(form.grossAmount)||0)*form.privateSharePercent/100)}</span></div>
          <div className="totals-row total"><span>Abzugsfähig netto</span><span style={{color:'var(--green)'}}>{fmt(abzugNetto)}</span></div>
          <div className="totals-row"><span style={{color:'var(--text-secondary)'}}>Abzugsfähige Vorsteuer</span><span style={{color:'var(--accent)'}}>{fmt(abzugUst)}</span></div>
        </div>}
      </Modal>
    </div>
  );
}

// ─── ANLAGEN ──────────────────────────────────────────────────────────────────
// ─── AfA-Richtwerte laut österreichischem BMF ─────────────────────────────────
const AFA_RICHTWERTE = [
  // Fahrzeuge
  { keys:['pkw','auto','fahrzeug','personenkraftwagen'],                          jahre:8 },
  { keys:['motorrad','moped','roller'],                                           jahre:5 },
  { keys:['lkw','transporter','lieferwagen','kastenwagen','pritsche'],            jahre:8 },
  { keys:['bus','kleinbus','minibus','van','vw bus','vw t','ford transit'],       jahre:8 },
  { keys:['traktor','landmaschine','mäher','bagger','stapler'],                   jahre:10 },
  // IT & Elektronik
  { keys:['laptop','notebook','computer','pc','desktop','imac','macbook'],        jahre:3 },
  { keys:['tablet','ipad','surface'],                                             jahre:3 },
  { keys:['smartphone','handy','iphone','android'],                               jahre:3 },
  { keys:['drucker','scanner','kopierer','multifunktion'],                        jahre:5 },
  { keys:['server','nas','netzwerk'],                                             jahre:5 },
  { keys:['monitor','bildschirm','display'],                                      jahre:5 },
  { keys:['kamera','fotoapparat','videokamera','drohne'],                         jahre:5 },
  // Maschinen & Geräte
  { keys:['maschine','produktionsanlage','fertigungsanlage'],                     jahre:10 },
  { keys:['werkzeug','bohrmaschine','schleifmaschine','säge','fräse'],            jahre:5 },
  { keys:['klimaanlage','klima','heizung','lüftung'],                             jahre:15 },
  { keys:['aufzug','lift','rolltreppe'],                                          jahre:20 },
  { keys:['kaffeemaschine','kaffeevollautomat'],                                  jahre:5 },
  { keys:['kühlschrank','kühlanlage','tiefkühler'],                               jahre:8 },
  { keys:['geschirrspüler','spülmaschine'],                                       jahre:8 },
  // Büroausstattung
  { keys:['büromöbel','schreibtisch','bürostuhl','regal','schrank','aktenschrank'],jahre:10 },
  { keys:['telefon','festnetz','telefonanlage'],                                  jahre:5 },
  { keys:['kassenlade','kasse','kassensystem','registrierkasse'],                 jahre:5 },
  // Gebäude & Grundstücke
  { keys:['gebäude','bürogebäude','halle','lagerhalle','betriebsgebäude'],        jahre:40 },
  { keys:['umbau','einbau','einrichtung','ladeneinrichtung'],                     jahre:10 },
  { keys:['solar','photovoltaik','pv-anlage'],                                    jahre:20 },
  { keys:['zaun','einfriedung'],                                                  jahre:15 },
  // Sonstiges
  { keys:['software','lizenz','programm'],                                        jahre:3 },
];

function lookupAfa(name) {
  const n = name.toLowerCase();
  for (const entry of AFA_RICHTWERTE) {
    if (entry.keys.some(k => n.includes(k))) return entry.jahre;
  }
  return null;
}

export function Assets() {
  const [showNew, setShowNew] = useState(false);
  const { data, loading, reload } = useData(()=>api.assets());
  const [form, setForm] = useState({name:'',supplierName:'',purchaseDate:today(),purchaseGrossAmount:0,vatRate:20,usefulLifeYears:5,depreciationMethod:'linear',location:''});
  const [afaHint, setAfaHint] = useState(null);

  const handleNameChange = (e) => {
    const name = e.target.value;
    const jahre = lookupAfa(name);
    setAfaHint(jahre ? `Richtwert laut BMF: ${jahre} Jahre` : null);
    setForm(f => ({ ...f, name, ...(jahre ? { usefulLifeYears: jahre } : {}) }));
  };

  const save=async()=>{ try{ await api.createAsset(form); setShowNew(false); reload(); }catch(e){alert(e.message);} };
  const assets=data?.data||[];
  const totalBW=assets.filter(a=>a.status==='active').reduce((s,a)=>s+parseFloat(a.book_value||0),0);
  const totalAfa=assets.filter(a=>a.status==='active').reduce((s,a)=>s+parseFloat(a.annual_depreciation||0),0);
  const curYear=new Date().getFullYear();
  return (
    <div className="page-body">
      <div className="toolbar"><div/><button className="btn primary" onClick={()=>setShowNew(true)}><i className="ti ti-plus"/>Neues Anlagegut</button></div>
      <div className="metric-grid metric-grid-3">
        <div className="metric-card"><div className="metric-label">Gesamter Buchwert</div><div className="metric-value purple">{fmt(totalBW)}</div></div>
        <div className="metric-card"><div className="metric-label">Jährl. AfA gesamt</div><div className="metric-value amber">{fmt(totalAfa)}</div></div>
        <div className="metric-card"><div className="metric-label">Aktive Anlagegüter</div><div className="metric-value blue">{assets.filter(a=>a.status==='active').length}</div></div>
      </div>
      <div className="card card-0">
        {loading?<div style={{padding:32,textAlign:'center'}}><Spinner dark/></div>:
         assets.length===0?<EmptyState icon="ti-building-factory" title="Keine Anlagegüter erfasst"/>:
        <div className="table-wrap"><table>
          <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Kaufdatum</th><th className="right">AK netto</th><th>Nutzung</th><th>Methode</th><th className="right">AfA/Jahr</th><th className="right">Buchwert</th><th>Status</th></tr></thead>
          <tbody>{assets.map(a=>{
            const elapsed=curYear-new Date(a.purchase_date).getFullYear();
            const pct=Math.min(100,Math.round(elapsed/a.useful_life_years*100));
            return(
              <tr key={a.id}>
                <td style={{fontSize:11,fontWeight:500}}>{a.asset_number}</td>
                <td style={{fontWeight:500,fontSize:12}}>{a.name}</td>
                <td style={{fontSize:12}}>{fmtDate(a.purchase_date)}</td>
                <td className="right">{fmt(a.purchase_net_amount)}</td>
                <td><div style={{fontSize:11}}>{a.useful_life_years} Jahre</div><div className="bar-bg" style={{width:60}}><div className="bar-fill" style={{width:`${pct}%`,background:'var(--purple)'}}/></div></td>
                <td><span className="badge gray">{a.depreciation_method==='linear'?'Linear':'Degressiv'}</span></td>
                <td className="right" style={{fontWeight:500}}>{fmt(a.annual_depreciation)}</td>
                <td className="right" style={{fontWeight:500,color:'var(--purple)'}}>{fmt(a.book_value)}</td>
                <td><StatusBadge status={a.status} label={STATUS_LABELS[a.status]||a.status}/></td>
              </tr>
            );
          })}</tbody>
        </table></div>}
      </div>
      <Modal open={showNew} onClose={()=>setShowNew(false)} title="Neues Anlagegut" maxWidth={520}
        footer={<><button className="btn" onClick={()=>setShowNew(false)}>Abbrechen</button><button className="btn primary" onClick={save} disabled={!form.name||!form.purchaseGrossAmount}><i className="ti ti-check"/>Speichern</button></>}>
        <Alert type="info">Wirtschaftsgüter mit Nutzungsdauer über 1 Jahr werden nicht sofort als Ausgabe gebucht, sondern über die AfA abgeschrieben.</Alert>
        <FormGroup label="Bezeichnung" required>
          <input value={form.name} onChange={handleNameChange} placeholder="z.B. Servicefahrzeug VW Transporter"/>
          {afaHint && <div style={{fontSize:11,color:'var(--blue)',marginTop:4,display:'flex',alignItems:'center',gap:4}}><i className="ti ti-info-circle"/>{afaHint} – automatisch eingetragen, kannst du anpassen</div>}
        </FormGroup>
        <FormRow>
          <FormGroup label="Lieferant"><input value={form.supplierName} onChange={e=>setForm(f=>({...f,supplierName:e.target.value}))}/></FormGroup>
          <FormGroup label="Kaufdatum"><input type="date" value={form.purchaseDate} onChange={e=>setForm(f=>({...f,purchaseDate:e.target.value}))}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Brutto-AK (€)" required><input type="number" value={form.purchaseGrossAmount} onChange={e=>setForm(f=>({...f,purchaseGrossAmount:e.target.value}))} step="0.01" min="0"/></FormGroup>
          <FormGroup label="USt-Satz"><select value={form.vatRate} onChange={e=>setForm(f=>({...f,vatRate:e.target.value}))}><option value="20">20%</option><option value="0">0%</option></select></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Nutzungsdauer (Jahre)"><input type="number" value={form.usefulLifeYears} min="1" max="50" onChange={e=>setForm(f=>({...f,usefulLifeYears:e.target.value}))}/></FormGroup>
          <FormGroup label="AfA-Methode"><select value={form.depreciationMethod} onChange={e=>setForm(f=>({...f,depreciationMethod:e.target.value}))}><option value="linear">Linear (gleichmäßig)</option><option value="degressive">Degressiv (fallend)</option></select></FormGroup>
        </FormRow>
        <FormGroup label="Standort"><input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="z.B. Büro Wien"/></FormGroup>
        {form.purchaseGrossAmount>0&&(()=>{const b=parseFloat(form.purchaseGrossAmount)||0;const r=parseFloat(form.vatRate)||0;const n=r>0?Math.round(b/(1+r/100)*100)/100:b;const afa=form.depreciationMethod==='linear'?Math.round(n/form.usefulLifeYears*100)/100:Math.round(n*(2/form.usefulLifeYears)*100)/100;return<div className="totals-box"><div className="totals-row"><span style={{color:'var(--text-secondary)'}}>Netto-AK</span><span>{fmt(n)}</span></div><div className="totals-row total"><span>AfA pro Jahr ({form.depreciationMethod})</span><span style={{color:'var(--red)'}}>−{fmt(afa)}/Jahr</span></div></div>;})()}
      </Modal>
    </div>
  );
}

// ─── DOKUMENTE ────────────────────────────────────────────────────────────────
export function Documents() {
  const [filter, setFilter]       = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading]  = useState(false);
  const [uploadErr, setUploadErr]  = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragOver, setDragOver]    = useState(false);
  const fileInputRef = React.useRef();
  const { data, loading, reload } = useData(()=>api.documents());
  const [kategorie, setKategorie] = useState('Eingangsbeleg');
  const KATS=['Ausgangsrechnung','Eingangsbeleg','Anlagendokument','Vertrag','Sonstiges'];
  const docs=(data?.data||[]).filter(d=>filter==='all'||d.entity_type===filter||d.category===filter);

  const pickFile = (f) => {
    if (!f) return;
    if (f.size > 10*1024*1024) { setUploadErr('Datei zu groß (max. 10 MB)'); return; }
    setSelectedFile(f); setUploadErr('');
  };

  const save = async () => {
    if (!selectedFile) { setUploadErr('Bitte eine Datei auswählen.'); return; }
    setUploading(true); setUploadErr('');
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('entityType', kategorie);
      await api.uploadDocument(fd);
      setShowUpload(false); setSelectedFile(null); setKategorie('Eingangsbeleg'); reload();
    } catch(e) { setUploadErr(e.message || 'Upload fehlgeschlagen'); }
    finally { setUploading(false); }
  };

  const closeUpload = () => { setShowUpload(false); setSelectedFile(null); setUploadErr(''); };

  const mimeIcon = mime => {
    if (!mime) return 'ti-file';
    if (mime.includes('pdf')) return 'ti-file-type-pdf';
    if (mime.includes('image')) return 'ti-photo';
    if (mime.includes('word') || mime.includes('docx')) return 'ti-file-type-doc';
    if (mime.includes('excel') || mime.includes('xlsx')) return 'ti-file-type-xls';
    return 'ti-file';
  };
  const mimeLabel = mime => {
    if (!mime) return 'Datei';
    if (mime.includes('pdf')) return 'PDF';
    if (mime.includes('image')) return 'Bild';
    if (mime.includes('word') || mime.includes('docx')) return 'Word';
    return 'Datei';
  };

  return (
    <div className="page-body">
      <div className="toolbar">
        <div className="filter-pills">
          {['all',...KATS].map(k=>(
            <button key={k} className={`btn xs ${filter===k?'primary':''}`} onClick={()=>setFilter(k)}>
              {k==='all'?'Alle':k}
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={()=>{ setShowUpload(true); setUploadErr(''); setSelectedFile(null); }}>
          <i className="ti ti-upload"/>Beleg hochladen
        </button>
      </div>

      <div className="card card-0">
        {loading ? <div style={{padding:32,textAlign:'center'}}><Spinner dark/></div> :
         docs.length===0 ? <EmptyState icon="ti-files" title="Keine Dokumente" subtitle="Lade Rechnungen, Lieferscheine und andere Belege hoch"/> :
        <div className="table-wrap"><table>
          <thead><tr><th>Dateiname</th><th>Typ</th><th>Kategorie</th><th>Hochgeladen</th><th/></tr></thead>
          <tbody>{docs.map(d=>(
            <tr key={d.id}>
              <td>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <i className={`ti ${mimeIcon(d.mime_type)}`} style={{color:'var(--accent)',fontSize:17,flexShrink:0}}/>
                  <span style={{fontSize:12,fontWeight:500}}>{d.original_name||d.filename||'Dokument'}</span>
                </div>
              </td>
              <td><span className="badge blue">{mimeLabel(d.mime_type)}</span></td>
              <td><span className="tag">{d.category||d.entity_type||'Sonstiges'}</span></td>
              <td style={{fontSize:12,color:'var(--text-secondary)'}}>{fmtDate(d.created_at||d.uploaded_at)}</td>
              <td>
                <a href={`/uploads/${d.stored_name||d.filename}`} target="_blank" rel="noreferrer" className="btn xs ghost">
                  <i className="ti ti-download"/>Download
                </a>
              </td>
            </tr>
          ))}</tbody>
        </table></div>}
      </div>

      {/* Upload Modal */}
      <Modal open={showUpload} onClose={closeUpload} title="Beleg hochladen" maxWidth={480}
        footer={<>
          <button className="btn" onClick={closeUpload}>Abbrechen</button>
          <button className="btn primary" onClick={save} disabled={uploading||!selectedFile}>
            {uploading ? <><i className="ti ti-loader-2"/>Wird hochgeladen...</> : <><i className="ti ti-upload"/>Hochladen</>}
          </button>
        </>}>

        {uploadErr && <div style={{marginBottom:12}}><Alert type="danger">{uploadErr}</Alert></div>}

        {/* Drag-Drop Zone */}
        <div
          style={{
            border:`2px dashed ${dragOver?'var(--accent)':'var(--border-strong)'}`,
            borderRadius:'var(--radius-lg)',
            padding:28,
            textAlign:'center',
            marginBottom:14,
            cursor:'pointer',
            background: dragOver?'var(--blue-light)':'transparent',
            transition:'all .15s',
          }}
          onClick={()=>fileInputRef.current?.click()}
          onDragOver={e=>{ e.preventDefault(); setDragOver(true); }}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{ e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files[0]); }}
        >
          {selectedFile ? (
            <>
              <i className="ti ti-file-check" style={{fontSize:32,display:'block',marginBottom:8,color:'var(--green)'}}/>
              <div style={{fontSize:13,fontWeight:600,color:'var(--green)'}}>{selectedFile.name}</div>
              <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:4}}>
                {(selectedFile.size/1024).toFixed(0)} KB · Klicken zum Wechseln
              </div>
            </>
          ) : (
            <>
              <i className="ti ti-upload" style={{fontSize:32,display:'block',marginBottom:8,opacity:.4}}/>
              <div style={{fontSize:13,fontWeight:500}}>Datei hierher ziehen oder <span style={{color:'var(--accent)'}}>klicken zum Auswählen</span></div>
              <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:4}}>PDF, JPG, PNG, DOCX – max. 10 MB</div>
            </>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" style={{display:'none'}}
          onChange={e=>pickFile(e.target.files[0])}/>

        <FormGroup label="Kategorie">
          <select value={kategorie} onChange={e=>setKategorie(e.target.value)}>
            {KATS.map(k=><option key={k}>{k}</option>)}
          </select>
        </FormGroup>
      </Modal>
    </div>
  );
}

// ─── UST ÜBERSICHT ────────────────────────────────────────────────────────────
export function VATReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, loading } = useData(()=>api.reportVAT({year}), [year]);
  if (loading) return <div className="page-body"><Spinner dark/></div>;
  if (!data) return null;

  const ustOut   = data.ustAusgang?.gesamt || 0;
  const vorst    = data.vorsteuer?.gesamt  || 0;
  const zahllast = data.zahllast           || 0;
  const gutschrift = zahllast < 0;
  const curQ = Math.ceil((new Date().getMonth()+1)/3);

  return (
    <div className="page-body">
      {/* Kopfzeile */}
      <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <label style={{fontSize:13,color:'var(--text-secondary)'}}>Jahr:</label>
          <select value={year} onChange={e=>setYear(parseInt(e.target.value))} style={{width:100}}>
            {[2023,2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
          </select>
        </div>
        <span style={{fontSize:12,color:'var(--text-secondary)'}}><i className="ti ti-info-circle"/> Ist-Besteuerung – USt wird nach Zahlungseingang fällig</span>
      </div>

      {/* ── Visuelle Erklärung: Wie funktioniert die USt? ── */}
      <div className="card" style={{marginBottom:16,padding:'16px 20px'}}>
        <div style={{fontSize:12,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:.5,marginBottom:14}}>Wie funktioniert die Umsatzsteuer?</div>
        <div style={{display:'flex',alignItems:'center',gap:0,flexWrap:'wrap'}}>
          {/* Box 1 */}
          <div style={{flex:1,minWidth:160,background:'var(--green-light)',border:'1px solid rgba(16,185,129,.3)',borderRadius:'var(--radius-md)',padding:'14px 16px'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--green)',textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>① USt aus Rechnungen</div>
            <div style={{fontSize:22,fontWeight:700,color:'var(--green)'}}>{fmt(ustOut)}</div>
            <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:4}}>Du hast deinen Kunden {fmt(ustOut)} USt in Rechnung gestellt und von ihnen kassiert. Dieses Geld gehört dem Finanzamt.</div>
          </div>
          {/* Pfeil */}
          <div style={{padding:'0 12px',fontSize:22,color:'var(--text-tertiary)',flexShrink:0}}>−</div>
          {/* Box 2 */}
          <div style={{flex:1,minWidth:160,background:'var(--blue-light)',border:'1px solid rgba(24,95,165,.25)',borderRadius:'var(--radius-md)',padding:'14px 16px'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>② Vorsteuer aus Ausgaben</div>
            <div style={{fontSize:22,fontWeight:700,color:'var(--accent)'}}>{fmt(vorst)}</div>
            <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:4}}>Du hast bei Einkäufen {fmt(vorst)} USt bezahlt. Diese bekommst du vom Finanzamt zurück (als Abzug).</div>
          </div>
          {/* Pfeil */}
          <div style={{padding:'0 12px',fontSize:22,color:'var(--text-tertiary)',flexShrink:0}}>=</div>
          {/* Box 3 – Ergebnis */}
          <div style={{flex:1,minWidth:160,background:gutschrift?'var(--green-light)':'rgba(220,38,38,.08)',border:`1px solid ${gutschrift?'rgba(16,185,129,.3)':'rgba(220,38,38,.3)'}`,borderRadius:'var(--radius-md)',padding:'14px 16px'}}>
            <div style={{fontSize:10,fontWeight:700,color:gutschrift?'var(--green)':'var(--red)',textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>{gutschrift?'③ Gutschrift vom FA':'③ Zahllast ans Finanzamt'}</div>
            <div style={{fontSize:22,fontWeight:700,color:gutschrift?'var(--green)':'var(--red)'}}>{fmt(Math.abs(zahllast))}</div>
            <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:4}}>
              {gutschrift
                ? `Du bekommst ${fmt(Math.abs(zahllast))} vom Finanzamt zurück!`
                : `Du musst ${fmt(zahllast)} ans Finanzamt überweisen (quartalsweise via UVA).`}
            </div>
          </div>
        </div>
      </div>

      {/* ── Quartalsübersicht ── */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card-title"><i className="ti ti-calendar"/>Quartalsübersicht {year} <span style={{fontSize:11,fontWeight:400,color:'var(--text-secondary)',marginLeft:8}}>— UVA ist jeweils am letzten Tag des Folgemonats fällig</span></div>
        <div className="quarterly-grid">
          {(data.quartale||[]).map(q=>{
            const isCurrentQ = year===new Date().getFullYear() && q.quartal===curQ;
            const isPast     = year<new Date().getFullYear() || (year===new Date().getFullYear() && q.quartal<curQ);
            const zl = q.zahllast;
            return (
              <div key={q.quartal} style={{border:`1.5px solid ${isCurrentQ?'var(--accent)':'var(--border)'}`,borderRadius:'var(--radius-md)',padding:'12px 14px',background:isCurrentQ?'var(--blue-light)':'transparent',position:'relative'}}>
                {isCurrentQ && <div style={{position:'absolute',top:-1,right:8,fontSize:9,fontWeight:700,color:'#fff',background:'var(--accent)',padding:'1px 6px',borderRadius:'0 0 4px 4px',letterSpacing:.5}}>AKTUELL</div>}
                <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>Q{q.quartal} / {year}</div>
                <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:2}}>Umsatz netto</div>
                <div style={{fontWeight:600,fontSize:13,marginBottom:6}}>{fmt(q.nettoUmsatz)}</div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-secondary)',marginBottom:1}}>
                  <span>USt Ausgang</span><span style={{color:'var(--green)',fontWeight:500}}>+{fmt(q.ustAusgang)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-secondary)',marginBottom:6}}>
                  <span>Vorsteuer</span><span style={{color:'var(--accent)',fontWeight:500}}>−{fmt(q.vorsteuer)}</span>
                </div>
                <div style={{borderTop:'1px solid var(--border)',paddingTop:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:11,fontWeight:600,color:zl>0?'var(--red)':zl<0?'var(--green)':'var(--text-secondary)'}}>{zl>0?'Zahllast':zl<0?'Gutschrift':'Ausgeglichen'}</span>
                  <span style={{fontSize:13,fontWeight:700,color:zl>0?'var(--red)':zl<0?'var(--green)':'var(--text-secondary)'}}>{fmt(Math.abs(zl))}</span>
                </div>
                <div style={{marginTop:6,fontSize:10,color:'var(--text-tertiary)'}}>
                  <i className="ti ti-clock" style={{marginRight:3}}/>Fällig: {q.faellig}
                  {isPast && zl>0 && <span style={{marginLeft:6,color:'var(--green)'}}>✓</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Aufschlüsselung nach Steuersatz ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
        <div className="card">
          <div className="card-title"><i className="ti ti-arrow-up-right" style={{color:'var(--green)'}}/>USt Ausgang nach Steuersatz</div>
          <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:10}}>Diese USt hast du von Kunden kassiert und schuldest dem Finanzamt.</div>
          {(data.ustAusgang?.positionen||[]).length===0
            ? <div style={{color:'var(--text-tertiary)',fontSize:12}}>Keine bezahlten Rechnungen in {year}</div>
            : (data.ustAusgang?.positionen||[]).map(p=>(
              <div key={p.vat_rate} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'0.5px solid var(--border)'}}>
                <span className="badge amber" style={{minWidth:36,textAlign:'center'}}>{p.vat_rate}%</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:'var(--text-secondary)'}}>Netto-Umsatz</div>
                  <div style={{fontSize:12,fontWeight:500}}>{fmt(p.netto)}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:11,color:'var(--text-secondary)'}}>USt-Betrag</div>
                  <div style={{fontSize:14,fontWeight:700,color:'var(--green)'}}>{fmt(p.ust)}</div>
                </div>
              </div>
            ))}
          <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14,marginTop:10,color:'var(--green)'}}>
            <span>Gesamt USt Ausgang</span><span>{fmt(ustOut)}</span>
          </div>
        </div>

        <div className="card">
          <div className="card-title"><i className="ti ti-arrow-down-left" style={{color:'var(--accent)'}}/>Vorsteuer nach Steuersatz</div>
          <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:10}}>Diese USt hast du bei Einkäufen bezahlt und bekommst sie zurück.</div>
          {(data.vorsteuer?.positionen||[]).length===0
            ? <div style={{color:'var(--text-tertiary)',fontSize:12}}>Keine bezahlten Ausgaben in {year}</div>
            : (data.vorsteuer?.positionen||[]).map(p=>(
              <div key={p.vat_rate} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'0.5px solid var(--border)'}}>
                <span className="badge blue" style={{minWidth:36,textAlign:'center'}}>{p.vat_rate}%</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:'var(--text-secondary)'}}>Netto-Aufwand</div>
                  <div style={{fontSize:12,fontWeight:500}}>{fmt(p.netto)}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:11,color:'var(--text-secondary)'}}>Vorsteuer</div>
                  <div style={{fontSize:14,fontWeight:700,color:'var(--accent)'}}>{fmt(p.ust)}</div>
                </div>
              </div>
            ))}
          <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14,marginTop:10,color:'var(--accent)'}}>
            <span>Gesamt Vorsteuer</span><span>{fmt(vorst)}</span>
          </div>
        </div>
      </div>

      {/* ── UVA-Formular Kennzahlen ── */}
      <div className="card">
        <div className="card-title"><i className="ti ti-file-invoice"/>UVA-Kennzahlen für den Steuerberater ({year})</div>
        <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:12}}>Diese Zahlen trägst du (oder dein Steuerberater) in die Umsatzsteuervoranmeldung ein.</div>
        <table>
          <thead><tr><th style={{width:100}}>Kennzahl</th><th>Bedeutung</th><th>Einfach erklärt</th><th className="right">Betrag</th></tr></thead>
          <tbody>
            <tr>
              <td><code>KZ 000</code></td>
              <td>Gesamtumsatz netto</td>
              <td style={{fontSize:11,color:'var(--text-secondary)'}}>Alle deine Einnahmen ohne USt</td>
              <td className="right">{fmt(data.uva?.KZ_000)}</td>
            </tr>
            <tr>
              <td><code>KZ 022</code></td>
              <td style={{color:'var(--green)'}}>20 % USt → Steuerbetrag</td>
              <td style={{fontSize:11,color:'var(--text-secondary)'}}>USt die du zu 20% verrechnet hast</td>
              <td className="right" style={{color:'var(--green)',fontWeight:500}}>{fmt(data.uva?.KZ_022)}</td>
            </tr>
            <tr>
              <td><code>KZ 010</code></td>
              <td style={{color:'var(--green)'}}>10 % USt → Steuerbetrag</td>
              <td style={{fontSize:11,color:'var(--text-secondary)'}}>USt die du zu 10% verrechnet hast</td>
              <td className="right" style={{color:'var(--green)',fontWeight:500}}>{fmt(data.uva?.KZ_010)}</td>
            </tr>
            <tr>
              <td><code>KZ 060</code></td>
              <td style={{color:'var(--accent)'}}>Abziehbare Vorsteuer</td>
              <td style={{fontSize:11,color:'var(--text-secondary)'}}>USt aus deinen Einkäufen (Abzug)</td>
              <td className="right" style={{color:'var(--accent)',fontWeight:500}}>− {fmt(data.uva?.KZ_060)}</td>
            </tr>
            <tr style={{background: zahllast>0?'rgba(220,38,38,.05)':'rgba(16,185,129,.05)'}}>
              <td><code style={{color:zahllast>0?'var(--red)':'var(--green)',fontWeight:700}}>KZ 095</code></td>
              <td style={{color:zahllast>0?'var(--red)':'var(--green)',fontWeight:600}}>{zahllast>0?'Zahllast ans Finanzamt':'Gutschrift vom Finanzamt'}</td>
              <td style={{fontSize:11,color:'var(--text-secondary)'}}>{zahllast>0?'Diesen Betrag überweist du dem Finanzamt':'Diesen Betrag bekommst du zurück'}</td>
              <td className="right" style={{fontWeight:700,fontSize:15,color:zahllast>0?'var(--red)':'var(--green)'}}>{fmt(Math.abs(zahllast))}</td>
            </tr>
          </tbody>
        </table>
        <div style={{marginTop:12,padding:'10px 14px',background:'var(--bg-secondary)',borderRadius:'var(--radius-sm)',fontSize:12,color:'var(--text-secondary)'}}>
          <i className="ti ti-bulb" style={{marginRight:6,color:'var(--amber)'}}/>
          <strong>Tipp:</strong> Schick diese Zahlen einfach deinem Steuerberater — er trägt sie in FinanzOnline ein. Die UVA muss spätestens am Ende des übernächsten Monats nach dem Quartal eingereicht werden.
        </div>
      </div>
    </div>
  );
}

// ─── E/A RECHNUNG ─────────────────────────────────────────────────────────────
export function EAReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, loading } = useData(()=>api.reportEA({year}), [year]);
  const openPdf = () => window.open(`/api/pdf/ea?year=${year}&token=${localStorage.getItem('danitec_token')}`, '_blank');
  if (loading) return <div className="page-body"><Spinner dark/></div>;
  if (!data) return null;
  const katMap = data.ausgaben?.nachKategorie || {};
  return (
    <div className="page-body">
      <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <label style={{fontSize:13,color:'var(--text-secondary)'}}>Jahr:</label>
          <select value={year} onChange={e=>setYear(parseInt(e.target.value))} style={{width:100}}>{[2023,2024,2025,2026].map(y=><option key={y}>{y}</option>)}</select>
        </div>
        <button className="btn primary" onClick={openPdf}><i className="ti ti-file-type-pdf"/>Als PDF exportieren</button>
      </div>
      <Alert type="info">Ist-Besteuerung · Privatanteile bereits abgezogen · AfA wird berücksichtigt</Alert>
      <div className="metric-grid metric-grid-4">
        <div className="metric-card"><div className="metric-label">Betriebseinnahmen (netto)</div><div className="metric-value green">{fmt(data.einnahmen?.summe)}</div></div>
        <div className="metric-card"><div className="metric-label">Betriebsausgaben (netto)</div><div className="metric-value red">{fmt(data.ausgaben?.summe)}</div></div>
        <div className="metric-card"><div className="metric-label">AfA Abschreibungen</div><div className="metric-value amber">{fmt(data.afa)}</div></div>
        <div className="metric-card"><div className="metric-label">Gewinn / Verlust</div><div className={`metric-value ${(data.gewinn||0)>=0?'blue':'red'}`}>{fmt(data.gewinn)}</div></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div className="card">
          <div className="card-title"><i className="ti ti-trending-up" style={{color:'var(--green)'}}/>Einnahmen</div>
          {(data.einnahmen?.positionen||[]).map((r,i)=>(
            <div key={i} className="activity-item"><div className="dot green"/><div style={{flex:1}}><div style={{fontSize:12,fontWeight:500}}>{r.number}</div><div style={{fontSize:11,color:'var(--text-secondary)'}}>{r.kunde} · {fmtDate(r.payment_date)}</div></div><div style={{color:'var(--green)',fontWeight:500}}>{fmt(r.netto)}</div></div>
          ))}
          <div className="divider"/>
          <div className="totals-row total"><span>Summe Einnahmen</span><span style={{color:'var(--green)'}}>{fmt(data.einnahmen?.summe)}</span></div>
        </div>
        <div className="card">
          <div className="card-title"><i className="ti ti-chart-pie" style={{color:'var(--red)'}}/>Ausgaben nach Kategorie</div>
          {Object.entries(katMap).sort((a,b)=>b[1]-a[1]).map(([k,v])=>(
            <div key={k} className="activity-item"><div className="dot red"/><div style={{flex:1,fontSize:12}}>{k}</div><div style={{color:'var(--red)',fontWeight:500}}>{fmt(v)}</div></div>
          ))}
          {data.afa>0&&<div className="activity-item"><div className="dot amber"/><div style={{flex:1,fontSize:12,color:'var(--text-secondary)'}}>AfA Abschreibungen</div><div style={{color:'var(--amber)',fontWeight:500}}>{fmt(data.afa)}</div></div>}
          <div className="divider"/>
          <div className="totals-row total"><span>Summe Ausgaben + AfA</span><span style={{color:'var(--red)'}}>{fmt((data.ausgaben?.summe||0)+(data.afa||0))}</span></div>
        </div>
      </div>
    </div>
  );
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
export function Export() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [exported, setExported] = useState({});
  const trigger = (id, url) => { window.open(url,'_blank'); setExported(e=>({...e,[id]:true})); setTimeout(()=>setExported(e=>({...e,[id]:false})),3000); };

  const EXPORTS = [
    {id:'invoices', icon:'ti-file-invoice', color:'var(--accent)', bg:'var(--accent-light)', title:'Ausgangsrechnungen', format:'CSV', url:`/api/exports/invoices?year=${year}`},
    {id:'expenses', icon:'ti-receipt-2',    color:'var(--green)',  bg:'var(--green-light)',  title:'Ausgaben mit Privatanteilen', format:'CSV', url:`/api/exports/expenses?year=${year}`},
    {id:'ea',       icon:'ti-chart-bar',    color:'var(--amber)', bg:'var(--amber-light)',  title:'E/A-Rechnung',  format:'PDF', url:`/api/pdf/ea?year=${year}`},
    {id:'audit',    icon:'ti-shield-lock',  color:'#444',         bg:'var(--bg)',           title:'Audit-Log',     format:'CSV', url:`/api/exports/audit-log?year=${year}`},
  ];

  return (
    <div className="page-body">
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:20}}>
        <label style={{fontSize:13,color:'var(--text-secondary)'}}>Exportjahr:</label>
        <select value={year} onChange={e=>setYear(parseInt(e.target.value))} style={{width:100}}>{[2023,2024,2025,2026].map(y=><option key={y}>{y}</option>)}</select>
      </div>
      <Alert type="info">Alle Exporte enthalten UTF-8 BOM – direkt in Excel lesbar. Dateiname: <code>Danitec_Export_{year}_[Inhalt].[Format]</code></Alert>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
        {EXPORTS.map(ex=>(
          <div key={ex.id} className="card" style={{display:'flex',alignItems:'flex-start',gap:14,marginBottom:0}}>
            <div style={{width:40,height:40,borderRadius:'var(--radius-md)',background:ex.bg,color:ex.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}><i className={`ti ${ex.icon}`}/></div>
            <div style={{flex:1}}>
              <div style={{fontWeight:500,fontSize:13,marginBottom:4}}>{ex.title}</div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}><span className="badge gray"><i className="ti ti-file" style={{fontSize:10}}/>{ex.format}</span>
              <button className={`btn xs ${exported[ex.id]?'success':'primary'}`} onClick={()=>trigger(ex.id,ex.url)}>
                {exported[ex.id]?<><i className="ti ti-check"/>Exportiert!</>:<><i className="ti ti-download"/>Export</>}
              </button></div>
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-title"><i className="ti ti-user-check" style={{color:'var(--purple)'}}/>Steuerberater-Quartalspaket</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {['Q1 (Jän–Mär)','Q2 (Apr–Jun)','Q3 (Jul–Sep)','Q4 (Okt–Dez)','Halbjahr 1','Gesamtjahr'].map(q=>(
            <button key={q} className="btn sm" style={{justifyContent:'center'}} onClick={()=>trigger('stb_'+q,`/api/exports/invoices?year=${year}`)}>
              {exported['stb_'+q]?<><i className="ti ti-check"/>Exportiert!</>:<><i className="ti ti-download"/>{q}</>}
            </button>
          ))}
        </div>
        <div style={{marginTop:10,fontSize:12,color:'var(--text-secondary)'}}>Enthält: Rechnungen + Ausgaben + E/A-Rechnung + USt-Übersicht + Audit-Log</div>
      </div>
    </div>
  );
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────
export function AuditLog() {
  const { data, loading } = useData(()=>
    fetch('/api/audit-log',{headers:{'Authorization':`Bearer ${localStorage.getItem('danitec_token')}`}}).then(r=>r.json())
  );
  const logs = Array.isArray(data) ? data : (data?.data || []);
  return (
    <div className="page-body">
      <Alert type="info"><i className="ti ti-shield-lock"/>Unveränderliches Protokoll aller Aktionen. Festgeschriebene Belege können nicht mehr geändert oder gelöscht werden.</Alert>
      <div className="card card-0">
        {loading?<div style={{padding:32,textAlign:'center'}}><Spinner dark/></div>:
         logs.length===0?<EmptyState icon="ti-shield-lock" title="Keine Einträge"/>:
        <div className="table-wrap"><table>
          <thead><tr><th>Zeitpunkt</th><th>Benutzer</th><th>Typ</th><th>Aktion</th></tr></thead>
          <tbody>{logs.slice(0,100).map((e,i)=>(
            <tr key={i}><td style={{fontSize:11,whiteSpace:'nowrap'}}>{fmtDate(e.created_at)}</td><td style={{fontSize:12}}>{e.user_id||'System'}</td><td><span className="badge gray">{e.entity_type||'—'}</span></td><td style={{fontSize:12,fontWeight:500}}>{e.action}</td></tr>
          ))}</tbody>
        </table></div>}
      </div>
    </div>
  );
}

// ─── EINSTELLUNGEN ────────────────────────────────────────────────────────────
// ─── SMTP-Einstellungen Block (wiederverwendbar in AdminDashboard) ────────────
function SmtpSettings({ st, setSt }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const testSmtp = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await api.smtpTest();
      setTestResult(r.ok ? { ok: true, msg: 'Verbindung erfolgreich!' } : { ok: false, msg: r.error });
    } catch(e) { setTestResult({ ok: false, msg: e.message }); }
    finally { setTesting(false); }
  };

  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-mail"/>E-Mail / SMTP (Ausgang)</div>
      <Alert type="info">Hier konfigurierst du den Ausgangs-Mailserver. Rechnungen und Angebote können dann direkt aus der App an Kunden versendet werden. Für Gmail: App-Passwort verwenden (nicht dein normales Passwort).</Alert>
      <FormRow>
        <FormGroup label="SMTP-Host"><input value={st?.smtp_host||''} onChange={e=>setSt(s=>({...s,smtp_host:e.target.value}))} placeholder="smtp.gmail.com"/></FormGroup>
        <FormGroup label="Port"><input type="number" value={st?.smtp_port||587} onChange={e=>setSt(s=>({...s,smtp_port:parseInt(e.target.value)}))} style={{width:80}}/></FormGroup>
        <FormGroup label="SSL/TLS"><select value={st?.smtp_secure?'true':'false'} onChange={e=>setSt(s=>({...s,smtp_secure:e.target.value==='true'}))}><option value="false">STARTTLS (Port 587)</option><option value="true">SSL (Port 465)</option></select></FormGroup>
      </FormRow>
      <FormRow>
        <FormGroup label="Benutzername (E-Mail)"><input value={st?.smtp_user||''} onChange={e=>setSt(s=>({...s,smtp_user:e.target.value}))} placeholder="firma@gmail.com"/></FormGroup>
        <FormGroup label="Passwort / App-Passwort"><input type="password" value={st?.smtp_password||''} onChange={e=>setSt(s=>({...s,smtp_password:e.target.value}))} placeholder="xxxx xxxx xxxx xxxx" autoComplete="new-password"/></FormGroup>
      </FormRow>
      <FormRow>
        <FormGroup label="Absender-Name"><input value={st?.smtp_from_name||''} onChange={e=>setSt(s=>({...s,smtp_from_name:e.target.value}))} placeholder="Danitek GmbH"/></FormGroup>
        <FormGroup label="Absender-E-Mail"><input value={st?.smtp_from_email||''} onChange={e=>setSt(s=>({...s,smtp_from_email:e.target.value}))} placeholder="firma@gmail.com"/></FormGroup>
      </FormRow>
      <div style={{display:'flex',alignItems:'center',gap:12,marginTop:4}}>
        <button className="btn sm ghost" onClick={testSmtp} disabled={testing}>
          {testing?<><i className="ti ti-loader-2"/>Teste...</>:<><i className="ti ti-wifi"/>Verbindung testen</>}
        </button>
        {testResult && <span style={{fontSize:12,fontWeight:600,color:testResult.ok?'var(--green)':'var(--red)'}}>
          <i className={`ti ${testResult.ok?'ti-check':'ti-x'}`}/> {testResult.msg}
        </span>}
      </div>
    </div>
  );
}

// ─── E-MAIL VERSENDEN MODAL ───────────────────────────────────────────────────
function SendEmailModal({ open, onClose, documentId, onSent }) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ to: '', subject: '', body: '' });
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (open && documentId) {
      setLoading(true); setErr(''); setSuccess(''); setSending(false);
      api.emailPreview(documentId)
        .then(r => setForm({ to: r.to||'', subject: r.subject||'', body: r.body||'' }))
        .catch(e => setErr(e.message))
        .finally(() => setLoading(false));
    }
  }, [open, documentId]);

  const send = async () => {
    if (!form.to) { setErr('Bitte E-Mail-Adresse eingeben.'); return; }
    setSending(true); setErr('');
    try {
      const r = await api.sendEmailDoc(documentId, { toEmail: form.to, subject: form.subject, bodyText: form.body });
      setSuccess(r.message || `Erfolgreich an ${form.to} versendet!`);
      if (onSent) onSent();
    } catch(e) { setErr(e.message); }
    finally { setSending(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Per E-Mail versenden" maxWidth={560}
      footer={success
        ? <button className="btn primary" onClick={onClose}><i className="ti ti-check"/> Schließen</button>
        : <><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn primary" onClick={send} disabled={sending||loading}>{sending?<><i className="ti ti-loader-2"/>Sende...</>:<><i className="ti ti-send"/>E-Mail senden</>}</button></>
      }>
      {loading && <div style={{textAlign:'center',padding:24}}><Spinner dark/></div>}
      {!loading && <>
        {success && <Alert type="success"><i className="ti ti-check"/> {success}</Alert>}
        {err && <Alert type="danger">{err}</Alert>}
        {!success && <>
          <FormGroup label="An (E-Mail)">
            <input value={form.to} onChange={e=>setForm(f=>({...f,to:e.target.value}))} placeholder="kunde@beispiel.at" type="email"/>
            {!form.to && <div style={{fontSize:11,color:'var(--amber)',marginTop:3}}><i className="ti ti-alert-triangle"/> Beim Kunden ist keine E-Mail-Adresse hinterlegt.</div>}
          </FormGroup>
          <FormGroup label="Betreff">
            <input value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))}/>
          </FormGroup>
          <FormGroup label="Nachricht">
            <textarea value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} rows={8} style={{fontFamily:'inherit',fontSize:13}}/>
          </FormGroup>
          <div style={{fontSize:11,color:'var(--text-tertiary)'}}><i className="ti ti-paperclip"/> Das PDF wird automatisch als Anhang beigefügt.</div>
        </>}
      </>}
    </Modal>
  );
}

// ─── ANLAGE FOTO-MODAL ────────────────────────────────────────────────────────
function EquipmentPhotoModal({ equipment, onClose }) {
  const [photos, setPhotos]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [driveOk, setDriveOk]   = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.driveStatus().then(r => setDriveOk(r?.connected)).catch(()=>setDriveOk(false));
    loadPhotos();
  }, [equipment.id]);

  const loadPhotos = async () => {
    setLoading(true);
    try { const r = await api.drivePhotos(equipment.id); setPhotos(r.data || []); }
    catch (_) { setPhotos([]); }
    finally { setLoading(false); }
  };

  const upload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('photos', f);
      await api.driveUploadPhotos(equipment.id, fd);
      await loadPhotos();
    } catch (err) { alert(err.message); }
    finally { setUploading(false); e.target.value=''; }
  };

  const deletePhoto = async (pid) => {
    if (!confirm('Foto löschen?')) return;
    await api.driveDeletePhoto(pid);
    setPhotos(ph => ph.filter(p => p.id !== pid));
  };

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:20,width:'100%',maxWidth:700,maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.3)'}}>
        {/* Header */}
        <div style={{padding:'20px 28px',borderBottom:'1px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:'#111'}}>
              <i className="ti ti-camera" style={{marginRight:8,color:'#2D9CDB'}}/>
              {equipment.name}
            </div>
            {equipment.order_number && <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>{equipment.order_number}</div>}
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {driveOk ? (
              <>
                <input ref={fileRef} type="file" multiple accept="image/*" style={{display:'none'}} onChange={upload}/>
                <button className="btn primary" onClick={()=>fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Spinner/> : <><i className="ti ti-upload"/> Fotos hochladen</>}
                </button>
              </>
            ) : (
              <span style={{fontSize:12,color:'var(--text-tertiary)'}}>
                <i className="ti ti-brand-google-drive"/> Drive nicht verbunden
              </span>
            )}
            <button onClick={onClose} style={{background:'none',border:'none',fontSize:22,color:'var(--text-tertiary)',cursor:'pointer',lineHeight:1}}>✕</button>
          </div>
        </div>
        {/* Body */}
        <div style={{padding:24,overflowY:'auto',flex:1}}>
          {loading ? (
            <div style={{textAlign:'center',padding:40}}><Spinner dark/></div>
          ) : photos.length === 0 ? (
            <div style={{textAlign:'center',padding:40,color:'var(--text-tertiary)'}}>
              <i className="ti ti-photo-off" style={{fontSize:48,display:'block',marginBottom:12}}/>
              <div style={{fontWeight:600}}>Noch keine Fotos</div>
              {driveOk
                ? <div style={{fontSize:13,marginTop:4}}>Lade Fotos hoch — sie werden automatisch in Google Drive gespeichert.</div>
                : <div style={{fontSize:13,marginTop:4}}>Verbinde Google Drive in den <strong>Einstellungen</strong>, um Fotos hochladen zu können.</div>
              }
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12}}>
              {photos.map(p => (
                <div key={p.id} style={{position:'relative',borderRadius:12,overflow:'hidden',aspectRatio:'4/3',background:'#f3f4f6',boxShadow:'0 2px 8px rgba(0,0,0,0.1)'}}>
                  <img src={p.drive_url} alt={p.original_name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                  <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 50%)',opacity:0,transition:'opacity 0.2s'}}
                       onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}>
                    <button onClick={()=>deletePhoto(p.id)}
                      style={{position:'absolute',bottom:8,right:8,background:'rgba(255,0,0,0.8)',border:'none',borderRadius:8,padding:'4px 10px',color:'#fff',cursor:'pointer',fontSize:12}}>
                      <i className="ti ti-trash"/>
                    </button>
                    <a href={p.drive_url} target="_blank" rel="noreferrer"
                      style={{position:'absolute',bottom:8,left:8,background:'rgba(0,0,0,0.6)',borderRadius:8,padding:'4px 10px',color:'#fff',fontSize:12,textDecoration:'none'}}>
                      <i className="ti ti-external-link"/>
                    </a>
                  </div>
                  {p.caption && <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'4px 8px',background:'rgba(0,0,0,0.5)',color:'#fff',fontSize:10,textAlign:'center'}}>{p.caption}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── GOOGLE DRIVE SEITE ───────────────────────────────────────────────────────
// ─── KALENDER ─────────────────────────────────────────────────────────────────
const CAL_TYPES = {
  termin:    { label:'Termin',    color:'#2D9CDB', icon:'ti-calendar' },
  baustelle: { label:'Baustelle', color:'#f59e0b', icon:'ti-hammer' },
  wartung:   { label:'Wartung',   color:'#10b981', icon:'ti-tool' },
  service:   { label:'Service',   color:'#8b5cf6', icon:'ti-clipboard-check' },
};
const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const DAYS_DE   = ['Mo','Di','Mi','Do','Fr','Sa','So'];

export function CalendarPage() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view,  setView]  = useState('month'); // 'month' | 'week'
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | { date, event }
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const { data: custData } = useData(() => api.customers());
  const customers = custData?.data || [];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date(year, month, 1).toISOString();
      const to   = new Date(year, month+1, 0, 23, 59).toISOString();
      const r = await api.calendarEvents(from, to);
      setEvents(r.data || []);
    } catch(_) {}
    finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  // Kalender-Grid aufbauen
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month+1, 0);
  // Montag als erster Tag
  let startDow = firstDay.getDay(); // 0=So
  startDow = startDow === 0 ? 6 : startDow - 1;
  const days = [];
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, 1 - (startDow - i));
    days.push({ date: d, otherMonth: true });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), otherMonth: false });
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length-1].date;
    days.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate()+1), otherMonth: true });
  }

  const eventsForDay = (date) => events.filter(e => {
    const d = new Date(e.start_at);
    return d.getFullYear()===date.getFullYear() && d.getMonth()===date.getMonth() && d.getDate()===date.getDate();
  });

  const openNew = (date) => {
    const iso = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 8, 0).toISOString().slice(0,16);
    setForm({ title:'', type:'termin', start_at: iso, end_at:'', all_day:false, location:'', description:'', customer_id:'', assigned_to:'' });
    setModal({ date, event: null });
  };

  const openEdit = (e) => {
    setForm({
      title: e.title, type: e.type, color: e.color,
      start_at: e.start_at?.slice(0,16),
      end_at:   e.end_at?.slice(0,16) || '',
      all_day:  e.all_day, location: e.location||'',
      description: e.description||'',
      customer_id: e.customer_id||'',
      assigned_to: e.assigned_to||'',
    });
    setModal({ date: null, event: e });
  };

  const save = async () => {
    setSaving(true);
    try {
      if (modal.event) await api.updateCalEvent(modal.event.id, form);
      else             await api.createCalEvent(form);
      setModal(null);
      load();
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!confirm('Termin löschen?')) return;
    await api.deleteCalEvent(modal.event.id);
    setModal(null);
    load();
  };

  const prevMonth = () => { if (month===0) { setMonth(11); setYear(y=>y-1); } else setMonth(m=>m-1); };
  const nextMonth = () => { if (month===11) { setMonth(0); setYear(y=>y+1); } else setMonth(m=>m+1); };

  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  return (
    <div className="page-body" style={{maxWidth:'none'}}>
      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        <button className="btn ghost" onClick={prevMonth}><i className="ti ti-chevron-left"/></button>
        <div style={{fontSize:18,fontWeight:800,minWidth:200,textAlign:'center'}}>
          {MONTHS_DE[month]} {year}
        </div>
        <button className="btn ghost" onClick={nextMonth}><i className="ti ti-chevron-right"/></button>
        <button className="btn ghost" onClick={()=>{setYear(today.getFullYear());setMonth(today.getMonth());}}>Heute</button>
        <div style={{flex:1}}/>
        {/* Legende */}
        {Object.entries(CAL_TYPES).map(([k,v])=>(
          <span key={k} style={{display:'flex',alignItems:'center',gap:5,fontSize:12}}>
            <span style={{width:10,height:10,borderRadius:'50%',background:v.color,display:'inline-block'}}/>
            {v.label}
          </span>
        ))}
        <button className="btn primary" onClick={()=>openNew(new Date())}>
          <i className="ti ti-plus"/> Neuer Termin
        </button>
      </div>

      {/* Wochentage Header */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:2}}>
        {DAYS_DE.map(d=>(
          <div key={d} style={{textAlign:'center',fontSize:12,fontWeight:700,color:'var(--text-secondary)',padding:'6px 0'}}>
            {d}
          </div>
        ))}
      </div>

      {/* Kalender Grid */}
      {loading ? <div style={{textAlign:'center',padding:60}}><Spinner dark/></div> : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
          {days.map(({date, otherMonth}, i) => {
            const dayEvs = eventsForDay(date);
            const isToday = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` === todayStr;
            return (
              <div key={i} onClick={()=>openNew(date)}
                style={{
                  minHeight:110, background: otherMonth?'var(--bg-muted,#f9fafb)':'#fff',
                  border: isToday?'2px solid #2D9CDB':'1px solid var(--border)',
                  borderRadius:10, padding:'6px 8px', cursor:'pointer',
                  transition:'background 0.15s',
                  opacity: otherMonth?0.45:1,
                }}
                onMouseEnter={e=>!otherMonth&&(e.currentTarget.style.background='#f0f7ff')}
                onMouseLeave={e=>e.currentTarget.style.background=otherMonth?'var(--bg-muted,#f9fafb)':'#fff'}
              >
                <div style={{fontSize:13,fontWeight:isToday?800:600,color:isToday?'#2D9CDB':'var(--text-primary)',marginBottom:4}}>
                  {isToday
                    ? <span style={{background:'#2D9CDB',color:'#fff',borderRadius:'50%',width:24,height:24,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{date.getDate()}</span>
                    : date.getDate()
                  }
                </div>
                {dayEvs.slice(0,3).map(e=>(
                  <div key={e.id} onClick={ev=>{ev.stopPropagation();openEdit(e);}}
                    style={{fontSize:11,fontWeight:600,background:e.color||'#2D9CDB',color:'#fff',
                      borderRadius:5,padding:'2px 6px',marginBottom:2,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'pointer'}}>
                    {e.all_day?'':new Date(e.start_at).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'})+' '}
                    {e.title}
                  </div>
                ))}
                {dayEvs.length>3&&<div style={{fontSize:10,color:'var(--text-secondary)',marginTop:2}}>+{dayEvs.length-3} weitere</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Termin-Modal */}
      {modal && (
        <Modal open title={modal.event?'Termin bearbeiten':'Neuer Termin'} maxWidth={520}
          onClose={()=>setModal(null)}
          footer={<>
            {modal.event && <button className="btn ghost danger" onClick={del}>Löschen</button>}
            <div style={{flex:1}}/>
            <button className="btn" onClick={()=>setModal(null)}>Abbrechen</button>
            <button className="btn primary" onClick={save} disabled={saving}>{saving?'Speichern...':'Speichern'}</button>
          </>}>
          <FormGroup label="Titel *">
            <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="z.B. Wartung Müller GmbH"/>
          </FormGroup>
          <FormRow>
            <FormGroup label="Typ">
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value,color:CAL_TYPES[e.target.value]?.color}))}>
                {Object.entries(CAL_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Kunde">
              <select value={form.customer_id} onChange={e=>setForm(f=>({...f,customer_id:e.target.value}))}>
                <option value="">— Kein Kunde —</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.company_name||`${c.first_name} ${c.last_name}`}</option>)}
              </select>
            </FormGroup>
          </FormRow>
          <FormRow>
            <FormGroup label="Start *">
              <input type="datetime-local" value={form.start_at} onChange={e=>setForm(f=>({...f,start_at:e.target.value}))}/>
            </FormGroup>
            <FormGroup label="Ende">
              <input type="datetime-local" value={form.end_at} onChange={e=>setForm(f=>({...f,end_at:e.target.value}))}/>
            </FormGroup>
          </FormRow>
          <FormGroup label="Ort / Adresse">
            <input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="z.B. Musterstraße 5, 1010 Wien"/>
          </FormGroup>
          <FormGroup label="Beschreibung">
            <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3}/>
          </FormGroup>
          <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,cursor:'pointer'}}>
            <input type="checkbox" checked={form.all_day} onChange={e=>setForm(f=>({...f,all_day:e.target.checked}))}/>
            Ganztägig
          </label>
        </Modal>
      )}
    </div>
  );
}

const DRIVE_DEFAULT = 'https://drive.google.com/embeddedfolderview?id=1qCDyU8YSBCUu34xyYdqSlZR7y6BeZErT#list';

export function GoogleDrivePage() {
  const [url, setUrl] = useState(localStorage.getItem('danitec_drive_url') || DRIVE_DEFAULT);
  const [inputUrl, setInputUrl] = useState('');
  const [editing, setEditing] = useState(false);

  const save = () => {
    let u = inputUrl.trim();
    // Ordner-URL in Embed-URL umwandeln
    // https://drive.google.com/drive/folders/FOLDER_ID → embed
    const match = u.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match) {
      u = `https://drive.google.com/embeddedfolderview?id=${match[1]}#list`;
    }
    localStorage.setItem('danitec_drive_url', u);
    setUrl(u);
    setEditing(false);
  };

  if (editing || !url) return (
    <div className="page-body" style={{maxWidth:560}}>
      <div className="card">
        <div className="card-title"><i className="ti ti-brand-google-drive"/>Google Drive verknüpfen</div>
        <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:16}}>
          Öffne deinen Google Drive Ordner im Browser, kopiere die URL aus der Adressleiste und füge sie hier ein.
        </p>
        <FormGroup label="Google Drive Ordner-URL">
          <input
            value={inputUrl}
            onChange={e=>setInputUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            style={{fontFamily:'monospace',fontSize:12}}
          />
        </FormGroup>
        <div style={{display:'flex',gap:8,marginTop:12}}>
          <button className="btn primary" onClick={save} disabled={!inputUrl.trim()}>
            <i className="ti ti-check"/> Speichern & anzeigen
          </button>
          {url && <button className="btn ghost" onClick={()=>setEditing(false)}>Abbrechen</button>}
        </div>
      </div>
      <div className="card" style={{background:'#f0f7ff',border:'1px solid #bfdbfe'}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:'#152248'}}>
          <i className="ti ti-info-circle"/> So geht's
        </div>
        <ol style={{fontSize:13,color:'var(--text-secondary)',paddingLeft:18,lineHeight:1.8}}>
          <li>Öffne <a href="https://drive.google.com" target="_blank" rel="noreferrer" style={{color:'#2D9CDB'}}>drive.google.com</a></li>
          <li>Navigiere zu deinem Firmen-Ordner (z.B. "Danitek GmbH")</li>
          <li>Kopiere die URL oben im Browser</li>
          <li>Füge sie oben ein und klicke Speichern</li>
        </ol>
      </div>
    </div>
  );

  // Ordner-ID aus URL extrahieren für direkten Link
  const folderMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
  const folderId    = folderMatch ? folderMatch[1] : null;
  const driveUrl    = folderId
    ? `https://drive.google.com/drive/folders/${folderId}`
    : 'https://drive.google.com';

  return (
    <div className="page-body" style={{maxWidth:640}}>
      {/* Haupt-Kachel */}
      <div style={{background:'linear-gradient(135deg,#152248 0%,#1e3a6e 100%)',borderRadius:16,
        padding:32,color:'#fff',marginBottom:20,textAlign:'center'}}>
        <i className="ti ti-brand-google-drive" style={{fontSize:48,marginBottom:12,display:'block',opacity:0.9}}/>
        <div style={{fontSize:20,fontWeight:800,marginBottom:8}}>Google Drive</div>
        <div style={{fontSize:13,opacity:0.7,marginBottom:24}}>
          Google Drive kann nicht direkt eingebettet werden.<br/>Öffne es im Browser-Tab.
        </div>
        <a href={driveUrl} target="_blank" rel="noreferrer"
          style={{display:'inline-flex',alignItems:'center',gap:8,background:'#fff',
            color:'#152248',fontWeight:700,fontSize:14,padding:'10px 24px',
            borderRadius:10,textDecoration:'none',boxShadow:'0 4px 12px rgba(0,0,0,0.2)'}}>
          <i className="ti ti-external-link"/>
          Google Drive öffnen
        </a>
      </div>

      {/* Schnelllinks */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
        {[
          { icon:'ti-folder', label:'Mein Drive',     href:'https://drive.google.com/drive/my-drive' },
          { icon:'ti-users',  label:'Geteilt mit mir',href:'https://drive.google.com/drive/shared-with-me' },
          { icon:'ti-clock',  label:'Zuletzt geöffnet',href:'https://drive.google.com/drive/recent' },
          { icon:'ti-star',   label:'Markiert',        href:'https://drive.google.com/drive/starred' },
        ].map(l=>(
          <a key={l.href} href={l.href} target="_blank" rel="noreferrer"
            style={{display:'flex',alignItems:'center',gap:12,background:'#fff',
              border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',
              textDecoration:'none',color:'var(--text)',fontWeight:600,fontSize:13,
              boxShadow:'0 1px 4px rgba(0,0,0,0.05)',transition:'box-shadow 0.15s'}}
            onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'}
            onMouseLeave={e=>e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.05)'}>
            <i className={`ti ${l.icon}`} style={{fontSize:20,color:'#2D9CDB'}}/>
            {l.label}
          </a>
        ))}
      </div>

      {/* Ordner ändern */}
      <div style={{textAlign:'right'}}>
        <button className="btn xs ghost" onClick={()=>{ setInputUrl(''); setEditing(true); }}>
          <i className="ti ti-settings"/> Ordner-URL ändern
        </button>
      </div>
    </div>
  );
}

// ─── WORKSPACE ────────────────────────────────────────────────────────────────
// Kategorie → Farbe
const CAT_COLORS = {
  'Organisation':            '#3b82f6',
  'Technik/F-Gase/Lager':   '#0891b2',
  'Finanzen/Buchhaltung':    '#7c3aed',
  'Finanzen/Preise':         '#9333ea',
  'GmbH/Notar/Firmenbuch':   '#1e293b',
  'GmbH/Notar':              '#1e293b',
  'Interne Verträge':        '#db2777',
  'Website/Marketing':       '#059669',
  'Vertrieb/Vorlagen':       '#d97706',
  'Betrieb/Vorlagen':        '#ea580c',
  'Recht/Vertrieb':          '#dc2626',
  'WKO/Gewerbe':             '#65a30d',
  'Finanzamt/Steuerberater': '#0369a1',
  'Bank':                    '#0f766e',
  'Versicherungen':          '#b45309',
};
const CAT_COLOR_DEFAULT = '#6b7280';

const STATUS_STYLES = {
  open:       { label:'Not started', bg:'#f1f5f9', color:'#64748b' },
  inprogress: { label:'In progress',  bg:'#fbbf24', color:'#78350f' },
  done:       { label:'Done',         bg:'#22c55e', color:'#fff'    },
};

const WS_CATEGORIES = [
  'Organisation',
  'Technik/F-Gase/Lager',
  'Finanzen/Buchhaltung',
  'Finanzen/Preise',
  'GmbH/Notar/Firmenbuch',
  'Interne Verträge',
  'Website/Marketing',
  'Vertrieb/Vorlagen',
  'Betrieb/Vorlagen',
  'Recht/Vertrieb',
  'WKO/Gewerbe',
  'Finanzamt/Steuerberater',
  'Bank',
  'Versicherungen',
];

function catColor(cat) {
  if (!cat) return CAT_COLOR_DEFAULT;
  for (const [k,v] of Object.entries(CAT_COLORS)) {
    if (cat.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(cat.toLowerCase())) return v;
  }
  return CAT_COLOR_DEFAULT;
}

function cleanTitle(title) {
  // "[Kategorie] Titel" → "Titel"
  return title.replace(/^\[.*?\]\s*/, '');
}

// ─── Spaltenfilter-Dropdown ───────────────────────────────────────────────────
function ColDropdown({ label, value, onChange, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{position:'relative',display:'inline-flex',alignItems:'center',gap:4,cursor:'pointer',userSelect:'none'}}
      onClick={()=>setOpen(o=>!o)}>
      <span style={{fontSize:11,fontWeight:700,color: value?'#152248':'#94a3b8',textTransform:'uppercase',letterSpacing:'0.05em'}}>
        {label}
      </span>
      <i className={`ti ti-chevron-${open?'up':'down'}`} style={{fontSize:10,color:'var(--text-tertiary)'}}/>
      {value && <span style={{width:6,height:6,borderRadius:'50%',background:'#2D9CDB',display:'inline-block'}}/>}
      {open && (
        <div onClick={e=>e.stopPropagation()} style={{position:'absolute',top:'calc(100% + 6px)',left:0,zIndex:999,
          background:'#fff',border:'1px solid var(--border)',borderRadius:10,
          boxShadow:'0 8px 24px rgba(0,0,0,0.12)',minWidth:180,padding:6}}>
          {children}
        </div>
      )}
    </div>
  );
}

function ColOption({ label, active, onClick, color }) {
  return (
    <div onClick={onClick} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
      borderRadius:7,cursor:'pointer',background: active?'#f0f7ff':'transparent',
      fontSize:13,fontWeight: active?600:400}}
      onMouseEnter={e=>{ if(!active) e.currentTarget.style.background='#f8fafc'; }}
      onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent'; }}>
      {color && <span style={{width:10,height:10,borderRadius:3,background:color,flexShrink:0}}/>}
      <span style={{flex:1}}>{label}</span>
      {active && <i className="ti ti-check" style={{fontSize:12,color:'#2D9CDB'}}/>}
    </div>
  );
}

function NotionTodoTable({ cards, onEdit, onToggle, onAddInline, onReorder }) {
  const [filterCat,    setFilterCat]    = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [search,       setSearch]       = useState('');
  const [hoverIdx,     setHoverIdx]     = useState(null);
  const [dragIdx,      setDragIdx]      = useState(null);
  const [dragOver,     setDragOver]     = useState(null);
  const [inlineIdx,    setInlineIdx]    = useState(null); // index to insert after
  const [inlineTitle,  setInlineTitle]  = useState('');
  const inlineRef = useRef(null);

  const cats = [...new Set(cards.map(c => c.category || '').filter(Boolean))].sort();
  const hasFilters = filterCat||filterStatus||dateFrom||dateTo||search;
  const reset = () => { setFilterCat(''); setFilterStatus(''); setDateFrom(''); setDateTo(''); setSearch(''); };

  const filtered = cards.filter(c => {
    if (filterCat    && c.category !== filterCat) return false;
    if (filterStatus && (c.status||c.column_key) !== filterStatus) return false;
    if (search && !cleanTitle(c.title).toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFrom && c.due_date && c.due_date.slice(0,10) < dateFrom) return false;
    if (dateTo   && c.due_date && c.due_date.slice(0,10) > dateTo)   return false;
    return true;
  });

  const open = filtered.filter(c => !c.done);
  const done = filtered.filter(c => c.done);

  // Inline hinzufügen
  const openInline = (idx) => { setInlineIdx(idx); setInlineTitle(''); setTimeout(()=>inlineRef.current?.focus(),50); };
  const submitInline = () => {
    if (inlineTitle.trim()) onAddInline(inlineTitle.trim(), inlineIdx);
    setInlineIdx(null); setInlineTitle('');
  };

  // Drag & Drop
  const handleDragStart = (i) => setDragIdx(i);
  const handleDragOver  = (i) => { if (i!==dragIdx) setDragOver(i); };
  const handleDrop      = (i) => {
    if (dragIdx!==null && dragIdx!==i) onReorder(dragIdx, i);
    setDragIdx(null); setDragOver(null);
  };

  const COLS = '24px 16px 1fr 190px 210px 140px';

  return (
    <div style={{background:'#fff',borderRadius:12,border:'1px solid var(--border)',overflow:'hidden',fontSize:13}}>

      {/* Suchleiste */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
        <i className="ti ti-search" style={{color:'#cbd5e1',fontSize:14,flexShrink:0}}/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Suchen…"
          style={{flex:1,fontSize:13,border:'none',outline:'none',color:'var(--text)'}}/>
        {hasFilters && (
          <button onClick={reset} style={{display:'flex',alignItems:'center',gap:4,fontSize:12,border:'none',
            background:'#fee2e2',color:'#ef4444',borderRadius:6,padding:'3px 8px',cursor:'pointer',whiteSpace:'nowrap'}}>
            <i className="ti ti-x"/> Filter löschen
          </button>
        )}
        <span style={{fontSize:12,color:'var(--text-tertiary)',whiteSpace:'nowrap',borderLeft:'1px solid #f1f5f9',paddingLeft:12}}>{filtered.length} Aufgaben</span>
      </div>

      {/* Header */}
      <div style={{display:'grid',gridTemplateColumns:COLS,padding:'0 16px',background:'var(--bg)',
        borderBottom:'1px solid var(--border)',alignItems:'center',gap:0}}>
        <div/><div/>
        {/* Aufgabe */}
        <div style={{padding:'10px 8px',fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>
          Aufgabe
        </div>
        {/* Kategorie Filter */}
        <div style={{padding:'10px 8px'}}>
          <ColDropdown label="Kategorie" value={filterCat} onChange={setFilterCat}>
            <ColOption label="Alle" active={!filterCat} onClick={()=>{setFilterCat('');}}/>
            <div style={{height:1,background:'#f1f5f9',margin:'4px 0'}}/>
            {cats.map(c=>(
              <ColOption key={c} label={c} active={filterCat===c} color={catColor(c)}
                onClick={()=>setFilterCat(filterCat===c?'':c)}/>
            ))}
          </ColDropdown>
        </div>
        {/* Datum Filter */}
        <div style={{padding:'6px 8px'}}>
          <ColDropdown label="Datum" value={dateFrom||dateTo} onChange={()=>{}}>
            <div style={{padding:'8px 10px'}}>
              <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:4}}>Von</div>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                style={{width:'100%',fontSize:12,border:'1px solid var(--border)',borderRadius:6,padding:'5px 8px'}}/>
              <div style={{fontSize:11,color:'var(--text-tertiary)',margin:'8px 0 4px'}}>Bis</div>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                style={{width:'100%',fontSize:12,border:'1px solid var(--border)',borderRadius:6,padding:'5px 8px'}}/>
              {(dateFrom||dateTo) && (
                <button onClick={()=>{setDateFrom('');setDateTo('');}}
                  style={{marginTop:8,width:'100%',fontSize:11,border:'none',background:'#fee2e2',color:'#ef4444',borderRadius:6,padding:'4px',cursor:'pointer'}}>
                  Zurücksetzen
                </button>
              )}
            </div>
          </ColDropdown>
        </div>
        {/* Status Filter */}
        <div style={{padding:'10px 8px'}}>
          <ColDropdown label="Status" value={filterStatus} onChange={setFilterStatus}>
            <ColOption label="Alle" active={!filterStatus} onClick={()=>setFilterStatus('')}/>
            <div style={{height:1,background:'#f1f5f9',margin:'4px 0'}}/>
            {[['open','Not started','#94a3b8'],['inprogress','In progress','#fbbf24'],['done','Done','#22c55e']].map(([k,l,c])=>(
              <ColOption key={k} label={l} active={filterStatus===k} color={c}
                onClick={()=>setFilterStatus(filterStatus===k?'':k)}/>
            ))}
          </ColDropdown>
        </div>
      </div>

      {/* Zeilen — Offen */}
      {open.length===0 && done.length===0 && (
        <div style={{padding:48,textAlign:'center',color:'var(--text-tertiary)'}}>Keine Aufgaben gefunden</div>
      )}
      {open.map((card, i) => (
        <React.Fragment key={card.id}>
          {/* Plus-Linie zwischen Zeilen */}
          <div style={{position:'relative',height:2}}
            onMouseEnter={()=>setHoverIdx(i)} onMouseLeave={()=>setHoverIdx(null)}>
            {hoverIdx===i && inlineIdx!==i && (
              <div style={{position:'absolute',left:0,right:0,top:-1,height:2,background:'#2D9CDB',zIndex:10,
                display:'flex',alignItems:'center'}}>
                <button onClick={()=>openInline(i)}
                  style={{position:'absolute',left:8,top:-10,width:20,height:20,borderRadius:'50%',
                    background:'#2D9CDB',border:'none',color:'#fff',cursor:'pointer',
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,lineHeight:1}}>
                  +
                </button>
              </div>
            )}
          </div>
          {/* Inline-Input Zeile */}
          {inlineIdx===i && (
            <div style={{display:'grid',gridTemplateColumns:COLS,padding:'6px 16px',background:'#f0f7ff',alignItems:'center',borderBottom:'1px solid #bfdbfe'}}>
              <div/><div/>
              <input ref={inlineRef} value={inlineTitle} onChange={e=>setInlineTitle(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') submitInline(); if(e.key==='Escape'){setInlineIdx(null);} }}
                onBlur={submitInline}
                placeholder="Aufgabe eingeben…"
                style={{gridColumn:'span 4',fontSize:13,border:'none',outline:'none',background:'transparent',color:'var(--text)',fontWeight:500}}/>
            </div>
          )}
          <NotionRow card={card} onEdit={onEdit} onToggle={onToggle}
            cols={COLS} isDragging={dragIdx===i} isDragOver={dragOver===i}
            onDragStart={()=>handleDragStart(i)} onDragOver={()=>handleDragOver(i)} onDrop={()=>handleDrop(i)}/>
        </React.Fragment>
      ))}

      {/* Plus am Ende */}
      <div style={{position:'relative',height:4}}
        onMouseEnter={()=>setHoverIdx(-1)} onMouseLeave={()=>setHoverIdx(null)}>
        {hoverIdx===-1 && inlineIdx!==open.length && (
          <div style={{position:'absolute',left:0,right:0,top:1,height:2,background:'#2D9CDB',
            display:'flex',alignItems:'center'}}>
            <button onClick={()=>openInline(open.length)}
              style={{position:'absolute',left:8,top:-9,width:20,height:20,borderRadius:'50%',
                background:'#2D9CDB',border:'none',color:'#fff',cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,lineHeight:1}}>
              +
            </button>
          </div>
        )}
      </div>
      {inlineIdx===open.length && (
        <div style={{display:'grid',gridTemplateColumns:COLS,padding:'6px 16px',background:'#f0f7ff',alignItems:'center',borderBottom:'1px solid #bfdbfe'}}>
          <div/><div/>
          <input ref={inlineRef} value={inlineTitle} onChange={e=>setInlineTitle(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') submitInline(); if(e.key==='Escape'){setInlineIdx(null);} }}
            onBlur={submitInline}
            placeholder="Aufgabe eingeben…"
            style={{fontSize:13,border:'none',outline:'none',background:'transparent',color:'var(--text)',fontWeight:500}}/>
        </div>
      )}

      {/* Erledigt */}
      {done.length > 0 && (
        <>
          <div style={{padding:'8px 16px 6px',background:'var(--bg)',borderTop:'1px solid var(--border)'}}>
            <span style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>
              ✓ Erledigt · {done.length}
            </span>
          </div>
          {done.map(card=>(
            <NotionRow key={card.id} card={card} onEdit={onEdit} onToggle={onToggle} cols={COLS} isDone/>
          ))}
        </>
      )}
    </div>
  );
}

function NotionRow({ card, onEdit, onToggle, cols, isDone, isDragging, isDragOver, onDragStart, onDragOver, onDrop }) {
  const [hov, setHov] = useState(false);
  const status = STATUS_STYLES[card.status || card.column_key] || STATUS_STYLES.open;
  const cat    = card.category;
  const color  = catColor(cat);
  const title  = cleanTitle(card.title);
  const overdue = !card.done && card.due_date && new Date(card.due_date) < new Date();

  return (
    <div
      draggable
      onDragStart={onDragStart} onDragOver={e=>{e.preventDefault();onDragOver?.();}}
      onDrop={e=>{e.preventDefault();onDrop?.();}} onDragEnd={()=>{}}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{display:'grid',gridTemplateColumns:cols,padding:'4px 16px',
        alignItems:'center',borderBottom:'1px solid var(--border)',
        background: isDragOver?'#e0f2fe': isDragging?'#f0f9ff': hov?'#f8fafc':'#fff',
        opacity: isDone?0.55:1, transition:'background 0.1s',
        cursor:'grab',
      }}>
      {/* Drag handle */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',opacity:hov?0.4:0,transition:'opacity 0.15s',cursor:'grab'}}>
        <i className="ti ti-grip-vertical" style={{fontSize:14,color:'var(--text-tertiary)'}}/>
      </div>
      {/* Checkbox */}
      <input type="checkbox" checked={!!card.done} onChange={()=>onToggle(card)}
        style={{width:15,height:15,cursor:'pointer',accentColor:'#2D9CDB'}}/>
      {/* Titel */}
      <div onClick={()=>onEdit(card)}
        style={{padding:'7px 8px',cursor:'pointer',fontWeight:isDone?400:500,
          textDecoration:isDone?'line-through':'none',color:isDone?'#94a3b8':'#1e293b',
          fontSize:13,lineHeight:1.4}}>
        {title}
      </div>
      {/* Kategorie */}
      <div style={{padding:'0 8px'}}>
        {cat && (
          <span style={{fontSize:11,fontWeight:600,color:'#fff',background:color,
            padding:'2px 8px',borderRadius:5,display:'inline-block',
            maxWidth:175,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {cat}
          </span>
        )}
      </div>
      {/* Datum */}
      <div style={{padding:'0 8px',fontSize:12,color: overdue?'#ef4444':'#64748b'}}>
        {card.start_date && <span style={{color:'var(--text-tertiary)'}}>{fmtDate(card.start_date)} → </span>}
        {card.due_date && fmtDate(card.due_date)}
      </div>
      {/* Status */}
      <div style={{padding:'0 4px'}}>
        <span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,
          background:status.bg,color:status.color,display:'inline-block',whiteSpace:'nowrap'}}>
          {status.label}
        </span>
      </div>
    </div>
  );
}

const WS_TYPES = {
  kanban:   { label:'Kanban',        icon:'ti-layout-kanban', color:'#2D9CDB' },
  todos:    { label:'To-do Liste',   icon:'ti-checklist',     color:'#10b981' },
  notes:    { label:'Notizen',       icon:'ti-notes',         color:'#f59e0b' },
  bulletin: { label:'Schwarzes Brett', icon:'ti-speakerphone', color:'#ef4444' },
};
const PRIO_COLORS2 = { low:'#9ca3af', normal:'#2D9CDB', high:'#f59e0b', urgent:'#ef4444' };
const KAN_COLS = [
  { key:'open',       label:'Offen',      color:'var(--text-secondary)' },
  { key:'inprogress', label:'In Arbeit',  color:'#f59e0b' },
  { key:'done',       label:'Erledigt',   color:'#10b981' },
];

export function WorkspacePage() {
  const [boards, setBoards]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [activeBoard, setActiveBoard] = useState(null);
  const [cards, setCards]       = useState([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [newBoardModal, setNewBoardModal] = useState(false);
  const [cardModal, setCardModal] = useState(null);
  const [cardForm, setCardForm] = useState({});
  const [boardForm, setBoardForm] = useState({ title:'', type:'kanban' });
  const [saving, setSaving]     = useState(false);

  const loadBoards = async () => {
    setLoading(true);
    try { const r = await api.wsBoards(); setBoards(r.data||[]); }
    catch(_) {}
    finally { setLoading(false); }
  };

  const loadCards = async (boardId) => {
    setCardsLoading(true);
    try { const r = await api.wsCards(boardId); setCards(r.data||[]); }
    catch(_) {}
    finally { setCardsLoading(false); }
  };

  useEffect(() => { loadBoards(); }, []);
  useEffect(() => { if (activeBoard) loadCards(activeBoard.id); }, [activeBoard]);

  const createBoard = async () => {
    if (!boardForm.title) return;
    setSaving(true);
    try {
      const r = await api.createWsBoard(boardForm);
      await loadBoards();
      setActiveBoard(r.data);
      setNewBoardModal(false);
      setBoardForm({ title:'', type:'kanban' });
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const deleteBoard = async (b) => {
    if (!confirm(`Board "${b.title}" löschen?`)) return;
    await api.deleteWsBoard(b.id);
    if (activeBoard?.id === b.id) setActiveBoard(null);
    loadBoards();
  };

  const openNewCard = (columnKey='open') => {
    setCardForm({ title:'', content:'', column_key:columnKey, priority:'normal', due_date:'', done:false });
    setCardModal({ card: null });
  };

  const openEditCard = (card) => {
    setCardForm({ title:cleanTitle(card.title), content:card.content||'', column_key:card.column_key,
      priority:card.priority, due_date:card.due_date?.slice(0,10)||'',
      start_date:card.start_date?.slice(0,10)||'',
      done:card.done, category:card.category||'', status:card.status||card.column_key||'open' });
    setCardModal({ card });
  };

  const saveCard = async () => {
    if (!cardForm.title) return;
    setSaving(true);
    try {
      if (cardModal.card) await api.updateWsCard(cardModal.card.id, cardForm);
      else                await api.createWsCard(activeBoard.id, cardForm);
      setCardModal(null);
      loadCards(activeBoard.id);
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const deleteCard = async () => {
    if (!confirm('Karte löschen?')) return;
    await api.deleteWsCard(cardModal.card.id);
    setCardModal(null);
    loadCards(activeBoard.id);
  };

  const toggleDone = async (card) => {
    await api.updateWsCard(card.id, { ...card, done: !card.done });
    loadCards(activeBoard.id);
  };

  const moveCard = async (card, newCol) => {
    await api.updateWsCard(card.id, { ...card, column_key: newCol });
    loadCards(activeBoard.id);
  };

  // Inline-Aufgabe hinzufügen (nach Index insertAfterIdx unter offenen Karten)
  const addInlineCard = async (title, insertAfterIdx) => {
    if (!activeBoard) return;
    try {
      await api.createWsCard(activeBoard.id, {
        title, column_key:'open', priority:'normal', done:false,
      });
      loadCards(activeBoard.id);
    } catch(e) { alert(e.message); }
  };

  // Drag-to-reorder: tausche Position in der lokalen Liste und persistiere
  const reorderCards = async (fromIdx, toIdx) => {
    const openCards = cards.filter(c => !c.done);
    const rest      = cards.filter(c => c.done);
    const reordered = [...openCards];
    const [moved]   = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const updated   = [...reordered, ...rest];
    setCards(updated);
    // Positionen speichern
    await Promise.all(reordered.map((c, i) => api.updateWsCard(c.id, { ...c, position: i })));
  };

  const type = activeBoard ? activeBoard.type : null;

  return (
    <div className="workspace-layout">
      {/* Sidebar: Board-Liste */}
      <div style={{width:240,borderRight:'1px solid var(--border)',background:'var(--bg-muted,#f9fafb)',display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{padding:'16px 16px 8px',fontWeight:800,fontSize:14,color:'var(--text-primary)'}}>
          <i className="ti ti-layout-board" style={{marginRight:8}}/>Workspace
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'4px 8px'}}>
          {loading ? <Spinner dark/> : boards.length===0 ? (
            <div style={{padding:16,fontSize:12,color:'var(--text-tertiary)',textAlign:'center'}}>Noch kein Board</div>
          ) : boards.map(b=>(
            <div key={b.id}
              onClick={()=>setActiveBoard(b)}
              style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,cursor:'pointer',
                background:activeBoard?.id===b.id?'#fff':'transparent',
                boxShadow:activeBoard?.id===b.id?'0 1px 4px rgba(0,0,0,0.08)':'none',
                marginBottom:2,
              }}>
              <i className={`ti ${b.icon}`} style={{fontSize:16,color:b.color||'#2D9CDB'}}/>
              <span style={{fontSize:13,fontWeight:600,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.title}</span>
              <button onClick={e=>{e.stopPropagation();deleteBoard(b);}}
                style={{background:'none',border:'none',cursor:'pointer',color:'#d1d5db',fontSize:14,padding:2}}
                title="Löschen"><i className="ti ti-trash"/></button>
            </div>
          ))}
        </div>
        <div style={{padding:12,borderTop:'1px solid var(--border)'}}>
          <button className="btn primary" style={{width:'100%'}} onClick={()=>setNewBoardModal(true)}>
            <i className="ti ti-plus"/> Neues Board
          </button>
        </div>
      </div>

      {/* Hauptbereich */}
      <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>
        {!activeBoard ? (
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,color:'var(--text-secondary)'}}>
            <i className="ti ti-layout-board" style={{fontSize:64,color:'#d1d5db'}}/>
            <div style={{fontSize:16,fontWeight:700}}>Wähle ein Board aus</div>
            <div style={{fontSize:13}}>oder erstelle ein neues Board links unten</div>
          </div>
        ) : (
          <>
            {/* Board Header */}
            <div style={{padding:'16px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,background:'#fff'}}>
              <i className={`ti ${activeBoard.icon}`} style={{fontSize:20,color:activeBoard.color}}/>
              <input
                defaultValue={activeBoard.title}
                key={activeBoard.id}
                onBlur={async e => {
                  const newTitle = e.target.value.trim();
                  if (newTitle && newTitle !== activeBoard.title) {
                    await api.updateWsBoard(activeBoard.id, { ...activeBoard, title: newTitle });
                    setActiveBoard(b => ({ ...b, title: newTitle }));
                    setBoards(bs => bs.map(b => b.id===activeBoard.id ? {...b,title:newTitle} : b));
                  }
                }}
                onKeyDown={e => e.key==='Enter' && e.target.blur()}
                style={{fontSize:18,fontWeight:800,border:'none',outline:'none',background:'transparent',
                  borderBottom:'2px solid transparent',cursor:'text',minWidth:120,
                  borderRadius:0,padding:'2px 0'}}
                onFocus={e=>e.target.style.borderBottomColor='#2D9CDB'}
                onBlurCapture={e=>e.target.style.borderBottomColor='transparent'}
              />
              <span className="badge gray">{WS_TYPES[activeBoard.type]?.label}</span>
              <div style={{flex:1}}/>
              {type!=='notes' && (
                <button className="btn primary" onClick={()=>openNewCard()}>
                  <i className="ti ti-plus"/> Hinzufügen
                </button>
              )}
            </div>

            {/* Board Content */}
            <div style={{flex:1,padding:24,overflowX: type==='kanban'?'auto':'hidden'}}>
              {cardsLoading ? <Spinner dark/> : (

                /* ── KANBAN ── */
                type==='kanban' ? (
                  <div style={{display:'flex',gap:16,alignItems:'flex-start',minWidth:'fit-content'}}>
                    {KAN_COLS.map(col=>{
                      const colCards = cards.filter(c=>c.column_key===col.key);
                      return (
                        <div key={col.key} style={{width:300,flexShrink:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                            <span style={{width:10,height:10,borderRadius:'50%',background:col.color,display:'inline-block'}}/>
                            <span style={{fontWeight:700,fontSize:14}}>{col.label}</span>
                            <span className="badge gray" style={{fontSize:11}}>{colCards.length}</span>
                            <div style={{flex:1}}/>
                            <button className="btn xs ghost" onClick={()=>openNewCard(col.key)}>
                              <i className="ti ti-plus"/>
                            </button>
                          </div>
                          <div style={{display:'flex',flexDirection:'column',gap:8}}>
                            {colCards.map(card=>(
                              <div key={card.id} onClick={()=>openEditCard(card)}
                                style={{background:'#fff',border:'1px solid var(--border)',borderRadius:12,
                                  padding:'12px 14px',cursor:'pointer',boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
                                  borderLeft:`3px solid ${PRIO_COLORS2[card.priority]||'#2D9CDB'}`,
                                }}>
                                <div style={{fontWeight:600,fontSize:13,marginBottom:6}}>{card.title}</div>
                                {card.content && <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:8,lineHeight:1.5}}>{card.content.slice(0,80)}{card.content.length>80?'…':''}</div>}
                                <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                                  {card.due_date && <span style={{fontSize:11,color:'var(--text-tertiary)'}}><i className="ti ti-calendar"/> {fmtDate(card.due_date)}</span>}
                                  {col.key!=='done' && <button onClick={e=>{e.stopPropagation();moveCard(card,'done');}} style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',color:'#10b981',fontSize:13}} title="Erledigt"><i className="ti ti-circle-check"/></button>}
                                </div>
                              </div>
                            ))}
                            {colCards.length===0 && <div style={{fontSize:12,color:'var(--text-tertiary)',textAlign:'center',padding:'20px 0',border:'2px dashed var(--border)',borderRadius:10}}>Leer</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                /* ── TO-DO LISTE (Notion-Style Tabelle) ── */
                ) : type==='todos' ? (
                  <NotionTodoTable cards={cards} onEdit={openEditCard} onToggle={toggleDone}
                    onAddInline={addInlineCard} onReorder={reorderCards}/>

                /* ── NOTIZEN / SCHWARZES BRETT ── */
                ) : (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
                    <div onClick={()=>openNewCard()}
                      style={{background:'#fff',border:'2px dashed var(--border)',borderRadius:14,padding:24,
                        cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                        flexDirection:'column',gap:8,color:'var(--text-tertiary)',minHeight:160}}>
                      <i className="ti ti-plus" style={{fontSize:28}}/>
                      <span style={{fontSize:13}}>Neue Notiz</span>
                    </div>
                    {cards.map(card=>(
                      <div key={card.id} onClick={()=>openEditCard(card)}
                        style={{background: type==='bulletin'?`${activeBoard.color}15`:'#fff',
                          border:`1px solid ${type==='bulletin'?activeBoard.color+'40':'var(--border)'}`,
                          borderRadius:14,padding:20,cursor:'pointer',
                          boxShadow:'0 2px 8px rgba(0,0,0,0.06)',minHeight:160}}>
                        <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>{card.title}</div>
                        <div style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{card.content}</div>
                        <div style={{marginTop:12,fontSize:11,color:'var(--text-tertiary)'}}>{fmtDate(card.created_at)}</div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>

      {/* Neues Board Modal */}
      {newBoardModal && (
        <Modal open title="Neues Board erstellen" maxWidth={400} onClose={()=>setNewBoardModal(false)}
          footer={<><button className="btn" onClick={()=>setNewBoardModal(false)}>Abbrechen</button><button className="btn primary" onClick={createBoard} disabled={saving||!boardForm.title}>Erstellen</button></>}>
          <FormGroup label="Titel *">
            <input value={boardForm.title} onChange={e=>setBoardForm(f=>({...f,title:e.target.value}))} placeholder="z.B. Sprint Juni"/>
          </FormGroup>
          <FormGroup label="Typ">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:4}}>
              {Object.entries(WS_TYPES).map(([k,v])=>(
                <div key={k} onClick={()=>setBoardForm(f=>({...f,type:k}))}
                  style={{padding:'10px 12px',borderRadius:10,border:`2px solid ${boardForm.type===k?v.color:'var(--border)'}`,
                    cursor:'pointer',display:'flex',alignItems:'center',gap:8,background:boardForm.type===k?`${v.color}15`:'#fff'}}>
                  <i className={`ti ${v.icon}`} style={{color:v.color,fontSize:18}}/>
                  <span style={{fontSize:13,fontWeight:600}}>{v.label}</span>
                </div>
              ))}
            </div>
          </FormGroup>
        </Modal>
      )}

      {/* Karten Modal */}
      {cardModal && (
        <Modal open title={cardModal.card?'Bearbeiten':'Neue Karte'} maxWidth={480} onClose={()=>setCardModal(null)}
          footer={<>
            {cardModal.card && <button className="btn ghost danger" onClick={deleteCard}>Löschen</button>}
            <div style={{flex:1}}/>
            <button className="btn" onClick={()=>setCardModal(null)}>Abbrechen</button>
            <button className="btn primary" onClick={saveCard} disabled={saving||!cardForm.title}>Speichern</button>
          </>}>
          <FormGroup label="Titel *">
            <input value={cardForm.title} onChange={e=>setCardForm(f=>({...f,title:e.target.value}))} placeholder="Aufgabe oder Thema"/>
          </FormGroup>
          {type==='kanban' && (
            <FormRow>
              <FormGroup label="Spalte">
                <select value={cardForm.column_key} onChange={e=>setCardForm(f=>({...f,column_key:e.target.value}))}>
                  {KAN_COLS.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Priorität">
                <select value={cardForm.priority} onChange={e=>setCardForm(f=>({...f,priority:e.target.value}))}>
                  <option value="low">Niedrig</option>
                  <option value="normal">Normal</option>
                  <option value="high">Hoch</option>
                  <option value="urgent">Dringend</option>
                </select>
              </FormGroup>
            </FormRow>
          )}
          {type==='todos' && (
            <FormRow>
              <FormGroup label="Fälligkeit">
                <input type="date" value={cardForm.due_date} onChange={e=>setCardForm(f=>({...f,due_date:e.target.value}))}/>
              </FormGroup>
              <FormGroup label="Priorität">
                <select value={cardForm.priority} onChange={e=>setCardForm(f=>({...f,priority:e.target.value}))}>
                  <option value="low">Niedrig</option>
                  <option value="normal">Normal</option>
                  <option value="high">Hoch</option>
                  <option value="urgent">Dringend</option>
                </select>
              </FormGroup>
            </FormRow>
          )}
          {type==='todos' && (
            <FormRow>
              <FormGroup label="Kategorie">
                <select value={cardForm.category||''} onChange={e=>setCardForm(f=>({...f,category:e.target.value}))}>
                  <option value="">— Keine —</option>
                  {WS_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Status">
                <select value={cardForm.status||'open'} onChange={e=>setCardForm(f=>({...f,status:e.target.value,column_key:e.target.value,done:e.target.value==='done'}))}>
                  <option value="open">Not started</option>
                  <option value="inprogress">In progress</option>
                  <option value="done">Done</option>
                </select>
              </FormGroup>
            </FormRow>
          )}
          <FormGroup label={type==='notes'||type==='bulletin'?'Text':'Beschreibung'}>
            <textarea value={cardForm.content} onChange={e=>setCardForm(f=>({...f,content:e.target.value}))} rows={type==='notes'||type==='bulletin'?8:4}/>
          </FormGroup>
        </Modal>
      )}
    </div>
  );
}

export function Settings() {
  const { data, loading, reload } = useData(()=>api.company());
  const [co, setCo] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(()=>{ if(data?.company) setCo(data.company); },[data]);
  const save = async()=>{ try{ await api.updateCompany(co); setSaved(true); setTimeout(()=>setSaved(false),2000); }catch(e){alert(e.message);} };
  if (loading || !co) return <div className="page-body"><Spinner dark/></div>;
  const s = data?.settings || {};
  return (
    <div className="page-body" style={{maxWidth:640}}>
      <BankingSettings/>
      <div className="card">
        <div className="card-title"><i className="ti ti-building"/>Unternehmensdaten</div>
        <FormGroup label="Firmenname"><input value={co.name||''} onChange={e=>setCo(c=>({...c,name:e.target.value}))}/></FormGroup>
        <FormRow>
          <FormGroup label="UID-Nummer"><input value={co.uid_number||''} onChange={e=>setCo(c=>({...c,uid_number:e.target.value}))}/></FormGroup>
          <FormGroup label="E-Mail"><input value={co.email||''} onChange={e=>setCo(c=>({...c,email:e.target.value}))}/></FormGroup>
        </FormRow>
        <FormRow><FormGroup label="Straße"><input value={co.street||''} onChange={e=>setCo(c=>({...c,street:e.target.value}))}/></FormGroup><FormGroup label="Nr." style={{maxWidth:90}}><input value={co.house_number||''} onChange={e=>setCo(c=>({...c,house_number:e.target.value}))}/></FormGroup></FormRow>
        <FormRow>
          <FormGroup label="PLZ"><input value={co.zip||''} onChange={e=>setCo(c=>({...c,zip:e.target.value}))}/></FormGroup>
          <FormGroup label="Ort"><input value={co.city||''} onChange={e=>setCo(c=>({...c,city:e.target.value}))}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="IBAN"><input value={co.iban||''} onChange={e=>setCo(c=>({...c,iban:e.target.value}))}/></FormGroup>
          <FormGroup label="Bank"><input value={co.bank_name||''} onChange={e=>setCo(c=>({...c,bank_name:e.target.value}))}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Firmenbuchnummer"><input value={co.company_register_nr||''} onChange={e=>setCo(c=>({...c,company_register_nr:e.target.value}))}/></FormGroup>
          <FormGroup label="Firmenbuchgericht"><input value={co.company_register_court||''} onChange={e=>setCo(c=>({...c,company_register_court:e.target.value}))}/></FormGroup>
        </FormRow>
      </div>
      <div className="card">
        <div className="card-title"><i className="ti ti-adjustments"/>Steuer- & Systemeinstellungen</div>
        {[
          ['Kleinunternehmerregelung', s.small_business?'Aktiv':'Nein (USt-pflichtig)', s.small_business?'amber':'green'],
          ['Versteuerungsart', s.taxation_type==='ist'?'Ist-Besteuerung':'Soll-Besteuerung', 'blue'],
          ['Standard-USt-Satz', `${s.default_vat_rate||20} %`, 'amber'],
          ['Standard-Zahlungsziel', `${s.default_payment_days||14} Tage netto`, 'gray'],
          ['Rechnungsprefix', s.invoice_prefix||'RE', 'gray'],
          ['Währung', s.default_currency||'EUR', 'gray'],
        ].map(([k,v,c])=>(
          <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'0.5px solid var(--border)',fontSize:13}}>
            <span style={{color:'var(--text-secondary)'}}>{k}</span>
            <span className={`badge ${c}`}>{v}</span>
          </div>
        ))}
      </div>
      <GoogleDriveSettings/>
      <div style={{textAlign:'right'}}>
        <button className="btn primary" onClick={save}>{saved?<><i className="ti ti-check"/>Gespeichert!</>:<><i className="ti ti-device-floppy"/>Einstellungen speichern</>}</button>
      </div>
    </div>
  );
}

// ─── GOOGLE DRIVE SETTINGS ────────────────────────────────────────────────────
function GoogleDriveSettings() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.driveStatus();
      setStatus(r);
    } catch (_) { setStatus(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const r = await api.driveConnectUrl();
      const win = window.open(r.url, '_blank', 'width=600,height=700');
      const handler = (e) => {
        if (e.data === 'drive-connected') {
          window.removeEventListener('message', handler);
          win?.close();
          load();
        }
      };
      window.addEventListener('message', handler);
    } catch(e) { alert(e.message); setConnecting(false); }
  };

  const disconnect = async () => {
    if (!window.confirm('Google Drive wirklich trennen?')) return;
    await api.driveDisconnect();
    setStatus(null);
  };

  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-brand-google-drive"/>Google Drive</div>
      {loading ? <Spinner dark/> : status?.connected ? (
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <span className="badge green"><i className="ti ti-check"/> Verbunden</span>
            <span style={{fontSize:12,color:'var(--text-secondary)'}}>
              seit {fmtDate(status.connectedAt)}
            </span>
          </div>
          <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:12}}>
            Anlagenfotos werden automatisch in Google Drive gespeichert.
            Ordner-ID: <code style={{fontSize:11}}>{status.folderId}</code>
          </p>
          <button className="btn ghost danger" onClick={disconnect}>
            <i className="ti ti-unlink"/> Verbindung trennen
          </button>
        </div>
      ) : (
        <div>
          <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:12}}>
            Verbinde dein Google Drive, um Anlagenfotos automatisch zu sichern und von überall darauf zuzugreifen.
          </p>
          <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:16,padding:'8px 12px',background:'var(--bg-muted,#f5f7fa)',borderRadius:8}}>
            ⚠️ Voraussetzung: Google Cloud Console → OAuth2-Zugangsdaten in <code>.env</code> eintragen (<code>GOOGLE_CLIENT_ID</code> + <code>GOOGLE_CLIENT_SECRET</code>)
          </p>
          <button className="btn primary" onClick={connect} disabled={connecting}>
            {connecting ? <Spinner/> : <><i className="ti ti-brand-google-drive"/> Mit Google Drive verbinden</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── BANKING SETTINGS ────────────────────────────────────────────────────────
function BankingSettings() {
  const { data: status, loading: statusLoading, reload } = useData(() => api.bankingStatus());
  const { data: instData } = useData(() => api.bankingInstitutions());
  const [selectedBank, setSelectedBank]   = useState(null);
  const [connecting, setConnecting]       = useState(false);
  const [completing, setCompleting]       = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [balance, setBalance]             = useState(null);
  const [msg, setMsg]                     = useState('');

  const institutions = instData?.data || [];

  // Nach OAuth-Redirect: /banking-callback → complete aufrufen
  useEffect(() => {
    if (window.location.pathname === '/banking-callback') {
      setCompleting(true);
      api.bankingComplete()
        .then(() => { reload(); window.history.replaceState({}, '', '/'); })
        .catch(e => setMsg('Fehler beim Verbinden: ' + e.message))
        .finally(() => setCompleting(false));
    }
  }, []);

  useEffect(() => {
    if (status?.status === 'linked') {
      api.bankingBalance().then(setBalance).catch(()=>{});
    }
  }, [status?.status]);

  const connect = async () => {
    if (!selectedBank) { setMsg('Bitte zuerst eine Bank auswählen.'); return; }
    setConnecting(true); setMsg('');
    try {
      const { link } = await api.bankingConnect({ institutionId: selectedBank.id, institutionName: selectedBank.name });
      window.location.href = link;
    } catch(e) { setMsg(e.message); setConnecting(false); }
  };

  const disconnect = async () => {
    if (!confirm('Bankverbindung wirklich trennen?')) return;
    setDisconnecting(true);
    try { await api.bankingDisconnect(); reload(); setBalance(null); setSelectedBank(null); }
    catch(e) { setMsg(e.message); }
    finally { setDisconnecting(false); }
  };

  if (statusLoading) return null;
  const isLinked = status?.status === 'linked';

  return (
    <div className="card" style={{marginBottom:16}}>
      <div className="card-title"><i className="ti ti-building-bank"/>Bankkonto verknüpfen</div>

      {msg && <Alert type="danger">{msg}</Alert>}
      {completing && <Alert type="info"><i className="ti ti-loader-2"/> Verbindung wird hergestellt...</Alert>}

      {!isLinked ? (
        <>
          <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:16}}>
            Verknüpfe dein Bankkonto um den Kontostand live zu sehen und Zahlungseingänge automatisch Rechnungen zuzuordnen.<br/>
            <strong style={{color:'var(--text)'}}>Datenschutz:</strong> Die Verbindung läuft über Salt Edge Open Banking (EU PSD2) — wir speichern keine Passwörter.
          </p>

          {/* Bankauswahl */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:.6,marginBottom:8}}>Deine Bank auswählen</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>
              {(institutions.length > 0 ? institutions : [
                { id:'raiffeisen_at_oauth',  name:'Raiffeisen' },
                { id:'bawag_at_oauth',       name:'BAWAG P.S.K.' },
                { id:'erstebank_at_oauth',   name:'Erste / Sparkasse' },
                { id:'bankaustria_at_oauth', name:'Bank Austria' },
                { id:'volksbank_at_oauth',   name:'Volksbank' },
              ]).map(bank => (
                <div key={bank.id} onClick={() => setSelectedBank(bank)}
                  style={{padding:'10px 12px',borderRadius:8,cursor:'pointer',border:`2px solid ${selectedBank?.id===bank.id?'var(--accent)':'var(--border)'}`,background:selectedBank?.id===bank.id?'rgba(0,229,255,0.08)':'var(--surface-2)',transition:'all .15s'}}>
                  <div style={{fontWeight:600,fontSize:13,color:selectedBank?.id===bank.id?'var(--accent)':'var(--text)'}}>{bank.name}</div>
                  {bank.bic && <div style={{fontSize:10,color:'var(--text-tertiary)',marginTop:2}}>{bank.bic}</div>}
                </div>
              ))}
            </div>
          </div>

          <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:12}}>
            🔒 Verbindung via <strong>Salt Edge</strong> — sichere EU PSD2 Open Banking Schnittstelle.
          </div>
          <button className="btn primary" onClick={connect} disabled={connecting || !selectedBank}>
            {connecting
              ? <><i className="ti ti-loader-2"/> Weiterleitung...</>
              : <><i className="ti ti-link"/> {selectedBank ? `Mit ${selectedBank.name} verbinden` : 'Bank auswählen'}</>
            }
          </button>
        </>
      ) : (
        <>
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderRadius:10,background:'rgba(74,222,128,0.06)',border:'1px solid rgba(74,222,128,0.2)',marginBottom:16}}>
            <i className="ti ti-circle-check" style={{fontSize:22,color:'var(--green)'}}/>
            <div>
              <div style={{fontWeight:700,fontSize:14}}>{status.institution_name || 'Bank'} verbunden</div>
              <div style={{fontSize:12,color:'var(--text-secondary)'}}>
                {status.account_name || 'Konto'}{status.iban ? ` · ${status.iban}` : ''}
              </div>
            </div>
            {balance && (
              <div style={{marginLeft:'auto',textAlign:'right'}}>
                <div style={{fontSize:22,fontWeight:800,color:'#2D9CDB'}}>
                  {parseFloat(balance.amount).toLocaleString('de-AT',{minimumFractionDigits:2})} €
                </div>
                <div style={{fontSize:11,color:'var(--text-tertiary)'}}>Kontostand</div>
              </div>
            )}
          </div>
          <button className="btn danger sm" onClick={disconnect} disabled={disconnecting}>
            {disconnecting ? 'Trenne...' : <><i className="ti ti-unlink"/> Verbindung trennen</>}
          </button>
        </>
      )}
    </div>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
export function AdminDashboard() {
  const { data, loading, reload } = useData(() => api.company());
  const [co, setCo] = useState(null);
  const [st, setSt] = useState(null);
  const [saved, setSaved] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile]     = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (data?.company) { setCo(data.company); setLogoPreview(data.company.logo_url || null); }
    if (data?.settings) setSt({ ...data.settings });
  }, [data]);

  const saveAll = async () => {
    try {
      // Logo hochladen falls neu gewählt
      if (logoFile) {
        setUploadingLogo(true);
        const fd = new FormData(); fd.append('logo', logoFile);
        await api.uploadLogo(fd);
        setUploadingLogo(false);
      }
      await api.updateCompany({
        name: co.name, legalForm: co.legal_form, address: co.address, zip: co.zip, city: co.city,
        phone: co.phone, email: co.email, website: co.website, uidNumber: co.uid_number,
        taxNumber: co.tax_number, companyRegisterNr: co.company_register_nr,
        companyRegisterCourt: co.company_register_court, bankName: co.bank_name,
        bankAccountHolder: co.bank_account_holder, iban: co.iban, bic: co.bic,
      });
      if (st) {
        await api.updateSettings({
          smallBusiness: st.small_business, taxationType: st.taxation_type,
          defaultVatRate: st.default_vat_rate, defaultCurrency: st.default_currency,
          defaultPaymentDays: st.default_payment_days, invoicePrefix: st.invoice_prefix,
          offerPrefix: st.offer_prefix, reverseChargeEnabled: st.reverse_charge_enabled,
          defaultInvoiceText: st.default_invoice_text,
          invoiceColor: st.invoice_color,
          openaiApiKey: st.openai_api_key,
          smtpHost: st.smtp_host, smtpPort: st.smtp_port, smtpSecure: st.smtp_secure,
          smtpUser: st.smtp_user, smtpPassword: st.smtp_password,
          smtpFromEmail: st.smtp_from_email, smtpFromName: st.smtp_from_name,
        });
      }
      setSaved(true); setLogoFile(null); setTimeout(() => setSaved(false), 2500);
      reload();
    } catch(e) { alert('Fehler: ' + e.message); setUploadingLogo(false); }
  };

  const deleteLogo = async () => {
    try { await api.deleteLogo(); setLogoPreview(null); reload(); } catch(e) { alert(e.message); }
  };

  const pickLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  if (loading || !co) return <div className="page-body"><Spinner dark/></div>;

  return (
    <div className="page-body" style={{maxWidth:760}}>

      {/* ── Logo ── */}
      <div className="card">
        <div className="card-title"><i className="ti ti-photo"/>Firmen-Logo</div>
        <div style={{display:'flex',gap:24,alignItems:'flex-start',flexWrap:'wrap'}}>
          <div style={{flexShrink:0}}>
            <div style={{width:180,height:90,border:'1.5px dashed var(--border-strong)',borderRadius:'var(--radius-md)',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',overflow:'hidden',position:'relative'}}>
              {logoPreview
                ? <img src={logoPreview} alt="Logo" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',padding:8}}/>
                : <div style={{textAlign:'center',color:'var(--text-tertiary)',fontSize:11}}><i className="ti ti-photo" style={{fontSize:24,display:'block',marginBottom:4}}/> Kein Logo</div>
              }
            </div>
            <div style={{marginTop:8,display:'flex',gap:6}}>
              <label className="btn xs primary" style={{cursor:'pointer'}}>
                <i className="ti ti-upload"/>{logoPreview ? 'Ersetzen' : 'Hochladen'}
                <input type="file" accept="image/*" style={{display:'none'}} onChange={pickLogo}/>
              </label>
              {logoPreview && <button className="btn xs danger" onClick={deleteLogo}><i className="ti ti-trash"/></button>}
            </div>
          </div>
          <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.8,paddingTop:4}}>
            <p><strong>Empfehlungen:</strong></p>
            <p>• Format: PNG mit transparentem Hintergrund</p>
            <p>• Mindestgröße: 400 × 200 Pixel</p>
            <p>• Das Logo erscheint auf allen PDFs (Rechnungen, Angebote, Mahnungen)</p>
            <p>• Max. 5 MB</p>
          </div>
        </div>
      </div>

      {/* ── Briefpapier / Rechnungsvorlage ── */}
      <div className="card">
        <div className="card-title"><i className="ti ti-file-text"/>Eigene Rechnungsvorlage (Briefpapier)</div>
        <div style={{display:'flex',gap:24,alignItems:'flex-start',flexWrap:'wrap'}}>
          <div style={{flexShrink:0}}>
            <div style={{width:120,height:170,border:'1.5px dashed var(--border-strong)',borderRadius:'var(--radius-md)',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',overflow:'hidden',position:'relative'}}>
              {co?.letterhead_url
                ? <img src={co.letterhead_url} alt="Briefpapier" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'cover'}}/>
                : <div style={{textAlign:'center',color:'var(--text-tertiary)',fontSize:11,padding:8}}><i className="ti ti-file" style={{fontSize:24,display:'block',marginBottom:4}}/> Kein Briefpapier</div>
              }
            </div>
            <div style={{marginTop:8,display:'flex',gap:6}}>
              <label className="btn xs primary" style={{cursor:'pointer'}}>
                <i className="ti ti-upload"/>{co?.letterhead_url ? 'Ersetzen' : 'Hochladen'}
                <input type="file" accept="image/*,.pdf,.docx,.doc" style={{display:'none'}} onChange={async(e)=>{
                  const file = e.target.files[0]; if (!file) return;
                  try {
                    const fd = new FormData(); fd.append('letterhead', file);
                    await api.uploadLetterhead(fd); reload();
                  } catch(err) { alert('Upload fehlgeschlagen: ' + err.message); }
                }}/>
              </label>
              {co?.letterhead_url && <button className="btn xs danger" onClick={async()=>{ try{ await api.deleteLetterhead(); reload(); }catch(e){alert(e.message);} }}><i className="ti ti-trash"/></button>}
            </div>
          </div>
          <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.9,paddingTop:4}}>
            <p><strong>Wie funktioniert das?</strong></p>
            <p>• Lade dein Briefpapier als PNG/JPG hoch (A4-Format)</p>
            <p>• Es wird als Hintergrund auf allen PDFs verwendet</p>
            <p>• Dein Design (Kopf- &amp; Fußzeile, Logo, etc.) bleibt erhalten</p>
            <p>• Rechnungsdaten werden automatisch darübergelegt</p>
            <p>• Empfohlene Größe: 2480 × 3508 px (A4 bei 300 dpi)</p>
            <p>• Max. 10 MB</p>
            <p style={{marginTop:8,color:'var(--text-tertiary)'}}>Wenn kein Briefpapier hinterlegt ist, wird das Standard-Layout verwendet.</p>
          </div>
        </div>
      </div>

      {/* ── Rechnungsdesign ── */}
      <div className="card">
        <div className="card-title"><i className="ti ti-palette"/>Rechnungsdesign</div>
        <FormRow>
          <FormGroup label="Akzentfarbe (PDF)">
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input type="color" value={st?.invoice_color || '#185fa5'}
                onChange={e => setSt(s => ({...s, invoice_color: e.target.value}))}
                style={{width:40,height:32,padding:2,border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',cursor:'pointer'}}/>
              <input value={st?.invoice_color || '#185fa5'}
                onChange={e => setSt(s => ({...s, invoice_color: e.target.value}))}
                style={{width:100, fontFamily:'monospace'}}
                placeholder="#185fa5"/>
              <div style={{display:'flex',gap:4}}>
                {['#185fa5','#0f6e56','#a32d2d','#854f0b','#444'].map(c=>(
                  <div key={c} onClick={()=>setSt(s=>({...s,invoice_color:c}))}
                    style={{width:20,height:20,borderRadius:'50%',background:c,cursor:'pointer',border:st?.invoice_color===c?'2px solid #fff':'2px solid transparent',outline:st?.invoice_color===c?`2px solid ${c}`:'none'}}/>
                ))}
              </div>
            </div>
          </FormGroup>
          <FormGroup label="Vorschau">
            <div style={{padding:'6px 12px',borderRadius:'var(--radius-sm)',background:st?.invoice_color||'#185fa5',color:'#fff',fontSize:12,fontWeight:500,display:'inline-block'}}>
              RECHNUNG RE-2025-0001
            </div>
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Rechnungsprefix">
            <input value={st?.invoice_prefix||'RE'} onChange={e=>setSt(s=>({...s,invoice_prefix:e.target.value}))} style={{width:80}}/>
          </FormGroup>
          <FormGroup label="Angebotsprefix">
            <input value={st?.offer_prefix||'AN'} onChange={e=>setSt(s=>({...s,offer_prefix:e.target.value}))} style={{width:80}}/>
          </FormGroup>
          <FormGroup label="Standard-Zahlungsziel (Tage)">
            <input type="number" value={st?.default_payment_days||14} min="1" max="90" onChange={e=>setSt(s=>({...s,default_payment_days:parseInt(e.target.value)}))} style={{width:80}}/>
          </FormGroup>
        </FormRow>
      </div>

      {/* ── Unternehmensdaten ── */}
      <div className="card">
        <div className="card-title"><i className="ti ti-building"/>Unternehmensdaten</div>
        <FormGroup label="Firmenname"><input value={co.name||''} onChange={e=>setCo(c=>({...c,name:e.target.value}))}/></FormGroup>
        <FormRow>
          <FormGroup label="UID-Nummer"><input value={co.uid_number||''} onChange={e=>setCo(c=>({...c,uid_number:e.target.value}))}/></FormGroup>
          <FormGroup label="Rechtsform"><input value={co.legal_form||''} onChange={e=>setCo(c=>({...c,legal_form:e.target.value}))} placeholder="GmbH, OG, ..."/></FormGroup>
        </FormRow>
        <FormRow><FormGroup label="Straße"><input value={co.street||''} onChange={e=>setCo(c=>({...c,street:e.target.value}))}/></FormGroup><FormGroup label="Nr." style={{maxWidth:90}}><input value={co.house_number||''} onChange={e=>setCo(c=>({...c,house_number:e.target.value}))}/></FormGroup></FormRow>
        <FormRow>
          <FormGroup label="PLZ"><input value={co.zip||''} onChange={e=>setCo(c=>({...c,zip:e.target.value}))}/></FormGroup>
          <FormGroup label="Ort"><input value={co.city||''} onChange={e=>setCo(c=>({...c,city:e.target.value}))}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Telefon"><input value={co.phone||''} onChange={e=>setCo(c=>({...c,phone:e.target.value}))}/></FormGroup>
          <FormGroup label="E-Mail"><input value={co.email||''} onChange={e=>setCo(c=>({...c,email:e.target.value}))}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="IBAN"><input value={co.iban||''} onChange={e=>setCo(c=>({...c,iban:e.target.value}))}/></FormGroup>
          <FormGroup label="BIC"><input value={co.bic||''} onChange={e=>setCo(c=>({...c,bic:e.target.value}))}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Bank"><input value={co.bank_name||''} onChange={e=>setCo(c=>({...c,bank_name:e.target.value}))}/></FormGroup>
          <FormGroup label="Kontoinhaber"><input value={co.bank_account_holder||''} onChange={e=>setCo(c=>({...c,bank_account_holder:e.target.value}))}/></FormGroup>
        </FormRow>
      </div>

      {/* ── Steuer-Einstellungen ── */}
      <div className="card">
        <div className="card-title"><i className="ti ti-percentage"/>Steuer & System</div>
        <FormRow>
          <FormGroup label="Versteuerungsart">
            <select value={st?.taxation_type||'ist'} onChange={e=>setSt(s=>({...s,taxation_type:e.target.value}))}>
              <option value="ist">Ist-Besteuerung (USt nach Zahlungseingang)</option>
              <option value="soll">Soll-Besteuerung (USt nach Rechnungslegung)</option>
            </select>
          </FormGroup>
          <FormGroup label="Standard-USt-Satz">
            <select value={st?.default_vat_rate||20} onChange={e=>setSt(s=>({...s,default_vat_rate:parseInt(e.target.value)}))}>
              <option value={20}>20 %</option>
              <option value={10}>10 %</option>
              <option value={13}>13 %</option>
              <option value={0}>0 %</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormGroup label="Standard-Schlusstext (Rechnungen)">
          <textarea rows={3} value={st?.default_invoice_text||''} onChange={e=>setSt(s=>({...s,default_invoice_text:e.target.value}))} style={{width:'100%',resize:'vertical'}}/>
        </FormGroup>
      </div>

      {/* ── KI-Einstellungen ── */}
      <div className="card">
        <div className="card-title"><i className="ti ti-robot"/>KI-Einstellungen (Foto-Erkennung)</div>
        <Alert type="info">Der OpenAI API-Key wird für die automatische Erkennung von Eingangsrechnungen per Foto verwendet. Du findest deinen Key unter <strong>platform.openai.com/api-keys</strong>.</Alert>
        <FormGroup label="OpenAI API-Key">
          <input type="password" value={st?.openai_api_key||''} onChange={e=>setSt(s=>({...s,openai_api_key:e.target.value}))} placeholder="sk-..." autoComplete="off"/>
        </FormGroup>
      </div>

      {/* ── E-Mail / SMTP ── */}
      <SmtpSettings st={st} setSt={setSt}/>

      <div style={{textAlign:'right', marginBottom: 24}}>
        <button className="btn primary" onClick={saveAll} disabled={uploadingLogo}>
          {uploadingLogo ? <><i className="ti ti-loader-2"/>Logo wird hochgeladen...</>
           : saved ? <><i className="ti ti-check"/>Gespeichert!</>
           : <><i className="ti ti-device-floppy"/>Alles speichern</>}
        </button>
      </div>
    </div>
  );
}

// ─── SCAN INVOICE – Eingangsrechnung fotografieren → Ausgangsrechnung ────────
export function ScanInvoice({ onNavigate }) {
  const [step, setStep]         = useState('upload'); // upload | scanning | edit | done
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [scanning, setScanning]   = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scanned, setScanned]     = useState(null);   // OCR-Ergebnis
  const [items, setItems]         = useState([]);      // editierbare Positionen
  const [globalMarkup, setGlobalMarkup] = useState(0); // globaler Aufschlag %
  const [form, setForm] = useState({ customerId: '', subject: '', documentDate: today(), paymentDays: 14 });
  const [saving, setSaving] = useState(false);
  const { data: customers } = useData(() => api.customers());

  const pickFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    // Nur Bilder haben eine sinnvolle Vorschau; PDF/DOCX zeigen Dateinamen-Badge
    if (file.type.startsWith('image/')) {
      setImagePreview(URL.createObjectURL(file));
    } else {
      setImagePreview('__file__:' + file.name);
    }
    setScanError(null);
    setStep('upload');
  };

  const scan = async () => {
    if (!imageFile) return;
    setScanning(true); setScanError(null); setStep('scanning');
    try {
      const fd = new FormData(); fd.append('image', imageFile);
      const result = await api.scanReceipt(fd);
      setScanned(result);
      // Items mit Aufschlagsfeldern initialisieren
      setItems((result.items || []).map(it => ({
        description: it.description,
        quantity: parseFloat(it.quantity) || 1,
        unit: it.unit || 'Stk',
        unit_price_net: parseFloat(it.unit_price_net) || 0,
        vat_rate: parseFloat(it.vat_rate) || 20,
        markup: 0,
      })));
      if (result.lieferant) {
        setForm(f => ({ ...f, subject: `Material von ${result.lieferant}` }));
      }
      setStep('edit');
    } catch(e) {
      setScanError(e.message);
      setStep('upload');
    } finally { setScanning(false); }
  };

  // Aufschlag anwenden
  const priceWithMarkup = (basePrice, markupPct) => {
    return Math.round(basePrice * (1 + (parseFloat(markupPct) || 0) / 100) * 100) / 100;
  };

  const updateItem = (i, field, val) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  };

  const addLaborRow = () => {
    setItems(prev => [...prev, { description: 'Montagestunden', quantity: 1, unit: 'Std', unit_price_net: 65, vat_rate: 20, markup: 0 }]);
  };

  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const applyGlobalMarkup = () => {
    setItems(prev => prev.map(it => ({ ...it, markup: parseFloat(globalMarkup) || 0 })));
  };

  // Finale Positionen (mit Aufschlag)
  const finalItems = items.map(it => ({
    description: it.description,
    quantity: parseFloat(it.quantity) || 1,
    unit: it.unit,
    unit_price_net: priceWithMarkup(parseFloat(it.unit_price_net) || 0, it.markup),
    discount_percent: 0,
    vat_rate: parseFloat(it.vat_rate) || 20,
  })).map(calcPos);

  const totals = calcTotals(finalItems);

  const createInvoice = async (finalize) => {
    if (!form.customerId) { alert('Bitte einen Kunden auswählen.'); return; }
    setSaving(true);
    try {
      await api.createInvoice({
        customerId: parseInt(form.customerId),
        documentDate: form.documentDate,
        dueDate: addDays(form.documentDate, parseInt(form.paymentDays) || 14),
        subject: form.subject,
        positions: finalItems,
        ...totals,
        finalize,
      });
      setStep('done');
    } catch(e) { alert('Fehler: ' + e.message); }
    finally { setSaving(false); }
  };

  // ─── Schritt: Upload ────────────────────────────────────────────────────────
  if (step === 'done') return (
    <div className="page-body">
      <div className="card" style={{textAlign:'center',padding:48}}>
        <i className="ti ti-circle-check" style={{fontSize:56,color:'var(--green)',display:'block',marginBottom:16}}/>
        <div style={{fontSize:18,fontWeight:600,marginBottom:8}}>Rechnung erstellt!</div>
        <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:24}}>Die Rechnung wurde aus dem gescannten Beleg erstellt.</div>
        <div style={{display:'flex',gap:10,justifyContent:'center'}}>
          <button className="btn primary" onClick={()=>onNavigate?.('invoices')}><i className="ti ti-file-invoice"/>Zur Rechnungsliste</button>
          <button className="btn" onClick={()=>{ setStep('upload'); setImageFile(null); setImagePreview(null); setScanned(null); setItems([]); }}><i className="ti ti-camera"/>Neuen Scan starten</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-body">
      {/* Fortschrittsanzeige */}
      <div style={{display:'flex',gap:0,marginBottom:24,borderRadius:'var(--radius-lg)',overflow:'hidden',border:'1px solid var(--border)'}}>
        {[
          {key:'upload',   label:'1. Datei wählen',  icon:'ti-upload'},
          {key:'scanning', label:'2. KI-Erkennung',   icon:'ti-robot'},
          {key:'edit',     label:'3. Rechnung prüfen', icon:'ti-edit'},
        ].map((s,i) => (
          <div key={s.key} style={{flex:1,padding:'10px 16px',background:step===s.key?'var(--accent)':['scanning','edit','done'].includes(step)&&i<['upload','scanning','edit'].indexOf(step)?'var(--accent-light)':'var(--bg)',color:step===s.key?'#fff':'var(--text-secondary)',display:'flex',alignItems:'center',gap:8,fontSize:12,fontWeight:step===s.key?600:400,borderRight:i<2?'1px solid var(--border)':'none'}}>
            <i className={`ti ${s.icon}`}/>{s.label}
          </div>
        ))}
      </div>

      {step === 'upload' && (
        <div className="card" style={{maxWidth:520}}>
          <div className="card-title"><i className="ti ti-camera"/>Eingangsrechnung hochladen</div>
          <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:16,lineHeight:1.7}}>
            Lade die Rechnung hoch – als Foto, PDF oder Word-Dokument.<br/>
            Die KI erkennt alle Positionen automatisch.
          </div>

          <label style={{display:'block',border:'2px dashed var(--border-strong)',borderRadius:'var(--radius-lg)',padding:32,textAlign:'center',cursor:'pointer',background:'var(--bg-secondary)',marginBottom:16,transition:'border-color 0.2s'}}>
            {imagePreview
              ? imagePreview.startsWith('__file__:')
                ? <div style={{padding:16}}>
                    <i className="ti ti-file-text" style={{fontSize:48,color:'var(--accent)',display:'block',marginBottom:8}}/>
                    <div style={{fontWeight:600,fontSize:14,wordBreak:'break-all'}}>{imagePreview.replace('__file__:','')}</div>
                    <div style={{fontSize:12,color:'var(--text-tertiary)',marginTop:4}}>Bereit zum Scannen</div>
                  </div>
                : <img src={imagePreview} alt="Vorschau" style={{maxWidth:'100%',maxHeight:280,borderRadius:'var(--radius-md)',objectFit:'contain'}}/>
              : <>
                  <i className="ti ti-upload" style={{fontSize:40,color:'var(--accent)',display:'block',marginBottom:12,opacity:0.7}}/>
                  <div style={{fontWeight:500,marginBottom:4}}>Klicken zum Datei wählen</div>
                  <div style={{fontSize:12,color:'var(--text-tertiary)'}}>JPG · PNG · PDF · DOCX – bis 25 MB</div>
                </>
            }
            <input type="file" accept="image/*,.pdf,.docx,.doc" capture="environment" style={{display:'none'}} onChange={pickFile}/>
          </label>

          {scanError && <Alert type="danger"><i className="ti ti-alert-circle"/>{scanError}</Alert>}

          {imagePreview && (
            <div style={{display:'flex',gap:8}}>
              <label className="btn" style={{cursor:'pointer'}}>
                <i className="ti ti-refresh"/>Andere Datei
                <input type="file" accept="image/*,.pdf,.docx,.doc" style={{display:'none'}} onChange={pickFile}/>
              </label>
              <button className="btn primary" onClick={scan} disabled={scanning} style={{flex:1}}>
                <i className="ti ti-robot"/>KI-Erkennung starten
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'scanning' && (
        <div className="card" style={{maxWidth:520,textAlign:'center',padding:48}}>
          <div style={{width:64,height:64,margin:'0 auto 20px',borderRadius:'50%',background:'var(--accent-light)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <i className="ti ti-robot" style={{fontSize:28,color:'var(--accent)'}}/>
          </div>
          <div style={{fontWeight:600,fontSize:15,marginBottom:8}}>KI analysiert die Rechnung...</div>
          <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:20}}>GPT-4 Vision erkennt Positionen, Mengen und Preise</div>
          <Spinner dark/>
        </div>
      )}

      {step === 'edit' && (
        <>
          {/* Lieferanten-Info */}
          {scanned?.lieferant && (
            <Alert type="info" style={{marginBottom:16}}>
              <i className="ti ti-check"/>
              <div><strong>Erkannt:</strong> {scanned.lieferant}{scanned.rechnungsnummer ? ` · RE-Nr: ${scanned.rechnungsnummer}` : ''}{scanned.rechnungsdatum ? ` · Datum: ${scanned.rechnungsdatum}` : ''}</div>
            </Alert>
          )}

          {/* Globaler Aufschlag */}
          <div className="card" style={{marginBottom:16}}>
            <div className="card-title"><i className="ti ti-percentage"/>Aufschlag auf alle Materialien</div>
            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <input type="number" value={globalMarkup} onChange={e=>setGlobalMarkup(e.target.value)}
                  style={{width:80}} min="0" max="500" step="5" placeholder="0"/>
                <span style={{fontSize:13,color:'var(--text-secondary)'}}>% Aufschlag</span>
              </div>
              <button className="btn primary" onClick={applyGlobalMarkup}><i className="ti ti-check"/>Auf alle anwenden</button>
              <span style={{fontSize:12,color:'var(--text-tertiary)'}}>Oder individuell pro Position einstellen</span>
            </div>
          </div>

          {/* Positionen */}
          <div className="card" style={{marginBottom:16}}>
            <div className="card-title" style={{marginBottom:12}}><i className="ti ti-list"/>Positionen (bearbeitbar)</div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{background:'var(--accent)'}}>
                    {['Beschreibung','Menge','Einheit','EK-Preis netto','Aufschlag %','VK-Preis netto','USt %',''].map(h=>(
                      <th key={h} style={{padding:'6px 8px',color:'#fff',fontWeight:500,textAlign:'left',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} style={{borderBottom:'1px solid var(--border)',background:i%2===0?'var(--bg-secondary)':''}}>
                      <td style={{padding:'4px 6px'}}>
                        <input value={it.description} onChange={e=>updateItem(i,'description',e.target.value)} style={{width:'100%',minWidth:160,fontSize:12}}/>
                      </td>
                      <td style={{padding:'4px 6px'}}>
                        <input type="number" value={it.quantity} onChange={e=>updateItem(i,'quantity',e.target.value)} style={{width:60,fontSize:12}} step="0.01" min="0"/>
                      </td>
                      <td style={{padding:'4px 6px'}}>
                        <input value={it.unit} onChange={e=>updateItem(i,'unit',e.target.value)} style={{width:50,fontSize:12}}/>
                      </td>
                      <td style={{padding:'4px 6px',textAlign:'right',color:'var(--text-secondary)',fontSize:12}}>
                        {fmt(it.unit_price_net)}
                      </td>
                      <td style={{padding:'4px 6px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:4}}>
                          <input type="number" value={it.markup} onChange={e=>updateItem(i,'markup',e.target.value)} style={{width:55,fontSize:12}} step="5" min="0"/>
                          <span style={{fontSize:11,color:'var(--text-tertiary)'}}>%</span>
                        </div>
                      </td>
                      <td style={{padding:'4px 6px',textAlign:'right',fontWeight:600,color:'var(--accent)'}}>
                        {fmt(priceWithMarkup(parseFloat(it.unit_price_net)||0, it.markup))}
                      </td>
                      <td style={{padding:'4px 6px'}}>
                        <select value={it.vat_rate} onChange={e=>updateItem(i,'vat_rate',e.target.value)} style={{width:60,fontSize:11}}>
                          <option value={20}>20%</option><option value={10}>10%</option><option value={13}>13%</option><option value={0}>0%</option>
                        </select>
                      </td>
                      <td style={{padding:'4px 6px'}}>
                        <button className="btn xs danger" onClick={()=>removeItem(i)}><i className="ti ti-trash"/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{marginTop:10,display:'flex',gap:8}}>
              <button className="btn xs" onClick={addLaborRow}><i className="ti ti-plus"/>Montagestunden</button>
              <button className="btn xs" onClick={()=>setItems(prev=>[...prev,{description:'',quantity:1,unit:'Std',unit_price_net:0,vat_rate:20,markup:0}])}><i className="ti ti-plus"/>Freie Position</button>
            </div>
          </div>

          {/* Rechnungsdetails */}
          <div className="card" style={{marginBottom:16}}>
            <div className="card-title"><i className="ti ti-file-invoice"/>Rechnungsdetails</div>
            <FormRow>
              <FormGroup label="Kunde" required>
                <select value={form.customerId} onChange={e=>setForm(f=>({...f,customerId:e.target.value}))}>
                  <option value="">Bitte wählen...</option>
                  {(customers?.data||[]).map(c=><option key={c.id} value={c.id}>{c.company_name||c.first_name+' '+c.last_name}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Rechnungsdatum">
                <input type="date" value={form.documentDate} onChange={e=>setForm(f=>({...f,documentDate:e.target.value}))}/>
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Betreff">
                <input value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))}/>
              </FormGroup>
              <FormGroup label="Zahlungsziel (Tage)">
                <input type="number" value={form.paymentDays} onChange={e=>setForm(f=>({...f,paymentDays:e.target.value}))} style={{width:80}}/>
              </FormGroup>
            </FormRow>
            <TotalsBox netto={totals.net_total} ust={totals.vat_total} brutto={totals.gross_total}/>
          </div>

          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginBottom:24}}>
            <button className="btn" onClick={()=>setStep('upload')}><i className="ti ti-arrow-left"/>Zurück</button>
            <button className="btn" onClick={()=>createInvoice(false)} disabled={saving||!form.customerId}>
              <i className="ti ti-device-floppy"/>Als Entwurf speichern
            </button>
            <button className="btn primary" onClick={()=>createInvoice(true)} disabled={saving||!form.customerId}>
              {saving ? <><i className="ti ti-loader-2"/>Speichern...</> : <><i className="ti ti-lock"/>Festschreiben & speichern</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── PROJEKTE ─────────────────────────────────────────────────────────────────

// ─── PROJEKTE ─────────────────────────────────────────────────────────────────
export function Projects({ onNavigate }) {
  const { data, loading, reload } = useData(() => api.projects());
  const { data: custData, reload: custReload } = useData(() => api.customers());
  const { data: offersData } = useData(() => api.offers());
  const { data: invData } = useData(() => api.invoices());
  const customers = custData?.data || [];
  const offers    = offersData?.data || [];
  const invoices  = invData?.data || [];

  const [view, setView]       = useState('list'); // list | detail
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [newTask, setNewTask] = useState('');
  const [newNote, setNewNote] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  // Quick-Kunde anlegen
  const [showQuickCust, setShowQuickCust] = useState(false);
  const [quickCust, setQuickCust]         = useState({ companyName:'', firstName:'', lastName:'', type:'business', email:'', phone:'' });
  const [quickCustSaving, setQuickCustSaving] = useState(false);

  const emptyForm = { name:'', description:'', status:'active', customerId:'', orderNumber:'', siteStreet:'', siteHouseNumber:'', siteZip:'', siteCity:'', contactPerson:'', contactPhone:'', startDate:'', endDate:'', inbetriebnahmedatum:'', offerId:'', invoiceId:'', budgetNet:'', priority:'normal' };
  const [form, setForm] = useState(emptyForm);
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));

  const projects = (data?.data||[]).filter(p => !filterStatus || p.status===filterStatus);

  // Shopify Bulk-Select
  const [selPrj, setSelPrj] = useState(new Set());
  const toggleOnePrj = id => setSelPrj(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllPrj = () => setSelPrj(s => s.size === projects.length ? new Set() : new Set(projects.map(p => p.id)));
  const bulkDeletePrj = async () => {
    if (!confirm(`${selPrj.size} Projekte löschen?`)) return;
    await Promise.all([...selPrj].map(id => api.deleteProject(id).catch(() => {})));
    setSelPrj(new Set()); reload();
  };

  const openDetail = async (p) => {
    try {
      const detail = await api.project(p.id);
      setSelected(detail);
      setView('detail');
    } catch(e) { alert(e.message); }
  };

  const saveProject = async () => {
    if (!form.name) { setErr('Bitte einen Projektnamen eingeben.'); return; }
    if (!form.customerId) { setErr('Bitte einen Kunden auswählen.'); return; }
    setSaving(true); setErr('');
    try {
      if (showEdit && selected) {
        await api.updateProject(selected.id, form);
        const updated = await api.project(selected.id);
        setSelected(updated);
        setShowEdit(false);
      } else {
        await api.createProject(form);
        setShowNew(false);
        reload();
      }
      setForm(emptyForm);
    } catch(e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const saveQuickCust = async () => {
    if (!quickCust.companyName && !quickCust.lastName) return;
    setQuickCustSaving(true);
    try {
      const neu = await api.createCustomer({
        type:        quickCust.type,
        companyName: quickCust.companyName,
        firstName:   quickCust.firstName,
        lastName:    quickCust.lastName,
        email:       quickCust.email,
        phone:       quickCust.phone,
      });
      await custReload();                          // Kundenliste aktualisieren
      sf('customerId', String(neu.id));            // neu angelegten Kunden auswählen
      setShowQuickCust(false);
      setQuickCust({ companyName:'', firstName:'', lastName:'', type:'business', email:'', phone:'' });
    } catch(e) { alert('Fehler: ' + e.message); }
    finally { setQuickCustSaving(false); }
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    try {
      await api.createTask(selected.id, { title: newTask });
      setNewTask('');
      const updated = await api.project(selected.id);
      setSelected(updated);
    } catch(e) { alert(e.message); }
  };

  const toggleTask = async (task) => {
    const newStatus = task.status === 'done' ? 'open' : 'done';
    try {
      await api.updateTask(selected.id, task.id, { ...task, status: newStatus });
      const updated = await api.project(selected.id);
      setSelected(updated);
    } catch(e) { alert(e.message); }
  };

  const deleteTask = async (taskId) => {
    try {
      await api.deleteTask(selected.id, taskId);
      const updated = await api.project(selected.id);
      setSelected(updated);
    } catch(e) { alert(e.message); }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    try {
      await api.createNote(selected.id, { note: newNote });
      setNewNote('');
      const updated = await api.project(selected.id);
      setSelected(updated);
    } catch(e) { alert(e.message); }
  };

  // ── Detail-Ansicht ──────────────────────────────────────────────────────────
  if (view === 'detail' && selected) {
    const st = STATUS_PROJEKT[selected.status] || STATUS_PROJEKT.active;
    const openTasks = (selected.tasks||[]).filter(t=>t.status!=='done').length;
    const doneTasks = (selected.tasks||[]).filter(t=>t.status==='done').length;
    return (
      <div className="page-body">
        {/* Breadcrumb */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,fontSize:13}}>
          <button className="btn ghost sm" onClick={()=>{setView('list');reload();}}><i className="ti ti-arrow-left"/>Alle Planungsprojekte</button>
          <span style={{color:'var(--text-tertiary)'}}>/</span>
          <span style={{fontWeight:600}}>{selected.order_number||selected.name}</span>
        </div>

        {/* Header */}
        <div className="card card-0" style={{padding:'16px 20px',marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
              <span style={{fontSize:11,fontWeight:700,color:st.color,textTransform:'uppercase',letterSpacing:1}}>{st.label}</span>
              <span className={`badge ${PRIO_COLOR[selected.priority]||'gray'}`}>{PRIO_LABEL[selected.priority]||'Normal'}</span>
            </div>
            <h2 style={{fontSize:20,fontWeight:700,margin:'0 0 4px'}}>{selected.name}</h2>
            {selected.order_number && <div style={{fontSize:12,fontWeight:700,color:'var(--accent)',background:'rgba(0,229,255,0.08)',padding:'2px 8px',borderRadius:4,display:'inline-block'}}>{selected.order_number}</div>}
            {selected.description && <div style={{marginTop:8,fontSize:13,color:'var(--text-secondary)'}}>{selected.description}</div>}
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {selected.status !== 'commissioned' && selected.status !== 'cancelled' && (
              <button className="btn sm" style={{background:'linear-gradient(135deg,#152248,#2D9CDB)',color:'#fff',border:'none'}}
                onClick={async()=>{
                  if(!selected.customer_id){alert('Kein Kunde zugewiesen – bitte zuerst Kunde ergänzen.');return;}
                  const name = window.prompt('Bezeichnung der Anlage (z.B. "Klimaanlage Büro EG"):', selected.name);
                  if(!name) return;
                  const installDate = window.prompt('Inbetriebnahmedatum (JJJJ-MM-TT):', new Date().toISOString().split('T')[0]);
                  try {
                    const r = await api.commissionProject(selected.id, { name, installDate });
                    alert(`✓ Anlage "${name}" wurde unter Kundenanlagen angelegt (${r.equipment?.order_number}).`);
                    setView('list'); reload();
                  } catch(e){ alert('Fehler: '+e.message); }
                }}>
                <i className="ti ti-rocket"/>Inbetriebnahme → Kundenanlagen
              </button>
            )}
            <button className="btn sm" onClick={()=>{ setForm({name:selected.name,description:selected.description||'',status:selected.status,customerId:selected.customer_id||'',siteStreet:selected.site_street||'',siteHouseNumber:selected.site_house_number||'',siteZip:selected.site_zip||'',siteCity:selected.site_city||'',contactPerson:selected.contact_person||'',contactPhone:selected.contact_phone||'',startDate:selected.start_date?.split('T')[0]||'',endDate:selected.end_date?.split('T')[0]||'',inbetriebnahmedatum:selected.inbetriebnahmedatum?.split('T')[0]||'',offerId:selected.offer_id||'',invoiceId:selected.invoice_id||'',budgetNet:selected.budget_net||'',priority:selected.priority||'normal'}); setShowEdit(true); }}><i className="ti ti-edit"/>Bearbeiten</button>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
          {/* Kunde & Baustelle */}
          <div className="card card-0" style={{padding:'14px 18px'}}>
            <div style={{fontWeight:600,marginBottom:10,fontSize:13}}><i className="ti ti-user" style={{marginRight:6,color:'var(--accent)'}}/>Kunde & Baustelle</div>
            {selected.customer_name && <div style={{marginBottom:6}}><span style={{fontSize:11,color:'var(--text-secondary)'}}>Kunde:</span><br/><strong>{selected.customer_name}</strong></div>}
            {(selected.site_address||selected.site_city) && <div style={{marginBottom:6}}><span style={{fontSize:11,color:'var(--text-secondary)'}}>Baustelle:</span><br/>{selected.site_address && <>{selected.site_address}<br/></>}{selected.site_zip} {selected.site_city}</div>}
            {selected.contact_person && <div style={{marginBottom:4}}><span style={{fontSize:11,color:'var(--text-secondary)'}}>Ansprechpartner:</span><br/>{selected.contact_person}{selected.contact_phone&&<> · <a href={`tel:${selected.contact_phone}`}>{selected.contact_phone}</a></>}</div>}
          </div>
          {/* Zeitraum & Budget */}
          <div className="card card-0" style={{padding:'14px 18px'}}>
            <div style={{fontWeight:600,marginBottom:10,fontSize:13}}><i className="ti ti-calendar" style={{marginRight:6,color:'var(--accent)'}}/>Zeitraum & Finanzen</div>
            {selected.start_date && <div style={{marginBottom:6}}><span style={{fontSize:11,color:'var(--text-secondary)'}}>Start:</span> {fmtDate(selected.start_date)}</div>}
            {selected.end_date   && <div style={{marginBottom:6}}><span style={{fontSize:11,color:'var(--text-secondary)'}}>Ende:</span> {fmtDate(selected.end_date)}</div>}
            {selected.budget_net && <div style={{marginBottom:6}}><span style={{fontSize:11,color:'var(--text-secondary)'}}>Budget netto:</span> <strong>{fmt(selected.budget_net)}</strong></div>}
            {selected.offer_number  && <div style={{marginBottom:4}}><span style={{fontSize:11,color:'var(--text-secondary)'}}>Angebot:</span> <span className="badge gray">{selected.offer_number}</span> {fmt(selected.offer_gross)}</div>}
            {selected.invoice_number && <div><span style={{fontSize:11,color:'var(--text-secondary)'}}>Rechnung:</span> <span className="badge blue">{selected.invoice_number}</span> {fmt(selected.invoice_gross)}</div>}
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          {/* Aufgaben */}
          <div className="card card-0" style={{padding:'14px 18px'}}>
            <div style={{fontWeight:600,marginBottom:10,fontSize:13,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span><i className="ti ti-checklist" style={{marginRight:6,color:'var(--accent)'}}/>Aufgaben</span>
              <span style={{fontSize:11,color:'var(--text-secondary)'}}>{doneTasks}/{doneTasks+openTasks} erledigt</span>
            </div>
            <div style={{display:'flex',gap:6,marginBottom:10}}>
              <input value={newTask} onChange={e=>setNewTask(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addTask()} placeholder="Neue Aufgabe..." style={{flex:1,fontSize:12}}/>
              <button className="btn sm primary" onClick={addTask}><i className="ti ti-plus"/></button>
            </div>
            {(selected.tasks||[]).length===0 ? <div style={{fontSize:12,color:'var(--text-tertiary)',textAlign:'center',padding:'12px 0'}}>Keine Aufgaben</div> :
            (selected.tasks||[]).map(t=>(
              <div key={t.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid var(--border)'}}>
                <input type="checkbox" checked={t.status==='done'} onChange={()=>toggleTask(t)} style={{cursor:'pointer'}}/>
                <span style={{flex:1,fontSize:12,textDecoration:t.status==='done'?'line-through':'none',color:t.status==='done'?'var(--text-tertiary)':'inherit'}}>{t.title}</span>
                {t.due_date && <span style={{fontSize:10,color:'var(--text-tertiary)'}}>{fmtDate(t.due_date)}</span>}
                <button className="btn xs ghost icon" onClick={()=>deleteTask(t.id)}><i className="ti ti-trash" style={{fontSize:11}}/></button>
              </div>
            ))}
          </div>

          {/* Notizen */}
          <div className="card card-0" style={{padding:'14px 18px'}}>
            <div style={{fontWeight:600,marginBottom:10,fontSize:13}}><i className="ti ti-note" style={{marginRight:6,color:'var(--accent)'}}/>Interne Notizen</div>
            <div style={{display:'flex',gap:6,marginBottom:10}}>
              <input value={newNote} onChange={e=>setNewNote(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addNote()} placeholder="Notiz eingeben..." style={{flex:1,fontSize:12}}/>
              <button className="btn sm primary" onClick={addNote}><i className="ti ti-plus"/></button>
            </div>
            {(selected.notes||[]).length===0 ? <div style={{fontSize:12,color:'var(--text-tertiary)',textAlign:'center',padding:'12px 0'}}>Keine Notizen</div> :
            (selected.notes||[]).map(n=>(
              <div key={n.id} style={{padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{fontSize:12}}>{n.note}</div>
                <div style={{fontSize:10,color:'var(--text-tertiary)',marginTop:2}}>{n.author} · {fmtDate(n.created_at)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Edit Modal */}
        <Modal open={showEdit} onClose={()=>setShowEdit(false)} title="Planungsprojekt bearbeiten" maxWidth={560}
          footer={<><button className="btn" onClick={()=>setShowEdit(false)}>Abbrechen</button><button className="btn primary" onClick={saveProject} disabled={saving}>{saving?'Speichern...':'Speichern'}</button></>}>
          {err&&<div style={{marginBottom:12}}><Alert type="danger">{err}</Alert></div>}
          <FormGroup label="Projektname" required><input value={form.name} onChange={e=>sf('name',e.target.value)}/></FormGroup>
          <FormRow>
            <FormGroup label="Status"><select value={form.status} onChange={e=>sf('status',e.target.value)}>{Object.entries(STATUS_PROJEKT).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></FormGroup>
            <FormGroup label="Priorität"><select value={form.priority} onChange={e=>sf('priority',e.target.value)}>{Object.entries(PRIO_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></FormGroup>
          </FormRow>
          <FormGroup label="Beschreibung"><textarea value={form.description} onChange={e=>sf('description',e.target.value)} rows={2}/></FormGroup>
          <FormRow>
            <FormGroup label="Start"><input type="date" value={form.startDate} onChange={e=>sf('startDate',e.target.value)}/></FormGroup>
            <FormGroup label="Ende"><input type="date" value={form.endDate} onChange={e=>sf('endDate',e.target.value)}/></FormGroup>
            <FormGroup label="Inbetriebnahme"><input type="date" value={form.inbetriebnahmedatum||''} onChange={e=>sf('inbetriebnahmedatum',e.target.value)}/></FormGroup>
          </FormRow>
          <FormGroup label="Budget netto (€)"><input type="number" value={form.budgetNet} onChange={e=>sf('budgetNet',e.target.value)} step="0.01"/></FormGroup>
          <FormGroup label="Angebot verknüpfen"><select value={form.offerId} onChange={e=>sf('offerId',e.target.value)}><option value="">— kein Angebot —</option>{offers.map(o=><option key={o.id} value={o.id}>{o.number} · {o.customer_name}</option>)}</select></FormGroup>
          <FormGroup label="Rechnung verknüpfen"><select value={form.invoiceId} onChange={e=>sf('invoiceId',e.target.value)}><option value="">— keine Rechnung —</option>{invoices.map(i=><option key={i.id} value={i.id}>{i.number} · {i.customer_name}</option>)}</select></FormGroup>
        </Modal>
      </div>
    );
  }

  // ── Listen-Ansicht ──────────────────────────────────────────────────────────
  return (
    <div className="page-body">
      <div className="toolbar">
        <div style={{display:'flex',gap:8}}>
          {Object.entries(STATUS_PROJEKT).map(([k,v])=>(
            <button key={k} className={`btn sm ${filterStatus===k?'primary':'ghost'}`} onClick={()=>setFilterStatus(filterStatus===k?'':k)}>
              <span style={{width:6,height:6,borderRadius:'50%',background:v.color,display:'inline-block'}}/>
              {v.label}
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={()=>{setForm(emptyForm);setErr('');setShowNew(true);}}><i className="ti ti-plus"/>Neues Planungsprojekt</button>
      </div>

      <div className="card card-0">
        {selPrj.size > 0 && (
          <div className="bulk-bar">
            <span className="bulk-bar-count">{selPrj.size} ausgewählt</span>
            <button className="btn sm bulk-cancel" onClick={() => setSelPrj(new Set())}>Auswahl aufheben</button>
            <button className="btn sm bulk-delete" onClick={bulkDeletePrj}><i className="ti ti-trash"/>Löschen</button>
          </div>
        )}
        {loading ? <div style={{padding:32,textAlign:'center'}}><Spinner dark/></div> :
         projects.length===0 ? <EmptyState icon="ti-hammer" title="Keine Planungsprojekte" subtitle="Lege dein erstes Planungsprojekt an"/> :
        <div className="table-wrap"><table>
          <thead><tr>
            <th className="cb-col"><input type="checkbox" checked={selPrj.size===projects.length&&projects.length>0} onChange={toggleAllPrj}/></th>
            <th>A-Nr.</th><th>Projektname</th><th>Kunde</th><th>Baustelle</th><th>Status</th><th>Priorität</th><th>Aufgaben</th><th>Start</th><th></th>
          </tr></thead>
          <tbody>{projects.map(p=>{
            const st = STATUS_PROJEKT[p.status]||STATUS_PROJEKT.active;
            return (
              <tr key={p.id} className={selPrj.has(p.id)?'row-selected':''} style={{cursor:'pointer'}} onClick={()=>openDetail(p)}>
                <td className="cb-col" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selPrj.has(p.id)} onChange={()=>toggleOnePrj(p.id)}/></td>
                <td><span style={{fontSize:11,fontWeight:600,color:'var(--accent)',background:'rgba(0,229,255,.08)',padding:'2px 6px',borderRadius:4}}>{p.order_number||'–'}</span></td>
                <td style={{fontWeight:600}}>{p.name}</td>
                <td style={{fontSize:12}}>{p.customer_name||'—'}</td>
                <td style={{fontSize:12}}>{p.site_city||'—'}</td>
                <td><span style={{fontSize:11,fontWeight:700,color:st.color}}>{st.label}</span></td>
                <td><span className={`badge ${PRIO_COLOR[p.priority]||'gray'}`}>{PRIO_LABEL[p.priority]||'Normal'}</span></td>
                <td style={{fontSize:12}}>{p.open_tasks>0?<span style={{color:'var(--amber)',fontWeight:600}}>{p.open_tasks} offen</span>:'✓ alle erledigt'}</td>
                <td style={{fontSize:12}}>{p.start_date?fmtDate(p.start_date):'—'}</td>
                <td onClick={e=>e.stopPropagation()}>
                  <button className="btn xs ghost icon" title="Bearbeiten" onClick={()=>{ setSelected(p); setForm({name:p.name,description:p.description||'',status:p.status,customerId:p.customer_id||'',siteStreet:p.site_street||'',siteHouseNumber:p.site_house_number||'',siteZip:p.site_zip||'',siteCity:p.site_city||'',contactPerson:p.contact_person||'',contactPhone:p.contact_phone||'',startDate:p.start_date?.split('T')[0]||'',endDate:p.end_date?.split('T')[0]||'',inbetriebnahmedatum:p.inbetriebnahmedatum?.split('T')[0]||'',offerId:p.offer_id||'',invoiceId:p.invoice_id||'',budgetNet:p.budget_net||'',priority:p.priority||'normal'}); setShowEdit(true); }}><i className="ti ti-edit"/></button>
                  <button className="btn xs danger icon" title="Löschen" onClick={async()=>{if(confirm(`Projekt "${p.name}" löschen?`)){try{await api.deleteProject(p.id);reload();}catch(e){alert(e.message);}}}}><i className="ti ti-trash"/></button>
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>}
      </div>

      <Modal open={showNew} onClose={()=>setShowNew(false)} title="Neues Planungsprojekt" maxWidth={560}
        footer={<><button className="btn" onClick={()=>setShowNew(false)}>Abbrechen</button><button className="btn primary" onClick={saveProject} disabled={saving||!form.name}>{saving?'Speichern...':'Planungsprojekt anlegen'}</button></>}>
        {err&&<div style={{marginBottom:12}}><Alert type="danger">{err}</Alert></div>}
        <FormRow>
          <FormGroup label="Projektname" required><input value={form.name} onChange={e=>sf('name',e.target.value)} placeholder="z.B. Klimaanlage Bürogebäude Muster GmbH"/></FormGroup>
          <FormGroup label="A-Nummer (leer = automatisch)"><input value={form.orderNumber||''} onChange={e=>sf('orderNumber',e.target.value)} placeholder="A-2026-0001"/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Priorität"><select value={form.priority} onChange={e=>sf('priority',e.target.value)}>{Object.entries(PRIO_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></FormGroup>
          <FormGroup label="Status"><select value={form.status} onChange={e=>sf('status',e.target.value)}>{Object.entries(STATUS_PROJEKT).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></FormGroup>
        </FormRow>
        <FormGroup label="Kunde">
          <div style={{display:'flex',gap:6}}>
            <select value={form.customerId} onChange={e=>{
              const c = customers.find(x=>String(x.id)===e.target.value);
              setForm(f=>({
                ...f,
                customerId:  e.target.value,
                siteStreet: f.siteStreet || c?.street || '',
                siteHouseNumber: f.siteHouseNumber || c?.house_number || '',
                siteZip:     f.siteZip     || c?.zip     || '',
                siteCity:    f.siteCity    || c?.city    || '',
              }));
            }} style={{flex:1}}>
              <option value="">— Bitte Kunden wählen * —</option>
              {customers.map(c=><option key={c.id} value={c.id}>{c.customer_number?`[${c.customer_number}] `:''}{c.company_name||`${c.first_name} ${c.last_name}`}</option>)}
            </select>
            <button type="button" className="btn sm" title="Neuen Kunden anlegen" onClick={()=>setShowQuickCust(true)} style={{whiteSpace:'nowrap'}}>
              <i className="ti ti-user-plus"/>
            </button>
          </div>
        </FormGroup>

        {/* Quick-Kunde Modal */}
        <Modal open={showQuickCust} onClose={()=>setShowQuickCust(false)} title="Schnell: Neuen Kunden anlegen" maxWidth={420}
          footer={<><button className="btn" onClick={()=>setShowQuickCust(false)}>Abbrechen</button><button className="btn primary" onClick={saveQuickCust} disabled={quickCustSaving||(!quickCust.companyName&&!quickCust.lastName)}>{quickCustSaving?'Speichern...':'Anlegen & auswählen'}</button></>}>
          <Alert type="info">Der Kunde wird sofort angelegt und direkt im Projekt ausgewählt. Weitere Details kannst du später unter Kunden ergänzen.</Alert>
          <FormGroup label="Typ">
            <select value={quickCust.type} onChange={e=>setQuickCust(q=>({...q,type:e.target.value}))}>
              <option value="business">Unternehmen</option>
              <option value="private">Privatkunde</option>
            </select>
          </FormGroup>
          {quickCust.type==='business'
            ? <FormGroup label="Firmenname" required><input value={quickCust.companyName} onChange={e=>setQuickCust(q=>({...q,companyName:e.target.value}))} placeholder="z.B. Muster GmbH" autoFocus/></FormGroup>
            : <FormRow>
                <FormGroup label="Vorname"><input value={quickCust.firstName} onChange={e=>setQuickCust(q=>({...q,firstName:e.target.value}))} autoFocus/></FormGroup>
                <FormGroup label="Nachname" required><input value={quickCust.lastName} onChange={e=>setQuickCust(q=>({...q,lastName:e.target.value}))}/></FormGroup>
              </FormRow>
          }
          <FormRow>
            <FormGroup label="E-Mail"><input type="email" value={quickCust.email} onChange={e=>setQuickCust(q=>({...q,email:e.target.value}))}/></FormGroup>
            <FormGroup label="Telefon"><input value={quickCust.phone} onChange={e=>setQuickCust(q=>({...q,phone:e.target.value}))}/></FormGroup>
          </FormRow>
        </Modal>
        <FormGroup label="Beschreibung"><textarea value={form.description} onChange={e=>sf('description',e.target.value)} rows={2} placeholder="Kurze Projektbeschreibung..."/></FormGroup>
        <FormRow><FormGroup label="Baustellenstraße"><input value={form.siteStreet||''} onChange={e=>sf('siteStreet',e.target.value)}/></FormGroup><FormGroup label="Nr." style={{maxWidth:90}}><input value={form.siteHouseNumber||''} onChange={e=>sf('siteHouseNumber',e.target.value)}/></FormGroup></FormRow>
        <FormRow>
          <FormGroup label="PLZ"><input value={form.siteZip} onChange={e=>sf('siteZip',e.target.value)}/></FormGroup>
          <FormGroup label="Ort"><input value={form.siteCity} onChange={e=>sf('siteCity',e.target.value)}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Ansprechpartner vor Ort"><input value={form.contactPerson} onChange={e=>sf('contactPerson',e.target.value)}/></FormGroup>
          <FormGroup label="Telefon"><input value={form.contactPhone} onChange={e=>sf('contactPhone',e.target.value)}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Startdatum"><input type="date" value={form.startDate} onChange={e=>sf('startDate',e.target.value)}/></FormGroup>
          <FormGroup label="Enddatum"><input type="date" value={form.endDate} onChange={e=>sf('endDate',e.target.value)}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Inbetriebnahmedatum"><input type="date" value={form.inbetriebnahmedatum||''} onChange={e=>sf('inbetriebnahmedatum',e.target.value)}/></FormGroup>
          <FormGroup label="Budget netto (€)"><input type="number" value={form.budgetNet} onChange={e=>sf('budgetNet',e.target.value)} step="0.01" min="0" placeholder="0.00"/></FormGroup>
        </FormRow>
        <FormGroup label="Angebot verknüpfen (optional)"><select value={form.offerId} onChange={e=>sf('offerId',e.target.value)}><option value="">— kein Angebot —</option>{offers.map(o=><option key={o.id} value={o.id}>{o.number} – {o.customer_name}</option>)}</select></FormGroup>
      </Modal>
    </div>
  );
}

// ─── KUNDENANLAGEN ────────────────────────────────────────────────────────────
const EQUIP_TYPES = ['Klimaanlage','Kühlstelle','Kühlzelle','Verbundanlage','Lüftungsgerät','Wärmepumpe','Split-Gerät','VRF-Anlage','Kaltwassersatz','Sonstiges'];
const WARTUNG_TYPEN = [
  'Vollwartung inkl. Überprüfung',
  'Vollwartung',
  'Reinigung inkl. Überprüfung',
  'Reinigung',
  'Überprüfung / Dichtigkeitsprüfung',
  'Sonstiges',
];

const REFRIGERANTS = ['R410A','R32','R290','R134a','R407C','R404A','R452B','R448A','R449A','R744 (CO₂)','Sonstiges'];

export function Equipment({ onNavigate }) {
  const { data, loading, reload } = useData(() => api.equipment());
  const { data: custData }        = useData(() => api.customers());
  const customers = custData?.data || [];

  const [showNew, setShowNew]       = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');
  const [filterCust, setFilterCust] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [contactModal, setContactModal] = useState(null); // { name, phone, email }
  const [photoModal, setPhotoModal]     = useState(null); // equipment object

  const emptyForm = { customerId:'', name:'', equipmentType:'Klimaanlage', manufacturer:'', model:'', serialNumber:'', location:'', refrigerant:'R410A', refrigerantCustom:'', refrigerantAmountKg:'', yearBuilt:'', installDate:'', warrantyUntil:'', maintenanceIntervalMonths:12, lastMaintenance:'', nextMaintenance:'', status:'active', notes:'' };
  const [form, setForm] = useState(emptyForm);
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));

  const calcNextMaint = (lastDate, months) => {
    if (!lastDate || !months) return '';
    const d = new Date(lastDate);
    d.setMonth(d.getMonth() + parseInt(months));
    return d.toISOString().split('T')[0];
  };

  const handleLastMaintChange = (dateStr) => {
    setForm(f => ({ ...f, lastMaintenance: dateStr, nextMaintenance: calcNextMaint(dateStr, f.maintenanceIntervalMonths) }));
  };

  const handleIntervalChange = (months) => {
    setForm(f => ({ ...f, maintenanceIntervalMonths: months, nextMaintenance: calcNextMaint(f.lastMaintenance, months) }));
  };

  const handleInstallDateChange = (dateStr) => {
    let warranty = '';
    if (dateStr) {
      const d = new Date(dateStr);
      d.setFullYear(d.getFullYear() + 2);
      warranty = d.toISOString().split('T')[0];
    }
    setForm(f => ({ ...f, installDate: dateStr, warrantyUntil: warranty }));
  };

  const [search, setSearch] = useState('');
  const [selEq, setSelEq] = useState(new Set());

  const items = (data?.data||[])
    .filter(e => !filterCust || String(e.customer_id)===filterCust)
    .filter(e => !filterStatus || e.maintenance_status===filterStatus)
    .filter(e => !search || (e.name||'').toLowerCase().includes(search.toLowerCase()) || (e.order_number||'').toLowerCase().includes(search.toLowerCase()) || (e.customer_name||'').toLowerCase().includes(search.toLowerCase()));

  const openEdit = (e) => {
    setEditItem(e);
    const rk2 = REFRIGERANTS.slice(0,-1).includes(e.refrigerant);
    setForm({ customerId:e.customer_id, name:e.name, equipmentType:e.equipment_type||'Klimaanlage', manufacturer:e.manufacturer||'', model:e.model||'', serialNumber:e.serial_number||'', location:e.location||'', refrigerant:rk2?e.refrigerant:'Sonstiges', refrigerantCustom:rk2?'':e.refrigerant||'', refrigerantAmountKg:e.refrigerant_amount_kg||'', yearBuilt:e.year_built||'', installDate:e.install_date?.split('T')[0]||'', warrantyUntil:e.warranty_until?.split('T')[0]||'', maintenanceIntervalMonths:e.maintenance_interval_months||12, lastMaintenance:e.last_maintenance?.split('T')[0]||'', nextMaintenance:e.next_maintenance?.split('T')[0]||'', status:e.status||'active', notes:e.notes||'' });
    setShowNew(true);
  };

  const save = async () => {
    if (!form.customerId || !form.name) { setErr('Kunde und Bezeichnung sind erforderlich.'); return; }
    setSaving(true); setErr('');
    try {
      if (editItem) { await api.updateEquipment(editItem.id, form); }
      else          { await api.createEquipment(form); }
      setShowNew(false); setEditItem(null); setForm(emptyForm); reload();
    } catch(e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const overdueCount  = (data?.data||[]).filter(e=>e.maintenance_status==='overdue').length;
  const dueSoonCount  = (data?.data||[]).filter(e=>e.maintenance_status==='due_soon').length;
  const toggleOneEq = id=>setSelEq(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAllEq = ()=>setSelEq(s=>s.size===items.length?new Set():new Set(items.map(e=>e.id)));
  const bulkDeleteEq = async()=>{if(!confirm(`${selEq.size} Anlagen löschen?`))return;await Promise.all([...selEq].map(id=>api.deleteEquipment(id).catch(()=>{})));setSelEq(new Set());reload();};

  return (
    <div className="page-body">

      {/* ── Kontakt-Modal ── */}
      {contactModal && (
        <div onClick={()=>setContactModal(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:20,padding:'36px 40px',width:360,boxShadow:'0 20px 60px rgba(0,0,0,0.25)',textAlign:'center',position:'relative'}}>
            <button onClick={()=>setContactModal(null)} style={{position:'absolute',top:14,right:16,background:'none',border:'none',fontSize:20,color:'var(--text-tertiary)',cursor:'pointer',lineHeight:1}}>✕</button>
            <div style={{width:64,height:64,borderRadius:'50%',background:'linear-gradient(135deg,#152248,#2D9CDB)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',boxShadow:'0 4px 16px rgba(45,156,219,0.35)'}}>
              <i className="ti ti-user" style={{fontSize:28,color:'#fff'}}/>
            </div>
            <div style={{fontSize:18,fontWeight:800,color:'var(--text)',marginBottom:4}}>{contactModal.name}</div>
            <div style={{fontSize:12,color:'var(--text-tertiary)',marginBottom:24}}>{contactModal.equipmentName}</div>
            {contactModal.phone && (
              <a href={`tel:${contactModal.phone}`} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,background:'linear-gradient(135deg,#152248,#2D9CDB)',color:'#fff',borderRadius:12,padding:'14px 20px',textDecoration:'none',marginBottom:10,fontSize:15,fontWeight:700,boxShadow:'0 4px 14px rgba(21,34,72,0.3)'}}>
                <i className="ti ti-phone" style={{fontSize:20}}/>
                {contactModal.phone}
              </a>
            )}
            {contactModal.email && (
              <a href={`mailto:${contactModal.email}?subject=Anlage ${contactModal.orderNumber||contactModal.equipmentName}`} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,background:'linear-gradient(135deg,#2D9CDB,#38b2f0)',color:'#fff',borderRadius:12,padding:'14px 20px',textDecoration:'none',fontSize:15,fontWeight:700,boxShadow:'0 4px 14px rgba(45,156,219,0.3)'}}>
                <i className="ti ti-mail" style={{fontSize:20}}/>
                {contactModal.email}
              </a>
            )}
            {!contactModal.phone && !contactModal.email && (
              <div style={{color:'var(--text-tertiary)',fontSize:13,padding:'20px 0'}}>Keine Kontaktdaten hinterlegt.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Foto-Modal ── */}
      {photoModal && <EquipmentPhotoModal equipment={photoModal} onClose={()=>setPhotoModal(null)}/>}

      {(overdueCount>0||dueSoonCount>0) && (
        <Alert type={overdueCount>0?'danger':'warning'}>
          {overdueCount>0 && <><strong>{overdueCount} Anlage{overdueCount>1?'n':''} überfällig</strong> — Wartung dringend erforderlich! </>}
          {dueSoonCount>0 && <>{dueSoonCount} Anlage{dueSoonCount>1?'n':''} in den nächsten 30 Tagen fällig.</>}
        </Alert>
      )}
      <div className="toolbar">
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <select value={filterCust} onChange={e=>setFilterCust(e.target.value)} style={{fontSize:12,minWidth:160}}>
            <option value="">Alle Kunden</option>
            {customers.map(c=><option key={c.id} value={c.id}>{c.company_name||`${c.first_name} ${c.last_name}`}</option>)}
          </select>
          {['overdue','due_soon','ok'].map(s=>(
            <button key={s} className={`btn sm ${filterStatus===s?'primary':'ghost'}`} onClick={()=>setFilterStatus(filterStatus===s?'':s)}>
              <i className={`ti ${MAINT_STATUS[s].icon}`} style={{color:MAINT_STATUS[s].color}}/>
              {MAINT_STATUS[s].label}
            </button>
          ))}
          <input placeholder="Suche A-Nummer, Name, Kunde..." value={search} onChange={e=>setSearch(e.target.value)} style={{fontSize:12,minWidth:220}}/>
        </div>
        <button className="btn primary" onClick={()=>{setEditItem(null);setForm(emptyForm);setErr('');setShowNew(true);}}><i className="ti ti-plus"/>Neue Anlage</button>
      </div>

      <div className="card card-0">
        {loading ? <div style={{padding:32,textAlign:'center'}}><Spinner dark/></div> :
         items.length===0 ? <EmptyState icon="ti-air-conditioning" title="Keine Kundenanlagen" subtitle="Erfasse Klimaanlagen, Kühlstellen und andere Anlagen"/> : <>
        {selEq.size>0&&<div className="bulk-bar"><span className="bulk-bar-count">{selEq.size} ausgewählt</span><button className="btn xs bulk-cancel" onClick={()=>setSelEq(new Set())}>Auswahl aufheben</button><button className="btn xs bulk-delete" onClick={bulkDeleteEq}><i className="ti ti-trash"/> Löschen</button></div>}
        <div className="table-wrap"><table>
          <thead><tr><th className="cb-col"><input type="checkbox" checked={selEq.size===items.length&&items.length>0} onChange={toggleAllEq}/></th><th>A-Nummer</th><th>Bezeichnung</th><th>Typ</th><th>Kunde / Standort</th><th>Kältemittel</th><th>Letzte Wartung</th><th>Nächste Wartung</th><th>Kundenkontakt</th><th>Status</th><th/></tr></thead>
          <tbody>{items.map(e=>{
            const ms = MAINT_STATUS[e.maintenance_status]||MAINT_STATUS.ok;
            return (
              <tr key={e.id} className={selEq.has(e.id)?'row-selected':''}>
                <td className="cb-col" onClick={ev=>ev.stopPropagation()}><input type="checkbox" checked={selEq.has(e.id)} onChange={()=>toggleOneEq(e.id)}/></td>
                <td>
                  {e.order_number && <div style={{fontSize:11,fontWeight:700,color:'var(--accent)',background:'rgba(0,229,255,0.1)',padding:'1px 6px',borderRadius:4,display:'inline-block'}}>{e.order_number}</div>}
                </td>
                <td style={{fontWeight:600,fontSize:13}}>{e.name}<br/><span style={{fontSize:11,color:'var(--text-secondary)',fontWeight:400}}>{e.manufacturer&&`${e.manufacturer} `}{e.model}</span></td>
                <td><span className="badge gray">{e.equipment_type||'—'}</span></td>
                <td style={{fontSize:12}}>
                  <strong>{e.customer_name}</strong>
                  {e.location&&<><br/><span style={{color:'var(--text-tertiary)'}}>{e.location}</span></>}
                </td>
                <td style={{fontSize:12}}>{e.refrigerant||'—'}{e.refrigerant_amount_kg&&<><br/><span style={{color:'var(--text-tertiary)'}}>{e.refrigerant_amount_kg} kg</span></>}</td>
                <td style={{fontSize:12}}>{e.last_maintenance?fmtDate(e.last_maintenance):'—'}</td>
                <td style={{fontSize:12,fontWeight:600,color:ms.color}}>{e.next_maintenance?fmtDate(e.next_maintenance):'—'}</td>
                <td style={{fontSize:12}}>
                  {(e.customer_phone||e.customer_email) ? (
                    <div style={{display:'flex',flexDirection:'column',gap:4}}>
                      {e.customer_phone && (
                        <button onClick={()=>setContactModal({name:e.customer_name,phone:e.customer_phone,email:e.customer_email,equipmentName:e.name,orderNumber:e.order_number})}
                          style={{display:'inline-flex',alignItems:'center',gap:5,background:'#f0f7ff',border:'1px solid #bfdbfe',borderRadius:7,padding:'4px 9px',cursor:'pointer',color:'#152248',fontWeight:600,fontSize:12,textAlign:'left'}}>
                          <i className="ti ti-phone" style={{fontSize:13,color:'#2D9CDB'}}/>{e.customer_phone}
                        </button>
                      )}
                      {e.customer_email && (
                        <button onClick={()=>setContactModal({name:e.customer_name,phone:e.customer_phone,email:e.customer_email,equipmentName:e.name,orderNumber:e.order_number})}
                          style={{display:'inline-flex',alignItems:'center',gap:5,background:'#f0f7ff',border:'1px solid #bfdbfe',borderRadius:7,padding:'4px 9px',cursor:'pointer',color:'var(--text-secondary)',fontSize:11,textAlign:'left',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          <i className="ti ti-mail" style={{fontSize:12,color:'#2D9CDB',flexShrink:0}}/><span style={{overflow:'hidden',textOverflow:'ellipsis'}}>{e.customer_email}</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <span style={{fontSize:11,color:'var(--text-tertiary)'}}>—</span>
                  )}
                </td>
                <td><span style={{fontSize:11,fontWeight:700,color:ms.color}}><i className={`ti ${ms.icon}`}/> {ms.label}</span></td>
                <td>
                  <div style={{display:'flex',gap:4}}>
                    <button className="btn xs ghost icon" title="Fotos" onClick={()=>setPhotoModal(e)}><i className="ti ti-camera"/></button>
                    <button className="btn xs ghost icon" title="Bearbeiten" onClick={()=>openEdit(e)}><i className="ti ti-edit"/></button>
                    <button className="btn xs danger icon" title="Löschen" onClick={async()=>{if(confirm(`Anlage "${e.name}" wirklich löschen?`)){try{await api.deleteEquipment(e.id);reload();}catch(err){alert(err.message);}}}}><i className="ti ti-trash"/></button>
                  </div>
                </td>
              </tr>
            );
          })}</tbody>
        </table></div></>}
      </div>

      <Modal open={showNew} onClose={()=>{setShowNew(false);setEditItem(null);}} title={editItem?'Anlage bearbeiten':'Neue Kundenanlage'} maxWidth={560}
        footer={<><button className="btn" onClick={()=>{setShowNew(false);setEditItem(null);}}>Abbrechen</button><button className="btn primary" onClick={save} disabled={saving}>{saving?'Speichern...':'Speichern'}</button></>}>
        {err&&<div style={{marginBottom:12}}><Alert type="danger">{err}</Alert></div>}
        <FormGroup label="Kunde *"><select value={form.customerId} onChange={e=>sf('customerId',e.target.value)} disabled={!!editItem} style={!form.customerId?{borderColor:'var(--red)'}:{}}><option value="">— Bitte Kunden wählen —</option>{customers.map(c=><option key={c.id} value={c.id}>{c.customer_number?`[${c.customer_number}] `:''}{c.company_name||`${c.first_name} ${c.last_name}`}</option>)}</select></FormGroup>
        <FormRow>
          <FormGroup label="Bezeichnung" required><input value={form.name} onChange={e=>sf('name',e.target.value)} placeholder="z.B. Klimaanlage Büro EG"/></FormGroup>
          <FormGroup label="Typ"><select value={form.equipmentType} onChange={e=>sf('equipmentType',e.target.value)}>{EQUIP_TYPES.map(t=><option key={t}>{t}</option>)}</select></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Hersteller"><input value={form.manufacturer} onChange={e=>sf('manufacturer',e.target.value)} placeholder="z.B. Daikin"/></FormGroup>
          <FormGroup label="Modell"><input value={form.model} onChange={e=>sf('model',e.target.value)}/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Seriennummer"><input value={form.serialNumber} onChange={e=>sf('serialNumber',e.target.value)}/></FormGroup>
          <FormGroup label="Baujahr"><input type="number" value={form.yearBuilt} onChange={e=>sf('yearBuilt',e.target.value)} placeholder="2020" min="1990" max="2030"/></FormGroup>
        </FormRow>
        <FormGroup label="Standort beim Kunden"><input value={form.location} onChange={e=>sf('location',e.target.value)} placeholder="z.B. Büro 2. OG, Serverraum"/></FormGroup>
        <FormRow>
          <FormGroup label="Kältemittel">
            <select value={form.refrigerant} onChange={e=>sf('refrigerant',e.target.value)}>{REFRIGERANTS.map(r=><option key={r} value={r}>{r}</option>)}</select>
            {form.refrigerant==='Sonstiges'&&<input value={form.refrigerantCustom||''} onChange={e=>sf('refrigerantCustom',e.target.value)} placeholder="Kältemittel eingeben..." style={{marginTop:6}}/>}
          </FormGroup>
          <FormGroup label="Füllmenge (kg)"><input type="number" value={form.refrigerantAmountKg} onChange={e=>sf('refrigerantAmountKg',e.target.value)} step="0.001" min="0"/></FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Letzte Wartung"><input type="date" value={form.lastMaintenance} onChange={e=>handleLastMaintChange(e.target.value)}/></FormGroup>
          <FormGroup label="Wartungsintervall (Monate)"><input type="number" value={form.maintenanceIntervalMonths} onChange={e=>handleIntervalChange(e.target.value)} min="1" max="60"/></FormGroup>
        </FormRow>
        <FormGroup label="Nächste Wartung (wird automatisch berechnet)"><input type="date" value={form.nextMaintenance} onChange={e=>sf('nextMaintenance',e.target.value)}/></FormGroup>
        <FormRow>
          <FormGroup label="Inbetriebnahme"><input type="date" value={form.installDate} onChange={e=>handleInstallDateChange(e.target.value)}/></FormGroup>
          <FormGroup label="Garantie bis (auto: +2 Jahre)"><input type="date" value={form.warrantyUntil} onChange={e=>sf('warrantyUntil',e.target.value)}/></FormGroup>
        </FormRow>
        <FormGroup label="Status"><select value={form.status} onChange={e=>sf('status',e.target.value)}><option value="active">Aktiv</option><option value="defective">Defekt</option><option value="decommissioned">Außer Betrieb</option></select></FormGroup>
        <FormGroup label="Notizen"><textarea value={form.notes} onChange={e=>sf('notes',e.target.value)} rows={2}/></FormGroup>
      </Modal>
    </div>
  );
}

// ─── SERVICEBERICHTE ──────────────────────────────────────────────────────────
const SR_TYPE = { service:'Serviceeinsatz', maintenance:'Wartung', repair:'Reparatur', installation:'Inbetriebnahme', emergency:'Notfalleinsatz' };
const SR_STATUS = {
  draft:     { label:'Entwurf',        color:'var(--amber)',  bg:'var(--amber-light)' },
  completed: { label:'Abgeschlossen',  color:'var(--green)',  bg:'var(--green-light)' },
  signed:    { label:'Unterschrieben', color:'var(--accent)', bg:'var(--accent-light)' },
};

const emptyMaterial = () => ({ name:'', quantity:1, unit:'Stk', unit_price:'' });
const emptyForm = () => ({
  customerId:'', equipmentId:'', projectId:'', reportDate:today(),
  technicianName:'', technicianId:'', reportType:'service',
  workPerformed:'', defectsFound:[''], recommendations:'',
  materialsUsed:[], hoursWorked:'', travelHours:'',
  timeFrom:'', timeTo:'',
  status:'draft', internalNotes:'', orderNumber:'',
});

export function ServiceReports({ onNavigate }) {
  const [reports, setReports]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showNew, setShowNew]   = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(emptyForm());
  const [filter, setFilter]     = useState('all');
  const [search, setSearch]     = useState('');
  const { data: customers }     = useData(() => api.customers());
  const { data: equipAll }      = useData(() => api.equipment());
  const { data: projects }      = useData(() => api.projects());
  const { data: usersData }     = useData(() => api.users());
  const { data: productsData }  = useData(() => api.products());

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.serviceReports(); setReports(r.data || []); }
    catch(e) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sf = (k,v) => setForm(f => ({...f, [k]:v}));

  const [aiLoading, setAiLoading] = useState({});
  const aiImprove = async (field, value, setter) => {
    if (!value || value.trim().length < 5) return;
    setAiLoading(l => ({...l, [field]: true}));
    try {
      const res = await api.aiImproveText(value, field);
      setter(res.improved);
    } catch(e) { alert('KI-Fehler: ' + e.message); }
    finally { setAiLoading(l => ({...l, [field]: false})); }
  };

  // Nur Anlagen des gewählten Kunden zeigen
  const customerEquip = useMemo(() => {
    if (!form.customerId) return equipAll?.data || [];
    return (equipAll?.data || []).filter(e => String(e.customer_id) === String(form.customerId));
  }, [equipAll, form.customerId]);

  const openNew = () => { setForm(emptyForm()); setEditing(null); setShowNew(true); };
  const openEdit = (r) => {
    setForm({
      customerId:    r.customer_id||'',
      equipmentId:   r.equipment_id||'',
      projectId:     r.project_id||'',
      reportDate:    r.report_date?.split('T')[0]||today(),
      technicianName:r.technician_name||'',
      technicianId:  r.technician_id||'',
      reportType:    r.report_type||'service',
      workPerformed: r.work_performed||'',
      defectsFound:  (() => { try { const p=JSON.parse(r.defects_found||'[]'); return Array.isArray(p)?p:(r.defects_found?[r.defects_found]:['']); } catch(_){ return r.defects_found?[r.defects_found]:['']; } })(),
      recommendations:r.recommendations||'',
      materialsUsed: Array.isArray(r.materials_used)?r.materials_used:JSON.parse(r.materials_used||'[]'),
      hoursWorked:   r.hours_worked||'',
      travelHours:   r.travel_hours||'',
      travelHoursTo: '',
      travelHoursBack: '',
      timeFrom:      r.time_from||'',
      timeTo:        r.time_to||'',
      status:        r.status||'draft',
      internalNotes: r.internal_notes||'',
    });
    setEditing(r);
    setShowNew(true);
  };

  const save = async () => {
    if (!form.customerId) { alert('Bitte zuerst einen Kunden auswählen.'); return; }
    try {
      const body = {
        ...form,
        customerId:   form.customerId||null,
        equipmentId:  form.equipmentId||null,
        projectId:    form.projectId||null,
        technicianId: form.technicianId||null,
        hoursWorked:  parseFloat(form.hoursWorked)||0,
        travelHours:  parseFloat(form.travelHours)||0,
        timeFrom:     form.timeFrom||null,
        timeTo:       form.timeTo||null,
        defectsFound: JSON.stringify((form.defectsFound||[]).filter(x=>x.trim())),
      };
      if (editing) await api.updateServiceReport(editing.id, body);
      else await api.createServiceReport(body);
      setShowNew(false);
      load();
    } catch(e) { alert(e.message); }
  };

  const del = async (id) => {
    if (!confirm('Servicebericht wirklich löschen?')) return;
    await api.deleteServiceReport(id);
    load();
  };

  const addMat  = () => sf('materialsUsed', [...form.materialsUsed, emptyMaterial()]);
  const updMat  = (i,k,v) => sf('materialsUsed', form.materialsUsed.map((m,j)=>j===i?{...m,[k]:v}:m));
  const delMat  = (i)      => sf('materialsUsed', form.materialsUsed.filter((_,j)=>j!==i));

  const filtered = reports.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.report_number||'').toLowerCase().includes(s)
          || (r.customer_name||'').toLowerCase().includes(s)
          || (r.equipment_name||'').toLowerCase().includes(s)
          || (r.technician_name||'').toLowerCase().includes(s)
          || (r.technician_user_name||'').toLowerCase().includes(s);
    }
    return true;
  });

  const [selSR, setSelSR] = useState(new Set());
  const toggleOneSR = id=>setSelSR(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAllSR = ()=>setSelSR(s=>s.size===filtered.length?new Set():new Set(filtered.map(r=>r.id)));
  const bulkDeleteSR = async()=>{if(!confirm(`${selSR.size} Serviceberichte löschen?`))return;await Promise.all([...selSR].map(id=>api.deleteServiceReport(id).catch(()=>{})));setSelSR(new Set());reload();};

  return (
    <div className="page-body">
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        <input className="input" placeholder="Suchen…" value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:220}}/>
        <div className="btn-group">
          {['all','draft','completed','signed'].map(s=>(
            <button key={s} className={`btn sm ${filter===s?'primary':''}`} onClick={()=>setFilter(s)}>
              {s==='all'?'Alle':SR_STATUS[s]?.label}
            </button>
          ))}
        </div>
        <button className="btn primary" style={{marginLeft:'auto'}} onClick={openNew}>
          <i className="ti ti-plus"/> Neuer Servicebericht
        </button>
      </div>

      {loading ? <Spinner dark/> : filtered.length === 0 ? (
        <EmptyState icon="ti-clipboard-check" title="Keine Serviceberichte" text="Lege deinen ersten Servicebericht an."/>
      ) : (
        <div className="card card-0">
          {selSR.size>0&&<div className="bulk-bar"><span className="bulk-bar-count">{selSR.size} ausgewählt</span><button className="btn xs bulk-cancel" onClick={()=>setSelSR(new Set())}>Auswahl aufheben</button><button className="btn xs bulk-delete" onClick={bulkDeleteSR}><i className="ti ti-trash"/> Löschen</button></div>}
          <table>
            <thead>
              <tr>
                <th className="cb-col"><input type="checkbox" checked={selSR.size===filtered.length&&filtered.length>0} onChange={toggleAllSR}/></th>
                <th>Nr.</th><th>S-Nr.</th><th>Datum</th><th>Art</th><th>Kunde</th>
                <th>Anlage</th><th>Techniker</th><th>Stunden</th><th>Status</th><th/>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const st = SR_STATUS[r.status] || SR_STATUS.draft;
                return (
                  <tr key={r.id} className={selSR.has(r.id)?'row-selected':''} style={{cursor:'pointer'}} onClick={()=>openEdit(r)}>
                    <td className="cb-col" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selSR.has(r.id)} onChange={()=>toggleOneSR(r.id)}/></td>
                    <td className="mono">{r.report_number}</td>
                    <td><span style={{fontSize:11,fontWeight:600,color:'var(--amber)',background:'rgba(255,183,0,.1)',padding:'2px 6px',borderRadius:4}}>{r.order_number||'–'}</span></td>
                    <td>{fmtDate(r.report_date)}</td>
                    <td><span className="badge gray">{SR_TYPE[r.report_type]||r.report_type}</span></td>
                    <td>{r.customer_name||'—'}</td>
                    <td>{r.equipment_name||'—'}</td>
                    <td>{r.technician_name || r.technician_user_name || '—'}</td>
                    <td>{parseFloat(r.hours_worked||0).toFixed(1)} h</td>
                    <td><span className="badge" style={{background:st.bg,color:st.color}}>{st.label}</span></td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div style={{display:'flex',gap:4}}>
                        <a href={api.serviceReportPdf(r.id)} target="_blank" rel="noreferrer"
                           className="btn xs ghost" title="PDF öffnen">
                          <i className="ti ti-file-type-pdf"/>
                        </a>
                        <button className="btn xs danger" onClick={()=>del(r.id)} title="Löschen">
                          <i className="ti ti-trash"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal: Neu / Bearbeiten ── */}
        <Modal open={showNew} title={editing?`Servicebericht ${editing.report_number}`:'Neuer Servicebericht'} onClose={()=>setShowNew(false)} maxWidth={900}>
          <FormRow>
            <FormGroup label="Art des Einsatzes">
              <select value={form.reportType} onChange={e=>sf('reportType',e.target.value)}>
                {Object.entries(SR_TYPE).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Datum">
              <input type="date" value={form.reportDate} onChange={e=>sf('reportDate',e.target.value)}/>
            </FormGroup>
            <FormGroup label="S-Nummer (leer = automatisch)">
              <input value={form.orderNumber||''} onChange={e=>sf('orderNumber',e.target.value)} placeholder="S-2026-0001"/>
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label="Kunde *">
              <select value={form.customerId} onChange={e=>{sf('customerId',e.target.value);sf('equipmentId','');}}
                style={!form.customerId?{borderColor:'var(--red)'}:{}}>
                <option value="">— Bitte Kunden wählen —</option>
                {(customers?.data||[]).map(c=><option key={c.id} value={c.id}>{c.customer_number ? `[${c.customer_number}] ` : ''}{c.company_name||`${c.first_name} ${c.last_name}`}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Anlage">
              <select value={form.equipmentId} onChange={e=>sf('equipmentId',e.target.value)}>
                <option value="">— Keine Anlage —</option>
                {customerEquip.map(e=><option key={e.id} value={e.id}>{e.name} ({e.equipment_type||''})</option>)}
              </select>
            </FormGroup>
          </FormRow>

          <FormGroup label="Techniker">
            <select value={form.technicianId} onChange={e=>{
              const u=(usersData?.data||[]).find(u=>String(u.id)===String(e.target.value));
              sf('technicianId',e.target.value);
              if(u) sf('technicianName',u.name);
            }}>
              <option value="">— Kein Techniker —</option>
              {(usersData?.data||[]).map(u=><option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </FormGroup>

          <FormGroup label={<span style={{display:'flex',alignItems:'center',gap:8}}>Durchgeführte Arbeiten <button type="button" className="btn xs ghost" style={{fontSize:11,padding:'1px 7px'}} onClick={()=>aiImprove('arbeiten',form.workPerformed,v=>sf('workPerformed',v))} disabled={aiLoading.arbeiten||!form.workPerformed}>{aiLoading.arbeiten?<><i className="ti ti-loader-2" style={{animation:'spin 1s linear infinite'}}/> KI…</>:<><i className="ti ti-sparkles"/> KI verbessern</>}</button></span>}>
            <textarea value={form.workPerformed} onChange={e=>sf('workPerformed',e.target.value)} rows={4} placeholder="Was wurde gemacht?"/>
          </FormGroup>
          <div style={{marginBottom:11}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
              <strong style={{fontSize:13}}>Festgestellte Mängel</strong>
              <button type="button" className="btn xs ghost" onClick={()=>sf('defectsFound',[...form.defectsFound,''])}><i className="ti ti-plus"/> Mangel hinzufügen</button>
            </div>
            {(form.defectsFound||['']).map((m,i)=>(
              <div key={i} style={{display:'flex',gap:6,marginBottom:6,alignItems:'center'}}>
                <span style={{fontSize:12,color:'var(--text-secondary)',minWidth:20,textAlign:'right'}}>{i+1}.</span>
                <input value={m} onChange={e=>{ const a=[...form.defectsFound]; a[i]=e.target.value; sf('defectsFound',a); }} placeholder={`Mangel ${i+1}…`} style={{flex:1}}/>
                <button type="button" className="btn xs ghost" style={{fontSize:11,padding:'1px 7px'}} onClick={()=>aiImprove('maengel',m,v=>{ const a=[...form.defectsFound]; a[i]=v; sf('defectsFound',a); })} disabled={aiLoading[`m${i}`]||!m} title="KI verbessern">
                  {aiLoading[`m${i}`]?<i className="ti ti-loader-2" style={{animation:'spin 1s linear infinite'}}/>:<i className="ti ti-sparkles"/>}
                </button>
                {form.defectsFound.length>1 && <button type="button" className="btn xs ghost" onClick={()=>sf('defectsFound',form.defectsFound.filter((_,j)=>j!==i))} title="Löschen"><i className="ti ti-trash" style={{color:'var(--red)'}}/></button>}
              </div>
            ))}
          </div>
          <FormGroup label={<span style={{display:'flex',alignItems:'center',gap:8}}>Empfehlungen (optional) <button type="button" className="btn xs ghost" style={{fontSize:11,padding:'1px 7px'}} onClick={()=>aiImprove('empfehlungen',form.recommendations,v=>sf('recommendations',v))} disabled={aiLoading.empfehlungen||!form.recommendations}>{aiLoading.empfehlungen?<><i className="ti ti-loader-2" style={{animation:'spin 1s linear infinite'}}/> KI…</>:<><i className="ti ti-sparkles"/> KI verbessern</>}</button></span>}>
            <textarea value={form.recommendations} onChange={e=>sf('recommendations',e.target.value)} rows={2} placeholder="Empfehlungen für den Kunden…"/>
          </FormGroup>

          {/* Material */}
          <div style={{marginBottom:11}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
              <strong style={{fontSize:13}}>Verwendetes Material</strong>
              <button className="btn xs ghost" onClick={addMat}><i className="ti ti-plus"/> Zeile</button>
            </div>
            {form.materialsUsed.length > 0 && (
              <table style={{fontSize:12}}>
                <thead>
                  <tr><th>Bezeichnung</th><th style={{width:70}}>Menge</th><th style={{width:80}}>Einheit</th><th style={{width:100}}>Einzelpreis</th><th style={{width:30}}/></tr>
                </thead>
                <tbody>
                  {form.materialsUsed.map((m,i)=>(
                    <tr key={i}>
                      <td>
                        <select value={m.productId||''} onChange={e=>{
                          const p=(productsData?.data||[]).find(px=>String(px.id)===String(e.target.value));
                          sf('materialsUsed', form.materialsUsed.map((mat,j)=>j===i?{...mat, productId:e.target.value, ...(p?{name:p.name,unit:p.unit,unit_price:p.net_price}:{})}:mat));
                        }} style={{marginBottom:3}}>
                          <option value="">— Aus Lager wählen —</option>
                          {(productsData?.data||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input value={m.name} onChange={e=>updMat(i,'name',e.target.value)} placeholder="oder manuell eingeben" style={{width:'100%'}}/>
                      </td>
                      <td><input type="number" value={m.quantity} onChange={e=>updMat(i,'quantity',e.target.value)} min="0" step="0.1"/></td>
                      <td><select value={m.unit} onChange={e=>updMat(i,'unit',e.target.value)}>
                        {['Stk','m','m²','kg','l','Pkg','Std','Rolle','Satz','Paar'].map(u=><option key={u}>{u}</option>)}
                      </select></td>
                      <td><input type="number" value={m.unit_price} onChange={e=>updMat(i,'unit_price',e.target.value)} placeholder="0.00" step="0.01"/></td>
                      <td><button className="btn xs danger" onClick={()=>delMat(i)}><i className="ti ti-x"/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Arbeitszeit */}
          <div style={{background:'var(--surface-2)',borderRadius:8,padding:'10px 14px',marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Arbeitszeit</div>
            <FormRow cols={3}>
              <FormGroup label="Von">
                <input type="time" value={form.timeFrom} onChange={e=>{
                  const from=e.target.value; sf('timeFrom',from);
                  if(from&&form.timeTo){const[fh,fm]=from.split(':').map(Number);const[th,tm]=form.timeTo.split(':').map(Number);const diff=((th*60+tm)-(fh*60+fm))/60;if(diff>0)sf('hoursWorked',diff.toFixed(2));}
                }}/>
              </FormGroup>
              <FormGroup label="Bis">
                <input type="time" value={form.timeTo} onChange={e=>{
                  const to=e.target.value; sf('timeTo',to);
                  if(form.timeFrom&&to){const[fh,fm]=form.timeFrom.split(':').map(Number);const[th,tm]=to.split(':').map(Number);const diff=((th*60+tm)-(fh*60+fm))/60;if(diff>0)sf('hoursWorked',diff.toFixed(2));}
                }}/>
              </FormGroup>
              <FormGroup label="Arbeitsstunden (auto)">
                <input type="number" value={form.hoursWorked} onChange={e=>sf('hoursWorked',e.target.value)} min="0" step="0.25" placeholder="0.00"/>
              </FormGroup>
            </FormRow>
          </div>

          {/* Fahrtzeit */}
          <div style={{background:'var(--surface-2)',borderRadius:8,padding:'10px 14px',marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Fahrtzeit</div>
            <FormRow cols={2}>
              <FormGroup label="Hinfahrt (Std.)">
                <input type="number" value={form.travelHoursTo||''} onChange={e=>{sf('travelHoursTo',e.target.value);const t=parseFloat(e.target.value)||0;const b=parseFloat(form.travelHoursBack)||0;sf('travelHours',(t+b).toFixed(2));}} min="0" step="0.25" placeholder="z.B. 1.5"/>
              </FormGroup>
              <FormGroup label="Rückfahrt (Std.)">
                <input type="number" value={form.travelHoursBack||''} onChange={e=>{sf('travelHoursBack',e.target.value);const b=parseFloat(e.target.value)||0;const t=parseFloat(form.travelHoursTo)||0;sf('travelHours',(t+b).toFixed(2));}} min="0" step="0.25" placeholder="z.B. 1.5"/>
              </FormGroup>
            </FormRow>
            <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:4}}>
              Fahrtzeit gesamt: <strong>{form.travelHours||'0.00'} Std.</strong>
            </div>
          </div>

          <FormGroup label="Interne Notizen">
            <textarea value={form.internalNotes} onChange={e=>sf('internalNotes',e.target.value)} rows={2} placeholder="Nur intern sichtbar, erscheint nicht im PDF"/>
          </FormGroup>

          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
            <button className="btn" onClick={()=>setShowNew(false)}>Abbrechen</button>
            {editing && (
              <a href={api.serviceReportPdf(editing.id)} target="_blank" rel="noreferrer" className="btn">
                <i className="ti ti-file-type-pdf"/> PDF
              </a>
            )}
            <button className="btn primary" onClick={save}>
              <i className="ti ti-check"/> Speichern
            </button>
          </div>
        </Modal>
    </div>
  );
}

// ─── WARTUNGSVERTRÄGE ─────────────────────────────────────────────────────────
const CONTRACT_STATUS = {
  active:    { label:'Aktiv',      color:'var(--green)' },
  paused:    { label:'Pausiert',   color:'var(--amber)' },
  cancelled: { label:'Gekündigt',  color:'var(--red)'   },
};
const SERVICE_STATUS = {
  overdue:  { label:'Überfällig',  color:'var(--red)',   bg:'rgba(239,68,68,0.1)',   icon:'ti-alert-circle' },
  due_soon: { label:'Bald fällig', color:'var(--amber)', bg:'rgba(245,158,11,0.1)',  icon:'ti-clock' },
  ok:       { label:'OK',          color:'var(--green)', bg:'rgba(16,185,129,0.1)',  icon:'ti-circle-check' },
};
const INTERVAL_LABELS = { 1:'Monatlich', 3:'Vierteljährlich', 6:'Halbjährlich', 12:'Jährlich', 24:'2-jährlich' };

export function MaintenanceContracts() {
  const { data: raw, loading, error, reload } = useData(() => api.maintenanceContracts());
  const { data: customers } = useData(() => api.customers());
  const { data: equipmentList } = useData(() => api.equipment());
  const { data: srData } = useData(() => api.serviceReports());
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showRecord, setShowRecord] = useState(null); // contract to record service on
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [alert, setAlert] = useState(null);
  const [recordDate, setRecordDate] = useState(today());
  const [recordNotes, setRecordNotes] = useState('');
  const [showSendModal, setShowSendModal] = useState(null);
  const [sendEmail, setSendEmail] = useState({ to:'', subject:'', body:'' });
  const [sending, setSending] = useState(false);

  const EMPTY_FORM = {
    customerId: '', name: '', description: '', status: 'active',
    contractStart: today(), contractEnd: '', intervalMonths: 12,
    pricePerService: '', priceYearly: '', lastServiceDate: '', nextServiceDate: '',
    equipmentIds: [], technicianId: '', notes: '', referenceNumber: '',
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const contracts = (raw?.data || []).filter(c => {
    if (filterStatus && c.status !== filterStatus) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) &&
        !(c.customer_name||'').toLowerCase().includes(search.toLowerCase()) &&
        !c.contract_number.toLowerCase().includes(search.toLowerCase()) && !(c.order_number||'').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total:   (raw?.data||[]).length,
    active:  (raw?.data||[]).filter(c=>c.status==='active').length,
    overdue: (raw?.data||[]).filter(c=>c.service_status==='overdue').length,
    dueSoon: (raw?.data||[]).filter(c=>c.service_status==='due_soon').length,
  };

  function openEdit(c) {
    setEditing(c);
    setForm({
      customerId: c.customer_id || '', name: c.name, description: c.description || '',
      status: c.status, contractStart: c.contract_start?.split('T')[0] || '',
      contractEnd: c.contract_end?.split('T')[0] || '',
      intervalMonths: c.interval_months, pricePerService: c.price_per_service || '',
      priceYearly: c.price_yearly || '',
      lastServiceDate: c.last_service_date?.split('T')[0] || '',
      nextServiceDate: c.next_service_date?.split('T')[0] || '',
      equipmentIds: c.equipment_ids || [], technicianId: c.technician_id || '',
      notes: c.notes || '', referenceNumber: c.reference_number || '',
    });
    setShowNew(true);
  }

  async function save() {
    if (!form.customerId) { setAlert({ type:'error', msg:'Bitte einen Kunden auswählen.' }); return; }
    if (!form.name)       { setAlert({ type:'error', msg:'Bitte eine Bezeichnung eingeben.' }); return; }
    try {
      const body = { ...form, intervalMonths: parseInt(form.intervalMonths) };
      if (editing) await api.updateMaintenanceContract(editing.id, body);
      else         await api.createMaintenanceContract(body);
      setShowNew(false); setEditing(null); setForm(EMPTY_FORM);
      reload();
    } catch(e) { setAlert({ type:'error', msg: e.message }); }
  }

  const [selWV, setSelWV] = useState(new Set());
  const toggleOneWV = id=>setSelWV(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAllWV = ()=>setSelWV(s=>s.size===contracts.length?new Set():new Set(contracts.map(c=>c.id)));
  const bulkDeleteWV = async()=>{if(!confirm(`${selWV.size} Wartungsverträge löschen?`))return;await Promise.all([...selWV].map(id=>api.deleteMaintenanceContract(id).catch(()=>{})));setSelWV(new Set());reload();};

  async function recordService() {
    try {
      await api.recordMaintenanceService(showRecord.id, { serviceDate: recordDate, notes: recordNotes });
      setShowRecord(null); setRecordNotes(''); setRecordDate(today());
      setAlert({ type:'success', msg:'Wartung als durchgeführt eingetragen.' });
      reload();
    } catch(e) { setAlert({ type:'error', msg: e.message }); }
  }

  async function del(c) {
    if (!confirm(`Wartungsvertrag "${c.name}" wirklich löschen?`)) return;
    try { await api.deleteMaintenanceContract(c.id); reload(); }
    catch(e) { setAlert({ type:'error', msg: e.message }); }
  }

  function toggleEquip(id) {
    const ids = form.equipmentIds || [];
    if (ids.includes(id)) sf('equipmentIds', ids.filter(x=>x!==id));
    else sf('equipmentIds', [...ids, id]);
  }

  const custEquipment = (equipmentList?.data || []).filter(e => !form.customerId || e.customer_id === parseInt(form.customerId));

  // Alle A-Nummern (Kundenanlagen) + S-Nummern (Serviceberichte) für Referenz-Dropdown
  const allANummern = (equipmentList?.data || [])
    .filter(e => e.order_number)
    .map(e => ({ value: e.order_number, label: `${e.order_number} – ${e.name}`, gruppe: 'A-Nummern (Anlagen)' }));
  const allSNummern = (srData?.data || [])
    .filter(r => r.order_number)
    .map(r => ({ value: r.order_number, label: `${r.order_number} – ${r.title||r.subject||'Servicebericht'}`, gruppe: 'S-Nummern (Serviceberichte)' }));

  if (loading) return <Spinner/>;
  if (error)   return <Alert type="error" msg={error}/>;

  return (
    <div className="page">
      {alert && <Alert type={alert.type} msg={alert.msg} onClose={()=>setAlert(null)}/>}

      {/* Stats */}
      <div className="dash-grid-4" style={{marginBottom:20}}>
        {[
          { label:'Gesamt', val: stats.total,   icon:'ti-file-certificate', color:'var(--accent)' },
          { label:'Aktiv',  val: stats.active,  icon:'ti-circle-check',     color:'var(--green)'  },
          { label:'Überfällig', val: stats.overdue, icon:'ti-alert-circle', color:'var(--red)'    },
          { label:'Bald fällig', val: stats.dueSoon, icon:'ti-clock',       color:'var(--amber)'  },
        ].map(s => (
          <div key={s.label} className="card metric-card">
            <i className={`ti ${s.icon}`} style={{fontSize:22,color:s.color,marginBottom:4}}/>
            <div className="metric-value" style={{color:s.color}}>{s.val}</div>
            <div className="metric-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="card" style={{marginBottom:16,padding:'12px 16px',display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
        <input className="search-input" placeholder="Suche..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:180}}/>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{minWidth:120}}>
          <option value="">Alle Status</option>
          {Object.entries(CONTRACT_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn primary" onClick={()=>{setEditing(null);setForm(EMPTY_FORM);setShowNew(true)}}>
          <i className="ti ti-plus"/> Neuer Vertrag
        </button>
      </div>

      {/* Liste */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        {contracts.length === 0 ? (
          <EmptyState icon="ti-file-certificate" title="Keine Wartungsverträge" subtitle="Erstelle deinen ersten Wartungsvertrag."/>
        ) : (<>
          {selWV.size>0&&<div className="bulk-bar"><span className="bulk-bar-count">{selWV.size} ausgewählt</span><button className="btn xs bulk-cancel" onClick={()=>setSelWV(new Set())}>Auswahl aufheben</button><button className="btn xs bulk-delete" onClick={bulkDeleteWV}><i className="ti ti-trash"/> Löschen</button></div>}
          <table>
            <thead>
              <tr>
                <th className="cb-col"><input type="checkbox" checked={selWV.size===contracts.length&&contracts.length>0} onChange={toggleAllWV}/></th>
                <th>Nr.</th><th>Bezeichnung</th><th>Kunde</th><th>Intervall</th>
                <th>Letzter Service</th><th>Nächster Service</th><th>Preis</th><th>Status</th><th/>
              </tr>
            </thead>
            <tbody>
              {contracts.map(c => {
                const ss = SERVICE_STATUS[c.service_status] || SERVICE_STATUS.ok;
                const cs = CONTRACT_STATUS[c.status] || CONTRACT_STATUS.active;
                return (
                  <tr key={c.id} className={selWV.has(c.id)?'row-selected':''}>
                    <td className="cb-col"><input type="checkbox" checked={selWV.has(c.id)} onChange={()=>toggleOneWV(c.id)}/></td>
                    <td>
                      {c.order_number && <div style={{fontSize:11,fontWeight:700,color:'var(--accent)',background:'rgba(0,229,255,0.1)',padding:'1px 6px',borderRadius:4,display:'inline-block',marginBottom:2}}>{c.order_number}</div>}
                      <div style={{fontSize:10,color:'var(--text-tertiary)'}}>{c.contract_number}</div>
                    </td>
                    <td><strong>{c.name}</strong>{c.description && <div style={{fontSize:11,color:'var(--text-secondary)'}}>{c.description}</div>}</td>
                    <td>{c.customer_name || '—'}</td>
                    <td>{INTERVAL_LABELS[c.interval_months] || `${c.interval_months} Monate`}</td>
                    <td style={{fontSize:12}}>{c.last_service_date ? fmtDate(c.last_service_date) : '—'}</td>
                    <td>
                      {c.next_service_date ? (
                        <span style={{display:'flex',alignItems:'center',gap:4,color:ss.color,fontSize:12,fontWeight:600}}>
                          <i className={`ti ${ss.icon}`}/>{fmtDate(c.next_service_date)}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{fontSize:12}}>
                      {c.price_yearly ? `${parseFloat(c.price_yearly).toFixed(2)} €/J.` :
                       c.price_per_service ? `${parseFloat(c.price_per_service).toFixed(2)} €/Service` : '—'}
                    </td>
                    <td><span style={{color:cs.color,fontWeight:600,fontSize:12}}>{cs.label}</span></td>
                    <td>
                      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                        {c.status === 'active' && (
                          <button className="btn xs" title="Wartung durchgeführt" onClick={()=>{setShowRecord(c);setRecordDate(today());setRecordNotes('');}}>
                            <i className="ti ti-tools"/> Durchgeführt
                          </button>
                        )}
                        <button className="btn xs" title="PDF Vorschau" onClick={()=>{
                          const token = localStorage.getItem('danitec_token');
                          const url = api.maintenanceContractPdfUrl(c.id);
                          fetch(url,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.blob()).then(b=>{
                            const u=URL.createObjectURL(b); window.open(u,'_blank');
                          });
                        }}><i className="ti ti-file-type-pdf"/></button>
                        <button className="btn xs" title="Per E-Mail senden" onClick={()=>{
                          setSendEmail({ to: c.customer_email||'', subject:`Wartungsvertrag ${c.order_number||c.contract_number} – ${c.name}`, body:`Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie Ihren Wartungsvertrag als PDF.\n\nMit freundlichen Grüßen` });
                          setShowSendModal(c);
                        }}><i className="ti ti-send"/></button>
                        <button className="btn xs" onClick={()=>openEdit(c)}><i className="ti ti-edit"/></button>
                        <button className="btn xs danger" onClick={()=>del(c)}><i className="ti ti-trash"/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>)}
      </div>

      {/* Modal: Neuer/Edit Wartungsvertrag */}
      <Modal open={showNew} title={editing ? `Vertrag bearbeiten – ${editing.contract_number}` : 'Neuer Wartungsvertrag'} onClose={()=>{setShowNew(false);setEditing(null);}} maxWidth={780}>
        <FormRow>
          <FormGroup label="Bezeichnung *">
            <select value={!form.name?'':WARTUNG_TYPEN.includes(form.name)?form.name:'__custom__'} onChange={e=>{ if(e.target.value==='__custom__') sf('name','__'); else sf('name',e.target.value); }}>
              <option value="">— Bitte wählen —</option>
              {WARTUNG_TYPEN.filter(t=>t!=='Sonstiges').map(t=><option key={t} value={t}>{t}</option>)}
              <option value="__custom__">Sonstiges (Freitext)</option>
            </select>
            {(form.name && !WARTUNG_TYPEN.filter(t=>t!=='Sonstiges').includes(form.name)) && <input value={form.name==='__'?'':form.name} onChange={e=>sf('name',e.target.value||'__')} placeholder="Bezeichnung eingeben..." style={{marginTop:6}}/>}
          </FormGroup>
          <FormGroup label="W-Nummer (leer = automatisch)">
            <input value={form.orderNumber||''} onChange={e=>sf('orderNumber',e.target.value)} placeholder="W-2026-0001"/>
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Status">
            <select value={form.status} onChange={e=>sf('status',e.target.value)}>
              {Object.entries(CONTRACT_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </FormGroup>
        </FormRow>

        <FormRow>
          <FormGroup label="Kunde *">
            <select value={form.customerId} onChange={e=>{sf('customerId',e.target.value);sf('equipmentIds',[]);}}
              style={!form.customerId?{borderColor:'var(--red)'}:{}}>
              <option value="">— Bitte Kunden wählen —</option>
              {(customers?.data||[]).map(c=><option key={c.id} value={c.id}>{c.customer_number?`[${c.customer_number}] `:''}{c.company_name||`${c.first_name} ${c.last_name}`}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Wartungsintervall">
            <select value={form.intervalMonths} onChange={e=>sf('intervalMonths',parseInt(e.target.value))}>
              {Object.entries(INTERVAL_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </FormGroup>
        </FormRow>

        <FormGroup label="Beschreibung">
          <input value={form.description} onChange={e=>sf('description',e.target.value)} placeholder="Kurzbeschreibung des Vertrags"/>
        </FormGroup>

        <FormRow>
          <FormGroup label="Vertragsbeginn">
            <input type="date" value={form.contractStart} onChange={e=>sf('contractStart',e.target.value)}/>
          </FormGroup>
          <FormGroup label="Vertragsende">
            <input type="date" value={form.contractEnd} onChange={e=>sf('contractEnd',e.target.value)}/>
          </FormGroup>
        </FormRow>

        <FormRow>
          <FormGroup label="Preis pro Service (€)">
            <input type="number" value={form.pricePerService} onChange={e=>sf('pricePerService',e.target.value)} step="0.01" min="0" placeholder="0.00"/>
          </FormGroup>
          <FormGroup label="Jahrespreis (€)">
            <input type="number" value={form.priceYearly} onChange={e=>sf('priceYearly',e.target.value)} step="0.01" min="0" placeholder="0.00"/>
          </FormGroup>
        </FormRow>

        <FormRow>
          <FormGroup label="Letzter Servicetermin">
            <input type="date" value={form.lastServiceDate} onChange={e=>sf('lastServiceDate',e.target.value)}/>
          </FormGroup>
          <FormGroup label="Nächster Servicetermin">
            <input type="date" value={form.nextServiceDate} onChange={e=>sf('nextServiceDate',e.target.value)}/>
          </FormGroup>
        </FormRow>

        {/* Referenz: A-Nummer + S-Nummer Dropdown */}
        <FormGroup label="Referenz (A-Nr. / S-Nr.)">
          <select value={form.referenceNumber||''} onChange={e=>sf('referenceNumber',e.target.value)}>
            <option value="">— Keine Referenz —</option>
            {allANummern.length > 0 && <optgroup label="── A-Nummern (Anlagen) ──">
              {allANummern.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>}
            {allSNummern.length > 0 && <optgroup label="── S-Nummern (Serviceberichte) ──">
              {allSNummern.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>}
          </select>
        </FormGroup>

        <FormGroup label="Notizen">
          <textarea value={form.notes} onChange={e=>sf('notes',e.target.value)} rows={2} placeholder="Interne Notizen zum Vertrag"/>
        </FormGroup>

        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
          <button className="btn" onClick={()=>{setShowNew(false);setEditing(null);}}>Abbrechen</button>
          <button className="btn primary" onClick={save}><i className="ti ti-check"/> Speichern</button>
        </div>
      </Modal>

      {/* Modal: E-Mail senden */}
      <Modal open={!!showSendModal} title="Wartungsvertrag per E-Mail senden" onClose={()=>setShowSendModal(null)} maxWidth={500}>
        {showSendModal && (
          <>
            <FormGroup label="An (E-Mail)">
              <input value={sendEmail.to} onChange={e=>setSendEmail(f=>({...f,to:e.target.value}))} placeholder="kunde@example.com"/>
            </FormGroup>
            <FormGroup label="Betreff">
              <input value={sendEmail.subject} onChange={e=>setSendEmail(f=>({...f,subject:e.target.value}))}/>
            </FormGroup>
            <FormGroup label="Nachricht">
              <textarea value={sendEmail.body} onChange={e=>setSendEmail(f=>({...f,body:e.target.value}))} rows={5}/>
            </FormGroup>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
              <button className="btn" onClick={()=>setShowSendModal(null)}>Abbrechen</button>
              <button className="btn primary" disabled={sending} onClick={async()=>{
                setSending(true);
                try {
                  await api.sendMaintenanceContractEmail(showSendModal.id, { toEmail:sendEmail.to, subject:sendEmail.subject, bodyText:sendEmail.body });
                  setAlert({type:'success',msg:`E-Mail an ${sendEmail.to} gesendet.`});
                  setShowSendModal(null);
                } catch(e){ setAlert({type:'error',msg:e.message}); }
                setSending(false);
              }}><i className="ti ti-send"/> {sending?'Sendet…':'Senden'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* Modal: Wartung durchgeführt */}
      <Modal open={!!showRecord} title="Wartung als durchgeführt eintragen" onClose={()=>setShowRecord(null)} maxWidth={460}>
        {showRecord && (
          <>
            <p style={{color:'var(--text-secondary)',fontSize:13,marginBottom:16}}>
              <strong>{showRecord.name}</strong> – {showRecord.customer_name}<br/>
              Nächster Termin wird automatisch auf +{showRecord.interval_months} Monate gesetzt.
            </p>
            <FormGroup label="Durchgeführt am">
              <input type="date" value={recordDate} onChange={e=>setRecordDate(e.target.value)}/>
            </FormGroup>
            <FormGroup label="Notizen (optional)">
              <textarea value={recordNotes} onChange={e=>setRecordNotes(e.target.value)} rows={3} placeholder="Was wurde gemacht?"/>
            </FormGroup>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
              <button className="btn" onClick={()=>setShowRecord(null)}>Abbrechen</button>
              <button className="btn primary" onClick={recordService}><i className="ti ti-check"/> Eintragen</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// ─── F-GASE-DOKUMENTATION ─────────────────────────────────────────────────────
const WORK_TYPES = {
  installation:  'Erstinstallation',
  maintenance:   'Wartung',
  repair:        'Reparatur',
  leak_check:    'Dichtigkeitsprüfung',
  refrigerant_add: 'Kältemittel auffüllen',
  refrigerant_remove: 'Kältemittel entnehmen',
  decommission:  'Außerbetriebnahme',
};
export function FGasLog() {
  const LAGERORTE = ['Lager','Firmenbus DTEC 1','Firmenbus DTEC 2','Sonstiges'];

  const { data: stockRaw, reload: reloadStock } = useData(() => api.refrigerantStock(), []);
  const { data: suppliersRaw } = useData(() => api.suppliers(), []);
  const { data: verlaufRaw, reload: reloadVerlauf } = useData(() => api.fgasLogs(), []);
  const bottles = stockRaw?.data || [];
  const suppliers = suppliersRaw?.data || [];
  const verlauf = verlaufRaw?.data || [];

  const [tab, setTab] = useState('bestand');

  // ── Flasche Modal ────────────────────────────────────────────────────────
  const [showBottle, setShowBottle] = useState(false);
  const [editBottle, setEditBottle] = useState(null);
  const emptyBottle = { refrigerantType:'', refrigerantCustom:'', lagerort:'', lagerortCustom:'', currentWeightKg:'', supplierId:'', notes:'' };
  const [bf, setBf] = useState(emptyBottle);
  const sbf = (k,v) => setBf(f=>({...f,[k]:v}));
  const [bottleSaving, setBottleSaving] = useState(false);

  function openBottleNew() { setEditBottle(null); setBf(emptyBottle); setShowBottle(true); }
  function openBottleEdit(b) {
    setEditBottle(b);
    setBf({
      refrigerantType: REFRIGERANTS.includes(b.refrigerant_type) ? b.refrigerant_type : 'Sonstiges',
      refrigerantCustom: REFRIGERANTS.includes(b.refrigerant_type) ? '' : b.refrigerant_type,
      lagerort: LAGERORTE.slice(0,-1).includes(b.lagerort||'') ? b.lagerort||'' : 'Sonstiges',
      lagerortCustom: LAGERORTE.slice(0,-1).includes(b.lagerort||'') ? '' : b.lagerort||'',
      currentWeightKg: b.current_weight_kg,
      supplierId: b.supplier_id||'',
      notes: b.notes||'',
    });
    setShowBottle(true);
  }
  async function saveBottle() {
    const realType = bf.refrigerantType==='Sonstiges' ? bf.refrigerantCustom : bf.refrigerantType;
    const realLager = bf.lagerort==='Sonstiges' ? bf.lagerortCustom : bf.lagerort;
    if (!realType || !bf.currentWeightKg) return;
    setBottleSaving(true);
    try {
      const body = { refrigerantType:realType, lagerort:realLager||null, currentWeightKg:parseFloat(bf.currentWeightKg), supplierId:bf.supplierId||null, notes:bf.notes||null };
      if (editBottle) await api.updateRefrigerantStock(editBottle.id, body);
      else            await api.createRefrigerantStock(body);
      setShowBottle(false);
      reloadStock();
    } catch(e) { alert(e.message); }
    finally { setBottleSaving(false); }
  }

  // ── Verlauf Modal ────────────────────────────────────────────────────────
  const [showVerlauf, setShowVerlauf] = useState(false);
  const [vf, setVf] = useState({ logDate:today(), refrigerantType:'', refrigerantCustom:'', lagerort:'', lagerortCustom:'', bewegung:'zugang', menge:'', notes:'' });
  const svf = (k,v) => setVf(f=>({...f,[k]:v}));
  const [verlaufSaving, setVerlaufSaving] = useState(false);

  async function saveVerlauf() {
    const realType = vf.refrigerantType==='Sonstiges' ? vf.refrigerantCustom : vf.refrigerantType;
    const realLager = vf.lagerort==='Sonstiges' ? vf.lagerortCustom : vf.lagerort;
    if (!realType || !vf.menge) return;
    setVerlaufSaving(true);
    try {
      await api.createFgasLog({ logDate:vf.logDate, refrigerantType:realType, technicianName:realLager, workType:vf.bewegung, amountAddedKg:vf.bewegung==='zugang'?parseFloat(vf.menge):null, amountRemovedKg:vf.bewegung==='abgang'?parseFloat(vf.menge):null, notes:vf.notes||null });
      setShowVerlauf(false);
      reloadVerlauf();
    } catch(e) { alert(e.message); }
    finally { setVerlaufSaving(false); }
  }

  // Gesamtbestand pro Kältemitteltyp
  const totalByType = bottles.reduce((acc, b) => {
    acc[b.refrigerant_type] = (acc[b.refrigerant_type]||0) + parseFloat(b.current_weight_kg||0);
    return acc;
  }, {});

  // Flaschen gruppiert nach Typ
  const grouped = bottles.reduce((acc, b) => {
    if (!acc[b.refrigerant_type]) acc[b.refrigerant_type] = [];
    acc[b.refrigerant_type].push(b);
    return acc;
  }, {});

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Kältemittel-Lager</h1>
          <p className="page-subtitle">Bestand und Bewegungen</p>
        </div>
        <button className="btn primary" onClick={tab==='bestand' ? openBottleNew : ()=>{ setVf({ logDate:today(), refrigerantType:'', refrigerantCustom:'', lagerort:'', lagerortCustom:'', bewegung:'zugang', menge:'', notes:'' }); setShowVerlauf(true); }}>
          <i className="ti ti-plus"/> {tab==='bestand' ? 'Flasche hinzufügen' : 'Bewegung'}
        </button>
      </div>

      {/* Gesamtbestand Kacheln */}
      {Object.keys(totalByType).length > 0 && (
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16}}>
          {Object.entries(totalByType).map(([type, kg]) => (
            <div key={type} className="card" style={{padding:'10px 18px',minWidth:130,cursor:'default'}}>
              <div style={{fontSize:11,color:'var(--text-tertiary)',fontWeight:700,textTransform:'uppercase',letterSpacing:.5}}>{type}</div>
              <div style={{fontSize:24,fontWeight:800,color:'var(--accent)',lineHeight:1.2}}>{kg.toFixed(2)} <span style={{fontSize:13,fontWeight:400}}>kg</span></div>
              <div style={{fontSize:11,color:'var(--text-secondary)'}}>{grouped[type]?.length} Flasche{grouped[type]?.length!==1?'n':''}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{display:'flex',gap:4,borderBottom:'1px solid var(--border)',marginBottom:14}}>
        {[['bestand','ti-package','Bestand'],['verlauf','ti-history','Verlauf']].map(([id,icon,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',fontSize:13,fontWeight:tab===id?700:500,color:tab===id?'var(--accent)':'var(--text-secondary)',background:'transparent',border:'none',borderBottom:tab===id?'2px solid var(--accent)':'2px solid transparent',cursor:'pointer',marginBottom:-1}}>
            <i className={`ti ${icon}`}/>{label}
          </button>
        ))}
      </div>

      {/* Tab: Bestand – eine Karte pro Kältemitteltyp */}
      {tab === 'bestand' && (
        bottles.length === 0
          ? <div className="card"><EmptyState icon="ti-droplet" title="Keine Flaschen erfasst" subtitle="Füge Flaschen einzeln hinzu — auch halb-volle."/></div>
          : Object.entries(grouped).map(([type, list]) => (
              <div key={type} className="card" style={{marginBottom:12,padding:0,overflow:'hidden'}}>
                <div style={{padding:'10px 16px',background:'var(--surface-2)',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontWeight:700,color:'var(--accent)',fontSize:15}}>{type}</span>
                  <span style={{fontSize:13,color:'var(--text-secondary)'}}>{list.length} Flasche{list.length!==1?'n':''} · <strong style={{color:'var(--blue)'}}>{list.reduce((s,b)=>s+parseFloat(b.current_weight_kg||0),0).toFixed(2)} kg gesamt</strong></span>
                </div>
                <table>
                  <thead><tr><th>#</th><th>Lagerort</th><th style={{textAlign:'right'}}>Kältemittelgewicht</th><th>Lieferant</th><th>Notiz</th><th/></tr></thead>
                  <tbody>
                    {list.map((b,i) => (
                      <tr key={b.id}>
                        <td style={{color:'var(--text-tertiary)',fontSize:12}}>#{i+1}</td>
                        <td style={{fontSize:13}}>{b.lagerort||'—'}</td>
                        <td style={{textAlign:'right',fontWeight:700,fontSize:15,color:parseFloat(b.current_weight_kg)<2?'var(--red)':'var(--text)'}}>
                          {parseFloat(b.current_weight_kg).toFixed(2)} kg
                          {parseFloat(b.current_weight_kg)<2 && <span style={{fontSize:10,color:'var(--red)',display:'block',fontWeight:400}}>⚠ Fast leer</span>}
                        </td>
                        <td style={{fontSize:12}}>{b.supplier_name||'—'}</td>
                        <td style={{fontSize:12,color:'var(--text-secondary)'}}>{b.notes||'—'}</td>
                        <td>
                          <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                            <button className="btn xs" onClick={()=>openBottleEdit(b)}><i className="ti ti-edit"/></button>
                            <button className="btn xs danger" onClick={async()=>{ if(confirm('Flasche löschen?')){ await api.deleteRefrigerantStock(b.id); reloadStock(); }}}><i className="ti ti-trash"/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
      )}

      {/* Tab: Verlauf */}
      {tab === 'verlauf' && (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {verlauf.length === 0
            ? <EmptyState icon="ti-history" title="Keine Bewegungen" subtitle="Erfasse Zugänge und Abgänge."/>
            : <table>
                <thead><tr><th>Datum</th><th>Kältemittel</th><th>Lagerort</th><th>Bewegung</th><th style={{textAlign:'right'}}>Menge</th><th>Notiz</th><th/></tr></thead>
                <tbody>
                  {verlauf.map(l => (
                    <tr key={l.id}>
                      <td style={{fontSize:12}}>{fmtDate(l.log_date)}</td>
                      <td><strong style={{fontSize:13}}>{l.refrigerant_type||'—'}</strong></td>
                      <td style={{fontSize:12}}>{l.technician_name||l.technician_user_name||'—'}</td>
                      <td><span style={{fontSize:11,fontWeight:700,color:l.work_type==='zugang'?'var(--green)':'var(--red)',padding:'2px 8px',borderRadius:4,background:l.work_type==='zugang'?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)'}}>{l.work_type==='zugang'?'↑ Zugang':'↓ Abgang'}</span></td>
                      <td style={{textAlign:'right',fontWeight:600}}>{l.amount_added_kg||l.amount_removed_kg||0} kg</td>
                      <td style={{fontSize:12,color:'var(--text-secondary)'}}>{l.notes||'—'}</td>
                      <td><button className="btn xs danger" onClick={async()=>{ if(confirm('Löschen?')){ await api.deleteFgasLog(l.id); reloadVerlauf(); }}}><i className="ti ti-trash"/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      )}

      {/* Flasche Modal */}
      <Modal open={showBottle} onClose={()=>setShowBottle(false)} title={editBottle?'Flasche bearbeiten':'Neue Flasche'} maxWidth={460}
        footer={<><button className="btn" onClick={()=>setShowBottle(false)}>Abbrechen</button><button className="btn primary" disabled={bottleSaving||!bf.refrigerantType||!bf.currentWeightKg} onClick={saveBottle}><i className="ti ti-check"/> Speichern</button></>}>
        <FormGroup label="Kältemittel *">
          <select value={bf.refrigerantType} onChange={e=>sbf('refrigerantType',e.target.value)}>
            <option value="">— Typ wählen —</option>
            {REFRIGERANTS.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          {bf.refrigerantType==='Sonstiges' && <input style={{marginTop:6}} value={bf.refrigerantCustom||''} onChange={e=>sbf('refrigerantCustom',e.target.value)} placeholder="Bezeichnung eingeben..."/>}
        </FormGroup>
        <FormGroup label="Kältemittelgewicht (kg) *">
          <input type="number" value={bf.currentWeightKg} onChange={e=>sbf('currentWeightKg',e.target.value)} min="0" step="0.1" placeholder="z.B. 11.5"/>
          <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:3}}>Gesamtgewicht − Tara (Leergewicht der Flasche)</div>
        </FormGroup>
        <FormGroup label="Lagerort">
          <select value={bf.lagerort} onChange={e=>sbf('lagerort',e.target.value)}>
            <option value="">— Lagerort wählen —</option>
            {LAGERORTE.map(l=><option key={l} value={l}>{l}</option>)}
          </select>
          {bf.lagerort==='Sonstiges' && <input style={{marginTop:6}} value={bf.lagerortCustom||''} onChange={e=>sbf('lagerortCustom',e.target.value)} placeholder="Lagerort eingeben..."/>}
        </FormGroup>
        <FormGroup label="Lieferant">
          <select value={bf.supplierId} onChange={e=>sbf('supplierId',e.target.value)}>
            <option value="">— Lieferant wählen —</option>
            {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Notiz"><input value={bf.notes||''} onChange={e=>sbf('notes',e.target.value)} placeholder="z.B. Charge, Kaufdatum..."/></FormGroup>
      </Modal>

      {/* Verlauf Modal */}
      <Modal open={showVerlauf} onClose={()=>setShowVerlauf(false)} title="Neue Bewegung" maxWidth={440}
        footer={<><button className="btn" onClick={()=>setShowVerlauf(false)}>Abbrechen</button><button className="btn primary" disabled={verlaufSaving||!vf.refrigerantType||!vf.menge} onClick={saveVerlauf}><i className="ti ti-check"/> Speichern</button></>}>
        <FormRow>
          <FormGroup label="Datum *"><input type="date" value={vf.logDate} onChange={e=>svf('logDate',e.target.value)}/></FormGroup>
          <FormGroup label="Bewegung">
            <select value={vf.bewegung} onChange={e=>svf('bewegung',e.target.value)}>
              <option value="zugang">↑ Zugang</option>
              <option value="abgang">↓ Abgang</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormGroup label="Kältemittel *">
          <select value={vf.refrigerantType} onChange={e=>svf('refrigerantType',e.target.value)}>
            <option value="">— Typ wählen —</option>
            {REFRIGERANTS.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          {vf.refrigerantType==='Sonstiges' && <input style={{marginTop:6}} value={vf.refrigerantCustom||''} onChange={e=>svf('refrigerantCustom',e.target.value)} placeholder="Bezeichnung..."/>}
        </FormGroup>
        <FormRow>
          <FormGroup label="Lagerort">
            <select value={vf.lagerort} onChange={e=>svf('lagerort',e.target.value)}>
              <option value="">— wählen —</option>
              {LAGERORTE.map(l=><option key={l} value={l}>{l}</option>)}
            </select>
            {vf.lagerort==='Sonstiges' && <input style={{marginTop:6}} value={vf.lagerortCustom||''} onChange={e=>svf('lagerortCustom',e.target.value)} placeholder="Lagerort..."/>}
          </FormGroup>
          <FormGroup label="Menge (kg) *"><input type="number" value={vf.menge} onChange={e=>svf('menge',e.target.value)} min="0" step="0.1" placeholder="0.0"/></FormGroup>
        </FormRow>
        <FormGroup label="Notiz"><input value={vf.notes||''} onChange={e=>svf('notes',e.target.value)} placeholder="Bemerkung..."/></FormGroup>
      </Modal>
    </div>
  );
}

// ─── ZEITERFASSUNG ────────────────────────────────────────────────────────────
const WORK_TYPE_LABELS = {
  work:      { label:'Arbeit',       color:'var(--accent)',  icon:'ti-briefcase' },
  travel:    { label:'Fahrt',        color:'var(--blue)',    icon:'ti-car' },
  training:  { label:'Schulung',     color:'var(--purple)',  icon:'ti-school' },
  sick:      { label:'Krank',        color:'var(--red)',     icon:'ti-stethoscope' },
  vacation:  { label:'Urlaub',       color:'var(--green)',   icon:'ti-beach' },
  holiday:   { label:'Feiertag',     color:'var(--amber)',   icon:'ti-calendar-event' },
};
const ENTRY_STATUS = {
  draft:     { label:'Entwurf',      color:'var(--text-secondary)' },
  submitted: { label:'Eingereicht',  color:'var(--amber)' },
  approved:  { label:'Genehmigt',    color:'var(--green)' },
};
const MONTH_NAMES = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

function fmtH(h) {
  if (h === null || h === undefined) return '—';
  const n = parseFloat(h);
  const hrs = Math.floor(n);
  const min = Math.round((n - hrs) * 60);
  return `${hrs}:${String(min).padStart(2,'0')} h`;
}

export function TimeTracking() {
  const now = new Date();
  const [tab, setTab]         = useState('entries'); // entries | month
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear, setSelYear]   = useState(now.getFullYear());
  const [selUserId, setSelUserId] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [alert, setAlert]     = useState(null);

  const { data: raw, loading, error, reload } = useData(
    () => api.timeEntries({ month: selMonth, year: selYear, userId: selUserId || undefined }),
    [selMonth, selYear, selUserId]
  );
  const { data: summary, reload: reloadSummary } = useData(
    () => api.timeSummary({ month: selMonth, year: selYear, userId: selUserId || undefined }),
    [selMonth, selYear, selUserId]
  );
  const { data: customers } = useData(() => api.customers());
  const { data: projects }  = useData(() => api.projects());

  const EMPTY_FORM = {
    entryDate: today(), startTime: '07:00', endTime: '16:00', breakMinutes: 30,
    workType: 'work', customerId: '', projectId: '', description: '',
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));

  // Live-Stundenberechnung im Formular
  const liveHours = useMemo(() => {
    if (!form.startTime || !form.endTime) return null;
    const [sh,sm] = form.startTime.split(':').map(Number);
    const [eh,em] = form.endTime.split(':').map(Number);
    const net = (eh*60+em) - (sh*60+sm) - parseInt(form.breakMinutes||0);
    return Math.max(0, Math.round(net*100/60)/100);
  }, [form.startTime, form.endTime, form.breakMinutes]);

  function openEdit(e) {
    setEditing(e);
    setForm({
      entryDate: e.entry_date?.split('T')[0] || today(),
      startTime: e.start_time?.slice(0,5) || '',
      endTime:   e.end_time?.slice(0,5) || '',
      breakMinutes: e.break_minutes || 0,
      workType: e.work_type || 'work',
      customerId: e.customer_id || '',
      projectId:  e.project_id || '',
      description: e.description || '',
    });
    setShowNew(true);
  }

  async function save() {
    try {
      if (editing) await api.updateTimeEntry(editing.id, form);
      else         await api.createTimeEntry(form);
      setShowNew(false); setEditing(null); setForm(EMPTY_FORM);
      reload(); reloadSummary();
    } catch(e) { setAlert({ type:'error', msg: e.message }); }
  }

  async function del(e) {
    if (!confirm('Eintrag löschen?')) return;
    try { await api.deleteTimeEntry(e.id); reload(); reloadSummary(); }
    catch(ex) { setAlert({ type:'error', msg: ex.message }); }
  }

  async function submitAll() {
    if (!confirm('Alle Entwürfe dieses Monats einreichen?')) return;
    try {
      await api.submitMonth({ month: selMonth, year: selYear });
      setAlert({ type:'success', msg:'Stundenzettel eingereicht.' });
      reload(); reloadSummary();
    } catch(e) { setAlert({ type:'error', msg: e.message }); }
  }

  const entries = raw?.data || [];
  const users   = summary?.users || [];
  const totals  = summary?.totals;
  const years   = Array.from({length:4},(_,i)=>now.getFullYear()-i);

  // Einträge nach Tagen gruppieren (für Monats-Tab)
  const dayMap = {};
  for (const e of entries) {
    const d = e.entry_date?.split('T')[0] || e.entry_date;
    if (!dayMap[d]) dayMap[d] = [];
    dayMap[d].push(e);
  }
  const days = Object.keys(dayMap).sort().reverse();

  if (loading) return <Spinner/>;
  if (error)   return <Alert type="error" msg={error}/>;

  return (
    <div className="page">
      {alert && <Alert type={alert.type} msg={alert.msg} onClose={()=>setAlert(null)}/>}

      {/* Header-Toolbar */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:16}}>
        {/* Monat/Jahr Picker */}
        <div className="card" style={{padding:'8px 12px',display:'flex',gap:8,alignItems:'center'}}>
          <button className="btn xs" onClick={()=>{ let m=selMonth-1,y=selYear; if(m<1){m=12;y--;} setSelMonth(m);setSelYear(y); }}>
            <i className="ti ti-chevron-left"/>
          </button>
          <strong style={{minWidth:140,textAlign:'center',fontSize:13}}>{MONTH_NAMES[selMonth-1]} {selYear}</strong>
          <button className="btn xs" onClick={()=>{ let m=selMonth+1,y=selYear; if(m>12){m=1;y++;} setSelMonth(m);setSelYear(y); }}>
            <i className="ti ti-chevron-right"/>
          </button>
        </div>

        {/* Admin: User-Auswahl */}
        {users.length > 0 && (
          <select value={selUserId} onChange={e=>setSelUserId(e.target.value)} style={{minWidth:160}}>
            <option value="">Eigene Einträge</option>
            {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}

        {/* Tabs */}
        <div style={{display:'flex',gap:4,marginLeft:'auto'}}>
          {[{id:'entries',label:'Einträge',icon:'ti-list'},{id:'month',label:'Monatsübersicht',icon:'ti-calendar-stats'}].map(t=>(
            <button key={t.id} className={`btn${tab===t.id?' primary':''}`} onClick={()=>setTab(t.id)}>
              <i className={`ti ${t.icon}`}/> {t.label}
            </button>
          ))}
        </div>

        <button className="btn primary" onClick={()=>{setEditing(null);setForm(EMPTY_FORM);setShowNew(true)}}>
          <i className="ti ti-plus"/> Neuer Eintrag
        </button>
      </div>

      {/* Monats-Summenkarten */}
      {totals && (
        <div className="dash-grid-4" style={{marginBottom:16}}>
          {[
            { label:'Gesamt',       val: fmtH(totals.total_hours),    icon:'ti-clock',          color:'var(--accent)' },
            { label:'Arbeitszeit',  val: fmtH(totals.work_hours),     icon:'ti-briefcase',      color:'var(--blue)' },
            { label:'Fahrtzeit',    val: fmtH(totals.travel_hours),   icon:'ti-car',            color:'var(--purple)' },
            { label:'Arbeitstage',  val: totals.working_days||0,      icon:'ti-calendar-check', color:'var(--green)' },
          ].map(s=>(
            <div key={s.label} className="card metric-card">
              <i className={`ti ${s.icon}`} style={{fontSize:22,color:s.color,marginBottom:4}}/>
              <div className="metric-value" style={{color:s.color,fontSize:typeof s.val==='string'?20:undefined}}>{s.val}</div>
              <div className="metric-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* TAB: Einträge Liste */}
      {tab === 'entries' && (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {entries.length === 0 ? (
            <EmptyState icon="ti-clock-hour-4" title="Keine Zeiteinträge" subtitle="Füge deinen ersten Eintrag für diesen Monat hinzu."/>
          ) : (
            <>
              <table>
                <thead>
                  <tr><th>Datum</th><th>Typ</th><th>Start</th><th>Ende</th><th>Pause</th><th>Stunden</th><th>Beschreibung</th><th>Status</th><th/></tr>
                </thead>
                <tbody>
                  {entries.map(e => {
                    const wt = WORK_TYPE_LABELS[e.work_type] || WORK_TYPE_LABELS.work;
                    const st = ENTRY_STATUS[e.status] || ENTRY_STATUS.draft;
                    return (
                      <tr key={e.id}>
                        <td style={{fontSize:12,whiteSpace:'nowrap'}}>{fmtDate(e.entry_date)}</td>
                        <td>
                          <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,padding:'2px 7px',borderRadius:4,background:`${wt.color}18`,color:wt.color,fontWeight:600}}>
                            <i className={`ti ${wt.icon}`}/>{wt.label}
                          </span>
                        </td>
                        <td style={{fontSize:12}}>{e.start_time?.slice(0,5)||'—'}</td>
                        <td style={{fontSize:12}}>{e.end_time?.slice(0,5)||'—'}</td>
                        <td style={{fontSize:12}}>{e.break_minutes ? `${e.break_minutes} min` : '—'}</td>
                        <td style={{fontWeight:700,fontSize:13,color:'var(--accent)'}}>{fmtH(e.total_hours)}</td>
                        <td style={{fontSize:12,maxWidth:200}}>
                          <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.description||'—'}</div>
                          {e.customer_name && <div style={{fontSize:10,color:'var(--text-secondary)'}}>{e.customer_name}</div>}
                        </td>
                        <td><span style={{fontSize:11,fontWeight:600,color:st.color}}>{st.label}</span></td>
                        <td>
                          <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                            {e.status === 'draft' && <button className="btn xs" onClick={()=>openEdit(e)}><i className="ti ti-edit"/></button>}
                            {e.status !== 'approved' && <button className="btn xs danger" onClick={()=>del(e)}><i className="ti ti-trash"/></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Stundenzettel einreichen */}
              {entries.some(e=>e.status==='draft') && (
                <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'flex-end'}}>
                  <button className="btn" onClick={submitAll}>
                    <i className="ti ti-send"/> Stundenzettel einreichen
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB: Monatsübersicht Kalender */}
      {tab === 'month' && (
        <div className="card" style={{padding:16}}>
          {days.length === 0 ? (
            <EmptyState icon="ti-calendar-stats" title="Keine Einträge" subtitle="Keine Zeiteinträge für diesen Monat."/>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {days.map(d => {
                const dayEntries = dayMap[d];
                const dayTotal = dayEntries.reduce((s,e)=>s+parseFloat(e.total_hours||0),0);
                const dateObj = new Date(d);
                const weekday = dateObj.toLocaleDateString('de-DE',{weekday:'short'});
                return (
                  <div key={d} style={{borderRadius:8,border:'1px solid var(--border)',overflow:'hidden'}}>
                    {/* Tages-Header */}
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',background:'var(--surface-2)'}}>
                      <span style={{fontSize:11,color:'var(--text-secondary)',width:30}}>{weekday}</span>
                      <strong style={{fontSize:13}}>{fmtDate(d)}</strong>
                      <span style={{marginLeft:'auto',fontWeight:700,fontSize:13,color:'var(--accent)'}}>{fmtH(Math.round(dayTotal*100)/100)}</span>
                    </div>
                    {/* Tages-Einträge */}
                    {dayEntries.map(e => {
                      const wt = WORK_TYPE_LABELS[e.work_type] || WORK_TYPE_LABELS.work;
                      const st = ENTRY_STATUS[e.status] || ENTRY_STATUS.draft;
                      return (
                        <div key={e.id} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 14px',borderTop:'1px solid var(--border)',fontSize:12}}>
                          <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:10,padding:'1px 6px',borderRadius:3,background:`${wt.color}18`,color:wt.color,fontWeight:600,minWidth:70}}>
                            <i className={`ti ${wt.icon}`}/>{wt.label}
                          </span>
                          <span style={{color:'var(--text-secondary)',whiteSpace:'nowrap'}}>
                            {e.start_time?.slice(0,5)||'?'} – {e.end_time?.slice(0,5)||'?'}
                            {e.break_minutes ? ` (${e.break_minutes}' Pause)` : ''}
                          </span>
                          <span style={{fontWeight:600,whiteSpace:'nowrap'}}>{fmtH(e.total_hours)}</span>
                          <span style={{flex:1,color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.description||''}</span>
                          {e.customer_name && <span style={{fontSize:10,color:'var(--text-tertiary)',whiteSpace:'nowrap'}}>{e.customer_name}</span>}
                          <span style={{fontSize:10,fontWeight:600,color:st.color}}>{st.label}</span>
                          {e.status==='draft' && (
                            <button className="btn xs" onClick={()=>openEdit(e)}><i className="ti ti-edit"/></button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Monats-Zusammenfassung */}
              {totals && (
                <div style={{borderRadius:8,border:'1px solid var(--border)',padding:'12px 16px',background:'var(--surface-2)',display:'flex',gap:24,flexWrap:'wrap'}}>
                  <strong style={{fontSize:12,color:'var(--text-secondary)',alignSelf:'center'}}>MONATSGESAMT</strong>
                  {[
                    ['Gesamt',      fmtH(totals.total_hours),    'var(--accent)'],
                    ['Arbeitszeit', fmtH(totals.work_hours),     'var(--blue)'],
                    ['Fahrtzeit',   fmtH(totals.travel_hours),   'var(--purple)'],
                    totals.sick_hours>0 && ['Krank',    fmtH(totals.sick_hours),    'var(--red)'],
                    totals.vacation_hours>0 && ['Urlaub',fmtH(totals.vacation_hours),'var(--green)'],
                  ].filter(Boolean).map(([label,val,color])=>(
                    <div key={label} style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
                      <span style={{fontWeight:700,fontSize:15,color}}>{val}</span>
                      <span style={{fontSize:10,color:'var(--text-secondary)'}}>{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: Neuer/Edit Zeiteintrag */}
      <Modal open={showNew} title={editing ? 'Zeiteintrag bearbeiten' : 'Neuer Zeiteintrag'} onClose={()=>{setShowNew(false);setEditing(null);}} maxWidth={600}>
        <FormRow>
          <FormGroup label="Datum *">
            <input type="date" value={form.entryDate} onChange={e=>sf('entryDate',e.target.value)}/>
          </FormGroup>
          <FormGroup label="Typ">
            <select value={form.workType} onChange={e=>sf('workType',e.target.value)}>
              {Object.entries(WORK_TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </FormGroup>
        </FormRow>

        <FormRow>
          <FormGroup label="Von">
            <input type="time" value={form.startTime} onChange={e=>sf('startTime',e.target.value)}/>
          </FormGroup>
          <FormGroup label="Bis">
            <input type="time" value={form.endTime} onChange={e=>sf('endTime',e.target.value)}/>
          </FormGroup>
          <FormGroup label="Pause (min)">
            <input type="number" value={form.breakMinutes} onChange={e=>sf('breakMinutes',e.target.value)} min="0" step="5" placeholder="30"/>
          </FormGroup>
        </FormRow>

        {/* Live-Berechnung */}
        {liveHours !== null && (
          <div style={{background:'rgba(0,229,255,0.06)',border:'1px solid rgba(0,229,255,0.2)',borderRadius:8,padding:'8px 14px',marginBottom:12,fontSize:13,display:'flex',gap:8,alignItems:'center'}}>
            <i className="ti ti-clock" style={{color:'var(--accent)'}}/>
            <strong style={{color:'var(--accent)'}}>{fmtH(liveHours)}</strong>
            <span style={{color:'var(--text-secondary)'}}>Nettoarbeitszeit</span>
          </div>
        )}

        <FormRow>
          <FormGroup label="Kunde">
            <select value={form.customerId} onChange={e=>sf('customerId',e.target.value)}>
              <option value="">— kein Kunde —</option>
              {(customers?.data||[]).map(c=><option key={c.id} value={c.id}>{c.company_name||`${c.first_name} ${c.last_name}`}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Projekt">
            <select value={form.projectId} onChange={e=>sf('projectId',e.target.value)}>
              <option value="">— kein Projekt —</option>
              {(projects?.data||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FormGroup>
        </FormRow>

        <FormGroup label="Beschreibung / Tätigkeit">
          <textarea value={form.description} onChange={e=>sf('description',e.target.value)} rows={3} placeholder="Was wurde gemacht? Wo war der Einsatz?"/>
        </FormGroup>

        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
          <button className="btn" onClick={()=>{setShowNew(false);setEditing(null);}}>Abbrechen</button>
          <button className="btn primary" onClick={save}><i className="ti ti-check"/> Speichern</button>
        </div>
      </Modal>
    </div>
  );
}


// ─── KOMBINIERTE RECHNUNGSSEITE (Ausgang + Eingang) ──────────────────────────
export function InvoicesPage({ onNavigate }) {
  const [tab, setTab] = useState('outgoing');
  return (
    <div className="page-body" style={{paddingTop:0}}>
      <div style={{display:'flex',gap:0,borderBottom:'2px solid var(--border)',marginBottom:0,padding:'0 0'}}>
        {[['outgoing','ti-file-invoice','Ausgangsrechnungen'],['incoming','ti-file-arrow-left','Eingangsrechnungen']].map(([id,icon,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{
            display:'flex',alignItems:'center',gap:6,padding:'10px 20px',fontSize:13,fontWeight:tab===id?700:400,
            background:'none',border:'none',cursor:'pointer',
            color:tab===id?'var(--accent)':'var(--text-secondary)',
            borderBottom:tab===id?'2.5px solid var(--accent)':'2.5px solid transparent',
            marginBottom:-2,
          }}>
            <i className={`ti ${icon}`}/>{label}
          </button>
        ))}
      </div>
      {tab==='outgoing' ? <InvoicesInner onNavigate={onNavigate}/> : <IncomingInvoicesInner/>}
    </div>
  );
}

// ─── EINGANGSRECHNUNGEN ───────────────────────────────────────────────────────
function IncomingInvoicesInner() {
  const { data, loading, reload } = useData(() => api.incomingInvoices(), []);
  const { data: suppliers } = useData(() => api.suppliers(), []);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const emptyForm = { supplierId:'', invoiceNumber:'', description:'', amount:'', vatRate:20, status:'offen', invoiceDate:'', dueDate:'' };
  const [form, setForm] = useState(emptyForm);
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));

  const rows = (data?.data || []).filter(r =>
    !search || (r.description||'').toLowerCase().includes(search.toLowerCase()) ||
    (r.supplier_name||'').toLowerCase().includes(search.toLowerCase()) ||
    (r.invoice_number||'').toLowerCase().includes(search.toLowerCase())
  );

  function openNew() { setEditing(null); setForm(emptyForm); setShowModal(true); }
  function openEdit(r) {
    setEditing(r);
    setForm({ supplierId:r.supplier_id||'', invoiceNumber:r.invoice_number||'', description:r.description||'', amount:r.amount||'', vatRate:r.vat_rate||20, status:r.status||'offen', invoiceDate:r.invoice_date?.split('T')[0]||'', dueDate:r.due_date?.split('T')[0]||'' });
    setShowModal(true);
  }

  async function save() {
    if (!form.amount) return;
    setSaving(true);
    try {
      const body = { supplierId:form.supplierId||null, invoiceNumber:form.invoiceNumber, description:form.description, amount:parseFloat(form.amount), vatRate:parseFloat(form.vatRate)||20, status:form.status, invoiceDate:form.invoiceDate||null, dueDate:form.dueDate||null };
      if (editing) await api.updateIncomingInvoice(editing.id, body);
      else         await api.createIncomingInvoice(body);
      setShowModal(false); reload();
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function del(id) {
    if (!confirm('Eingangsrechnung löschen?')) return;
    await api.deleteIncomingInvoice(id); reload();
  }

  const STATUS_COLOR = { offen:'var(--amber)', bezahlt:'var(--green)', überfällig:'var(--red)' };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Eingangsrechnungen</h1>
          <p className="page-subtitle">Rechnungen von Lieferanten verwalten</p>
        </div>
        <button className="btn primary" onClick={openNew}><i className="ti ti-plus"/> Neue Rechnung</button>
      </div>

      <div className="card" style={{marginBottom:14,padding:'10px 14px'}}>
        <input placeholder="Suche nach Lieferant, Beschreibung, Nr..." value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:380}}/>
      </div>

      <div className="card" style={{padding:0,overflow:'hidden'}}>
        {loading ? <div style={{padding:40,textAlign:'center'}}><Spinner/></div> :
        rows.length === 0
          ? <EmptyState icon="ti-file-invoice" title="Keine Eingangsrechnungen" subtitle="Noch keine Lieferantenrechnungen erfasst."/>
          : <table>
              <thead>
                <tr>
                  <th>Lieferant</th>
                  <th>Rechnungs-Nr.</th>
                  <th>Beschreibung</th>
                  <th>Datum</th>
                  <th>Fällig</th>
                  <th style={{textAlign:'right'}}>Betrag</th>
                  <th>USt</th>
                  <th>Status</th>
                  <th/>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{fontWeight:500,fontSize:13}}>{r.supplier_name||'—'}</td>
                    <td style={{fontSize:12,color:'var(--text-secondary)'}}>{r.invoice_number||'—'}</td>
                    <td style={{fontSize:12}}>{r.description||'—'}</td>
                    <td style={{fontSize:12}}>{r.invoice_date ? fmtDate(r.invoice_date) : '—'}</td>
                    <td style={{fontSize:12,color:r.status==='überfällig'?'var(--red)':undefined}}>{r.due_date ? fmtDate(r.due_date) : '—'}</td>
                    <td style={{textAlign:'right',fontWeight:600,fontSize:13}}>{parseFloat(r.amount||0).toLocaleString('de-AT',{minimumFractionDigits:2})} €</td>
                    <td style={{fontSize:12}}>{r.vat_rate||0}%</td>
                    <td><span style={{fontSize:11,fontWeight:600,color:STATUS_COLOR[r.status]||'var(--text-secondary)'}}>{r.status}</span></td>
                    <td>
                      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                        <button className="btn xs" onClick={()=>openEdit(r)}><i className="ti ti-edit"/></button>
                        <button className="btn xs danger" onClick={()=>del(r.id)}><i className="ti ti-trash"/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>

      <Modal open={showModal} onClose={()=>setShowModal(false)} title={editing?'Eingangsrechnung bearbeiten':'Neue Eingangsrechnung'} maxWidth={560}
        footer={<>
          <button className="btn" onClick={()=>setShowModal(false)}>Abbrechen</button>
          <button className="btn primary" disabled={saving||!form.amount} onClick={save}><i className="ti ti-check"/> Speichern</button>
        </>}>
        <FormRow>
          <FormGroup label="Lieferant">
            <select value={form.supplierId} onChange={e=>sf('supplierId',e.target.value)}>
              <option value="">— kein Lieferant —</option>
              {(suppliers?.data||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Rechnungs-Nr.">
            <input value={form.invoiceNumber} onChange={e=>sf('invoiceNumber',e.target.value)} placeholder="RE-2026-001"/>
          </FormGroup>
        </FormRow>
        <FormGroup label="Beschreibung">
          <input value={form.description} onChange={e=>sf('description',e.target.value)} placeholder="Wofür ist die Rechnung?"/>
        </FormGroup>
        <FormRow>
          <FormGroup label="Betrag (brutto) *">
            <input type="number" value={form.amount} onChange={e=>sf('amount',e.target.value)} step="0.01" min="0" placeholder="0.00"/>
          </FormGroup>
          <FormGroup label="USt-Satz">
            <select value={form.vatRate} onChange={e=>sf('vatRate',e.target.value)}>
              <option value="20">20%</option>
              <option value="10">10%</option>
              <option value="13">13%</option>
              <option value="0">0% (steuerfrei)</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="Rechnungsdatum">
            <input type="date" value={form.invoiceDate} onChange={e=>sf('invoiceDate',e.target.value)}/>
          </FormGroup>
          <FormGroup label="Fälligkeitsdatum">
            <input type="date" value={form.dueDate} onChange={e=>sf('dueDate',e.target.value)}/>
          </FormGroup>
        </FormRow>
        <FormGroup label="Status">
          <select value={form.status} onChange={e=>sf('status',e.target.value)}>
            <option value="offen">Offen</option>
            <option value="bezahlt">Bezahlt</option>
            <option value="überfällig">Überfällig</option>
          </select>
        </FormGroup>
      </Modal>
    </div>
  );
}
