# ===========================================================================
# Dockerfile — EDC Data Plane (Standalone Participante)
#
# Build context: participante/ (o diretório raiz do pacote)
#
# PREREQUISITO: Os launchers compilados devem estar em:
#   participante/launcher/dataplane/build/install/dataplane/
#
# Se não existirem, compile a partir do projeto principal:
#   cd insp-connector/
#   ./gradlew :launcher:dataplane:installDist -x test
#   cp -r launcher/dataplane/build/install/dataplane/ participante/launcher/dataplane/build/install/dataplane/
#
# Build da imagem (a partir de participante/):
#   docker build -f docker/dataplane.Dockerfile -t participante-dataplane .
# ===========================================================================

FROM eclipse-temurin:21-jre-alpine

LABEL org.opencontainers.image.title="EDC Data Plane — Participante Standalone"
LABEL org.opencontainers.image.description="INSP Dataspace Standalone Participant Data Plane"
LABEL org.opencontainers.image.licenses="Apache-2.0"

RUN addgroup -S edc && adduser -S edc -G edc

WORKDIR /app

# Copiar distribuição pré-compilada do launcher
# Build context = participante/, então o caminho é relativo a participante/
COPY launcher/dataplane/build/install/dataplane/ /app/

RUN mkdir -p /app/config && chown -R edc:edc /app && chmod +x /app/bin/*

USER edc

EXPOSE 8181 8182 8183

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8181/api/check/health || exit 1

ENV JAVA_TOOL_OPTIONS="-Xms256m -Xmx512m"

ENTRYPOINT ["/app/bin/dataplane"]
