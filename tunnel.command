#!/bin/bash
cd "$(dirname "$0")"
BASE="$(pwd)"

echo "🚀 Backend wird gestartet..."
cd "$BASE/backend"
npm run dev &
BACKEND_PID=$!

echo "⏳ Warte 4 Sekunden..."
sleep 4

echo ""
echo "🌐 Tunnel wird erstellt..."

# cloudflared installieren falls nicht vorhanden
if ! command -v cloudflared &> /dev/null; then
  echo "📦 cloudflared installieren..."
  brew install cloudflare/cloudflare/cloudflared
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Dein Link erscheint gleich unten:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cloudflared tunnel --url http://localhost:3001 --no-autoupdate

# Wenn Tunnel beendet wird, auch Backend beenden
kill $BACKEND_PID 2>/dev/null
