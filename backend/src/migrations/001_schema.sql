-- ═══════════════════════════════════════════════════════════════════════════
-- Danitec Datenbankschema – PostgreSQL
-- Österreichisches Rechnungs- und Buchhaltungssystem
-- ═══════════════════════════════════════════════════════════════════════════

-- Erweiterungen
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Für Volltextsuche

-- ─── ENUM-Typen ───────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('admin', 'geschaeftsfuehrer', 'buchhaltung', 'mitarbeiter', 'steuerberater');
CREATE TYPE document_type AS ENUM ('invoice', 'offer', 'credit_note', 'cancellation', 'reminder', 'dunning');
CREATE TYPE document_status AS ENUM ('draft', 'finalized', 'sent', 'partial_paid', 'paid', 'overdue', 'cancelled', 'dunned');
CREATE TYPE offer_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted');
CREATE TYPE expense_status AS ENUM ('draft', 'open', 'paid', 'partial_paid', 'archived');
CREATE TYPE payment_method AS ENUM ('bank_transfer', 'cash', 'card', 'online', 'other');
CREATE TYPE asset_status AS ENUM ('active', 'sold', 'retired');
CREATE TYPE depreciation_method AS ENUM ('linear', 'degressive', 'manual');
CREATE TYPE taxation_type AS ENUM ('ist', 'soll');
CREATE TYPE customer_type AS ENUM ('business', 'private');

-- ─── UNTERNEHMEN ──────────────────────────────────────────────────────────────
CREATE TABLE companies (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(200) NOT NULL,
  legal_form            VARCHAR(50),
  address               VARCHAR(300),
  zip                   VARCHAR(10),
  city                  VARCHAR(100),
  country               VARCHAR(10) DEFAULT 'AT',
  phone                 VARCHAR(50),
  email                 VARCHAR(200),
  website               VARCHAR(200),
  uid_number            VARCHAR(20),           -- ATU12345678
  tax_number            VARCHAR(30),
  company_register_nr   VARCHAR(30),           -- FN 123456b
  company_register_court VARCHAR(100),
  bank_name             VARCHAR(100),
  bank_account_holder   VARCHAR(200),
  iban                  VARCHAR(34),
  bic                   VARCHAR(11),
  logo_file_id          INTEGER,               -- FK → files
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── UNTERNEHMENSEINSTELLUNGEN ────────────────────────────────────────────────
CREATE TABLE company_settings (
  id                          SERIAL PRIMARY KEY,
  company_id                  INTEGER NOT NULL REFERENCES companies(id),
  small_business              BOOLEAN DEFAULT FALSE,
  taxation_type               taxation_type DEFAULT 'ist',
  vat_net_system              BOOLEAN DEFAULT TRUE,  -- TRUE = Netto, FALSE = Brutto
  default_vat_rate            NUMERIC(5,2) DEFAULT 20.00,
  default_currency            VARCHAR(3) DEFAULT 'EUR',
  default_payment_days        INTEGER DEFAULT 14,
  invoice_prefix              VARCHAR(10) DEFAULT 'RE',
  offer_prefix                VARCHAR(10) DEFAULT 'AN',
  customer_prefix             VARCHAR(10) DEFAULT 'K',
  supplier_prefix             VARCHAR(10) DEFAULT 'L',
  mahnung_prefix              VARCHAR(10) DEFAULT 'MA',
  next_invoice_seq            INTEGER DEFAULT 1,
  next_offer_seq              INTEGER DEFAULT 1,
  next_customer_seq           INTEGER DEFAULT 1,
  next_supplier_seq           INTEGER DEFAULT 1,
  next_mahnung_seq            INTEGER DEFAULT 1,
  reverse_charge_enabled      BOOLEAN DEFAULT FALSE,
  eu_delivery_enabled         BOOLEAN DEFAULT FALSE,
  export_delivery_enabled     BOOLEAN DEFAULT FALSE,
  default_invoice_text        TEXT,
  default_offer_text          TEXT,
  default_dunning_text        TEXT,
  invoice_color               VARCHAR(7) DEFAULT '#185fa5',
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id)
);

-- ─── BENUTZER ─────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id),
  email         VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(200) NOT NULL,
  role          user_role DEFAULT 'mitarbeiter',
  active        BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_users_email ON users(email);

-- ─── KUNDEN ───────────────────────────────────────────────────────────────────
CREATE TABLE customers (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  customer_number     VARCHAR(20) NOT NULL,
  type                customer_type DEFAULT 'business',
  company_name        VARCHAR(200),
  first_name          VARCHAR(100),
  last_name           VARCHAR(100),
  address             VARCHAR(300),
  zip                 VARCHAR(10),
  city                VARCHAR(100),
  country             VARCHAR(10) DEFAULT 'AT',
  email               VARCHAR(200),
  phone               VARCHAR(50),
  uid_number          VARCHAR(20),
  payment_days        INTEGER DEFAULT 14,
  discount_percent    NUMERIC(5,2) DEFAULT 0,
  notes               TEXT,
  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, customer_number)
);
CREATE INDEX idx_customers_company ON customers(company_id);
CREATE INDEX idx_customers_search ON customers USING gin(
  to_tsvector('german', COALESCE(company_name,'') || ' ' || COALESCE(last_name,'') || ' ' || COALESCE(first_name,''))
);

-- ─── LIEFERANTEN ─────────────────────────────────────────────────────────────
CREATE TABLE suppliers (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  supplier_number     VARCHAR(20) NOT NULL,
  company_name        VARCHAR(200) NOT NULL,
  address             VARCHAR(300),
  zip                 VARCHAR(10),
  city                VARCHAR(100),
  country             VARCHAR(10) DEFAULT 'AT',
  email               VARCHAR(200),
  phone               VARCHAR(50),
  uid_number          VARCHAR(20),
  iban                VARCHAR(34),
  bic                 VARCHAR(11),
  default_category    VARCHAR(100),
  default_vat_rate    NUMERIC(5,2),
  payment_days        INTEGER DEFAULT 30,
  our_customer_nr     VARCHAR(50),   -- Unsere Kundennummer beim Lieferanten
  notes               TEXT,
  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, supplier_number)
);
CREATE INDEX idx_suppliers_company ON suppliers(company_id);

-- ─── PRODUKTE & LEISTUNGEN ────────────────────────────────────────────────────
CREATE TABLE products (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id),
  sku           VARCHAR(50),          -- Artikelnummer
  name          VARCHAR(300) NOT NULL,
  description   TEXT,
  unit          VARCHAR(30) DEFAULT 'Std',
  net_price     NUMERIC(12,2) DEFAULT 0,
  gross_price   NUMERIC(12,2) DEFAULT 0,
  vat_rate      NUMERIC(5,2) DEFAULT 20,
  category      VARCHAR(100),
  active        BOOLEAN DEFAULT TRUE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_products_company ON products(company_id);

-- ─── DOKUMENTE (Rechnungen, Angebote, Gutschriften, Stornos) ─────────────────
CREATE TABLE documents (
  id                    SERIAL PRIMARY KEY,
  company_id            INTEGER NOT NULL REFERENCES companies(id),
  type                  document_type NOT NULL,
  number                VARCHAR(30) NOT NULL,
  status                document_status DEFAULT 'draft',
  locked                BOOLEAN DEFAULT FALSE,
  locked_at             TIMESTAMPTZ,
  customer_id           INTEGER REFERENCES customers(id),
  document_date         DATE NOT NULL,
  service_date          DATE,
  service_period_start  DATE,
  service_period_end    DATE,
  due_date              DATE,
  currency              VARCHAR(3) DEFAULT 'EUR',
  exchange_rate         NUMERIC(10,6) DEFAULT 1,
  subject               VARCHAR(300),
  intro_text            TEXT,
  closing_text          TEXT,
  net_total             NUMERIC(12,2) DEFAULT 0,
  vat_total             NUMERIC(12,2) DEFAULT 0,
  gross_total           NUMERIC(12,2) DEFAULT 0,
  paid_total            NUMERIC(12,2) DEFAULT 0,
  open_total            NUMERIC(12,2) GENERATED ALWAYS AS (gross_total - paid_total) STORED,
  reverse_charge        BOOLEAN DEFAULT FALSE,
  eu_delivery           BOOLEAN DEFAULT FALSE,
  internal_note         TEXT,
  pdf_file_id           INTEGER,
  cancels_document_id   INTEGER REFERENCES documents(id),
  cancelled_by_id       INTEGER REFERENCES documents(id),
  sent_at               TIMESTAMPTZ,
  finalized_at          TIMESTAMPTZ,
  created_by            INTEGER REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, number)
);
CREATE INDEX idx_documents_company ON documents(company_id);
CREATE INDEX idx_documents_customer ON documents(customer_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_date ON documents(document_date);
CREATE INDEX idx_documents_due ON documents(due_date);

-- ─── DOKUMENT-POSITIONEN ─────────────────────────────────────────────────────
CREATE TABLE document_items (
  id                SERIAL PRIMARY KEY,
  document_id       INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position_number   INTEGER NOT NULL,
  product_id        INTEGER REFERENCES products(id),
  description       TEXT NOT NULL,
  quantity          NUMERIC(12,4) DEFAULT 1,
  unit              VARCHAR(30),
  unit_price_net    NUMERIC(12,4) DEFAULT 0,
  discount_percent  NUMERIC(5,2) DEFAULT 0,
  discount_amount   NUMERIC(12,2) DEFAULT 0,
  vat_rate          NUMERIC(5,2) DEFAULT 20,
  net_amount        NUMERIC(12,2) DEFAULT 0,
  vat_amount        NUMERIC(12,2) DEFAULT 0,
  gross_amount      NUMERIC(12,2) DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_items_document ON document_items(document_id);

-- ─── ZAHLUNGEN ────────────────────────────────────────────────────────────────
CREATE TABLE document_payments (
  id              SERIAL PRIMARY KEY,
  document_id     INTEGER NOT NULL REFERENCES documents(id),
  payment_date    DATE NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  payment_method  payment_method DEFAULT 'bank_transfer',
  bank_reference  VARCHAR(200),
  note            TEXT,
  file_id         INTEGER,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_payments_document ON document_payments(document_id);
CREATE INDEX idx_payments_date ON document_payments(payment_date);

-- ─── ANGEBOTS-STATUS ─────────────────────────────────────────────────────────
CREATE TABLE offer_details (
  id                  SERIAL PRIMARY KEY,
  document_id         INTEGER NOT NULL UNIQUE REFERENCES documents(id),
  offer_status        offer_status DEFAULT 'draft',
  valid_until         DATE,
  converted_to_id     INTEGER REFERENCES documents(id),
  converted_at        TIMESTAMPTZ
);

-- ─── MAHNUNGEN ────────────────────────────────────────────────────────────────
CREATE TABLE dunnings (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  document_id     INTEGER NOT NULL REFERENCES documents(id),
  dunning_number  VARCHAR(30) NOT NULL,
  dunning_level   INTEGER NOT NULL DEFAULT 1,  -- 1=Erinnerung, 2=1. Mahnung, ...
  dunning_date    DATE NOT NULL,
  due_amount      NUMERIC(12,2) NOT NULL,
  dunning_fees    NUMERIC(12,2) DEFAULT 0,
  interest_amount NUMERIC(12,2) DEFAULT 0,
  text            TEXT,
  pdf_file_id     INTEGER,
  sent_at         TIMESTAMPTZ,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_dunnings_document ON dunnings(document_id);

-- ─── AUSGABEN (Eingangsrechnungen) ───────────────────────────────────────────
CREATE TABLE expense_categories (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id),
  name        VARCHAR(100) NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  UNIQUE(company_id, name)
);

CREATE TABLE expenses (
  id                      SERIAL PRIMARY KEY,
  company_id              INTEGER NOT NULL REFERENCES companies(id),
  supplier_id             INTEGER REFERENCES suppliers(id),
  expense_number          VARCHAR(30) NOT NULL,
  supplier_invoice_number VARCHAR(100),
  document_date           DATE NOT NULL,
  payment_date            DATE,
  category_id             INTEGER REFERENCES expense_categories(id),
  description             TEXT,
  net_amount              NUMERIC(12,2) DEFAULT 0,
  vat_rate                NUMERIC(5,2) DEFAULT 20,
  vat_amount              NUMERIC(12,2) DEFAULT 0,
  gross_amount            NUMERIC(12,2) DEFAULT 0,
  private_share_percent   NUMERIC(5,2) DEFAULT 0,
  business_share_percent  NUMERIC(5,2) GENERATED ALWAYS AS (100 - private_share_percent) STORED,
  deductible_net_amount   NUMERIC(12,2) DEFAULT 0,
  deductible_vat_amount   NUMERIC(12,2) DEFAULT 0,
  payment_method          payment_method DEFAULT 'bank_transfer',
  status                  expense_status DEFAULT 'open',
  file_id                 INTEGER,
  internal_note           TEXT,
  created_by              INTEGER REFERENCES users(id),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_expenses_company ON expenses(company_id);
CREATE INDEX idx_expenses_date ON expenses(document_date);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_category ON expenses(category_id);

-- ─── ANLAGENVERZEICHNIS ───────────────────────────────────────────────────────
CREATE TABLE assets (
  id                    SERIAL PRIMARY KEY,
  company_id            INTEGER NOT NULL REFERENCES companies(id),
  expense_id            INTEGER REFERENCES expenses(id),
  asset_number          VARCHAR(30) NOT NULL,
  name                  VARCHAR(300) NOT NULL,
  supplier_name         VARCHAR(200),
  purchase_date         DATE NOT NULL,
  start_use_date        DATE,
  purchase_net_amount   NUMERIC(12,2) NOT NULL,
  vat_amount            NUMERIC(12,2) DEFAULT 0,
  purchase_gross_amount NUMERIC(12,2) NOT NULL,
  useful_life_years     INTEGER NOT NULL DEFAULT 5,
  depreciation_method   depreciation_method DEFAULT 'linear',
  annual_depreciation   NUMERIC(12,2) DEFAULT 0,
  book_value            NUMERIC(12,2) DEFAULT 0,
  location              VARCHAR(200),
  inventory_number      VARCHAR(50),
  status                asset_status DEFAULT 'active',
  sold_date             DATE,
  sale_price            NUMERIC(12,2),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, asset_number)
);
CREATE INDEX idx_assets_company ON assets(company_id);

-- Jährliche Abschreibungsbuchungen
CREATE TABLE asset_depreciations (
  id              SERIAL PRIMARY KEY,
  asset_id        INTEGER NOT NULL REFERENCES assets(id),
  year            INTEGER NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  book_value_end  NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(asset_id, year)
);

-- ─── DATEIEN & BELEGE ─────────────────────────────────────────────────────────
CREATE TABLE files (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id),
  original_name VARCHAR(300) NOT NULL,
  stored_name   VARCHAR(300) NOT NULL,
  mime_type     VARCHAR(100),
  file_size     INTEGER,
  file_hash     VARCHAR(64),       -- SHA-256 für Integrität
  storage_path  VARCHAR(500),
  entity_type   VARCHAR(100),      -- 'expense', 'invoice', 'asset', ...
  entity_id     INTEGER,
  uploaded_by   INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_files_company ON files(company_id);
CREATE INDEX idx_files_entity ON files(entity_type, entity_id);

-- ─── E-MAIL LOG ───────────────────────────────────────────────────────────────
CREATE TABLE email_logs (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER REFERENCES companies(id),
  document_id INTEGER REFERENCES documents(id),
  to_email    VARCHAR(200),
  subject     VARCHAR(500),
  sent_at     TIMESTAMPTZ DEFAULT NOW(),
  status      VARCHAR(50) DEFAULT 'sent',
  error       TEXT
);

-- ─── AUDIT LOG ────────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER REFERENCES companies(id),
  user_id       INTEGER REFERENCES users(id),
  entity_type   VARCHAR(100),
  entity_id     INTEGER,
  action        VARCHAR(200) NOT NULL,
  old_value     JSONB,
  new_value     JSONB,
  ip_address    INET,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_company ON audit_logs(company_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_time ON audit_logs(created_at DESC);

-- ─── USt-PERIODEN ─────────────────────────────────────────────────────────────
CREATE TABLE vat_periods (
  id                    SERIAL PRIMARY KEY,
  company_id            INTEGER NOT NULL REFERENCES companies(id),
  period_year           INTEGER NOT NULL,
  period_month          INTEGER,          -- NULL = Jahres-UVA
  period_quarter        INTEGER,          -- 1-4
  vat_output            NUMERIC(12,2) DEFAULT 0,
  vat_input             NUMERIC(12,2) DEFAULT 0,
  vat_liability         NUMERIC(12,2) GENERATED ALWAYS AS (vat_output - vat_input) STORED,
  submitted_at          TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TRIGGER: updated_at automatisch setzen ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies','company_settings','users','customers','suppliers',
    'products','documents','expenses','assets']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s
                    FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
  END LOOP;
END $$;

-- ─── TRIGGER: Dokument-Summen prüfen ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_document_locked()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.locked = TRUE AND NEW.locked = TRUE THEN
    IF OLD.net_total != NEW.net_total OR OLD.gross_total != NEW.gross_total THEN
      RAISE EXCEPTION 'Festgeschriebene Rechnung % kann nicht mehr geändert werden.', OLD.number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_document_lock_check
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION check_document_locked();

-- ─── TRIGGER: Zahlungsstatus automatisch berechnen ───────────────────────────
CREATE OR REPLACE FUNCTION update_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_total NUMERIC;
  v_paid  NUMERIC;
  v_due   DATE;
BEGIN
  SELECT gross_total, paid_total, due_date
  INTO v_total, v_paid, v_due
  FROM documents WHERE id = NEW.document_id;

  UPDATE documents SET
    paid_total = (SELECT COALESCE(SUM(amount),0) FROM document_payments WHERE document_id = NEW.document_id),
    status = CASE
      WHEN (SELECT COALESCE(SUM(amount),0) FROM document_payments WHERE document_id = NEW.document_id) >= v_total THEN 'paid'
      WHEN (SELECT COALESCE(SUM(amount),0) FROM document_payments WHERE document_id = NEW.document_id) > 0 THEN 'partial_paid'
      WHEN v_due < CURRENT_DATE THEN 'overdue'
      ELSE status
    END
  WHERE id = NEW.document_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_status
  AFTER INSERT OR UPDATE ON document_payments
  FOR EACH ROW EXECUTE FUNCTION update_payment_status();

-- ─── VIEWS ────────────────────────────────────────────────────────────────────

-- Offene Rechnungen mit Kundendaten
CREATE OR REPLACE VIEW v_open_invoices AS
SELECT
  d.id, d.number, d.document_date, d.due_date,
  d.gross_total, d.paid_total, d.open_total, d.status,
  c.company_name, c.first_name, c.last_name, c.email,
  COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS customer_name,
  (d.due_date < CURRENT_DATE AND d.status NOT IN ('paid','cancelled')) AS is_overdue
FROM documents d
LEFT JOIN customers c ON d.customer_id = c.id
WHERE d.type = 'invoice' AND d.status NOT IN ('draft','paid','cancelled');

-- E/A-Rechnung Basis (Ist-Besteuerung)
CREATE OR REPLACE VIEW v_ea_basis AS
SELECT
  'einnahmen' AS typ,
  dp.payment_date AS buchungsdatum,
  d.number AS beleg_nr,
  COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS gegenseite,
  d.net_total AS netto,
  d.vat_total AS ust,
  dp.amount AS brutto,
  d.company_id
FROM documents d
JOIN document_payments dp ON dp.document_id = d.id
LEFT JOIN customers c ON d.customer_id = c.id
WHERE d.type = 'invoice' AND d.status = 'paid'
UNION ALL
SELECT
  'ausgaben' AS typ,
  e.payment_date AS buchungsdatum,
  e.expense_number AS beleg_nr,
  COALESCE(s.company_name, 'Unbekannt') AS gegenseite,
  e.deductible_net_amount AS netto,
  e.deductible_vat_amount AS ust,
  e.gross_amount * (e.business_share_percent/100) AS brutto,
  e.company_id
FROM expenses e
LEFT JOIN suppliers s ON e.supplier_id = s.id
WHERE e.status = 'paid';
