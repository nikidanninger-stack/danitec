#!/bin/bash
# Danitec – Demo-Link erstellen (alles automatisch)
cd "$(dirname "$0")"
BASE="$(pwd)"

echo ""
echo "╔════════════════════════════════════╗"
echo "║     Danitec Demo wird gestartet    ║"
echo "╚════════════════════════════════════╝"
echo ""

# 1. cloudflared installieren falls nicht vorhanden
if ! command -v cloudflared &> /dev/null; then
  echo "📦 cloudflared wird installiert..."
  brew install cloudflare/cloudflare/cloudflared 2>&1 | grep -E "install|already|Error"
fi

# 2. Alten dist-Ordner löschen
echo "🗑  Alten Build löschen..."
rm -rf "$BASE/frontend/dist" 2>/dev/null || true

# 3. Frontend bauen
echo "🔨 Frontend wird gebaut (ca. 30 Sekunden)..."
cd "$BASE/frontend"
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Build fehlgeschlagen!"
  read -p "Drücke Enter zum Schließen..."
  exit 1
fi
echo "✅ Frontend gebaut!"
cd "$BASE"

# 4. Backend starten (in neuem Tab)
echo "🚀 Backend wird gestartet..."
osascript -e "tell application \"Terminal\"
  tell application \"System Events\" to keystroke \"t\" using command down
  delay 0.5
  do script \"cd '$BASE/backend' && npm run dev\" in front window
end tell" 2>/dev/null || osascript -e "tell application \"Terminal\"
  do script \"cd '$BASE/backend' && npm run dev\"
end tell"

echo "⏳ Warte bis Backend läuft..."
sleep 5

# 5. Tunnel starten und Link anzeigen
echo ""
echo "🌐 Öffentlicher Link wird erstellt..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Den Link siehst du unten bei:"
echo "   'Your quick Tunnel has been created'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
cloudflared tunnel --url http://localhost:3001 --no-autoupdate
