// ─── Danitec API Client ───────────────────────────────────────────────────────
const BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api');

function getToken() {
  return localStorage.getItem('danitec_token');
}

async function request(method, path, body = null, params = {}) {
  const fullUrl = BASE.startsWith('http') ? `${BASE}${path}` : `${window.location.origin}${BASE}${path}`;
  const url = new URL(fullUrl);
  Object.entries(params).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, v));

  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (res.status === 401) {
    localStorage.removeItem('danitec_token');
    window.location.href = '/login';
    return;
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

export const api = {
  // Auth
  login:    (email, password) => request('POST', '/auth/login', { email, password }),
  register: (body)            => request('POST', '/auth/register', body),
  me:       ()                => request('GET', '/auth/me'),

  // Rechnungen
  invoices:        (params={}) => request('GET', '/invoices', null, params),
  invoice:         (id)        => request('GET', `/invoices/${id}`),
  createInvoice:   (body)      => request('POST', '/invoices', body),
  finalizeInvoice: (id)        => request('POST', `/invoices/${id}/finalize`),
  payInvoice:      (id, body)  => request('POST', `/invoices/${id}/payment`, body),
  cancelInvoice:   (id)        => request('POST', `/invoices/${id}/cancel`),

  // Angebote
  offers:           (params={}) => request('GET', '/offers', null, params),
  createOffer:      (body)      => request('POST', '/offers', body),
  sendOffer:        (id)        => request('POST', `/offers/${id}/send`),
  acceptOffer:      (id)        => request('POST', `/offers/${id}/accept`),
  rejectOffer:      (id)        => request('POST', `/offers/${id}/reject`),
  convertOffer:     (id)        => request('POST', `/offers/${id}/convert-to-invoice`),

  // E-Mail
  emailPreview:     (id)        => request('GET',  `/pdf/email-preview/${id}`),
  sendEmailDoc:     (id, body)  => request('POST', `/pdf/send/${id}`, body),
  smtpTest:         ()          => request('GET',  '/pdf/smtp-test'),

  // Kunden
  customers:        (params={}) => request('GET', '/customers', null, params),
  customer:         (id)        => request('GET', `/customers/${id}`),
  customerOverview: (id)        => request('GET', `/customers/${id}/overview`),
  createCustomer:   (body)      => request('POST', '/customers', body),
  updateCustomer:   (id, body)  => request('PUT', `/customers/${id}`, body),
  deleteCustomer:   (id)        => request('DELETE', `/customers/${id}`),

  // Lieferanten
  suppliers:       (params={}) => request('GET', '/suppliers', null, params),
  createSupplier:  (body)      => request('POST', '/suppliers', body),
  updateSupplier:  (id, body)  => request('PUT', `/suppliers/${id}`, body),
  deleteSupplier:  (id)        => request('DELETE', `/suppliers/${id}`),

  // Produkte & Lager
  products:          (params={}) => request('GET', '/products', null, params),
  product:           (id)        => request('GET', `/products/${id}`),
  createProduct:     (body)      => request('POST', '/products', body),
  updateProduct:     (id, body)  => request('PUT', `/products/${id}`, body),
  stockAdjust:       (id, body)  => request('POST', `/products/${id}/stock-adjust`, body),
  bulkStockIn:       (body)      => request('POST', '/products/bulk-stock-in', body),
  lowStock:          ()          => request('GET', '/products/low-stock'),
  matchProducts:     (body)      => request('POST', '/ocr/match-products', body),

  // Ausgaben
  expenses:        (params={}) => request('GET', '/expenses', null, params),
  createExpense:   (body)      => request('POST', '/expenses', body),
  markExpensePaid: (id, body)  => request('POST', `/expenses/${id}/mark-paid`, body),

  // Anlagen
  assets:          ()           => request('GET', '/assets'),
  createAsset:     (body)       => request('POST', '/assets', body),

  // Belege
  documents:       (params={}) => request('GET', '/documents', null, params),
  uploadDocument:  (formData)  => {
    const token = getToken();
    return fetch(`${BASE}/documents/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(r => r.json());
  },

  // Zahlungen
  payments:        (params={}) => request('GET', '/payments', null, params),

  // Firma
  company:         ()          => request('GET', '/company'),
  updateCompany:   (body)      => request('PUT', '/company', body),
  updateSettings:  (body)      => request('PUT', '/company/settings', body),

  // Auswertungen
  dashboard:       ()          => request('GET', '/reports/dashboard'),
  reportEA:        (params={}) => request('GET', '/reports/ea', null, params),
  reportVAT:       (params={}) => request('GET', '/reports/vat', null, params),
  reportMonthly:   (params={}) => request('GET', '/reports/monthly', null, params),

  // Exporte
  exportInvoices:  (year)      => `${BASE}/exports/invoices?year=${year}&token=${getToken()}`,
  exportExpenses:  (year)      => `${BASE}/exports/expenses?year=${year}&token=${getToken()}`,
  exportAuditLog:  (year)      => `${BASE}/exports/audit-log?year=${year}&token=${getToken()}`,

  // Logo
  uploadLogo: (formData) => {
    const token = getToken();
    return fetch(`${BASE}/company/logo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(r => r.json());
  },
  deleteLogo: () => request('DELETE', '/company/logo'),

  uploadLetterhead: (formData) => {
    const token = getToken();
    return fetch(`${BASE}/company/letterhead`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(r => r.json());
  },
  deleteLetterhead: () => request('DELETE', '/company/letterhead'),

  // Projekte
  projects:          (params={})   => request('GET', '/projects', null, params),
  project:           (id)          => request('GET', `/projects/${id}`),
  createProject:     (body)        => request('POST', '/projects', body),
  updateProject:     (id, body)    => request('PUT', `/projects/${id}`, body),
  deleteProject:     (id)          => request('DELETE', `/projects/${id}`),
  createTask:        (pid, body)   => request('POST', `/projects/${pid}/tasks`, body),
  updateTask:        (pid, tid, b) => request('PUT', `/projects/${pid}/tasks/${tid}`, b),
  deleteTask:        (pid, tid)    => request('DELETE', `/projects/${pid}/tasks/${tid}`),
  createNote:        (pid, body)   => request('POST', `/projects/${pid}/notes`, body),
  deleteNote:        (pid, nid)    => request('DELETE', `/projects/${pid}/notes/${nid}`),

  // Serviceberichte
  serviceReports:       (params={})   => request('GET', '/service-reports', null, params),
  serviceReport:        (id)          => request('GET', `/service-reports/${id}`),
  createServiceReport:  (body)        => request('POST', '/service-reports', body),
  updateServiceReport:  (id, body)    => request('PUT', `/service-reports/${id}`, body),
  deleteServiceReport:  (id)          => request('DELETE', `/service-reports/${id}`),
  completeServiceReport:(id)          => request('POST', `/service-reports/${id}/complete`),
  serviceReportPdf:     (id)          => `${BASE}/pdf/service-report/${id}?token=${getToken()}`,

  // Kundenanlagen
  equipment:         (params={})   => request('GET', '/equipment', null, params),
  equipmentById:     (id)          => request('GET', `/equipment/${id}`),
  createEquipment:   (body)        => request('POST', '/equipment', body),
  updateEquipment:   (id, body)    => request('PUT', `/equipment/${id}`, body),
  deleteEquipment:   (id)          => request('DELETE', `/equipment/${id}`),

  // Arbeitszeit-Erfassung
  timeEntries:       (params={}) => request('GET', '/time-entries', null, params),
  timeEntry:         (id)        => request('GET', `/time-entries/${id}`),
  createTimeEntry:   (body)      => request('POST', '/time-entries', body),
  updateTimeEntry:   (id, body)  => request('PUT', `/time-entries/${id}`, body),
  deleteTimeEntry:   (id)        => request('DELETE', `/time-entries/${id}`),
  submitTimeEntry:   (id)        => request('POST', `/time-entries/${id}/submit`),
  approveTimeEntry:  (id)        => request('POST', `/time-entries/${id}/approve`),
  submitMonth:       (body)      => request('POST', '/time-entries/submit-month', body),
  timeSummary:       (params={}) => request('GET', '/time-entries/summary', null, params),

  // Wartungsverträge
  maintenanceContracts:        (params={})   => request('GET', '/maintenance-contracts', null, params),
  maintenanceContract:         (id)          => request('GET', `/maintenance-contracts/${id}`),
  createMaintenanceContract:   (body)        => request('POST', '/maintenance-contracts', body),
  updateMaintenanceContract:   (id, body)    => request('PUT', `/maintenance-contracts/${id}`, body),
  deleteMaintenanceContract:   (id)          => request('DELETE', `/maintenance-contracts/${id}`),
  recordMaintenanceService:    (id, body)    => request('POST', `/maintenance-contracts/${id}/record-service`, body),
  maintenanceContractPdfUrl:   (id)          => `${BASE}/pdf/maintenance-contract/${id}?token=${getToken()}`,
  commissionProject:           (id, body)    => request('POST', `/projects/${id}/commission`, body),
  sendMaintenanceContractEmail:(id, body)    => request('POST', `/pdf/maintenance-contract/${id}/send`, body),

  // F-Gase-Dokumentation
  fgasLogs:        (params={}) => request('GET', '/fgas-logs', null, params),
  fgasLog:         (id)        => request('GET', `/fgas-logs/${id}`),
  createFgasLog:   (body)      => request('POST', '/fgas-logs', body),
  updateFgasLog:   (id, body)  => request('PUT', `/fgas-logs/${id}`, body),
  deleteFgasLog:   (id)        => request('DELETE', `/fgas-logs/${id}`),
  fgasStats:       (params={}) => request('GET', '/fgas-logs/stats/summary', null, params),

  // Banking – Salt Edge Open Banking
  bankingStatus:        ()      => request('GET',    '/banking/status'),
  bankingInstitutions:  ()      => request('GET',    '/banking/institutions'),
  bankingConnect:       (body)  => request('POST',   '/banking/connect', body),
  bankingComplete:     (body)  => request('POST',   '/banking/complete', body),
  bankingBalance:      ()      => request('GET',    '/banking/balance'),
  bankingSync:         ()      => request('POST',   '/banking/sync'),
  bankingTransactions: (p={})  => request('GET',    '/banking/transactions', null, p),
  bankingMatch:        (id, b) => request('POST',   `/banking/transactions/${id}/match`, b),
  bankingDisconnect:   ()      => request('DELETE', '/banking/connection'),

  // Kunden-Telefonnummern
  customerPhones:       (id)          => request('GET', `/customers/${id}/phones`),
  createCustomerPhone:  (id, body)    => request('POST', `/customers/${id}/phones`, body),
  updateCustomerPhone:  (id, pid, b)  => request('PUT', `/customers/${id}/phones/${pid}`, b),
  deleteCustomerPhone:  (id, pid)     => request('DELETE', `/customers/${id}/phones/${pid}`),

  // Eingangsrechnungen
  incomingInvoices:       (params={}) => request('GET', '/incoming-invoices', null, params),
  createIncomingInvoice:  (body)      => request('POST', '/incoming-invoices', body),
  updateIncomingInvoice:  (id, body)  => request('PUT', `/incoming-invoices/${id}`, body),
  deleteIncomingInvoice:  (id)        => request('DELETE', `/incoming-invoices/${id}`),

  // Kältemittel-Lager (Einzelflaschen)
  refrigerantStock:       ()           => request('GET', '/refrigerant-stock'),
  createRefrigerantStock: (body)       => request('POST', '/refrigerant-stock', body),
  updateRefrigerantStock: (id, body)   => request('PUT', `/refrigerant-stock/${id}`, body),
  deleteRefrigerantStock: (id)         => request('DELETE', `/refrigerant-stock/${id}`),

  // Lieferant aus URL extrahieren
  supplierExtract: (text) => request('POST', '/supplier-extract', { text }),
  supplierLookupByName: (name) => request('POST', '/supplier-extract/lookup-by-name', { name }),
  aiImproveText:  (text, field) => request('POST', '/ai-text', { text, field }),
  plaudAnalyse:   (transcript)  => request('POST', '/plaud-analyse', { transcript }),
  plaudSecret:    ()            => request('GET',  '/company/plaud-secret'),
  plaudSecretNew: ()            => request('POST', '/company/plaud-secret'),

  // Backup
  backupRun:      ()            => request('POST', '/backup/run'),
  backupStatus:   ()            => request('GET',  '/backup/status'),

  // Kassabuch
  kassabuch:        (p={})      => request('GET',  '/kassabuch', null, p),
  createKassaeintrag:(body)     => request('POST', '/kassabuch', body),
  deleteKassaeintrag:(id)       => request('DELETE', `/kassabuch/${id}`),

  // Benutzer (für Techniker-Dropdown)
  users:               ()             => request('GET', '/auth/users'),

  // OCR – Eingangsrechnung scannen
  scanReceipt: (formData) => {
    const token = getToken();
    return fetch(`${BASE}/ocr/scan-receipt`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
      return data;
    });
  },

  // Kalender
  calendarEvents:      (from, to) => request('GET', '/calendar', null, { from, to }),
  createCalEvent:      (body)     => request('POST', '/calendar', body),
  updateCalEvent:      (id, body) => request('PUT', `/calendar/${id}`, body),
  deleteCalEvent:      (id)       => request('DELETE', `/calendar/${id}`),

  // Workspace
  wsBoards:            ()              => request('GET',    '/workspace/boards'),
  createWsBoard:       (body)          => request('POST',   '/workspace/boards', body),
  updateWsBoard:       (id, body)      => request('PUT',    `/workspace/boards/${id}`, body),
  deleteWsBoard:       (id)            => request('DELETE', `/workspace/boards/${id}`),
  wsCards:             (boardId)       => request('GET',    `/workspace/boards/${boardId}/cards`),
  createWsCard:        (boardId, body) => request('POST',   `/workspace/boards/${boardId}/cards`, body),
  updateWsCard:        (id, body)      => request('PUT',    `/workspace/cards/${id}`, body),
  deleteWsCard:        (id)            => request('DELETE', `/workspace/cards/${id}`),

  // Google Drive
  driveStatus:      ()         => request('GET',    '/drive/status'),
  driveFiles:       (folderId) => request('GET',    '/drive/files', null, folderId ? { folderId } : {}),
  driveConnectUrl:  ()         => request('GET',    '/drive/connect'),
  driveDisconnect:  ()         => request('DELETE', '/drive/disconnect'),
  drivePhotos:      (equipId)  => request('GET',    `/drive/equipment/${equipId}/photos`),
  driveDeletePhoto: (photoId)  => request('DELETE', `/drive/photos/${photoId}`),
  driveUploadPhotos: (equipId, formData) => {
    const token = getToken();
    const fullUrl = BASE.startsWith('http')
      ? `${BASE}/drive/equipment/${equipId}/photos`
      : `${window.location.origin}${BASE}/drive/equipment/${equipId}/photos`;
    return fetch(fullUrl, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
      return data;
    });
  },
};

export default api;
