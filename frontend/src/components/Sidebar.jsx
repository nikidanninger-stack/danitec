import React from 'react';
import { useAuth } from '../hooks/useAuth';

// roles: undefined = alle, sonst Array mit erlaubten Rollen
const PAGES = [
  // ── Übersicht ──────────────────────────────────────────────────────────────
  { id:'dashboard',              label:'Dashboard',            icon:'ti-dashboard',          section:'Übersicht' },

  // ── Kunden & Einsätze ─────────────────────────────────────────────────────
  { id:'customers',              label:'Kunden',               icon:'ti-users',              section:'Kunden & Einsätze',   roles:['admin','geschaeftsfuehrer','verwaltung','disponent'] },
  { id:'equipment',              label:'Kundenanlagen',        icon:'ti-air-conditioning',   section:'Kunden & Einsätze',   roles:['admin','geschaeftsfuehrer','verwaltung','disponent','montage','techniker'], badge:'dueMaintenance' },
  { id:'maintenance-contracts',  label:'Wartungsverträge',     icon:'ti-file-certificate',   section:'Kunden & Einsätze',   roles:['admin','geschaeftsfuehrer','verwaltung','montage','techniker'], badge:'dueContracts' },
  { id:'service-reports',        label:'Serviceberichte',      icon:'ti-clipboard-check',    section:'Kunden & Einsätze',   roles:['admin','geschaeftsfuehrer','verwaltung','montage','techniker','disponent'] },
  { id:'fgas',                   label:'Kältemittel-Lager', icon:'ti-snowflake',          section:'Lager & Stammdaten',  roles:['admin','geschaeftsfuehrer','verwaltung','montage','techniker'] },
  { id:'projects',               label:'Planungsprojekte',     icon:'ti-hammer',             section:'Kunden & Einsätze',   roles:['admin','geschaeftsfuehrer','verwaltung','disponent','buchhaltung'], badge:'openTasks' },
  { id:'klima-kalkulation',      label:'Klimamontage Kalkulation', icon:'ti-calculator',     section:'Kunden & Einsätze',   roles:['admin','geschaeftsfuehrer','verwaltung','disponent','montage','techniker','buchhaltung'], highlight: true },
  { id:'kuehlraum-kalkulation',  label:'Kühlraum Kalkulation',     icon:'ti-snowflake',      section:'Kunden & Einsätze',   roles:['admin','geschaeftsfuehrer','verwaltung','disponent','montage','techniker','buchhaltung'], highlight: true },
  { id:'plaud',                  label:'Plaud Gespräch',           icon:'ti-microphone',     section:'Kunden & Einsätze',   roles:['admin','geschaeftsfuehrer','verwaltung','montage','techniker','disponent'], highlight: true },

  // ── Buchhaltung & Belege ──────────────────────────────────────────────────
  { id:'kassabuch',              label:'Kassabuch',            icon:'ti-cash',               section:'Buchhaltung & Belege', roles:['admin','geschaeftsfuehrer','verwaltung'] },
  { id:'invoices',               label:'Rechnungen',           icon:'ti-file-invoice',       section:'Buchhaltung & Belege', roles:['admin','geschaeftsfuehrer','buchhaltung','verwaltung'], badge:'overdue' },
  { id:'offers',                 label:'Angebote',             icon:'ti-clipboard',          section:'Buchhaltung & Belege', roles:['admin','geschaeftsfuehrer','buchhaltung','verwaltung'] },
  { id:'expenses',               label:'Ausgaben',             icon:'ti-receipt-2',          section:'Buchhaltung & Belege', roles:['admin','geschaeftsfuehrer','buchhaltung','verwaltung'] },
  { id:'documents',              label:'Belege & Dokumente',   icon:'ti-files',              section:'Buchhaltung & Belege', roles:['admin','geschaeftsfuehrer','buchhaltung','verwaltung'] },
  { id:'vat',                    label:'USt-Übersicht',        icon:'ti-percentage',         section:'Buchhaltung & Belege', roles:['admin','geschaeftsfuehrer','buchhaltung'] },
  { id:'ea',                     label:'E/A-Rechnung',         icon:'ti-chart-bar',          section:'Buchhaltung & Belege', roles:['admin','geschaeftsfuehrer','buchhaltung'] },

  // ── Lager & Stammdaten ────────────────────────────────────────────────────
  { id:'products',               label:'Lagerbestand',         icon:'ti-package',            section:'Lager & Stammdaten',  roles:['admin','geschaeftsfuehrer','lager','verwaltung','montage','techniker'] },
  { id:'services',               label:'Leistungen',           icon:'ti-tool',               section:'Lager & Stammdaten',  roles:['admin','geschaeftsfuehrer','lager','verwaltung','montage','techniker'] },
  { id:'suppliers',              label:'Lieferanten',          icon:'ti-truck',              section:'Lager & Stammdaten',  roles:['admin','geschaeftsfuehrer','lager','buchhaltung','verwaltung'] },
  { id:'assets',                 label:'Anlagenverzeichnis',   icon:'ti-building-factory',   section:'Lager & Stammdaten',  roles:['admin','geschaeftsfuehrer','verwaltung'] },
  { id:'time-tracking',          label:'Arbeitszeit',          icon:'ti-clock',              section:'Lager & Stammdaten',  roles:['admin','geschaeftsfuehrer','verwaltung','montage','techniker','disponent'] },

  // ── Dokumente & Ablage ────────────────────────────────────────────────────
  { id:'calendar',               label:'Kalender',             icon:'ti-calendar',           section:'Dokumente & Ablage' },
  { id:'workspace',              label:'Workspace',            icon:'ti-layout-board',       section:'Dokumente & Ablage' },
  { id:'drive',                  label:'Google Drive',         icon:'ti-brand-google-drive', section:'Dokumente & Ablage' },

  // ── System ────────────────────────────────────────────────────────────────
  { id:'export',                 label:'Steuerberater-Export', icon:'ti-upload',             section:'System',              roles:['admin','geschaeftsfuehrer','buchhaltung'] },
  { id:'audit',                  label:'Audit-Log',            icon:'ti-shield-lock',        section:'System',              roles:['admin','geschaeftsfuehrer'] },
  { id:'admin',                  label:'Admin Dashboard',      icon:'ti-adjustments-alt',    section:'System',              roles:['admin'] },
  { id:'settings',               label:'Einstellungen',        icon:'ti-settings',           section:'System' },
];

const SECTIONS = ['Übersicht','Kunden & Einsätze','Buchhaltung & Belege','Lager & Stammdaten','Dokumente & Ablage','System'];

export default function Sidebar({ currentPage, onNavigate, badges = {}, open, onClose }) {
  const { user, company, logout } = useAuth();
  const role = user?.role || 'admin';
  const canSee = (p) => !p.roles || p.roles.includes(role);
  const sections = SECTIONS.map(s => ({ s, pages: PAGES.filter(p => p.section === s && canSee(p)) })).filter(({pages}) => pages.length > 0);

  const handleNav = (id) => {
    onNavigate(id);
    onClose?.();
  };

  const avatarInitial = user?.name ? user.name.charAt(0).toUpperCase() : '?';

  return (
    <>
      {/* Overlay für Mobile */}
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={onClose}/>

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <img
            src="/logo.png"
            alt="Danitec Kälte & Klimatechnik"
            style={{
              width: '100%',
              maxWidth: 190,
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '6px 0', overflowY: 'auto' }}>
          {sections.map(({ s, pages }) => (
            <div key={s}>
              <div className="nav-section">{s}</div>
              {pages.map(p => (
                <div
                  key={p.id}
                  className={`nav-item ${currentPage === p.id ? 'active' : ''}`}
                  onClick={() => handleNav(p.id)}
                  title={p.label}
                  style={p.highlight && currentPage !== p.id ? {
                    background: 'linear-gradient(90deg, rgba(16,185,129,0.1), transparent)',
                    color: 'var(--green)',
                  } : undefined}
                >
                  <i className={`ti ${p.icon}`} style={p.highlight && currentPage !== p.id ? { color: 'var(--green)' } : undefined}/>
                  <span>{p.label}</span>
                  {p.badge && badges[p.badge] > 0 && (
                    <span className="nav-badge">{badges[p.badge]}</span>
                  )}
                  {p.highlight && <span style={{ fontSize: 9, padding: '1px 5px', background: 'var(--green)', color: '#fff', borderRadius: 4, marginLeft: 'auto' }}>NEU</span>}
                </div>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{avatarInitial}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.name}</div>
              <div className="sidebar-user-role">{user?.role}</div>
            </div>
          </div>
          {company?.name && (
            <div className="sidebar-company">
              <i className="ti ti-building" style={{ fontSize: 11, marginRight: 4 }}/>{company.name}
            </div>
          )}
          <button
            className="btn ghost sm"
            style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
            onClick={logout}
          >
            <i className="ti ti-logout"/> Abmelden
          </button>
        </div>
      </aside>
    </>
  );
}
