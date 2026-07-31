import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import {
  Dashboard, InvoicesPage, Offers,
  Customers, Suppliers, Products,
  Expenses, Assets, Documents,
  VATReport, EAReport, Export,
  AuditLog, Settings, AdminDashboard, ScanInvoice,
  Projects, Equipment, ServiceReports, MaintenanceContracts,
  FGasLog, TimeTracking, GoogleDrivePage, CalendarPage, WorkspacePage,
  PlaudImport,
} from './pages/Pages';
import { api } from './api/client';
import KlimaKalkulation from './pages/KlimaKalkulation';
import KuehlraumKalkulation from './pages/KuehlraumKalkulation';

// Stabile Wrapper-Komponenten für Products-Tabs (verhindert Remount)
const Lagerbestand = (props) => <Products {...props} defaultTab="materials" />;
const Leistungen   = (props) => <Products {...props} defaultTab="services"  />;

// ─── Seitentitel-Mapping ──────────────────────────────────────────────────────
const PAGE_META = {
  dashboard:  { title: 'Dashboard',             icon: 'ti-dashboard' },
  scan:       { title: 'Rechnung scannen',       icon: 'ti-camera' },
  projects:          { title: 'Planungsprojekte',       icon: 'ti-hammer' },
  'service-reports':       { title: 'Serviceberichte',       icon: 'ti-clipboard-check' },
  equipment:               { title: 'Kundenanlagen',         icon: 'ti-air-conditioning' },
  'maintenance-contracts': { title: 'Wartungsverträge',      icon: 'ti-file-certificate' },
  invoices:   { title: 'Rechnungen',            icon: 'ti-file-invoice' },
  offers:     { title: 'Angebote',              icon: 'ti-clipboard' },
  expenses:   { title: 'Ausgaben',              icon: 'ti-receipt-2' },
  'incoming-invoices': { title: 'Eingangsrechnungen', icon: 'ti-file-arrow-left' },
  'fgas':           { title: 'F-Gase Dokumentation',  icon: 'ti-snowflake' },
  'time-tracking':  { title: 'Arbeitszeit',             icon: 'ti-clock' },
  vat:        { title: 'USt-Übersicht',         icon: 'ti-percentage' },
  ea:         { title: 'E/A-Rechnung',          icon: 'ti-chart-bar' },
  customers:  { title: 'Kunden',                icon: 'ti-users' },
  suppliers:  { title: 'Lieferanten',           icon: 'ti-truck' },
  products:   { title: 'Lagerbestand',           icon: 'ti-package' },
  services:   { title: 'Leistungen',             icon: 'ti-tool' },
  assets:     { title: 'Anlagenverzeichnis',    icon: 'ti-building-factory' },
  documents:  { title: 'Belege & Dokumente',    icon: 'ti-files' },
  export:     { title: 'Steuerberater-Export',  icon: 'ti-upload' },
  audit:      { title: 'Audit-Log',             icon: 'ti-shield-lock' },
  admin:      { title: 'Admin Dashboard',       icon: 'ti-adjustments-alt' },
  settings:   { title: 'Einstellungen',         icon: 'ti-settings' },
  drive:      { title: 'Google Drive',          icon: 'ti-brand-google-drive' },
  calendar:   { title: 'Kalender',              icon: 'ti-calendar' },
  workspace:  { title: 'Workspace',             icon: 'ti-layout-board' },
  'klima-kalkulation':     { title: 'Klimamontage Kalkulation', icon: 'ti-calculator' },
  'kuehlraum-kalkulation': { title: 'Kühlraum Kalkulation',     icon: 'ti-snowflake'  },
  plaud:                   { title: 'Plaud Kundengespräch',      icon: 'ti-microphone' },
};

const PAGE_COMPONENTS = {
  dashboard: Dashboard,
  scan:      ScanInvoice,
  projects:          Projects,
  'service-reports':       ServiceReports,
  equipment:               Equipment,
  'maintenance-contracts': MaintenanceContracts,
  invoices:  InvoicesPage,
  offers:    Offers,
  customers: Customers,
  suppliers: Suppliers,
  products:  Lagerbestand,
  services:  Leistungen,
  expenses:  Expenses,
  'incoming-invoices': InvoicesPage,
  'fgas':          FGasLog,
  'time-tracking': TimeTracking,
  vat:       VATReport,
  ea:        EAReport,
  assets:    Assets,
  documents: Documents,
  export:    Export,
  audit:     AuditLog,
  admin:     AdminDashboard,
  settings:  Settings,
  drive:     GoogleDrivePage,
  calendar:  CalendarPage,
  workspace: WorkspacePage,
  'klima-kalkulation':     KlimaKalkulation,
  'kuehlraum-kalkulation': KuehlraumKalkulation,
  plaud:                   PlaudImport,
};

// ─── App Shell (nach Login) ───────────────────────────────────────────────────
function AppShell({ initialPage = 'dashboard' }) {
  const { user, company } = useAuth();
  const [page, setPage] = useState(initialPage);
  const [badges, setBadges] = useState({ overdue: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Überfällige Rechnungen zählen
  useEffect(() => {
    const check = async () => {
      try {
        const token = localStorage.getItem('danitec_token');
        const res = await fetch('/api/reports/dashboard', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setBadges({ overdue: data.ueberfaellig || 0 });
      } catch (_) {}
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  const meta = PAGE_META[page] || PAGE_META.dashboard;
  const PageComponent = PAGE_COMPONENTS[page] || Dashboard;

  return (
    <div className="app-layout">
      <Sidebar
        currentPage={page}
        onNavigate={setPage}
        badges={badges}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="main-content">
        {/* Header */}
        <header className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="menu-toggle" onClick={() => setSidebarOpen(o => !o)}>
              <i className="ti ti-menu-2"/>
            </button>
            <h1>
              <i className={`ti ${meta.icon}`} style={{ color: 'var(--accent)' }}/>
              {meta.title}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
            <span><i className="ti ti-building" style={{ marginRight: 4 }}/>{company?.name || user?.company_id}</span>
            <span style={{ color: 'var(--text-tertiary)' }}>·</span>
            <span>{user?.name}</span>
          </div>
        </header>

        {/* Seite */}
        <PageComponent key={page} onNavigate={setPage}/>
      </div>
    </div>
  );
}

// ─── Salt Edge Callback Handler ──────────────────────────────────────────────
function BankingCallback({ onDone }) {
  const [msg, setMsg] = React.useState('Bankverbindung wird abgeschlossen...');

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectionId = params.get('connection_id');

    async function finish() {
      try {
        await api.bankingComplete({ connectionId });
        setMsg('✓ Bank erfolgreich verbunden! Weiterleitung...');
      } catch(e) {
        setMsg(`Fehler: ${e.message}`);
      }
      setTimeout(() => {
        window.history.replaceState({}, '', '/');
        onDone();
      }, 1800);
    }
    finish();
  }, []);

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div style={{ textAlign:'center' }}>
        <i className="ti ti-bank" style={{ fontSize:40, color:'var(--accent)', display:'block', marginBottom:16 }}/>
        <div style={{ color:'var(--text-primary)', fontSize:15 }}>{msg}</div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function Root() {
  const { user, loading } = useAuth();
  const [page, setPage] = React.useState(() => {
    // Initial-Seite aus URL ableiten (für Banking-Callback)
    if (window.location.pathname === '/banking-callback') return 'banking-callback';
    return 'dashboard';
  });

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <i className="ti ti-snowflake" style={{ fontSize: 36, color: 'var(--accent)', display: 'block', marginBottom: 12 }}/>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Danitec wird geladen...</div>
        </div>
      </div>
    );
  }

  if (!user) return <Login/>;

  if (page === 'banking-callback') {
    return <BankingCallback onDone={() => setPage('settings')}/>;
  }

  return <AppShell initialPage={page}/>;
}

export default function App() {
  return (
    <AuthProvider>
      <Root/>
    </AuthProvider>
  );
}
