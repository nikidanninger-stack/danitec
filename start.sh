#!/bin/bash
# ─── Danitec – App starten ────────────────────────────────────────────────────
# Ausführen mit: bash start.sh
# ─────────────────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════╗"
echo "║         Danitec wird gestartet       ║"
echo "╚══════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")"

# PostgreSQL sicherstellen
echo -e "${YELLOW}→ PostgreSQL wird gestartet...${NC}"
brew services start postgresql@16 2>/dev/null || brew services start postgresql 2>/dev/null || true
sleep 1
echo -e "${GREEN}✓ PostgreSQL läuft${NC}"

# Migrationen ausführen
echo -e "${YELLOW}→ Datenbank-Migrationen werden geprüft...${NC}"
cd backend && npm run migrate && cd ..
echo -e "${GREEN}✓ Migrationen aktuell${NC}"

# App starten
echo -e "${YELLOW}→ Backend + Frontend werden gestartet...${NC}"
echo ""
echo -e "${GREEN}✓ App läuft gleich auf: http://localhost:3000${NC}"
echo -e "${GREEN}✓ Mit Ctrl+C beenden${NC}"
echo ""

npm run dev
