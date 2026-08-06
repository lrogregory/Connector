#!/usr/bin/env bash
# === INSP Dataspace — Setup do Participante ===
# Gera os arquivos de configuração a partir do .env
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f .env ]; then
    echo "❌ Arquivo .env não encontrado."
    echo "   Copie .env.example para .env e ajuste os valores."
    exit 1
fi

# --- Verificar launchers (baixar se não existirem) ---
LAUNCHERS_URL="https://github.com/lrogregory/Connector/releases/download/v1.0.0/launchers.tar.gz"

if [ ! -d "launcher/controlplane/build/install/controlplane/bin" ]; then
    echo "📦 Launchers não encontrados. Baixando do GitHub..."
    mkdir -p launcher
    if command -v wget &> /dev/null; then
        wget -q --show-progress -O launchers.tar.gz "$LAUNCHERS_URL"
    elif command -v curl &> /dev/null; then
        curl -L -o launchers.tar.gz "$LAUNCHERS_URL"
    else
        echo "❌ wget ou curl não encontrado. Instale um deles."
        exit 1
    fi

    if [ -f launchers.tar.gz ]; then
        tar -xzf launchers.tar.gz
        rm -f launchers.tar.gz
        echo "   ✅ Launchers baixados e extraídos"
    else
        echo "❌ Falha ao baixar launchers de: $LAUNCHERS_URL"
        echo ""
        echo "   Baixe manualmente de:"
        echo "   $LAUNCHERS_URL"
        echo ""
        echo "   Extraia com: tar -xzf launchers.tar.gz"
        exit 1
    fi
fi

if [ ! -d "launcher/dataplane/build/install/dataplane/bin" ]; then
    echo "❌ Launcher do Data Plane não encontrado!"
    echo "   Verifique a extração dos launchers."
    exit 1
fi

echo "   ✅ Launchers encontrados"

source .env

echo "🔧 Configurando participante: ${PARTICIPANT_ID}"
echo "   Porta base: ${PORT_BASE}"
echo "   Host: ${HOST_ADDRESS}"
echo "   Broker: ${BROKER_URL}"
echo ""

# --- Criar diretório config ---
mkdir -p config

# --- Gerar controlplane.properties ---
cat > config/controlplane.properties << EOF
# ===========================================================================
# ${PARTICIPANT_ID} — Control Plane (gerado por setup.sh)
# ===========================================================================

edc.participant.id=${PARTICIPANT_ID}
edc.connector.name=${PARTICIPANT_ID}-controlplane
edc.hostname=${PARTICIPANT_ID}-controlplane

# --- Web/HTTP API Ports ---
web.http.port=8181
web.http.path=/api

web.http.management.port=8182
web.http.management.path=/management

web.http.protocol.port=8183
web.http.protocol.path=/protocol

web.http.control.port=8184
web.http.control.path=/control

web.http.signaling.port=8185
web.http.signaling.path=/signaling

# --- DSP Callback (endereço externo acessível pelo broker/outros connectors) ---
edc.dsp.callback.address=http://${HOST_ADDRESS}:${PORT_BASE}193/protocol/2025-1

# --- Data Plane Selector ---
edc.dpf.selector.url=http://${PARTICIPANT_ID}-controlplane:8184/control/v1/dataplanes

# --- PostgreSQL ---
edc.datasource.default.url=jdbc:postgresql://postgres:5432/${PARTICIPANT_ID}
edc.datasource.default.user=edc
edc.datasource.default.password=edc
edc.sql.schema.autocreate=true

# --- State Machine ---
edc.transfer.state-machine.iteration-wait-millis=500
edc.negotiation.state-machine.iteration-wait-millis=500
edc.data.plane.selector.state-machine.iteration-wait-millis=500

# --- Retry ---
edc.transfer.send.retry.limit=3
edc.transfer.send.retry.base-delay.ms=1000
edc.negotiation.send.retry.limit=3
edc.negotiation.send.retry.base-delay.ms=1000

# --- Management API ---
edc.management.context.enabled=true

# --- Manual Approval ---
edc.negotiation.manual.approval.enabled=true

# --- Transfer Token Signing ---
edc.transfer.proxy.token.signer.privatekey.alias=private-key
edc.transfer.proxy.token.verifier.publickey.alias=public-key

# --- Vault Secrets (chaves para assinatura de tokens) ---
edc.vault.secrets.private-key=-----BEGIN EC PRIVATE KEY-----\\nMHcCAQEEIFCcuLUoUzeXqBPbz+FNtqC1DOn9MdZHOwlQcYJZ0JQnoAoGCCqGSM49\\nAwEHoUQDQgAEIyNWBxX1vgfTEgX2+ze6akcS3srobisgDCW0dUuVq0silOOxwzZG\\nJPvW97c6Ga1jyba9Hz8wypYb/0fpkPcvsg==\\n-----END EC PRIVATE KEY-----
edc.vault.secrets.public-key=-----BEGIN PUBLIC KEY-----\\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEIyNWBxX1vgfTEgX2+ze6akcS3sro\\nbisgDCW0dUuVq0silOOxwzZGJPvW97c6Ga1jyba9Hz8wypYb/0fpkPcvsg==\\n-----END PUBLIC KEY-----
private-key=-----BEGIN EC PRIVATE KEY-----\\nMHcCAQEEIFCcuLUoUzeXqBPbz+FNtqC1DOn9MdZHOwlQcYJZ0JQnoAoGCCqGSM49\\nAwEHoUQDQgAEIyNWBxX1vgfTEgX2+ze6akcS3srobisgDCW0dUuVq0silOOxwzZG\\nJPvW97c6Ga1jyba9Hz8wypYb/0fpkPcvsg==\\n-----END EC PRIVATE KEY-----
public-key=-----BEGIN PUBLIC KEY-----\\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEIyNWBxX1vgfTEgX2+ze6akcS3sro\\nbisgDCW0dUuVq0silOOxwzZGJPvW97c6Ga1jyba9Hz8wypYb/0fpkPcvsg==\\n-----END PUBLIC KEY-----
EOF

# --- Gerar dataplane.properties ---
cat > config/dataplane.properties << EOF
# ===========================================================================
# ${PARTICIPANT_ID} — Data Plane (gerado por setup.sh)
# ===========================================================================

edc.participant.id=${PARTICIPANT_ID}
edc.connector.name=${PARTICIPANT_ID}-dataplane
edc.hostname=${PARTICIPANT_ID}-dataplane

# --- Web/HTTP API Ports ---
web.http.port=8181
web.http.path=/api

web.http.control.port=8182
web.http.control.path=/control

web.http.public.port=8183
web.http.public.path=/public

# --- Control Plane connection ---
edc.dpf.selector.url=http://${PARTICIPANT_ID}-controlplane:8184/control/v1/dataplanes

# --- Transfer Proxy Token ---
edc.transfer.proxy.token.signer.privatekey.alias=private-key
edc.transfer.proxy.token.verifier.publickey.alias=public-key

# --- Public API base URL ---
edc.dataplane.api.public.response.baseurl=http://${HOST_ADDRESS}:${PORT_BASE}283/public

# --- PostgreSQL ---
edc.datasource.default.url=jdbc:postgresql://postgres:5432/${PARTICIPANT_ID}
edc.datasource.default.user=edc
edc.datasource.default.password=edc
edc.sql.schema.autocreate=true

# --- Data Plane Tuning ---
edc.dataplane.http.sink.partition.size=5
edc.dataplane.send.retry.limit=3
edc.dataplane.state-machine.iteration-wait-millis=500

# --- Vault Secrets ---
edc.vault.secrets.private-key=-----BEGIN EC PRIVATE KEY-----\\nMHcCAQEEIFCcuLUoUzeXqBPbz+FNtqC1DOn9MdZHOwlQcYJZ0JQnoAoGCCqGSM49\\nAwEHoUQDQgAEIyNWBxX1vgfTEgX2+ze6akcS3srobisgDCW0dUuVq0silOOxwzZG\\nJPvW97c6Ga1jyba9Hz8wypYb/0fpkPcvsg==\\n-----END EC PRIVATE KEY-----
edc.vault.secrets.public-key=-----BEGIN PUBLIC KEY-----\\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEIyNWBxX1vgfTEgX2+ze6akcS3sro\\nbisgDCW0dUuVq0silOOxwzZGJPvW97c6Ga1jyba9Hz8wypYb/0fpkPcvsg==\\n-----END PUBLIC KEY-----
private-key=-----BEGIN EC PRIVATE KEY-----\\nMHcCAQEEIFCcuLUoUzeXqBPbz+FNtqC1DOn9MdZHOwlQcYJZ0JQnoAoGCCqGSM49\\nAwEHoUQDQgAEIyNWBxX1vgfTEgX2+ze6akcS3srobisgDCW0dUuVq0silOOxwzZG\\nJPvW97c6Ga1jyba9Hz8wypYb/0fpkPcvsg==\\n-----END EC PRIVATE KEY-----
public-key=-----BEGIN PUBLIC KEY-----\\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEIyNWBxX1vgfTEgX2+ze6akcS3sro\\nbisgDCW0dUuVq0silOOxwzZGJPvW97c6Ga1jyba9Hz8wypYb/0fpkPcvsg==\\n-----END PUBLIC KEY-----
EOF

# --- Copiar arquivos de config do dashboard (VCRs e schema) ---
mkdir -p dashboard/config
if [ -d "../dashboard/config" ]; then
    cp -n ../dashboard/config/dcat-br-schema.json dashboard/config/ 2>/dev/null || true
    cp -n ../dashboard/config/vcr-*.json dashboard/config/ 2>/dev/null || true
    echo "   ✅ Arquivos de configuração copiados de ../dashboard/config/"
else
    echo "   ⚠️  Diretório ../dashboard/config/ não encontrado."
    echo "      Copie manualmente os arquivos vcr-*.json e dcat-br-schema.json para dashboard/config/"
fi

# --- Copiar shared assets ---
mkdir -p dashboard/shared/img
if [ -d "../dashboard/shared" ]; then
    cp -n ../dashboard/shared/layout.css dashboard/shared/ 2>/dev/null || true
    cp -rn ../dashboard/shared/img/* dashboard/shared/img/ 2>/dev/null || true
    echo "   ✅ Layout CSS e imagens copiados"
else
    echo "   ⚠️  Diretório ../dashboard/shared/ não encontrado."
fi

echo ""
echo "✅ Configuração gerada com sucesso!"
echo ""
echo "   config/controlplane.properties"
echo "   config/dataplane.properties"
echo ""
echo "   Próximo passo: ./start.sh"
