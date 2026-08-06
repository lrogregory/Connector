# INSP Dataspace — Connector Participante

Pacote independente para implantar um connector participante no INSP Dataspace.
Permite que qualquer organização ingresse no dataspace de forma autônoma, sem necessidade de acesso ao repositório do nó central.

## Visão Geral

Este é um **connector independente** baseado no Eclipse Dataspace Components (EDC) v0.17.0 que se conecta ao INSP Dataspace. Cada organização participante executa seu próprio connector, que:

- Publica datasets no catálogo federado (via protocolo DSP 2025-1)
- Negocia contratos de compartilhamento de dados
- Transfere dados de forma segura para consumidores autorizados
- Suporta o padrão **DCAT-BR** do governo federal brasileiro

O nó central (Broker + Connector A + Portal Admin) é operado pelo administrador do dataspace. Este pacote é tudo que um participante precisa para ingressar.

## Pré-requisitos

| Requisito | Versão | Uso |
|-----------|--------|-----|
| Docker | ≥ 24.0 | Containers do connector |
| Docker Compose | v2 | Orquestração dos serviços |
| Python 3 | ≥ 3.8 | Dashboard web local |
| curl | qualquer | Solicitação de ingresso ao broker |
| Launchers compilados | — | JARs do controlplane + dataplane |

> **Nota:** Java 21 e Gradle são necessários apenas se você precisar compilar os launchers a partir do código-fonte.

## Instalação

### Passo 1 — Clonar o repositório

```bash
git clone <url-do-repositório> insp-dataspace-participante
cd insp-dataspace-participante
```

### Passo 2 — Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env   # Edite com os dados da sua organização
```

### Passo 3 — Verificar launchers

Os Dockerfiles dependem dos JARs compilados do projeto principal. Verifique se existem:

```bash
ls launcher/controlplane/build/install/controlplane/bin/
ls launcher/dataplane/build/install/dataplane/bin/
```

Se os launchers **não estiverem incluídos** no pacote, compile a partir do projeto principal:

```bash
cd insp-connector/
./gradlew :launcher:controlplane:installDist :launcher:dataplane:installDist -x test

# Copiar para o pacote participante
cp -r launcher/controlplane/build/install/controlplane/ participante/launcher/controlplane/build/install/controlplane/
cp -r launcher/dataplane/build/install/dataplane/ participante/launcher/dataplane/build/install/dataplane/
```

### Passo 4 — Iniciar

```bash
./start.sh
```

## Configuração (.env)

### Variáveis

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `PARTICIPANT_ID` | Identificador único do connector (sem espaços) | `connector-c` |
| `PARTICIPANT_NAME` | Nome legível para exibição | `Connector C` |
| `ORGANIZATION_NAME` | Nome da organização participante | `Ministério da Saúde` |
| `PORT_BASE` | Prefixo de 2 dígitos para todas as portas | `13` |
| `HOST_ADDRESS` | IP/hostname acessível externamente | `localhost` ou `192.168.1.50` |
| `BROKER_URL` | URL da Management API do broker | `http://localhost:39192` |
| `DASHBOARD_PORT` | Porta do dashboard web | `3003` |
| `DB_PORT` | Porta externa do PostgreSQL | `5434` |

### Convenção de Portas (PORT_BASE)

Dado `PORT_BASE=XX`, as portas são mapeadas automaticamente:

| Serviço | Porta Interna | Porta Externa | Descrição |
|---------|:---:|:---:|-----------|
| Control Plane — Health | 8181 | `XX191` | Health check |
| Control Plane — Management | 8182 | `XX192` | API de gerenciamento |
| Control Plane — Protocol | 8183 | `XX193` | Protocolo DSP 2025-1 |
| Control Plane — Control | 8184 | `XX194` | Controle interno |
| Control Plane — Signaling | 8185 | `XX195` | Sinalização data plane |
| Data Plane — Default | 8181 | `XX281` | Health do data plane |
| Data Plane — Control | 8182 | `XX282` | Controle do data plane |
| Data Plane — Public | 8183 | `XX283` | Transferência de dados (EDR) |
| PostgreSQL | 5432 | `DB_PORT` | Banco de dados |
| Dashboard | — | `DASHBOARD_PORT` | Interface web |

**Exemplos de alocação:**

| Participante | PORT_BASE | Management | DSP | Data Public | Dashboard |
|---|:---:|:---:|:---:|:---:|:---:|
| Connector C | `13` | `:13192` | `:13193` | `:13283` | `:3003` |
| Connector D | `14` | `:14192` | `:14193` | `:14283` | `:3004` |
| Connector E | `15` | `:15192` | `:15193` | `:15283` | `:3005` |

### HOST_ADDRESS — Mesma máquina vs. Remota

- **Mesma máquina** (participante rodando no mesmo host que o nó central):
  - Use `HOST_ADDRESS=localhost`
  - O `start.sh` conecta automaticamente o container à rede Docker do nó central
  - A comunicação intra-Docker usa nomes de container (mais eficiente)

- **Máquina remota** (participante em outro servidor):
  - Use `HOST_ADDRESS=<IP externo da máquina>`
  - O broker e outros connectors acessam via IP + porta mapeada
  - Requer portas abertas no firewall

## Iniciar

```bash
./start.sh
```

O script executa automaticamente:

1. ✅ Valida que `.env` existe
2. 📦 Gera `config/*.properties` se primeira execução (via `setup.sh`)
3. 🐳 Sobe containers Docker (PostgreSQL → Controlplane → Dataplane)
4. 🔗 Conecta à rede do nó central (se rodando na mesma máquina)
5. ⏳ Aguarda controlplane ficar healthy (timeout: 60s)
6. 📡 Envia solicitação de ingresso ao Portal Administrativo
7. 🌐 Inicia o dashboard web na porta configurada

Após a inicialização, o connector **solicita aprovação automaticamente**. Não é necessário nenhuma ação manual adicional por parte do participante.

## Aprovação

O fluxo de aprovação é feito pelo **administrador do nó central**:

1. O administrador acessa o **Portal Administrativo** (`http://<central>:3100`)
2. Na seção **Broker → Participantes Pendentes**, aparece a solicitação
3. O administrador clica em **"Aprovar"**
4. O broker registra o connector e inicia o crawl automático
5. Após ~30 segundos, os datasets do participante aparecem no **catálogo federado**

> Enquanto não aprovado, o connector funciona normalmente mas seus datasets não são visíveis no catálogo federado.

## Parar

```bash
./stop.sh
```

Remove os containers Docker e para o dashboard. Os dados persistem no volume PostgreSQL.

## Deploy em Outra Máquina

### Empacotar para distribuição

No nó central, gere o pacote completo:

```bash
cd insp-connector/

# Garantir que os launchers estão no pacote
mkdir -p participante/launcher/controlplane/build/install/
mkdir -p participante/launcher/dataplane/build/install/
cp -r launcher/controlplane/build/install/controlplane/ participante/launcher/controlplane/build/install/controlplane/
cp -r launcher/dataplane/build/install/dataplane/ participante/launcher/dataplane/build/install/dataplane/

# Empacotar
tar -czf insp-dataspace-participante.tar.gz participante/
```

O arquivo `insp-dataspace-participante.tar.gz` (~125 MB) contém tudo que o participante precisa.

### Instalar na máquina remota

```bash
# Copiar o pacote para a máquina remota
scp insp-dataspace-participante.tar.gz usuario@192.168.1.50:~/

# Na máquina remota:
tar -xzf insp-dataspace-participante.tar.gz
cd participante/

# Configurar
cp .env.example .env
nano .env
```

### Passo a passo completo

1. **Copiar o pacote** para a máquina remota:
   ```bash
   scp -r participante/ usuario@192.168.1.50:~/insp-participante/
   ```

2. **Verificar launchers** — confirme que `launcher/` foi copiado:
   ```bash
   ls launcher/controlplane/build/install/controlplane/bin/controlplane
   ls launcher/dataplane/build/install/dataplane/bin/dataplane
   ```

3. **Configurar `.env`**:
   ```bash
   cp .env.example .env
   nano .env
   ```
   
   Exemplo para máquina remota:
   ```env
   PARTICIPANT_ID=connector-d
   PARTICIPANT_NAME=Connector D
   ORGANIZATION_NAME=Secretaria Estadual de Saúde
   PORT_BASE=14
   HOST_ADDRESS=192.168.1.50
   BROKER_URL=http://10.0.0.1:39192
   DASHBOARD_PORT=3004
   DB_PORT=5435
   ```

4. **Abrir portas no firewall**:
   ```bash
   # Porta DSP (obrigatória — broker e outros connectors precisam acessar)
   sudo ufw allow ${PORT_BASE}193/tcp

   # Porta de transferência de dados (obrigatória — consumidores acessam via EDR)
   sudo ufw allow ${PORT_BASE}283/tcp

   # Dashboard (opcional — apenas se quiser acesso remoto ao dashboard)
   sudo ufw allow ${DASHBOARD_PORT}/tcp
   ```

5. **Iniciar**:
   ```bash
   ./start.sh
   ```

### Configurações importantes para deploy remoto

| Variável | Valor | Explicação |
|----------|-------|-----------|
| `HOST_ADDRESS` | IP externo da máquina | O broker usa isso para acessar o connector |
| `BROKER_URL` | IP do nó central + porta 39192 | Ex: `http://10.0.0.1:39192` |

### targetUrl — Mesma máquina vs. Remota

O `start.sh` determina automaticamente o `targetUrl` enviado ao broker:

- **Mesma máquina** (`HOST_ADDRESS=localhost`):
  ```
  targetUrl = http://<PARTICIPANT_ID>-controlplane:8183/protocol/2025-1
  ```
  Usa o nome do container Docker, pois ambos estão na mesma rede Docker.

- **Máquina remota** (`HOST_ADDRESS=<IP externo>`):
  ```
  targetUrl = http://<HOST_ADDRESS>:<PORT_BASE>193/protocol/2025-1
  ```
  Usa o IP externo + porta mapeada, pois o broker precisa acessar pela rede.

> **IMPORTANTE:** Se seu participante está em outra máquina, o nó central precisa conseguir acessar `http://<HOST_ADDRESS>:<PORT_BASE>193` — verifique firewall e roteamento.

## Dashboard

Acesse: `http://localhost:<DASHBOARD_PORT>` (padrão: http://localhost:3003)

O dashboard oferece:

- 📋 **Catálogo** — visualizar datasets disponíveis no catálogo federado
- 📥 **Importar RDF** — importar metadados de datasets em formato DCAT-BR
- 📤 **Publicar** — criar e publicar novos datasets com formulário guiado
- 🤝 **Negociar** — iniciar e gerenciar negociações de contrato
- 📊 **Transferências** — monitorar transferências de dados em andamento

## Troubleshooting

| Problema | Causa Provável | Solução |
|----------|---------------|---------|
| `❌ Arquivo .env não encontrado` | .env não criado | `cp .env.example .env` e edite |
| `❌ Launchers não encontrados!` | JARs não copiados | Compile e copie (veja seção Instalação) |
| Porta em uso | Conflito com outro serviço | Altere `PORT_BASE` (ex: 15, 16, 17) |
| Controlplane não inicia | JARs corrompidos ou incompletos | Recompile: `./gradlew :launcher:controlplane:installDist -x test` |
| `⚠️ Não foi possível enviar solicitação` | Portal Admin offline | Verifique se o nó central está rodando |
| Broker não crawlea após aprovação | `HOST_ADDRESS` incorreto | Confirme que o broker consegue acessar `HOST_ADDRESS:PORT_BASE193` |
| Dashboard não carrega | Python 3 não instalado | `sudo apt install python3` |
| Timeout no health check | Memória insuficiente | Verifique com `docker compose logs controlplane` |
| Datasets não aparecem no catálogo | Aguardar ciclo de crawl | Espere 30s após aprovação; verifique logs do broker |
| Erro de conexão ao PostgreSQL | Container postgres não healthy | `docker compose logs postgres` |

## Estrutura do Pacote

```
participante/
├── .env.example                  # Template de configuração
├── .gitignore                    # Ignora config/, volumes, PIDs
├── docker-compose.yml            # Serviços: postgres + controlplane + dataplane
├── setup.sh                      # Gera config/ a partir do .env + valida launchers
├── start.sh                      # Inicia tudo (containers + registro + dashboard)
├── stop.sh                       # Para tudo
├── docker/                       # Dockerfiles
│   ├── controlplane.Dockerfile   # Imagem do Control Plane
│   └── dataplane.Dockerfile      # Imagem do Data Plane
├── launcher/                     # JARs compilados (necessário para build)
│   ├── controlplane/build/install/controlplane/
│   └── dataplane/build/install/dataplane/
├── config/                       # (gerado) Arquivos .properties
│   ├── controlplane.properties
│   └── dataplane.properties
├── dashboard/
│   ├── server.py                 # Servidor HTTP do dashboard
│   ├── connector/                # Interface web (HTML/JS/CSS)
│   ├── shared/                   # CSS e imagens compartilhadas
│   └── config/                   # Schema DCAT-BR + vocabulários (VCR)
└── README.md                     # Este arquivo
```

## Segurança (Notas para Produção)

Este pacote é projetado para desenvolvimento e PoC. Para produção, considere:

- **TLS**: Coloque nginx/Caddy na frente das portas DSP e Public com certificado SSL
- **Vault**: Substitua vault-seed por HashiCorp Vault para gerenciamento de chaves
- **Credenciais**: Use Docker secrets ao invés de variáveis de ambiente
- **Rede**: Restrinja Management API e PostgreSQL à rede interna
- **Dashboard**: Adicione autenticação (Basic Auth ou OAuth2 proxy)
- **Firewall**: Exponha apenas as portas DSP (Protocol) e Public (Data Transfer)

## Licença

Apache License 2.0
