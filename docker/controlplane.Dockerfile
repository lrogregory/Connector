# ===========================================================================
# Dockerfile — EDC Control Plane (Standalone Participante)
#
# Build context: participante/ (o diretório raiz do pacote)
#
# PREREQUISITO: Os launchers compilados devem estar em:
#   participante/launcher/controlplane/build/install/controlplane/
#
# Se não existirem, compile a partir do projeto principal:
#   cd insp-connector/
#   ./gradlew :launcher:controlplane:installDist -x test
#   cp -r launcher/controlplane/build/install/controlplane/ participante/launcher/controlplane/build/install/controlplane/
#
# Build da imagem (a partir de participante/):
#   docker build -f docker/controlplane.Dockerfile -t participante-controlplane .
# ===========================================================================

FROM eclipse-temurin:21-jre-alpine

LABEL org.opencontainers.image.title="EDC Control Plane — Participante Standalone"
LABEL org.opencontainers.image.description="INSP Dataspace Standalone Participant Control Plane"
LABEL org.opencontainers.image.licenses="Apache-2.0"

RUN addgroup -S edc && adduser -S edc -G edc

WORKDIR /app

# Copiar distribuição pré-compilada do launcher
# Build context = participante/, então o caminho é relativo a participante/
COPY launcher/controlplane/build/install/controlplane/ /app/

RUN mkdir -p /app/config && chown -R edc:edc /app && chmod +x /app/bin/*

USER edc

EXPOSE 8181 8182 8183 8184 8185

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8181/api/check/health || exit 1

ENV JAVA_TOOL_OPTIONS="-Xms256m -Xmx512m"

ENTRYPOINT ["/app/bin/controlplane"]
