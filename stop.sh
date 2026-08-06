#!/usr/bin/env bash
# === INSP Dataspace — Parar Participante ===
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f .env ]; then
    source .env
    echo "🛑 Parando participante: ${PARTICIPANT_ID}"
else
    echo "🛑 Parando participante..."
fi

# --- Parar dashboard ---
if [ -f .dashboard.pid ]; then
    PID=$(cat .dashboard.pid)
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null || true
        echo "   ✅ Dashboard parado (PID: $PID)"
    fi
    rm -f .dashboard.pid
fi

# Matar qualquer server.py remanescente deste diretório
pkill -f "python3.*dashboard/server.py" 2>/dev/null || true

# --- Parar containers ---
echo "   🐳 Parando containers Docker..."
docker compose down

echo ""
echo "✅ Participante parado."
