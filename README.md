# Danitec – Rechnungs- und Belegverwaltung

Vollständiges österreichisches Buchhaltungssystem für Danitec GmbH.  
**Stack:** Node.js · Express · PostgreSQL · React · Vite

---

## Schnellstart

### 1. Voraussetzungen

- Node.js 18+
- PostgreSQL 14+
- npm 9+

### 2. Datenbank anlegen

```sql
psql -U postgres
CREATE DATABASE danitec_db;
CREATE USER danitec_user WITH PASSWORD 'sicheres_passwort';
GRANT ALL PRIVILEGES ON DATABASE danitec_db TO danitec_user;
\q
```

### 3. Projekt einrichten

```bash
# Repository klonen / entpacken
cd danitec

# Umgebungsvariablen konfigurieren
cp backend/.env.example backend/.env
# .env mit Datenbankdaten und JWT-Secret befüllen

# Abhängigkeiten installieren
npm install

# Datenbank migrieren (Schema anlegen)
npm run db:migrate

# Testdaten einfügen
npm run db:seed
```

### 4. Starten

```bash
# Backend + Frontend gleichzeitig starten
npm run dev

# Nur Backend
cd backend && npm run dev    # → http://localhost:3001

# Nur Frontend
cd frontend && npm run dev   # → http://localhost:3000
```

**Standard-Login nach Seed:**
- E-Mail: `admin@danitec.at`
- Passwort: `Danitec2025!`

---

## Projektstruktur

```
danitec/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express App
│   │   ├── routes/
│   │   │   ├── auth.js            # Login, Register
│   │   │   ├── invoices.js        # Rechnungen (Kernmodul)
│   │   │   ├── offers.js          # Angebote
│   │   │   ├── customers.js       # Kunden
│   │   │   ├── suppliers.js       # Lieferanten
│   │   │   ├── products.js        # Produkte & Leistungen
│   │   │   ├── expenses.js        # Ausgaben + Privatanteil
│   │   │   ├── assets.js          # Anlagenverzeichnis
│   │   │   ├── documents.js       # Belegs-Upload
│   │   │   ├── payments.js        # Zahlungen
│   │   │   ├── reports.js         # Dashboard, E/A, USt
│   │   │   ├── exports.js         # CSV-Export für Steuerberater
│   │   │   └── company.js         # Firmeneinstellungen
│   │   ├── middleware/
│   │   │   └── auth.js            # JWT + Rollen + Audit-Middleware
│   │   ├── migrations/
│   │   │   ├── 001_schema.sql     # Vollständiges Datenbankschema
│   │   │   └── run.js             # Migration Runner
│   │   ├── seeds/
│   │   │   └── run.js             # Testdaten (Danitec)
│   │   └── utils/
│   │       ├── db.js              # PostgreSQL Pool + Transaktionen
│   │       └── logger.js          # Winston Logger
│   ├── uploads/                   # Hochgeladene Belege (gitignore)
│   ├── logs/                      # Log-Dateien (gitignore)
│   └── .env.example
└── frontend/
    └── src/
        └── api/
            └── client.js          # API Client für alle Endpunkte
```

---

## API-Referenz (Kurzübersicht)

### Authentifizierung
```
POST /api/auth/register    Erstregistrierung (Firma + Admin)
POST /api/auth/login       Login → JWT Token
GET  /api/auth/me          Aktueller Benutzer
```

### Rechnungen
```
GET    /api/invoices                 Liste (Filter: status, customerId, from, to)
POST   /api/invoices                 Neue Rechnung erstellen
GET    /api/invoices/:id             Rechnung mit Positionen + Zahlungen
POST   /api/invoices/:id/finalize    Festschreiben (locked = TRUE)
POST   /api/invoices/:id/payment     Zahlung buchen
POST   /api/invoices/:id/cancel      Stornieren
```

### Angebote
```
GET    /api/offers
POST   /api/offers
POST   /api/offers/:id/accept
POST   /api/offers/:id/convert-to-invoice
```

### Auswertungen
```
GET /api/reports/dashboard   KPIs, offene Rechnungen, USt-Zahllast
GET /api/reports/ea          Einnahmen-Ausgaben-Rechnung
GET /api/reports/vat         USt-Übersicht mit UVA-Kennzahlen
```

### Exporte (CSV, UTF-8 mit BOM)
```
GET /api/exports/invoices?year=2025    Ausgangsrechnungen
GET /api/exports/expenses?year=2025    Ausgaben mit Privatanteilen
GET /api/exports/audit-log?year=2025   Audit-Protokoll
```

---

## Datenbankschema (Übersicht)

| Tabelle               | Beschreibung                                |
|-----------------------|---------------------------------------------|
| `companies`           | Firmenstammdaten                            |
| `company_settings`    | Steuer- und Systemeinstellungen             |
| `users`               | Benutzer mit Rollen                         |
| `customers`           | Kunden                                      |
| `suppliers`           | Lieferanten                                 |
| `products`            | Produkte & Leistungen                       |
| `documents`           | Rechnungen, Angebote, Gutschriften, Stornos |
| `document_items`      | Positionen zu Dokumenten                    |
| `document_payments`   | Zahlungseingänge                            |
| `offer_details`       | Angebots-Status-Erweiterung                 |
| `dunnings`            | Mahnungen                                   |
| `expenses`            | Ausgaben / Eingangsrechnungen               |
| `expense_categories`  | Ausgaben-Kategorien                         |
| `assets`              | Anlagenverzeichnis                          |
| `asset_depreciations` | Jahresabschreibungen                        |
| `files`               | Hochgeladene Belege                         |
| `audit_logs`          | Unveränderliches Änderungsprotokoll         |
| `email_logs`          | E-Mail-Versandprotokoll                     |
| `vat_periods`         | USt-Perioden                                |

---

## Wichtige Datenbank-Features

- **Festschreibungs-Trigger:** Festgeschriebene Rechnungen können nicht mehr geändert werden (DB-seitig erzwungen)
- **Zahlungsstatus-Trigger:** Status (offen/teilbezahlt/bezahlt/überfällig) wird automatisch nach jeder Zahlung aktualisiert
- **Atomare Nummernvergabe:** Rechnungsnummern werden mit `FOR UPDATE` vergeben – keine Duplikate möglich
- **Generated Columns:** `open_total`, `business_share_percent` werden automatisch berechnet
- **Volltextsuche:** GIN-Index auf Kunden für schnelle Suche
- **Audit-Log:** Jede wichtige Aktion wird mit User, Zeit und IP protokolliert

---

## Benutzerrollen

| Rolle              | Rechte                                          |
|--------------------|-------------------------------------------------|
| `admin`            | Alles                                           |
| `geschaeftsfuehrer`| Alles außer technische Systemeinstellungen      |
| `buchhaltung`      | Rechnungen, Zahlungen, Ausgaben, Exporte        |
| `mitarbeiter`      | Belege hochladen, Kunden ansehen                |
| `steuerberater`    | Lesen + Exportieren (kein Schreiben)            |

---

## Österreich-spezifische Logik

- **Ist-Besteuerung:** USt entsteht erst nach Zahlungseingang
- **Soll-Besteuerung:** USt entsteht mit Rechnungslegung (umschaltbar)
- **Kleinunternehmerregelung:** Keine USt-Ausweisung (§ 6 Abs. 1 Z 27 UStG)
- **Reverse Charge:** Steuerschuld geht auf Leistungsempfänger über
- **Innergemeinschaftliche Lieferungen:** Unterstützt
- **UVA-Kennzahlen:** KZ 000, 022, 010, 060, 095
- **Privatanteile:** Automatische Berechnung des abzugsfähigen Betrags
- **Lineare & degressive AfA**

---

## Nächste Schritte (Phase 4)

- [ ] PDF-Generator (PDFKit oder Puppeteer)
- [ ] E-Mail-Versand (Nodemailer)
- [ ] DATEV/BMD-Export
- [ ] Bankkontoverbindung (Banking-API)
- [ ] 2-Faktor-Authentifizierung
- [ ] React Frontend mit allen Seiten (auf Basis des Prototyps)

---

*Erstellt für Danitec GmbH – Österreichisches Recht (UStG, BAO)*
