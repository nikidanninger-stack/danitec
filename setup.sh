#!/bin/bash
# ─── Danitec – Einmaliges Setup-Skript ───────────────────────────────────────
# Führe dieses Skript einmalig aus, um die App auf deinem Mac einzurichten.
# Ausführen mit: bash setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓ $1${NC}"; }
info() { echo -e "${YELLOW}→ $1${NC}"; }
err()  { echo -e "${RED}✗ $1${NC}"; exit 1; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     Danitec – Setup wird gestartet   ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── 1. Homebrew ─────────────────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
  info "Homebrew wird installiert..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ok "Homebrew installiert"
else
  ok "Homebrew bereits vorhanden"
fi

# ─── 2. Node.js ──────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  info "Node.js wird installiert..."
  brew install node
  ok "Node.js installiert"
else
  ok "Node.js bereits vorhanden ($(node --version))"
fi

# ─── 3. PostgreSQL ───────────────────────────────────────────────────────────
if ! command -v psql &>/dev/null; then
  info "PostgreSQL wird installiert..."
  brew install postgresql@16
  brew link postgresql@16 --force
  ok "PostgreSQL installiert"
else
  ok "PostgreSQL bereits vorhanden"
fi

# PostgreSQL starten
info "PostgreSQL wird gestartet..."
brew services start postgresql@16 2>/dev/null || brew services start postgresql 2>/dev/null || true
sleep 2
ok "PostgreSQL läuft"

# ─── 4. Datenbank & Benutzer anlegen ─────────────────────────────────────────
info "Datenbank wird eingerichtet..."

# Versuche zuerst mit dem aktuellen User (macOS Standard), dann mit postgres
PSQL_CMD=""
if psql postgres -c '\q' 2>/dev/null; then
  PSQL_CMD="psql postgres"
elif psql -U postgres -c '\q' 2>/dev/null; then
  PSQL_CMD="psql -U postgres"
else
  err "Konnte keine PostgreSQL-Verbindung herstellen. Bitte PostgreSQL neu starten und erneut versuchen."
fi

$PSQL_CMD <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'danitec_user') THEN
    CREATE USER danitec_user WITH PASSWORD 'Danitec2025!';
    RAISE NOTICE 'User danitec_user erstellt';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE danitec_db OWNER danitec_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'danitec_db')\gexec

GRANT ALL PRIVILEGES ON DATABASE danitec_db TO danitec_user;
SQL

ok "Datenbank eingerichtet"

# ─── 5. npm Dependencies installieren ────────────────────────────────────────
info "npm-Pakete werden installiert (inkl. Puppeteer für PDF – lädt ~100MB Chromium)..."
cd "$(dirname "$0")"
npm install
ok "npm-Pakete installiert"

# ─── 6. Datenbank-Schema anlegen ─────────────────────────────────────────────
info "Datenbankschema wird angelegt (Migrationen)..."
npm run db:migrate
ok "Migrationen ausgeführt"

# ─── 7. Testdaten einfügen ───────────────────────────────────────────────────
read -p "$(echo -e "${YELLOW}Testdaten einfügen? (Standard-Login: admin@danitec.at / Danitec2025!) [j/N] ${NC}")" SEED
if [[ "$SEED" =~ ^[jJyY]$ ]]; then
  npm run db:seed
  ok "Testdaten eingefügt"
fi

# ─── 8. OpenAI API-Key eintragen ─────────────────────────────────────────────
echo ""
read -p "$(echo -e "${YELLOW}OpenAI API-Key für Foto-Erkennung eintragen? (Enter zum Überspringen) ${NC}")" OPENAI_KEY
if [[ -n "$OPENAI_KEY" ]]; then
  sed -i '' "s|OPENAI_API_KEY=sk-hier-deinen-key-eintragen|OPENAI_API_KEY=${OPENAI_KEY}|" backend/.env
  ok "OpenAI API-Key eingetragen"
else
  info "OpenAI API-Key übersprungen – kann später unter Admin-Dashboard eingetragen werden."
fi

# ─── Fertig ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Setup abgeschlossen! 🎉                  ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  App starten:  bash start.sh                         ║"
echo "║  Browser:      http://localhost:3000                 ║"
echo "║  Login:        admin@danitec.at / Danitec2025!       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
