#!/usr/bin/env bash
# WaitLess Wien — Quick Setup Script
# Run once: bash setup.sh

set -e

echo "🏥 WaitLess Wien — Setup"
echo "========================"

# Check for node
if ! command -v node &>/dev/null; then
    echo ""
    echo "⚠️  Node.js nicht gefunden."
    echo "   Bitte installieren: https://nodejs.org  (LTS empfohlen)"
    echo "   Oder via Homebrew: brew install node"
    exit 1
fi

echo "✅ Node.js $(node -v) gefunden"
echo "📦 Installiere Abhängigkeiten..."
npm install

echo ""
echo "✅ Setup abgeschlossen!"
echo ""
echo "🚀 Server starten:"
echo "   npm start"
echo ""
echo "🌐 Dann öffnen:"
echo "   http://localhost:3000"
echo ""
echo "🔑 Demo-Zugänge:"
echo "   Patient:   maria@example.at     / patient123"
echo "   Ordination: denia@waitless.at   / praxis123"
