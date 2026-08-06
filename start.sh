#!/usr/bin/env bash
# === INSP Dataspace — Iniciar Participante ===
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f .env ]; then
    echo "❌ Arquivo .env não encontrado."
    echo "   Copie .env.example para .env e ajuste os valores."
    exit 1
fi

source .env

echo "═══════════════════════════════════════════════════"
echo "  INSP Dataspace — Participante: ${PARTICIPANT_ID}"
echo "═══════════════════════════════════════════════════"
echo ""

# --- Gerar config se não existir ---
if [ ! -d config ]; then
    echo "📦 Primeira execução — gerando configuração..."
    bash setup.sh
    echo ""
fi

# --- Iniciar containers ---
echo "🐳 Iniciando containers Docker..."
docker compose up -d --build

# --- Conectar à rede do nó central (modo same-machine) ---
CENTRAL_NETWORK=""
if docker network ls --format '{{.Name}}' | grep -q '^insp-connector_default$'; then
    CENTRAL_NETWORK="insp-connector_default"
elif docker network ls --format '{{.Name}}' | grep -q '^connector_default$'; then
    CENTRAL_NETWORK="connector_default"
fi

if [ -n "$CENTRAL_NETWORK" ]; then
    echo "🔗 Rede ${CENTRAL_NETWORK} detectada — conectando controlplane..."
    docker network connect "$CENTRAL_NETWORK" "${PARTICIPANT_ID}-controlplane" 2>/dev/null && \
        echo "   ✅ Conectado à rede do nó central" || \
        echo "   ℹ️  Já conectado ou rede indisponível"
fi

# --- Aguardar controlplane ficar healthy ---
echo "⏳ Aguardando controlplane ficar pronto..."
TIMEOUT=60
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    if curl -sf "http://localhost:${PORT_BASE}191/api/check/health" > /dev/null 2>&1; then
        echo "   ✅ Controlplane online! (${ELAPSED}s)"
        break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    printf "   ⏳ %ds / %ds\r" $ELAPSED $TIMEOUT
done

if [ $ELAPSED -ge $TIMEOUT ]; then
    echo ""
    echo "   ⚠️  Timeout aguardando controlplane. Verifique os logs:"
    echo "      docker compose logs controlplane"
    echo ""
    echo "   O dashboard será iniciado de qualquer forma..."
fi

# --- Solicitar ingresso no broker via Portal Admin ---
echo ""
echo "📡 Enviando solicitação de ingresso ao Portal Administrativo..."

# Determine the correct target URL for the broker:
# If same machine (localhost), use the Docker container name which is accessible via connector_default network
if [ "$HOST_ADDRESS" = "localhost" ] || [ "$HOST_ADDRESS" = "127.0.0.1" ]; then
    BROKER_TARGET_URL="http://${PARTICIPANT_ID}-controlplane:8183/protocol/2025-1"
else
    BROKER_TARGET_URL="http://${HOST_ADDRESS}:${PORT_BASE}193/protocol/2025-1"
fi

JOIN_BODY=$(cat <<EOF
{
  "name": "${PARTICIPANT_ID}",
  "targetUrl": "${BROKER_TARGET_URL}",
  "organization": "${ORGANIZATION_NAME}"
}
EOF
)

JOIN_RESULT=$(curl -sf -X POST \
    "http://${HOST_ADDRESS}:3100/join/request" \
    -H "Content-Type: application/json" \
    -d "$JOIN_BODY" 2>&1) && \
    echo "   ✅ Solicitação enviada! Aguarde aprovação no Portal Administrativo (http://${HOST_ADDRESS}:3100)" || \
    echo "   ⚠️  Não foi possível enviar solicitação (Portal Admin pode estar offline)."
echo "   → Após aprovação, seus dados aparecerão no catálogo federado (broker)."

# --- Iniciar dashboard ---
echo ""
echo "🌐 Iniciando dashboard na porta ${DASHBOARD_PORT}..."
cd dashboard
python3 server.py &
DASHBOARD_PID=$!
cd "$SCRIPT_DIR"

# Salvar PID para stop.sh
echo $DASHBOARD_PID > .dashboard.pid

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Participante ${PARTICIPANT_ID} iniciado!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  📊 Dashboard:     http://localhost:${DASHBOARD_PORT}"
echo "  🔧 Management:    http://localhost:${PORT_BASE}192/management/"
echo "  🌐 Protocol DSP:  http://${HOST_ADDRESS}:${PORT_BASE}193/protocol/2025-1"
echo "  💾 Health Check:   http://localhost:${PORT_BASE}191/api/check/health"
echo ""
echo "  Para parar: ./stop.sh"
echo ""

# Manter script rodando (dashboard em background)
wait $DASHBOARD_PID 2>/dev/null || true
