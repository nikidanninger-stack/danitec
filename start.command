#!/bin/bash
# Danitec – beide Server starten
cd "$(dirname "$0")"

echo "🚀 Danitec wird gestartet..."

# PostgreSQL sicherstellen
brew services start postgresql@14 2>/dev/null || brew services start postgresql 2>/dev/null
sleep 2

# Backend starten
osascript -e "tell application \"Terminal\"
  do script \"cd '$(pwd)/backend' && npm start\"
end tell"

sleep 1

# Frontend starten
osascript -e "tell application \"Terminal\"
  do script \"cd '$(pwd)/frontend' && npm run dev\"
end tell"

sleep 4

# Browser öffnen
open http://localhost:3000

echo "✅ Fertig – Browser wird geöffnet"
