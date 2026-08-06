// ===== CONNECTOR APP =====
const API = '/api/mgmt';
const CTX = ["https://w3id.org/edc/connector/management/v2"];
const METADATA_KEY = "dcat-br:metadata";

const PORT = window.location.port;

// ===== NAVIGATION =====
const sidebarMenus = {
    catalogo: [
        { id: 'conjuntos', icon: '📦', label: 'Conjuntos de Dados' },
        { id: 'gestao', icon: '⚙️', label: 'Gestão' },
        { id: 'recebidos', icon: '📥', label: 'Dados Recebidos' },
        { id: 'importar', icon: '🌐', label: 'Repositórios' }
    ],
    admin: [
        { id: 'negociar', icon: '🤝', label: 'Negociar' },
        { id: 'negociacoes', icon: '📊', label: 'Negociações Recebidas' }
    ]
};

let currentSection = 'catalogo';
let currentNav = 'conjuntos';

function switchSection(section) {
    currentSection = section;
    document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.top-tab[onclick*="${section}"]`).classList.add('active');
    renderSidebar();
    // Navigate to first item in new section
    navigateTo(sidebarMenus[section][0].id);
}

function renderSidebar() {
    const sidebar = document.getElementById('sidebar');
    const items = sidebarMenus[currentSection];
    sidebar.innerHTML = items.map(item =>
        `<div class="sidebar-item ${currentNav === item.id ? 'active' : ''}" onclick="navigateTo('${item.id}')">${item.icon} <span>${item.label}</span></div>`
    ).join('');
}

function navigateTo(pageId) {
    currentNav = pageId;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById('page-' + pageId);
    if (page) page.classList.add('active');
    renderSidebar();
    // Trigger load for specific pages
    if (pageId === 'conjuntos') loadAssets();
    if (pageId === 'gestao') loadGestao();
    if (pageId === 'recebidos') loadReceivedData();
    if (pageId === 'organizacoes') loadOrgs();
    if (pageId === 'config') showConfigPanel('schema');
    if (pageId === 'vcr') loadVcrList();
    if (pageId === 'politicas') loadPolicies();
    if (pageId === 'contratos') loadContracts();
    if (pageId === 'negociacoes') loadReceivedNegotiationsA();
}

// Initialize navigation
renderSidebar();

async function checkHealth() {
    try {
        const r = await fetch('/api/health/api/check/health');
        const d = await r.json();
        document.getElementById('health').textContent = d.isSystemHealthy ? '✅ Online' : '❌';
        document.getElementById('health').className = 'health-indicator ' + (d.isSystemHealthy ? 'online' : 'offline');
    } catch { document.getElementById('health').textContent = '❌'; }
}

async function api(path, method = 'POST', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(API + path, opts);
    try { return await r.json(); } catch { return null; }
}

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

function formatBytes(val) {
    if (!val) return '';
    // If already has unit (e.g. "1,5 MB"), return as-is
    if (/[a-zA-Z]/.test(String(val))) return String(val);
    const bytes = parseFloat(String(val).replace(/[^\d.]/g, ''));
    if (isNaN(bytes)) return String(val);
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1).replace('.0', '') + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1).replace('.0', '') + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1).replace('.0', '') + ' KB';
    return bytes + ' bytes';
}

// ===== ASSETS (fetch ALL with high limit) =====
let allAssets = [];
let currentPage = 0;
const PAGE_SIZE = 12;
let currentFilter = 'todos';
let currentSearchText = '';
let activeFieldFilters = {};

async function loadAssets() {
    // EDC default limit is 50. Request up to 999999 to get ALL assets.
    try {
        const data = await api('/management/v4/assets/request', 'POST', {
            "@context": ["https://w3id.org/edc/connector/management/v2"], "@type": "QuerySpec",
            "limit": 999999,
            "offset": 0
        });
        allAssets = Array.isArray(data) ? data : [];
        // Sort most recent first (by createdAt or asset ID timestamp)
        allAssets.sort((a, b) => {
            const timeA = a.createdAt || parseInt((a['@id']||'').replace(/\D/g,'')) || 0;
            const timeB = b.createdAt || parseInt((b['@id']||'').replace(/\D/g,'')) || 0;
            return timeB - timeA;
        });
    } catch(e) {
        allAssets = [];
        console.error('loadAssets error:', e);
    }
    currentPage = 0;
    renderMainView();
}

function renderMainView() {
    const mainEl = document.getElementById('assets-content');
    const total = allAssets.length;
    const abertos = allAssets.filter(a => parseMetadata(a).dadosAbertos === 'Sim').length;
    const naoAbertos = total - abertos;

    const orgs = [...new Set(allAssets.map(a => parseMetadata(a).creator).filter(Boolean))];
    const temas = [...new Set(allAssets.flatMap(a => parseMetadata(a).temas || []).filter(Boolean))];
    const periodicidades = [...new Set(allAssets.map(a => parseMetadata(a).periodicidade).filter(Boolean))];
    const licencas = [...new Set(allAssets.map(a => parseMetadata(a).licenca).filter(Boolean))];

    mainEl.innerHTML = `
        <div class="stats-bar">
            <div class="stat-item"><span class="stat-num">${total}</span><span class="stat-lbl">Conjuntos de dados</span></div>
            <div class="stat-item stat-green"><span class="stat-num">${abertos}</span><span class="stat-lbl">Abertos</span></div>
            <div class="stat-item stat-orange"><span class="stat-num">${naoAbertos}</span><span class="stat-lbl">Não abertos</span></div>
        </div>
        <div class="filters-section">
            <div class="filter-bar">
                <button class="filter-btn ${currentFilter==='todos'?'active':''}" onclick="setFilter('todos')">Todos</button>
                <button class="filter-btn ${currentFilter==='aberto'?'active':''}" onclick="setFilter('aberto')">🟢 Abertos</button>
                <button class="filter-btn ${currentFilter==='nao-aberto'?'active':''}" onclick="setFilter('nao-aberto')">🟠 Não abertos</button>
            </div>
            <div class="advanced-filters">
                <input type="text" class="search-input" placeholder="🔍 Buscar por título, descrição..." value="${esc(currentSearchText)}" oninput="doSearch(this.value)">
                <select class="filter-select" onchange="filterByField('org', this.value)">
                    <option value="">🏛️ Todas organizações</option>
                    ${orgs.map(o => `<option value="${esc(o)}" ${activeFieldFilters.org===o?'selected':''}>${esc(o.substring(0,40))}</option>`).join('')}
                </select>
                <select class="filter-select" onchange="filterByField('tema', this.value)">
                    <option value="">📂 Todos temas</option>
                    ${temas.map(t => `<option value="${esc(t)}" ${activeFieldFilters.tema===t?'selected':''}>${esc(t)}</option>`).join('')}
                </select>
                <select class="filter-select" onchange="filterByField('periodicidade', this.value)">
                    <option value="">🔄 Periodicidade</option>
                    ${periodicidades.map(p => `<option value="${esc(p)}" ${activeFieldFilters.periodicidade===p?'selected':''}>${esc(p)}</option>`).join('')}
                </select>
                <select class="filter-select" onchange="filterByField('licenca', this.value)">
                    <option value="">📜 Licença</option>
                    ${licencas.map(l => `<option value="${esc(l)}" ${activeFieldFilters.licenca===l?'selected':''}>${esc(l)}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="card-grid" id="assets-grid"></div>`;
    renderAssets();
}

function setFilter(f) { currentFilter = f; currentPage = 0; renderMainView(); }
function doSearch(text) { currentSearchText = text.toLowerCase(); currentPage = 0; renderAssets(); }
function filterByField(field, value) { if (value) activeFieldFilters[field] = value; else delete activeFieldFilters[field]; currentPage = 0; renderAssets(); }

function getFilteredAssets() {
    let filtered = allAssets;
    // Hide assets marked as hidden (managed via Gestão tab)
    filtered = filtered.filter(a => !parseMetadata(a)._hidden);
    if (currentFilter === 'aberto') filtered = filtered.filter(a => parseMetadata(a).dadosAbertos === 'Sim');
    if (currentFilter === 'nao-aberto') filtered = filtered.filter(a => parseMetadata(a).dadosAbertos !== 'Sim');
    if (currentSearchText) {
        filtered = filtered.filter(a => {
            const m = parseMetadata(a);
            return (m.title||'').toLowerCase().includes(currentSearchText) ||
                   (m.description||'').toLowerCase().includes(currentSearchText) ||
                   (m.creator||'').toLowerCase().includes(currentSearchText);
        });
    }
    if (activeFieldFilters.org) filtered = filtered.filter(a => parseMetadata(a).creator === activeFieldFilters.org);
    if (activeFieldFilters.tema) filtered = filtered.filter(a => (parseMetadata(a).temas||[]).includes(activeFieldFilters.tema));
    if (activeFieldFilters.periodicidade) filtered = filtered.filter(a => parseMetadata(a).periodicidade === activeFieldFilters.periodicidade);
    if (activeFieldFilters.licenca) filtered = filtered.filter(a => parseMetadata(a).licenca === activeFieldFilters.licenca);
    return filtered;
}

function renderAssets() {
    const grid = document.getElementById('assets-grid');
    if (!grid) return;
    const filtered = getFilteredAssets();
    if (filtered.length === 0) { grid.innerHTML = '<p class="empty">Nenhum conjunto de dados encontrado</p>'; return; }

    const start = currentPage * PAGE_SIZE;
    const page = filtered.slice(start, start + PAGE_SIZE);
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

    grid.innerHTML = page.map((a, i) => {
        const meta = parseMetadata(a);
        const idx = start + i;
        const distCount = (meta.distributions || []).length || (meta.recursoUrl ? 1 : 0);
        const modDate = meta.importedAt ? new Date(meta.importedAt).toLocaleDateString('pt-BR') : '';
        return `<div class="card" onclick="openAssetDetail(${idx})">
            <div class="card-body">
                <div class="card-selo-row">
                    <img src="/shared/img/semselo.png" class="selo-img" alt="Sem selo" title="Sem selo — Aguardando avaliação MQM">
                    <div class="fair-badges">
                        <span class="fair-badge inactive">F</span>
                        <span class="fair-badge inactive">A</span>
                        <span class="fair-badge inactive">I</span>
                        <span class="fair-badge inactive">R</span>
                        <span class="fair-badge-separator">+</span>
                        <span class="fair-badge inactive">C</span>
                        <span class="fair-badge inactive">C</span>
                    </div>
                </div>
                <h4>${esc(meta.title)}</h4>
                <p class="card-desc">${esc((meta.description||'').substring(0, 150))}</p>
                ${meta.creator ? `<p class="card-org">Por: <strong>${esc(meta.creator.substring(0,50))}</strong></p>` : ''}
            </div>
            <div class="card-footer">
                <span>📦 ${distCount} Recurso${distCount!==1?'s':''}</span>
                ${modDate ? `<span>📅 ${modDate}</span>` : ''}
            </div>
        </div>`;
    }).join('');

    if (totalPages > 1) {
        grid.innerHTML += `<div class="pagination">
            <button ${currentPage===0?'disabled':''} onclick="currentPage--;renderAssets()">← Anterior</button>
            <span>Página ${currentPage+1} de ${totalPages} (${filtered.length} conjuntos de dados)</span>
            <button ${currentPage>=totalPages-1?'disabled':''} onclick="currentPage++;renderAssets()">Próxima →</button>
        </div>`;
    }
}

// ===== DETAIL VIEW (full page inside tab, not popup) =====
function openAssetDetail(idx) {
    const filtered = getFilteredAssets();
    const asset = filtered[idx];
    const meta = parseMetadata(asset);

    const mainEl = document.getElementById('assets-content');
    mainEl.innerHTML = `
        <div class="detail-page">
            <button class="back-btn" onclick="renderMainView()">← Voltar aos conjuntos de dados</button>
            <div class="detail-header">
                <h1 class="detail-title">${esc(meta.title)}</h1>
                <div class="detail-badges">
                    <img src="/shared/img/semselo.png" class="selo-img-lg" alt="Sem selo" title="Sem selo — Aguardando avaliação MQM">
                    <div class="fair-badges">
                        <span class="fair-badge inactive">F</span>
                        <span class="fair-badge inactive">A</span>
                        <span class="fair-badge inactive">I</span>
                        <span class="fair-badge inactive">R</span>
                        <span class="fair-badge-separator">+</span>
                        <span class="fair-badge inactive">C</span>
                        <span class="fair-badge inactive">C</span>
                    </div>
                    <span class="badge ${meta.dadosAbertos === 'Sim' ? 'badge-green' : 'badge-orange'}">${meta.dadosAbertos === 'Sim' ? 'Dados Abertos' : 'Não aberto'}</span>
                </div>
            </div>
            <section class="detail-section"><h4>Descrição</h4><p>${esc(meta.description || 'Sem descrição')}</p></section>
            <section class="detail-section"><h4>Informações do Conjunto de Dados</h4><div class="detail-grid">
                ${dField('Organização', meta.creator)}
                ${dField('Área Técnica', meta.publisher)}
                ${dField('E-mail', meta.email)}
                ${dField('Periodicidade', meta.periodicidade)}
                ${dField('Licença', meta.licenca)}
                ${dField('Observância Legal', meta.observancia)}
                ${dField('Idioma', meta.idioma)}
                ${dField('Versão', meta.versao)}
                ${dField('Cobertura Espacial', meta.espacial)}
                ${dField('Granularidade', meta.granularidade)}
                ${dField('Temporal Início', meta.temporalInicio)}
                ${dField('Temporal Fim', meta.temporalFim)}
                ${dField('Dados Abertos', meta.dadosAbertos)}
                ${meta.relacionadoODS === 'Sim' ? dField('Relacionado a ODS', 'Sim') : ''}
                ${meta.relacionadoODS === 'Sim' && meta.ods && meta.ods.length ? dField('ODS', Array.isArray(meta.ods) ? meta.ods.join(', ') : meta.ods) : ''}
                ${dField('Dados de Raça/Etnia', meta.dadosRacaEtnia)}
                ${dField('Dados de Gênero', meta.dadosGenero)}
                ${dField('Visibilidade', meta.visibilidade)}
                ${dField('Fonte', meta.source)}
                ${dField('Importado em', meta.importedAt ? new Date(meta.importedAt).toLocaleString('pt-BR') : '')}
            </div></section>
            ${(meta.temas||[]).length ? `<section class="detail-section"><h4>Temas</h4><div class="tags">${meta.temas.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></section>` : ''}
            ${(meta.keywords||[]).length ? `<section class="detail-section"><h4>Palavras-chave</h4><div class="tags">${meta.keywords.map(k=>`<span class="tag tag-y">${esc(k)}</span>`).join('')}</div></section>` : ''}
            ${renderDistributions(meta)}
            <section class="detail-section"><h4>Asset ID</h4><code>${esc(asset['@id'])}</code></section>
        </div>`;
    window.scrollTo(0, 0);
}

function renderDistributions(meta) {
    const dists = meta.distributions || [];
    // Backwards compatibility: if old format with single recursoUrl
    if (!dists.length && meta.recursoUrl) {
        const legacy = { title: 'Recurso', url: meta.recursoUrl, format: meta.recursoFormato || '' };
        return renderDistributionSection([legacy]);
    }
    if (!dists.length) return '';
    return renderDistributionSection(dists);
}

function renderDistributionSection(dists) {
    return `<section class="detail-section"><h4>Recursos / Distribuições (${dists.length})</h4><div class="resources-list">
        ${dists.map((d, i) => `<details class="resource-item" ${i === 0 ? 'open' : ''}>
            <summary style="cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center">
                <span class="res-title">${esc(d.title || 'Recurso ' + (i+1))}</span>
                <span style="font-size:0.7rem;color:#888">${d.format ? esc(d.format.toUpperCase()) : ''}</span>
            </summary>
            <div style="margin-top:0.75rem">
                ${d.description ? `<p class="res-desc">${esc(d.description)}</p>` : ''}
                <div class="res-meta" style="margin-top:0.5rem">
                    ${d.type ? `<span>📂 Tipo: ${esc(d.type)}</span>` : ''}
                    ${d.format ? `<span class="res-format">${esc(d.format.toUpperCase())}</span>` : ''}
                    ${d.mediaType ? `<span>MIME: ${esc(d.mediaType)}</span>` : ''}
                    ${d.byteSize ? `<span>📐 ${formatBytes(d.byteSize)}</span>` : ''}
                </div>
                ${(d.temporalStart || d.temporalEnd) ? `<div class="res-meta"><span>📅 Cobertura: ${esc(d.temporalStart || '?')} — ${esc(d.temporalEnd || '?')}</span></div>` : ''}
                ${(d.accessRights && d.accessRights.length) ? `<div class="res-meta"><span>🔒 Acesso: ${esc(Array.isArray(d.accessRights) ? d.accessRights.join(', ') : d.accessRights)}</span></div>` : ''}
                ${d.checksum ? `<div class="res-meta"><span>🔑 Checksum: ${esc(d.checksum)}</span></div>` : ''}
                ${d.url ? `<a href="${d.url}" target="_blank" class="res-link">📥 Acessar recurso ↗</a>` : ''}
                ${d.downloadUrl ? `<a href="${d.downloadUrl}" target="_blank" class="res-link">⬇️ Download ↗</a>` : ''}
            </div>
        </details>`).join('')}
    </div></section>`;
}

function dField(label, value) { if (!value) return ''; return `<div class="field-item"><span class="field-label">${esc(label)}</span><span class="field-value">${esc(String(value))}</span></div>`; }

function parseMetadata(asset) {
    const props = asset.properties || {};
    if (props[METADATA_KEY]) { try { return JSON.parse(props[METADATA_KEY]); } catch {} }
    return {
        title: props['dcterms:title'] || props.name || asset['@id'],
        description: props['dcterms:description'] || props.description || '',
        creator: props['dcterms:creator'] || '', periodicidade: props['dcterms:accrualPeriodicity'] || '',
        dadosAbertos: props['dcatbr:dadosAbertos'] || '', licenca: props['dcterms:license'] || '',
        observancia: props['dcterms:accessRights'] || '', temas: props['dcat:theme'] || [], keywords: props['dcat:keyword'] || []
    };
}

// ===== PUBLISH =====
let recursoCount = 0;

function addRecurso() {
    const container = document.getElementById('recursos-container');
    const idx = recursoCount++;
    const div = document.createElement('div');
    div.className = 'recurso-block';
    div.id = `recurso-${idx}`;
    div.innerHTML = `
        <div class="recurso-header">
            <strong>Recurso ${idx + 1}</strong>
            <button type="button" onclick="removeRecurso(${idx})" class="btn-remove-resource">✕ Remover</button>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Título do Recurso *</label><input type="text" id="r-title-${idx}" required placeholder="Ex: API REST - Dados (CNAE)"></div>
            <div class="form-group"><label>URL de Acesso *</label><input type="url" id="r-url-${idx}" required placeholder="https://api.exemplo.gov.br/dados"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Tipo do Recurso *</label><select id="r-tipo-${idx}" required><option value="">Selecione</option></select></div>
            <div class="form-group"><label>Formato *</label><select id="r-formato-${idx}" required><option value="">Selecione</option></select></div>
            <div class="form-group"><label>Observância Legal</label><select id="r-observancia-${idx}" multiple></select></div>
        </div>
        <div class="form-group"><label>Descrição do Recurso</label><textarea id="r-desc-${idx}" rows="2" placeholder="Breve descrição sobre o recurso..."></textarea></div>
        <div class="form-row">
            <div class="form-group"><label>Tamanho</label><input type="text" id="r-size-${idx}" placeholder="Ex: 1024 ou 1,5 MB"></div>
            <div class="form-group"><label>Cobertura Temporal Início</label><input type="date" id="r-tempInicio-${idx}"></div>
            <div class="form-group"><label>Cobertura Temporal Fim</label><input type="date" id="r-tempFim-${idx}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Verificação de Conteúdo (checksum)</label><input type="text" id="r-checksum-${idx}" placeholder="Ex: sha256:abc123..."></div>
        </div>
    `;
    container.appendChild(div);
    // Populate dropdowns for this resource
    populateDropdownFromVcr(`r-tipo-${idx}`, 'vcr-tipo-recurso.json', 'Selecione o tipo');
    populateDropdownFromVcr(`r-formato-${idx}`, 'vcr-formatos.json', 'Selecione o formato');
    populateMultiselectFromVcr(`r-observancia-${idx}`, 'vcr-observancia-legal.json');
}

function removeRecurso(idx) {
    const el = document.getElementById(`recurso-${idx}`);
    if (el) el.remove();
    // Re-number remaining labels
    const blocks = document.querySelectorAll('.recurso-block');
    blocks.forEach((b, i) => {
        const header = b.querySelector('.recurso-header strong');
        if (header) header.textContent = `Recurso ${i + 1}`;
    });
}

function collectRecursos() {
    const recursos = [];
    const blocks = document.querySelectorAll('.recurso-block');
    blocks.forEach(block => {
        const idx = block.id.replace('recurso-', '');
        const title = document.getElementById(`r-title-${idx}`)?.value?.trim();
        const url = document.getElementById(`r-url-${idx}`)?.value?.trim();
        if (!title && !url) return; // skip empty
        const recurso = {
            title: title || '',
            description: document.getElementById(`r-desc-${idx}`)?.value?.trim() || '',
            url: url || '',
            type: document.getElementById(`r-tipo-${idx}`)?.value || '',
            format: document.getElementById(`r-formato-${idx}`)?.value || '',
            accessRights: Array.from(document.getElementById(`r-observancia-${idx}`)?.selectedOptions || []).map(o => o.value),
            byteSize: document.getElementById(`r-size-${idx}`)?.value?.trim() || '',
            temporalStart: document.getElementById(`r-tempInicio-${idx}`)?.value || '',
            temporalEnd: document.getElementById(`r-tempFim-${idx}`)?.value || '',
            checksum: document.getElementById(`r-checksum-${idx}`)?.value?.trim() || ''
        };
        recursos.push(recurso);
    });
    return recursos;
}

async function publishDataset(event) {
    event.preventDefault();
    const resultEl = document.getElementById('publish-result');
    resultEl.innerHTML = '<p>⏳ Publicando...</p>';

    const recursos = collectRecursos();
    if (recursos.length === 0) {
        resultEl.innerHTML = '<p class="error">❌ Adicione pelo menos um recurso.</p>';
        return;
    }

    const metadata = {
        title: document.getElementById('p-title').value,
        description: document.getElementById('p-description').value,
        creator: document.getElementById('p-creator').value,
        dadosAbertos: document.getElementById('p-dadosAbertos').value,
        periodicidade: document.getElementById('p-periodicidade').value,
        licenca: document.getElementById('p-licenca').value,
        observancia: document.getElementById('p-observancia').value,
        idioma: document.getElementById('p-idioma').value,
        versao: document.getElementById('p-versao').value,
        publisher: document.getElementById('p-publisher').value,
        email: document.getElementById('p-email').value,
        temas: Array.from(document.getElementById('p-temas').selectedOptions).map(o => o.value),
        keywords: document.getElementById('p-keywords').value.split(',').map(s=>s.trim()).filter(Boolean),
        espacial: document.getElementById('p-espacial').value,
        granularidade: document.getElementById('p-granularidade')?.value || '',
        temporalInicio: document.getElementById('p-tempInicio').value,
        temporalFim: document.getElementById('p-tempFim').value,
        relacionadoODS: document.getElementById('p-ods-rel')?.value || '',
        ods: Array.from(document.getElementById('p-ods')?.selectedOptions || []).map(o => o.value),
        dadosRacaEtnia: document.getElementById('p-raca')?.value || '',
        dadosGenero: document.getElementById('p-genero')?.value || '',
        visibilidade: document.getElementById('p-visibilidade')?.value || '',
        distributions: recursos
    };
    const assetId = `conjunto-${Date.now()}`;
    const baseUrl = recursos[0].url || 'http://example.com';
    const res = await api('/management/v4/assets', 'POST', {
        "@context": CTX, "@id": assetId, "@type": "Asset",
        "properties": { "name": metadata.title, "description": metadata.description.substring(0,200), "contenttype": "application/json", [METADATA_KEY]: JSON.stringify(metadata) },
        "dataAddress": { "@type": "DataAddress", "type": "HttpData", "baseUrl": baseUrl }
    });
    if (!res || res.message) { resultEl.innerHTML = `<p class="error">❌ ${res?.message || 'Falha'}</p>`; return; }
    const policyId = `policy-${assetId}`;
    await api('/management/v4/policydefinitions', 'POST', { "@context": CTX, "@type": "PolicyDefinition", "@id": policyId, "policy": {"@type": "Set", "permission": [{"action": "use"}]} });
    await api('/management/v4/contractdefinitions', 'POST', { "@context": {"@vocab":"https://w3id.org/edc/v0.0.1/ns/"}, "@type": "ContractDefinition", "@id": `contract-${assetId}`, "accessPolicyId": policyId, "contractPolicyId": policyId, "assetsSelector": [{"operandLeft": "https://w3id.org/edc/v0.0.1/ns/id", "operator": "=", "operandRight": assetId}] });
    resultEl.innerHTML = `<p class="success">✅ Publicado! Asset: ${assetId}</p>`;
    document.getElementById('publish-form').reset();
    document.getElementById('recursos-container').innerHTML = '';
    recursoCount = 0;
    addRecurso(); // Add one empty resource for convenience
    loadAssets();
}

// ===== POLICIES =====
function updatePolicyForm() {
    const type = document.getElementById('pol-type').value;
    const extra = document.getElementById('pol-extra-fields');
    if (type === 'org-restrict') extra.innerHTML = `<div class="form-group"><label>Organizações permitidas</label><input type="text" id="pol-orgs" placeholder="CGU, IBGE"></div>`;
    else if (type === 'temporal') extra.innerHTML = `<div class="form-row"><div class="form-group"><label>De</label><input type="date" id="pol-from"></div><div class="form-group"><label>Até</label><input type="date" id="pol-to"></div></div>`;
    else extra.innerHTML = '';
}
async function createCustomPolicy(event) {
    event.preventDefault();
    const name = document.getElementById('pol-name').value;
    const type = document.getElementById('pol-type').value;
    let permission = [{"action": "use"}], prohibition = [];
    if (type === 'no-redistribution') prohibition = [{"action": "distribute"}];
    await api('/management/v4/policydefinitions', 'POST', { "@context": CTX, "@type": "PolicyDefinition", "@id": `policy-${name}`, "policy": {"@type": "Set", "permission": permission, "prohibition": prohibition} });
    loadPolicies();
}
async function loadPolicies() {
    const data = await api('/management/v4/policydefinitions/request', 'POST', {"@context": ["https://w3id.org/edc/connector/management/v2"], "@type": "QuerySpec", "limit": 999999});
    const el = document.getElementById('policies-list');
    if (!Array.isArray(data) || !data.length) { el.innerHTML = '<p class="empty">Nenhuma política</p>'; return; }
    const auto = data.filter(p => p['@id'].startsWith('policy-rdf-') || p['@id'].startsWith('policy-conjunto-'));
    const manual = data.filter(p => !p['@id'].startsWith('policy-rdf-') && !p['@id'].startsWith('policy-conjunto-'));
    let html = '';
    if (manual.length) { html += `<h4 class="sub-title">📋 Políticas manuais (${manual.length})</h4><div class="card-grid">${manual.map(renderPolicyCard).join('')}</div>`; }
    if (auto.length) { html += `<details class="auto-section"><summary>🤖 Auto-geradas pela importação (${auto.length}) — clique para expandir</summary><div class="card-grid">${auto.map(renderPolicyCard).join('')}</div></details>`; }
    el.innerHTML = html;
    const sel = document.getElementById('ct-policy');
    if (sel) sel.innerHTML = data.map(p => `<option value="${p['@id']}">${p['@id']}</option>`).join('');
}
function renderPolicyCard(p) {
    const perms = (p.policy?.permission||[]).map(pp=>`✅ ${pp.action||'use'}`).join(', ');
    const prohibs = (p.policy?.prohibition||[]).map(pp=>`🚫 ${pp.action}`).join(', ');
    return `<div class="card card-small"><h4>🛡️ ${esc(p['@id'])}</h4><p>${perms||'Nenhuma permissão'}</p>${prohibs?`<p>${prohibs}</p>`:''}
        <button class="btn-delete" onclick="event.stopPropagation();deletePolicy('${p['@id']}')">🗑️</button></div>`;
}
async function deletePolicy(id) { if (!confirm(`Excluir "${id}"?`)) return; await fetch(API+'/management/v4/policydefinitions/'+encodeURIComponent(id),{method:'DELETE'}); loadPolicies(); }

// ===== CONTRACTS =====
async function loadContracts() {
    const data = await api('/management/v4/contractdefinitions/request', 'POST', {"@context": ["https://w3id.org/edc/connector/management/v2"], "@type": "QuerySpec", "limit": 999999});
    const el = document.getElementById('contracts-list');
    if (!Array.isArray(data) || !data.length) { el.innerHTML = '<p class="empty">Nenhum contrato</p>'; return; }
    const auto = data.filter(c => c['@id'].startsWith('contract-rdf-') || c['@id'].startsWith('contract-conjunto-'));
    const manual = data.filter(c => !c['@id'].startsWith('contract-rdf-') && !c['@id'].startsWith('contract-conjunto-'));
    let html = '';
    if (manual.length) { html += `<h4 class="sub-title">📋 Contratos manuais (${manual.length})</h4><div class="card-grid">${manual.map(renderContractCard).join('')}</div>`; }
    if (auto.length) { html += `<details class="auto-section"><summary>🤖 Auto-gerados (${auto.length}) — clique para expandir</summary><div class="card-grid">${auto.map(renderContractCard).join('')}</div></details>`; }
    el.innerHTML = html;
}
function renderContractCard(c) {
    const scope = c.assetsSelector?.length > 0 ? 'Específico' : 'Todos';
    return `<div class="card"><h4>📋 ${esc(c['@id'])}</h4><p><strong>Política:</strong> ${esc(c.accessPolicyId)}</p><p><strong>Escopo:</strong> ${scope}</p>
        <button class="btn-delete" onclick="event.stopPropagation();deleteContract('${c['@id']}')">🗑️</button></div>`;
}
async function deleteContract(id) { if (!confirm(`Excluir "${id}"?`)) return; await fetch(API+'/management/v4/contractdefinitions/'+encodeURIComponent(id),{method:'DELETE'}); loadContracts(); }
document.getElementById('ct-scope')?.addEventListener('change', e => {
    document.getElementById('ct-asset-group').style.display = e.target.value === 'specific' ? '' : 'none';
    if (e.target.value === 'specific') loadAssetSelect();
});
async function loadAssetSelect() {
    const data = await api('/management/v4/assets/request', 'POST', {"@context": ["https://w3id.org/edc/connector/management/v2"], "@type": "QuerySpec", "limit": 999999});
    const sel = document.getElementById('ct-asset');
    if (Array.isArray(data)) sel.innerHTML = data.map(a => `<option value="${a['@id']}">${parseMetadata(a).title}</option>`).join('');
}
async function createContract(event) {
    event.preventDefault();
    const policyId = document.getElementById('ct-policy').value;
    const scope = document.getElementById('ct-scope').value;
    let assetsSelector;
    if (scope === 'specific') {
        assetsSelector = [{"operandLeft": "https://w3id.org/edc/v0.0.1/ns/id", "operator": "=", "operandRight": document.getElementById('ct-asset').value}];
    } else {
        // "like %" matches all asset IDs — empty array does NOT work in EDC v0.17.0
        assetsSelector = [{"operandLeft": "https://w3id.org/edc/v0.0.1/ns/id", "operator": "like", "operandRight": "%"}];
    }
    await api('/management/v4/contractdefinitions', 'POST', { "@context": {"@vocab":"https://w3id.org/edc/v0.0.1/ns/"}, "@type": "ContractDefinition", "@id": `contract-${Date.now()}`, "accessPolicyId": policyId, "contractPolicyId": policyId, "assetsSelector": assetsSelector });
    loadContracts();
}

// ===== NEGOTIATE (compact) =====
function extractDatasetsFromCatalog(data) {
    // EDC v0.17.0 catalog response can have datasets in many places depending on JSON-LD compaction
    let datasets = [];
    
    // Try common paths
    const paths = [
        'http://www.w3.org/ns/dcat#dataset',
        'dcat:dataset',
        'https://w3id.org/edc/v0.0.1/ns/dataset',
        'edc:dataset',
        'dataset'
    ];
    
    for (const path of paths) {
        const ds = data[path];
        if (ds) {
            datasets = Array.isArray(ds) ? ds : [ds];
            break;
        }
    }
    
    // If still empty, check if data itself is an array (some EDC versions)
    if (!datasets.length && Array.isArray(data)) {
        for (const item of data) {
            for (const path of paths) {
                const ds = item[path];
                if (ds) {
                    const arr = Array.isArray(ds) ? ds : [ds];
                    datasets.push(...arr);
                }
            }
        }
    }
    
    // If still empty, check @graph
    if (!datasets.length && data['@graph']) {
        const graph = Array.isArray(data['@graph']) ? data['@graph'] : [data['@graph']];
        datasets = graph.filter(item => {
            const type = item['@type'] || '';
            return type.includes('Dataset') || type.includes('dcat:Dataset');
        });
    }
    
    return datasets;
}

function extractPolicyFromDataset(ds) {
    const policyPaths = [
        'http://www.w3.org/ns/odrl/2/hasPolicy',
        'odrl:hasPolicy',
        'https://w3id.org/edc/v0.0.1/ns/hasPolicy',
        'edc:hasPolicy',
        'hasPolicy'
    ];
    for (const path of policyPaths) {
        if (ds[path]) {
            const policies = Array.isArray(ds[path]) ? ds[path] : [ds[path]];
            return policies;
        }
    }
    return [];
}

function extractDatasetName(ds) {
    return ds['edc:name'] || ds['name'] || ds['https://w3id.org/edc/v0.0.1/ns/name'] || 
           ds['http://purl.org/dc/terms/title'] || ds['dcterms:title'] || ds['@id'] || 'Sem nome';
}

let remoteCatalogDatasets = [];

async function requestRemoteCatalog() {
    const dsp = document.getElementById('n-dsp').value;
    if (!dsp) { alert('Informe o endereço DSP'); return; }
    const el = document.getElementById('remote-catalog');
    el.innerHTML = '<p>⏳ Consultando catálogo remoto...</p>';
    try {
        const data = await api('/management/v4/catalog/request', 'POST', {
            "@context": CTX, "@type": "CatalogRequest", "counterPartyAddress": dsp, "counterPartyId": "unknown", "protocol": "dataspace-protocol-http:2025-1",
            "querySpec": {"@type": "QuerySpec", "limit": 999999, "offset": 0}
        });
        if (!data) { el.innerHTML = '<p class="error">❌ Sem resposta do connector remoto. Verifique se ele está online.</p>'; return; }
        if (data.message || data.error) { el.innerHTML = `<p class="error">❌ Erro: ${esc(data.message || data.error)}</p>`; return; }
        
        remoteCatalogDatasets = extractDatasetsFromCatalog(data);
        
        if (!remoteCatalogDatasets.length) { 
            el.innerHTML = `<p>⚠️ Nenhum conjunto encontrado. O connector remoto pode não ter assets com contract definitions associadas.<details><summary>Resposta Raw (debug)</summary><pre style="max-height:200px;overflow:auto;font-size:0.7rem">${esc(JSON.stringify(data,null,2).substring(0,2000))}</pre></details></p>`; 
            return; 
        }
        
        el.innerHTML = `<p><strong>${remoteCatalogDatasets.length} conjuntos disponíveis:</strong></p>
            <div style="margin:0.5rem 0;display:flex;gap:0.5rem">
                <button onclick="importAllRemote()" style="padding:0.4rem 0.8rem;background:#00a651;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.75rem">📥 Importar todos para meu catálogo (${remoteCatalogDatasets.length})</button>
            </div>
            <div class="remote-list">${remoteCatalogDatasets.map((d, i) => {
            const policies = extractPolicyFromDataset(d);
            const offerId = policies[0]?.['@id'] || '';
            const name = extractDatasetName(d);
            const assetId = d['@id'] || d['edc:id'] || '';
            const hasPolicy = offerId ? '✅' : '⚠️';
            return `<div class="remote-item">
                <span onclick="fillNeg('${esc(offerId)}','${esc(assetId)}')" style="flex:1;cursor:pointer">${hasPolicy} ${esc(String(name).substring(0,50))}</span>
                <button onclick="importSingleRemote(${i})" style="padding:0.2rem 0.5rem;background:#1351b4;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:0.65rem" title="Importar este para meu catálogo">📥</button>
            </div>`;
        }).join('')}</div>`;
    } catch(e) {
        el.innerHTML = `<p class="error">❌ Falha de conexão: ${esc(e.message)}</p>`;
    }
}

async function importSingleRemote(idx) {
    const ds = remoteCatalogDatasets[idx];
    if (!ds) return;
    const name = extractDatasetName(ds);
    const assetId = ds['@id'] || ds['edc:id'] || `remote-${Date.now()}`;
    const description = ds['edc:description'] || ds['description'] || ds['https://w3id.org/edc/v0.0.1/ns/description'] || '';
    
    const metadata = { title: name, description: description, creator: '', dadosAbertos: 'Sim', source: 'Connector B (negociação DSP)', importedAt: new Date().toISOString() };
    const hash = simpleHash(name);
    const localId = `remote-${hash}`;

    // Delete existing if upsert
    await fetch(API + '/management/v4/assets/' + encodeURIComponent(localId), {method:'DELETE'});
    await fetch(API + '/management/v4/policydefinitions/policy-' + encodeURIComponent(localId), {method:'DELETE'});
    await fetch(API + '/management/v4/contractdefinitions/contract-' + encodeURIComponent(localId), {method:'DELETE'});

    const res = await api('/management/v4/assets', 'POST', {
        "@context": CTX, "@id": localId, "@type": "Asset",
        "properties": {"name": name.substring(0,100), "description": description.substring(0,200), "contenttype": "application/json", [METADATA_KEY]: JSON.stringify(metadata)},
        "dataAddress": {"@type":"DataAddress","type":"HttpData","baseUrl":"http://connector-b-controlplane:8183/protocol/2025-1"}
    });
    if (res && !res.message) {
        await api('/management/v4/policydefinitions', 'POST', {"@context":CTX,"@type":"PolicyDefinition","@id":`policy-${localId}`,"policy":{"@type":"Set","permission":[{"action":"use"}]}});
        await api('/management/v4/contractdefinitions', 'POST', {"@context":{"@vocab":"https://w3id.org/edc/v0.0.1/ns/"},"@type":"ContractDefinition","@id":`contract-${localId}`,"accessPolicyId":`policy-${localId}`,"contractPolicyId":`policy-${localId}`,"assetsSelector":[{"operandLeft":"https://w3id.org/edc/v0.0.1/ns/id","operator":"=","operandRight":localId}]});
        alert(`✅ "${name.substring(0,40)}" importado para o catálogo local!`);
    } else {
        alert(`❌ Falha ao importar: ${res?.message || 'erro desconhecido'}`);
    }
}

async function importAllRemote() {
    if (!remoteCatalogDatasets.length) return;
    if (!confirm(`Importar ${remoteCatalogDatasets.length} conjuntos do catálogo remoto para o Connector A?`)) return;
    const el = document.getElementById('remote-catalog');
    let imported = 0, errors = 0;
    for (let i = 0; i < remoteCatalogDatasets.length; i++) {
        const ds = remoteCatalogDatasets[i];
        const name = extractDatasetName(ds);
        const description = ds['edc:description'] || ds['description'] || ds['https://w3id.org/edc/v0.0.1/ns/description'] || '';
        const metadata = { title: name, description: description, creator: '', dadosAbertos: 'Sim', source: 'Connector B (negociação DSP)', importedAt: new Date().toISOString() };
        const hash = simpleHash(name);
        const localId = `remote-${hash}`;

        await fetch(API + '/management/v4/assets/' + encodeURIComponent(localId), {method:'DELETE'});
        await fetch(API + '/management/v4/policydefinitions/policy-' + encodeURIComponent(localId), {method:'DELETE'});
        await fetch(API + '/management/v4/contractdefinitions/contract-' + encodeURIComponent(localId), {method:'DELETE'});

        const res = await api('/management/v4/assets', 'POST', {
            "@context": CTX, "@id": localId, "@type": "Asset",
            "properties": {"name": name.substring(0,100), "description": description.substring(0,200), "contenttype": "application/json", [METADATA_KEY]: JSON.stringify(metadata)},
            "dataAddress": {"@type":"DataAddress","type":"HttpData","baseUrl":"http://connector-b-controlplane:8183/protocol/2025-1"}
        });
        if (res && !res.message) {
            await api('/management/v4/policydefinitions', 'POST', {"@context":CTX,"@type":"PolicyDefinition","@id":`policy-${localId}`,"policy":{"@type":"Set","permission":[{"action":"use"}]}});
            await api('/management/v4/contractdefinitions', 'POST', {"@context":{"@vocab":"https://w3id.org/edc/v0.0.1/ns/"},"@type":"ContractDefinition","@id":`contract-${localId}`,"accessPolicyId":`policy-${localId}`,"contractPolicyId":`policy-${localId}`,"assetsSelector":[{"operandLeft":"https://w3id.org/edc/v0.0.1/ns/id","operator":"=","operandRight":localId}]});
            imported++;
        } else { errors++; }
        const pct = Math.round(((i+1)/remoteCatalogDatasets.length)*100);
        el.querySelector('p').textContent = `⏳ Importando... ${i+1}/${remoteCatalogDatasets.length} (${pct}%)`;
    }
    el.innerHTML = `<p class="success">✅ Importação concluída! ${imported} importados, ${errors} erros.</p>`;
    loadAssets();
}
function fillNeg(offerId, assetId) {
    document.getElementById('n-offer').value = offerId;
    document.getElementById('n-asset').value = assetId;
}

let activeNegotiationId = null;
let negotiationPollInterval = null;

async function startNegotiation() {
    const dsp = document.getElementById('n-dsp').value, offerId = document.getElementById('n-offer').value, assetId = document.getElementById('n-asset').value, participant = document.getElementById('n-participant').value;
    if (!dsp||!offerId||!assetId) { alert('Preencha DSP, Offer ID e Asset ID'); return; }
    const el = document.getElementById('negotiation-result');
    el.innerHTML = '<p>⏳ Enviando proposta de negociação...</p>';
    try {
        const result = await api('/management/v4/contractnegotiations', 'POST', { "@context": CTX, "@type": "ContractRequest", "counterPartyAddress": dsp, "counterPartyId": participant||"unknown", "protocol": "dataspace-protocol-http:2025-1", "policy": {"@type":"Offer","@id":offerId,"assigner":participant||"unknown","target":assetId,"permission":[{"action":"use"}]} });
        if (result?.['@id']) {
            activeNegotiationId = result['@id'];
            el.innerHTML = `<p class="success">✅ Negociação iniciada! ID: ${result['@id']}<br><span style="color:#666;font-size:0.8rem">⏳ Aguardando FINALIZED... (polling automático)</span></p>`;
            // Start polling for negotiation state
            pollNegotiationState();
        } else {
            el.innerHTML = `<p class="error">❌ ${esc(result?.message || JSON.stringify(result))}</p>`;
        }
    } catch(e) {
        el.innerHTML = `<p class="error">❌ Falha: ${esc(e.message)}</p>`;
    }
}

async function pollNegotiationState() {
    if (negotiationPollInterval) clearInterval(negotiationPollInterval);
    const el = document.getElementById('negotiation-result');
    let attempts = 0;
    negotiationPollInterval = setInterval(async () => {
        attempts++;
        if (!activeNegotiationId || attempts > 30) {
            clearInterval(negotiationPollInterval);
            if (attempts > 30) el.innerHTML += '<p class="error">⚠️ Timeout — verifique no histórico abaixo</p>';
            return;
        }
        try {
            const neg = await api('/management/v4/contractnegotiations/' + activeNegotiationId, 'GET');
            if (neg?.state === 'FINALIZED') {
                clearInterval(negotiationPollInterval);
                const agreementId = neg.contractAgreementId || neg['edc:contractAgreementId'] || '';
                const assetId = neg.assetId || neg['edc:assetId'] || document.getElementById('n-asset').value;
                el.innerHTML = `<p class="success">✅ <strong>FINALIZED!</strong> Contrato assinado.<br>Agreement: <code>${esc(agreementId)}</code></p>`;
                // Auto-fill transfer fields
                if (agreementId) {
                    document.getElementById('n-contract').value = agreementId;
                    document.getElementById('n-transfer-asset').value = assetId;
                }
                loadNegotiations();
            } else if (neg?.state === 'TERMINATED') {
                clearInterval(negotiationPollInterval);
                el.innerHTML = `<p class="error">❌ Negociação TERMINADA (rejeitada pelo provider). Verifique se a policy do connector remoto permite este acesso.</p>`;
                loadNegotiations();
            } else {
                el.innerHTML = `<p class="success">✅ Negociação iniciada! ID: ${activeNegotiationId}<br><span style="color:#666;font-size:0.8rem">⏳ Estado: <strong>${neg?.state || 'REQUESTED'}</strong> — aguardando... (${attempts}s)</span></p>`;
            }
        } catch(e) { /* retry next interval */ }
    }, 1000);
}

async function startTransfer() {
    const dsp = document.getElementById('n-dsp').value, contractId = document.getElementById('n-contract').value, assetId = document.getElementById('n-transfer-asset').value;
    if (!contractId) { alert('Aguarde a negociação finalizar! O campo Contract Agreement ID será preenchido automaticamente.'); return; }
    if (!assetId) { alert('Preencha o Asset ID'); return; }
    const el = document.getElementById('transfer-result');
    el.innerHTML = '<p>⏳ Iniciando transferência...</p>';
    try {
        const result = await api('/management/v4/transferprocesses', 'POST', { "@context": CTX, "@type": "TransferRequest", "counterPartyAddress": dsp, "counterPartyId": "unknown", "protocol": "dataspace-protocol-http:2025-1", "contractId": contractId, "assetId": assetId, "transferType": "HttpData-PULL", "dataDestination": {"@type":"DataAddress","type":"HttpProxy"} });
        if (result?.['@id']) {
            el.innerHTML = `<p class="success">✅ Transferência iniciada! ID: ${result['@id']}<br><span style="font-size:0.8rem;color:#666">O dado está sendo transmitido via HttpData-PULL.</span></p>`;
        } else {
            const msg = result?.message || JSON.stringify(result);
            if (msg.includes('not found')) {
                el.innerHTML = `<p class="error">❌ Contract Agreement não encontrado. A negociação pode ainda não ter finalizado. Aguarde o estado FINALIZED no passo 2.</p>`;
            } else {
                el.innerHTML = `<p class="error">❌ ${esc(msg)}</p>`;
            }
        }
    } catch(e) {
        el.innerHTML = `<p class="error">❌ Falha: ${esc(e.message)}</p>`;
    }
}
async function loadNegotiations() {
    const negs = await api('/management/v4/contractnegotiations/request', 'POST', {"@context": ["https://w3id.org/edc/connector/management/v2"], "@type": "QuerySpec", "limit": 999999}) || [];
    const transfers = await api('/management/v4/transferprocesses/request', 'POST', {"@context": ["https://w3id.org/edc/connector/management/v2"], "@type": "QuerySpec", "limit": 999999}) || [];
    const el = document.getElementById('negotiations-list');
    let html = '';
    if (Array.isArray(negs) && negs.length) {
        html += '<h4 style="margin:0.5rem 0;font-size:0.85rem;color:#555">Negociações</h4>';
        html += negs.map(n => {
            const stateIcon = n.state === 'FINALIZED' ? '✅' : n.state === 'TERMINATED' ? '❌' : '⏳';
            const stateClass = n.state === 'FINALIZED' ? 'neg-ok' : n.state === 'TERMINATED' ? 'neg-err' : 'neg-pending';
            const stateHint = n.state === 'FINALIZED' ? '→ Pronto para transferir! Clique no código abaixo.' :
                              n.state === 'TERMINATED' ? '→ Rejeitada pelo provider.' :
                              n.state === 'REQUESTED' ? '→ Aguardando resposta do provider...' :
                              `→ ${n.state}`;
            return `<div class="neg-item ${stateClass}">
                <strong>${stateIcon} ${n.state}</strong> — ${esc(n.assetId||'-')}
                <br><small style="color:#666">${stateHint}</small>
                ${n.contractAgreementId ? `<br><code class="click-code" onclick="document.getElementById('n-contract').value='${n.contractAgreementId}';document.getElementById('n-transfer-asset').value='${n.assetId||''}'">📋 ${n.contractAgreementId.substring(0,30)}... (clique para usar)</code>` : ''}
            </div>`;
        }).join('');
    }
    if (Array.isArray(transfers) && transfers.length) {
        html += '<h4 style="margin:0.5rem 0;font-size:0.85rem;color:#555">Transferências</h4>';
        html += transfers.map(t => {
            const stateIcon = t.state === 'STARTED' || t.state === 'COMPLETED' ? '✅' : t.state === 'TERMINATED' ? '❌' : '⏳';
            return `<div class="neg-item ${t.state==='STARTED'||t.state==='COMPLETED'?'neg-ok':t.state==='TERMINATED'?'neg-err':''}"><strong>${stateIcon} 🚀 ${t.state}</strong> — ${esc(t.assetId||'-')}</div>`;
        }).join('');
    }
    el.innerHTML = html || '<p class="empty">Nenhuma negociação ainda</p>';
}

// ===== RECEIVED NEGOTIATIONS (provider side for connector A) =====
async function loadReceivedNegotiationsA() {
    const el = document.getElementById('received-negotiations-a');
    el.innerHTML = '<p class="empty">⏳ Carregando...</p>';

    // Fetch pending approvals
    let pendingData = { pending: [], count: 0 };
    try {
        const pRes = await fetch(API + '/management/approval/pending');
        if (pRes.ok) {
            pendingData = await pRes.json();
            pendingData.count = pendingData.pending ? pendingData.pending.length : 0;
        }
    } catch(e) { /* approval API may not be available */ }

    const negs = await api('/management/v4/contractnegotiations/request', 'POST', {"@context": CTX, "@type": "QuerySpec", "limit": 999999}) || [];
    const providerNegs = Array.isArray(negs) ? negs.filter(n => n.type === 'PROVIDER') : [];

    let html = '';

    if (pendingData.count > 0) {
        html += `<div class="panel" style="border-left:4px solid #f59e0b;background:#fffbeb">
            <h3 style="color:#d97706;margin:0 0 0.75rem">⏳ Aguardando Aprovação (${pendingData.count})</h3>
            <div class="card-grid">${pendingData.pending.map(p => `<div class="card" style="border-left-color:#f59e0b;cursor:default">
                <h4 style="font-size:0.85rem;word-break:break-all">📋 ${esc(p.assetId)}</h4>
                <p style="font-size:0.75rem;color:#666">Solicitante: <strong>${esc(p.counterPartyId)}</strong></p>
                <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
                    <button onclick="approveNegA('${p.id}')" style="background:#00a651;padding:0.4rem 1rem;font-size:0.8rem">✅ Aprovar</button>
                    <button onclick="rejectNegA('${p.id}')" style="background:#e53e3e;padding:0.4rem 1rem;font-size:0.8rem">❌ Rejeitar</button>
                </div>
            </div>`).join('')}</div>
        </div>`;
    }

    const finalized = providerNegs.filter(n => n.state === 'FINALIZED').length;
    const terminated = providerNegs.filter(n => n.state === 'TERMINATED').length;

    html += `<div class="stats-bar" style="margin:1rem 0">
        <div class="stat-item"><span class="stat-num">${pendingData.count}</span><span class="stat-lbl">Pendentes</span></div>
        <div class="stat-item stat-green"><span class="stat-num">${finalized}</span><span class="stat-lbl">Aceitas</span></div>
        <div class="stat-item stat-orange"><span class="stat-num">${terminated}</span><span class="stat-lbl">Rejeitadas</span></div>
    </div>`;

    if (providerNegs.length) {
        html += '<h3 style="font-size:0.9rem;margin-top:1rem">Histórico</h3><div class="card-grid">';
        html += providerNegs.slice(0, 30).map(n => {
            const stateIcon = n.state === 'FINALIZED' ? '✅' : n.state === 'TERMINATED' ? '❌' : '⏳';
            return `<div class="card card-small" style="cursor:default">
                <span class="badge">${stateIcon} ${n.state}</span>
                <h4 style="font-size:0.8rem;word-break:break-all">${esc(n.assetId || n['@id'])}</h4>
                <p style="font-size:0.7rem;color:#666">De: ${esc(n.counterPartyId || '?')}</p>
            </div>`;
        }).join('') + '</div>';
    }

    el.innerHTML = html || '<p class="empty">Nenhuma negociação recebida.</p>';
}

async function approveNegA(id) {
    try {
        const res = await fetch(API + '/management/approval/' + id + '/approve', { method: 'POST', headers: {'Content-Type':'application/json'} });
        const data = await res.json();
        if (data.success) { alert('✅ Aprovada!'); loadReceivedNegotiationsA(); }
        else { alert('❌ Erro: ' + (data.error || 'falha')); }
    } catch(e) { alert('❌ Erro: ' + e.message); }
}

async function rejectNegA(id) {
    if (!confirm('Rejeitar esta negociação?')) return;
    try {
        const res = await fetch(API + '/management/approval/' + id + '/reject', { method: 'POST', headers: {'Content-Type':'application/json'} });
        const data = await res.json();
        if (data.success) { alert('❌ Rejeitada.'); loadReceivedNegotiationsA(); }
        else { alert('❌ Erro: ' + (data.error || 'falha')); }
    } catch(e) { alert('❌ Erro: ' + e.message); }
}

// ===== DADOS RECEBIDOS (negociados de outros connectors) =====
async function loadReceivedData() {
    const el = document.getElementById('received-data-content');
    el.innerHTML = '<p class="empty">⏳ Carregando...</p>';

    // Get all negotiations where we are CONSUMER and state is FINALIZED
    const negs = await api('/management/v4/contractnegotiations/request', 'POST', {
        "@context": CTX, "@type": "QuerySpec", "limit": 999999
    }) || [];

    const finalizedNegs = Array.isArray(negs) ? negs.filter(n => n.type === 'CONSUMER' && n.state === 'FINALIZED') : [];

    // Get all transfer processes
    const transfers = await api('/management/v4/transferprocesses/request', 'POST', {
        "@context": CTX, "@type": "QuerySpec", "limit": 999999
    }) || [];

    const transferMap = {};
    if (Array.isArray(transfers)) {
        transfers.forEach(t => {
            const key = t.contractId || t.contractAgreementId;
            if (!transferMap[key]) transferMap[key] = [];
            transferMap[key].push(t);
        });
    }

    if (!finalizedNegs.length) {
        el.innerHTML = '<p class="empty">Nenhum conjunto de dados recebido. Negocie com outro connector na aba "Negociar".</p>';
        return;
    }

    // Stats
    const withTransfer = finalizedNegs.filter(n => {
        const t = transferMap[n.contractAgreementId];
        return t && t.some(tp => tp.state === 'STARTED');
    }).length;

    let html = `
        <div class="stats-bar">
            <div class="stat-item"><span class="stat-num">${finalizedNegs.length}</span><span class="stat-lbl">Contratos</span></div>
            <div class="stat-item stat-green"><span class="stat-num">${withTransfer}</span><span class="stat-lbl">Acessíveis</span></div>
            <div class="stat-item stat-orange"><span class="stat-num">${finalizedNegs.length - withTransfer}</span><span class="stat-lbl">Aguardando transferência</span></div>
        </div>
        <div class="card-grid">`;

    for (const neg of finalizedNegs) {
        const contractId = neg.contractAgreementId;
        const assetId = neg.assetId || 'desconhecido';
        const provider = neg.counterPartyId || 'desconhecido';
        const nTransfers = transferMap[contractId] || [];
        const activeTransfer = nTransfers.find(t => t.state === 'STARTED');
        const lastTransfer = nTransfers[0];

        let statusBadge, statusInfo, actionBtn;
        if (activeTransfer) {
            statusBadge = '<span class="badge badge-green">✅ Acessível</span>';
            statusInfo = `<p style="font-size:0.7rem;color:#00a651">Conjunto de dados disponível para consulta</p>`;
            actionBtn = `<button onclick="fetchDataViaEdr('${activeTransfer['@id']}', '${esc(assetId)}')" style="background:#00a651;margin-top:0.5rem">📥 Consultar Conjunto de Dados</button>`;
        } else if (lastTransfer && lastTransfer.state === 'TERMINATED') {
            statusBadge = '<span class="badge badge-orange">⚠️ Expirado</span>';
            statusInfo = `<p style="font-size:0.7rem;color:#e65100">Acesso expirado. Inicie nova transferência.</p>`;
            actionBtn = `<button onclick="retryTransfer('${contractId}', '${esc(assetId)}', '${esc(neg.counterPartyAddress)}')" style="background:#1351b4;margin-top:0.5rem">🔄 Nova Transferência</button>`;
        } else {
            statusBadge = '<span class="badge">📋 Contrato firmado</span>';
            statusInfo = `<p style="font-size:0.7rem;color:#666">Inicie a transferência para acessar o conjunto de dados.</p>`;
            actionBtn = `<button onclick="retryTransfer('${contractId}', '${esc(assetId)}', '${esc(neg.counterPartyAddress)}')" style="background:#1351b4;margin-top:0.5rem">🚀 Iniciar Transferência</button>`;
        }

        html += `<div class="card" style="cursor:default">
            <div class="card-top">${statusBadge}</div>
            <h4 style="word-break:break-all">${esc(assetId)}</h4>
            <p style="font-size:0.75rem;color:#666">Provider: <strong>${esc(provider)}</strong></p>
            <p style="font-size:0.7rem;color:#888">Contrato: ${esc((contractId||'').substring(0,24))}...</p>
            ${statusInfo}
            ${actionBtn}
            <div id="edr-result-${activeTransfer ? activeTransfer['@id'] : contractId}" style="margin-top:0.5rem"></div>
        </div>`;
    }

    html += '</div>';
    el.innerHTML = html;
}

async function retryTransfer(contractId, assetId, counterPartyAddress) {
    const dsp = counterPartyAddress || document.getElementById('n-dsp')?.value || '';
    if (!dsp) { alert('Endereço DSP do provider não encontrado'); return; }

    const result = await api('/management/v4/transferprocesses', 'POST', {
        "@context": CTX, "@type": "TransferRequest",
        "counterPartyAddress": dsp,
        "counterPartyId": "unknown",
        "protocol": "dataspace-protocol-http:2025-1",
        "contractId": contractId,
        "assetId": assetId,
        "transferType": "HttpData-PULL",
        "dataDestination": {"@type": "DataAddress", "type": "HttpProxy"}
    });

    if (result?.['@id']) {
        alert('✅ Transferência iniciada! ID: ' + result['@id'] + '\nAguarde alguns segundos e atualize.');
        setTimeout(loadReceivedData, 3000);
    } else {
        alert('❌ Falha: ' + (result?.message || JSON.stringify(result)));
    }
}

async function fetchDataViaEdr(transferId, assetId) {
    const el = document.getElementById('edr-result-' + transferId);
    if (!el) return;
    el.innerHTML = '<p style="font-size:0.75rem;color:#666">⏳ Obtendo informações de acesso...</p>';

    try {
        const resp = await fetch('/edr/' + transferId);
        const edr = await resp.json();

        if (resp.ok && edr.assetId) {
            const endpoint = edr.endpoint || '';
            el.innerHTML = `<div style="background:#f0f4ff;padding:0.5rem;border-radius:6px;font-size:0.7rem">
                <p><strong>Conjunto de Dados:</strong> <code>${esc(edr.assetId)}</code></p>
                <p><strong>Provider:</strong> <code>${esc(edr.providerId || '')}</code></p>
                <p><strong>Contrato:</strong> <code>${esc(edr.agreementId || '')}</code></p>
                ${endpoint ? `<p><strong>Endpoint origem:</strong> <code>${esc(endpoint)}</code></p>` : ''}
                <p style="margin-top:0.4rem;color:#00a651"><strong>✅ Acesso ativo</strong> — O conjunto de dados está acessível via protocolo DSP. O token de acesso é gerenciado automaticamente pelo connector.</p>
            </div>`;
        } else {
            el.innerHTML = `<div style="background:#fff8e1;padding:0.5rem;border-radius:6px;font-size:0.7rem">
                <p>⚠️ ${esc(edr.error || 'Informações de acesso não disponíveis.')}</p>
                <p>Inicie uma <strong>nova transferência</strong> para restabelecer o acesso.</p>
            </div>`;
        }
    } catch (e) {
        el.innerHTML = `<p style="font-size:0.7rem;color:#e53e3e">❌ ${esc(e.message)}</p>`;
    }
}

async function proxyFetchData(endpoint, authKey, authToken) {
    try {
        const resp = await fetch(endpoint, { headers: { [authKey]: authToken } });
        const text = await resp.text();
        const win = window.open('', '_blank');
        win.document.write('<pre>' + text.substring(0, 10000) + '</pre>');
    } catch (e) {
        alert('❌ Não foi possível acessar o endpoint: ' + e.message + '\n(O endpoint pode ser interno ao Docker)');
    }
}

// ===== IMPORT RDF =====
function simpleHash(str) { let h=0; for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h=h&h;} return Math.abs(h).toString(36); }

function saveRepository(url, name) {
    const repos = JSON.parse(localStorage.getItem('rdf-repos-'+PORT)||'[]');
    const existing = repos.find(r => r.url === url);
    if (!existing) repos.push({url, name: name||'', lastSync: new Date().toISOString()});
    else { existing.lastSync = new Date().toISOString(); if(name) existing.name = name; }
    localStorage.setItem('rdf-repos-'+PORT, JSON.stringify(repos));
    loadRepositories();
}
function loadRepositories() {
    const repos = JSON.parse(localStorage.getItem('rdf-repos-'+PORT)||'[]');
    const el = document.getElementById('rdf-repos');
    if (!el) return;
    if (!repos.length) { el.innerHTML = '<p class="empty">Nenhum repositório</p>'; return; }
    el.innerHTML = repos.map(r => `<div class="card card-small"><h4>🌐 ${esc(r.name||r.url.substring(0,40))}</h4><p>${esc(r.url)}</p><p>Sync: ${new Date(r.lastSync).toLocaleString('pt-BR')}</p><button onclick="document.getElementById('rdf-url').value='${r.url}';document.getElementById('rdf-name').value='${esc(r.name||'')}';importRDF()">🔄 Resincronizar</button></div>`).join('');
}

async function importRDF() {
    const url = document.getElementById('rdf-url').value;
    const repoName = document.getElementById('rdf-name')?.value || '';
    if (!url) { alert('Informe a URL'); return; }
    const el = document.getElementById('rdf-result');
    el.innerHTML = '<p>⏳ Buscando RDF...</p>';
    try {
        const res = await fetch('/rdf/import', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({url})});
        const data = await res.json();
        if (data.error) { el.innerHTML = `<p class="error">❌ ${data.error}</p>`; return; }
        if (!data.datasets?.length) { el.innerHTML = '<p class="error">❌ Nenhum dataset</p>'; return; }

        el.innerHTML = `<p>⏳ ${data.count} datasets. Importando...</p>`;
        let imported=0, updated=0, skipped=0;
        for (const ds of data.datasets) {
            // Use only title for hash (id from RDF can change between fetches)
            const hash = simpleHash(ds.title || 'untitled');
            const assetId = `rdf-${hash}`;
            // Map all available fields from RDF to dcat-br:metadata schema properties
            const metadata = {
                // Standard DCAT/DCT fields mapped to schema property names
                'dcterms:title': ds.title || '',
                'dcterms:description': ds.description || '',
                'dcterms:creator': ds.creator || '',
                'dcat:keyword': ds.keywords || [],
                'dcatbr:temas': ds.themes || [],
                'dcterms:license': ds.license || '',
                'dcterms:accrualPeriodicity': ds.periodicity || '',
                'dcterms:language': ds.language || '',
                'dcterms:spatial': ds.spatial || '',
                'dcterms:accessRights': ds.accessRights || '',
                'dcat:contactPoint': ds.contactPoint || '',
                'dcat:startDate': ds.temporalStart || '',
                'dcat:endDate': ds.temporalEnd || '',
                'dcat:version': ds.version || '',
                // DCAT-BR specific fields (dcatbr: namespace)
                'dcatbr:dadosAbertos': ds['dcatbr:dadosAbertos'] || 'Sim',
                'dcatbr:previsaoAbertura': ds['dcatbr:previsaoAbertura'] || '',
                'dcatbr:dataAbertura': ds['dcatbr:dataAbertura'] || '',
                'dcatbr:relacionadoODS': ds['dcatbr:relacionadoODS'] || '',
                'dcatbr:ods': ds['dcatbr:ods'] || '',
                'dcatbr:dadosRacaEtnia': ds['dcatbr:dadosRacaEtnia'] || '',
                'dcatbr:dadosGenero': ds['dcatbr:dadosGenero'] || '',
                'dcatbr:granularidadeEspacial': ds['dcatbr:granularidadeEspacial'] || '',
                'dcatbr:visibilidade': ds['dcatbr:visibilidade'] || '',
                'dcatbr:descontinuado': ds['dcatbr:descontinuado'] || '',
                'dcatbr:dataDescontinuacao': ds['dcatbr:dataDescontinuacao'] || '',
                // Legacy compat keys (used by some dashboard views)
                title: ds.title || '',
                description: ds.description || '',
                creator: ds.creator || '',
                keywords: ds.keywords || [],
                temas: ds.themes || [],
                licenca: ds.license || '',
                periodicidade: ds.periodicity || '',
                dadosAbertos: ds['dcatbr:dadosAbertos'] || 'Sim',
                // Import metadata
                source: url,
                distributions: ds.distributions || [],
                importedAt: new Date().toISOString()
            };
            // Also copy any other dcatbr: fields that were parsed dynamically
            for (const [k, v] of Object.entries(ds)) {
                if (k.startsWith('dcatbr:') && v && !metadata[k]) metadata[k] = v;
            }
            const baseUrl = ds.distributions?.[0]?.url || url;

            // Full upsert: delete asset+policy+contract first
            const del = await fetch(API+'/management/v4/assets/'+encodeURIComponent(assetId), {method:'DELETE'});
            const isUpdate = del.status === 204;
            if (isUpdate) { updated++; await fetch(API+'/management/v4/policydefinitions/policy-'+encodeURIComponent(assetId),{method:'DELETE'}); await fetch(API+'/management/v4/contractdefinitions/contract-'+encodeURIComponent(assetId),{method:'DELETE'}); }

            const r = await api('/management/v4/assets', 'POST', { "@context": CTX, "@id": assetId, "@type": "Asset", "properties": {"name": (ds.title||'').substring(0,100), "description": ds.description||'', "contenttype": "application/json", [METADATA_KEY]: JSON.stringify(metadata)}, "dataAddress": {"@type":"DataAddress","type":"HttpData","baseUrl": baseUrl} });
            if (r && !r.message) {
                await api('/management/v4/policydefinitions', 'POST', {"@context":CTX,"@type":"PolicyDefinition","@id":`policy-${assetId}`,"policy":{"@type":"Set","permission":[{"action":"use"}]}});
                await api('/management/v4/contractdefinitions', 'POST', {"@context":{"@vocab":"https://w3id.org/edc/v0.0.1/ns/"},"@type":"ContractDefinition","@id":`contract-${assetId}`,"accessPolicyId":`policy-${assetId}`,"contractPolicyId":`policy-${assetId}`,"assetsSelector":[{"operandLeft":"https://w3id.org/edc/v0.0.1/ns/id","operator":"=","operandRight":assetId}]});
                imported++;
            } else { skipped++; }
            const pct = Math.round(((imported+skipped)/data.count)*100);
            el.innerHTML = `<div class="progress-bar-container"><div class="progress-bar" style="width:${pct}%">${pct}%</div></div><p>${imported+skipped}/${data.count}</p>`;
        }
        el.innerHTML = `<p class="success">✅ Novos: ${imported-updated} | Atualizados: ${updated} | Erros: ${skipped} | Total: ${imported}</p>`;
        saveRepository(url, repoName);
        loadAssets();
    } catch(e) { el.innerHTML = `<p class="error">❌ ${e.message}</p>`; }
}

// ===== ORGANIZAÇÕES =====
let orgData = null;

async function loadOrgs() {
    try {
        const res = await fetch('/config/vcr-organizacoes.json');
        orgData = await res.json();
        renderOrgs();
        populateOrgDropdown();
    } catch(e) { 
        orgData = { id: "organizacoes", title: "Organizações Participantes", values: [] };
        renderOrgs();
    }
}

function renderOrgs() {
    const el = document.getElementById('org-list');
    if (!orgData?.values?.length) { el.innerHTML = '<p class="empty">Nenhuma organização cadastrada</p>'; return; }
    el.innerHTML = `<div class="stats-bar" style="margin-bottom:1rem">
        <div class="stat-item"><span class="stat-num">${orgData.values.length}</span><span class="stat-lbl">Organizações</span></div>
    </div>
    <table class="config-table"><thead><tr><th>Nome</th><th>Ações</th></tr></thead><tbody>` +
        orgData.values.map((o, i) => `<tr>
            <td><strong>${esc(o.label)}</strong></td>
            <td>
                <button onclick="editOrg(${i})">✏️ Editar</button>
                <button onclick="deleteOrg(${i})">🗑️ Excluir</button>
            </td>
        </tr>`).join('') + '</tbody></table>';
}

function populateOrgDropdown() {
    const sel = document.getElementById('p-creator');
    if (!sel || !orgData) return;
    sel.innerHTML = '<option value="">Selecione a organização...</option>' + 
        orgData.values.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
}

function addOrg() {
    const name = prompt('Nome da organização (sigla + nome completo):\nEx: CGU - Controladoria-Geral da União');
    if (!name || !name.trim()) return;
    if (!orgData) orgData = { id: "organizacoes", title: "Organizações Participantes", values: [] };
    if (orgData.values.find(o => o.value === name.trim())) { alert('Organização já existe!'); return; }
    orgData.values.push({ value: name.trim(), label: name.trim() });
    orgData.values.sort((a, b) => a.label.localeCompare(b.label));
    saveOrgs();
}

function editOrg(idx) {
    const org = orgData.values[idx];
    const newName = prompt('Editar nome da organização:', org.label);
    if (!newName || !newName.trim() || newName.trim() === org.label) return;
    orgData.values[idx] = { value: newName.trim(), label: newName.trim() };
    saveOrgs();
}

function deleteOrg(idx) {
    const org = orgData.values[idx];
    if (!confirm(`Excluir "${org.label}"?`)) return;
    orgData.values.splice(idx, 1);
    saveOrgs();
}

async function saveOrgs() {
    try {
        await fetch('/config/vcr-organizacoes.json', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(orgData) });
        renderOrgs();
        populateOrgDropdown();
    } catch(e) { alert('Erro ao salvar: ' + e.message); }
}

// ===== POPULATE DROPDOWNS FROM VCR =====
async function populateDropdownFromVcr(selectId, vcrFile, placeholder) {
    try {
        const res = await fetch('/config/' + vcrFile);
        const data = await res.json();
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = `<option value="">${placeholder || 'Selecione...'}</option>` +
            data.values.map(v => `<option value="${esc(v.value)}">${esc(v.label)}</option>`).join('');
    } catch(e) { /* VCR not found, keep hardcoded */ }
}

function loadFormDropdowns() {
    loadOrgs();
    populateDropdownFromVcr('p-dadosAbertos', 'vcr-dados-abertos.json', 'Selecione');
    populateDropdownFromVcr('p-periodicidade', 'vcr-periodicidade.json', 'Selecione a periodicidade');
    populateDropdownFromVcr('p-licenca', 'vcr-licencas.json', 'Selecione a licença');
    populateDropdownFromVcr('p-observancia', 'vcr-observancia-legal.json', 'Selecione');
    populateDropdownFromVcr('p-idioma', 'vcr-idiomas.json', 'Selecione o idioma');
    populateDropdownFromVcr('p-espacial', 'vcr-cobertura-espacial.json', 'Selecione');
    populateDropdownFromVcr('p-granularidade', 'vcr-granularidade-espacial.json', 'Selecione');
    populateDropdownFromVcr('p-ods-rel', 'vcr-sim-nao.json', 'Selecione');
    populateDropdownFromVcr('p-raca', 'vcr-sim-nao.json', 'Selecione');
    populateDropdownFromVcr('p-genero', 'vcr-sim-nao.json', 'Selecione');
    populateDropdownFromVcr('p-ods', 'vcr-ods.json', 'Selecione ODS');
    populateDropdownFromVcr('p-visibilidade', 'vcr-visibilidade.json', 'Selecione');
    populateMultiselectFromVcr('p-temas', 'vcr-temas.json');
    // Add first resource block
    addRecurso();
    // Show/hide ODS field
    const odsRel = document.getElementById('p-ods-rel');
    if (odsRel) odsRel.addEventListener('change', () => {
        const grp = document.getElementById('p-ods-group');
        if (grp) grp.style.display = odsRel.value === 'Sim' ? '' : 'none';
    });
}

async function populateMultiselectFromVcr(selectId, vcrFile) {
    try {
        const res = await fetch('/config/' + vcrFile);
        const data = await res.json();
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = data.values.map(v => `<option value="${esc(v.value)}">${esc(v.label)}</option>`).join('');
        sel.size = Math.min(data.values.length, 6);
    } catch(e) { /* VCR not found */ }
}

// ===== CONFIG DCAT-BR =====
let schemaData = null;
let currentVcrData = null;
let editingFieldIndex = -1;

function showConfigPanel(panel) {
    if (panel === 'schema') loadSchema();
    if (panel === 'vcr') loadVcrList();
}

async function loadSchema() {
    try {
        const res = await fetch('/config/dcat-br-schema.json');
        schemaData = await res.json();
        renderSchemaFields();
    } catch(e) { console.error('loadSchema:', e); }
}

let currentSchemaSection = 0;

function renderSchemaFields() {
    const el = document.getElementById('schema-fields-list');
    if (!schemaData?.sections?.length) { el.innerHTML = '<p class="empty">Nenhum campo definido</p>'; return; }

    // Section tabs
    let html = `<div class="schema-section-tabs" style="display:flex;gap:0.5rem;margin-bottom:1rem">`;
    schemaData.sections.forEach((sec, si) => {
        html += `<button class="filter-btn ${currentSchemaSection === si ? 'active' : ''}" onclick="currentSchemaSection=${si};renderSchemaFields()">${esc(sec.title)}</button>`;
    });
    html += `</div>`;

    const section = schemaData.sections[currentSchemaSection];
    const fields = section.fields || [];
    if (!fields.length) { el.innerHTML = html + '<p class="empty">Nenhum campo nesta seção</p>'; return; }

    html += `<table class="config-table"><thead><tr><th>Ordem</th><th>ID</th><th>Rótulo</th><th>Tipo</th><th>Obrig.</th><th>VCR</th><th>Ações</th></tr></thead><tbody>` +
        fields.map((f, i) => `<tr>
            <td><button onclick="moveField(${i},-1)" ${i===0?'disabled':''}>↑</button><button onclick="moveField(${i},1)" ${i===fields.length-1?'disabled':''}>↓</button></td>
            <td><code>${esc(f.id)}</code></td>
            <td>${esc(f.label)}</td>
            <td><span class="type-badge">${esc(f.type)}</span></td>
            <td>${f.required ? '✅' : ''}</td>
            <td>${f.vcr ? `<code>${esc(f.vcr)}</code>` : ''}</td>
            <td><button onclick="editField(${i})">✏️</button> <button onclick="deleteField(${i})">🗑️</button></td>
        </tr>`).join('') + '</tbody></table>';
    el.innerHTML = html;
}

function moveField(idx, dir) {
    const fields = schemaData.sections[currentSchemaSection].fields;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= fields.length) return;
    [fields[idx], fields[newIdx]] = [fields[newIdx], fields[idx]];
    saveSchema();
}

function addField() {
    editingFieldIndex = -1;
    document.getElementById('field-modal-title').textContent = 'Novo Campo';
    document.getElementById('f-id').value = '';
    document.getElementById('f-property').value = '';
    document.getElementById('f-label').value = '';
    document.getElementById('f-type').value = 'text';
    document.getElementById('f-required').value = 'false';
    document.getElementById('f-vcr').value = '';
    document.getElementById('f-description').value = '';
    document.getElementById('f-placeholder').value = '';
    document.getElementById('f-id').removeAttribute('readonly');
    document.getElementById('field-modal').style.display = 'flex';
}

function editField(idx) {
    editingFieldIndex = idx;
    const f = schemaData.sections[currentSchemaSection].fields[idx];
    document.getElementById('field-modal-title').textContent = `Editar: ${f.label}`;
    document.getElementById('f-id').value = f.id || '';
    document.getElementById('f-property').value = f.property || '';
    document.getElementById('f-label').value = f.label || '';
    document.getElementById('f-type').value = f.type || 'text';
    document.getElementById('f-required').value = f.required ? 'true' : 'false';
    document.getElementById('f-vcr').value = f.vcr || '';
    document.getElementById('f-description').value = f.description || '';
    document.getElementById('f-placeholder').value = f.placeholder || '';
    document.getElementById('f-id').setAttribute('readonly', 'true');
    document.getElementById('field-modal').style.display = 'flex';
}

function closeFieldModal() { document.getElementById('field-modal').style.display = 'none'; }

function saveField() {
    const field = {
        id: document.getElementById('f-id').value.trim(),
        property: document.getElementById('f-property').value.trim(),
        label: document.getElementById('f-label').value.trim(),
        type: document.getElementById('f-type').value,
        required: document.getElementById('f-required').value === 'true'
    };
    if (!field.id || !field.label) { alert('ID e Rótulo são obrigatórios'); return; }
    const vcr = document.getElementById('f-vcr').value.trim();
    const desc = document.getElementById('f-description').value.trim();
    const placeholder = document.getElementById('f-placeholder').value.trim();
    if (vcr) field.vcr = vcr;
    if (desc) field.description = desc;
    if (placeholder) field.placeholder = placeholder;

    const sectionFields = schemaData.sections[currentSchemaSection].fields;
    if (editingFieldIndex >= 0) {
        sectionFields[editingFieldIndex] = field;
    } else {
        if (sectionFields.find(f => f.id === field.id)) { alert('Já existe um campo com esse ID'); return; }
        sectionFields.push(field);
    }
    closeFieldModal();
    saveSchema();
}

function deleteField(idx) {
    const f = schemaData.sections[currentSchemaSection].fields[idx];
    if (!confirm(`Excluir campo "${f.label}" (${f.id})?`)) return;
    schemaData.sections[currentSchemaSection].fields.splice(idx, 1);
    saveSchema();
}

async function saveSchema() {
    try {
        await fetch('/config/dcat-br-schema.json', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(schemaData) });
        renderSchemaFields();
    } catch(e) { alert('Erro ao salvar: ' + e.message); }
}

// ===== VCR MANAGEMENT =====
async function loadVcrList() {
    try {
        const res = await fetch('/config');
        const data = await res.json();
        const sel = document.getElementById('vcr-select');
        const vcrs = data.files.filter(f => f.startsWith('vcr-'));
        sel.innerHTML = '<option value="">Selecione um vocabulário...</option>' + vcrs.map(f => {
            const name = f.replace('vcr-','').replace('.json','');
            return `<option value="${f}">${name}</option>`;
        }).join('');
        // Show VCR overview cards when nothing is selected
        if (!document.getElementById('vcr-select').value) {
            renderVcrOverview(vcrs);
        }
    } catch(e) { console.error('loadVcrList:', e); }
}

function renderVcrOverview(vcrs) {
    const el = document.getElementById('vcr-editor');
    el.style.display = '';
    el.innerHTML = `<h4>Vocabulários Disponíveis (${vcrs.length})</h4>
        <p style="font-size:0.8rem;color:#666;margin-bottom:1rem">Selecione no dropdown acima para editar, ou clique num card abaixo.</p>
        <div class="card-grid">${vcrs.map(f => {
            const name = f.replace('vcr-','').replace('.json','');
            return `<div class="card card-small" style="cursor:pointer" onclick="document.getElementById('vcr-select').value='${f}';loadVcrValues()">
                <h4 style="font-size:0.85rem">📚 ${esc(name)}</h4>
                <p style="font-size:0.7rem;color:#888">${f}</p>
            </div>`;
        }).join('')}</div>`;
}

async function loadVcrValues() {
    const file = document.getElementById('vcr-select').value;
    const editor = document.getElementById('vcr-editor');
    if (!file) { loadVcrList(); return; }
    try {
        const res = await fetch('/config/' + file);
        currentVcrData = await res.json();
        editor.style.display = '';
        editor.innerHTML = `
            <div class="section-header">
                <h4>${esc(currentVcrData.title || file)}</h4>
                <button onclick="addVcrValue()">➕ Adicionar Valor</button>
            </div>
            <div id="vcr-values-list"></div>
            <button onclick="saveVcr()" class="btn-publish" style="margin-top:1rem">💾 Salvar Vocabulário</button>`;
        renderVcrValues();
    } catch(e) { console.error('loadVcrValues:', e); }
}

function renderVcrValues() {
    const el = document.getElementById('vcr-values-list');
    if (!currentVcrData?.values?.length) { el.innerHTML = '<p class="empty">Nenhum valor</p>'; return; }
    el.innerHTML = `<table class="config-table"><thead><tr><th>Valor</th><th>Rótulo</th><th>Ações</th></tr></thead><tbody>` +
        currentVcrData.values.map((v, i) => `<tr>
            <td><input type="text" value="${esc(v.value)}" onchange="updateVcrValue(${i},'value',this.value)" class="vcr-input"></td>
            <td><input type="text" value="${esc(v.label)}" onchange="updateVcrValue(${i},'label',this.value)" class="vcr-input"></td>
            <td><button onclick="deleteVcrValue(${i})">🗑️</button></td>
        </tr>`).join('') + '</tbody></table>';
}

function updateVcrValue(idx, key, value) { currentVcrData.values[idx][key] = value; }

function addVcrValue() {
    if (!currentVcrData) return;
    currentVcrData.values.push({ value: '', label: '' });
    renderVcrValues();
    // Focus the last input
    setTimeout(() => {
        const inputs = document.querySelectorAll('.vcr-input');
        if (inputs.length) inputs[inputs.length - 2].focus();
    }, 50);
}

function deleteVcrValue(idx) {
    currentVcrData.values.splice(idx, 1);
    renderVcrValues();
}

async function saveVcr() {
    const file = document.getElementById('vcr-select').value;
    if (!file || !currentVcrData) return;
    // Remove empty values
    currentVcrData.values = currentVcrData.values.filter(v => v.value || v.label);
    try {
        await fetch('/config/' + file, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(currentVcrData) });
        renderVcrValues();
        alert('✅ Vocabulário salvo!');
    } catch(e) { alert('Erro: ' + e.message); }
}

function addVcr() {
    const name = prompt('Nome do novo vocabulário (sem vcr- e sem .json):\nEx: organizacoes, tipos-dados');
    if (!name) return;
    const filename = `vcr-${name.toLowerCase().replace(/\s+/g,'-')}.json`;
    currentVcrData = { id: name.toLowerCase().replace(/\s+/g,'-'), title: name, values: [] };
    fetch('/config/' + filename, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(currentVcrData) })
        .then(() => { loadVcrList(); setTimeout(() => { document.getElementById('vcr-select').value = filename; loadVcrValues(); }, 300); });
}

// ===== INIT =====
checkHealth(); setInterval(checkHealth, 30000);
loadAssets();
loadPolicies();
loadRepositories();
loadFormDropdowns();

// ===== GESTÃO DE CONJUNTOS DE DADOS =====
let gestaoAssets = [];
let gestaoPage = 0;
const GESTAO_PAGE_SIZE = 20;
let gestaoSearch = '';
let gestaoShowHidden = false;

async function loadGestao() {
    const el = document.getElementById('gestao-content');
    el.innerHTML = '<p class="empty">⏳ Carregando...</p>';
    try {
        const data = await api('/management/v4/assets/request', 'POST', {
            "@context": CTX, "@type": "QuerySpec", "limit": 999999, "offset": 0
        });
        gestaoAssets = Array.isArray(data) ? data : [];
        gestaoAssets.sort((a, b) => {
            const tA = parseMetadata(a).title || '';
            const tB = parseMetadata(b).title || '';
            return tA.localeCompare(tB);
        });
        gestaoPage = 0;
        renderGestao();
    } catch(e) { el.innerHTML = `<p class="error">❌ ${e.message}</p>`; }
}

function renderGestao() {
    const el = document.getElementById('gestao-content');
    let filtered = gestaoAssets;

    // Filter by search
    if (gestaoSearch) {
        const s = gestaoSearch.toLowerCase();
        filtered = filtered.filter(a => {
            const m = parseMetadata(a);
            return (m.title||'').toLowerCase().includes(s) || (m.creator||'').toLowerCase().includes(s) || (a['@id']||'').toLowerCase().includes(s);
        });
    }

    // Filter hidden
    if (!gestaoShowHidden) {
        filtered = filtered.filter(a => !parseMetadata(a)._hidden);
    }

    const total = filtered.length;
    const totalHidden = gestaoAssets.filter(a => parseMetadata(a)._hidden).length;
    const start = gestaoPage * GESTAO_PAGE_SIZE;
    const page = filtered.slice(start, start + GESTAO_PAGE_SIZE);
    const totalPages = Math.ceil(total / GESTAO_PAGE_SIZE);

    el.innerHTML = `
        <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap">
            <input type="text" class="search-input" style="max-width:300px" placeholder="🔍 Buscar..." value="${esc(gestaoSearch)}" oninput="gestaoSearch=this.value;gestaoPage=0;renderGestao()">
            <label style="font-size:0.85rem;cursor:pointer"><input type="checkbox" ${gestaoShowHidden?'checked':''} onchange="gestaoShowHidden=this.checked;gestaoPage=0;renderGestao()"> Mostrar ocultos (${totalHidden})</label>
            <span style="font-size:0.85rem;color:#666">${total} conjuntos de dados</span>
        </div>
        <table class="gestao-table">
            <thead><tr><th style="width:40%">Título</th><th>Organização</th><th>Status</th><th style="width:180px">Ações</th></tr></thead>
            <tbody>
                ${page.map((a, i) => {
                    const m = parseMetadata(a);
                    const isHidden = m._hidden === true;
                    return `<tr style="${isHidden?'opacity:0.5':''}">
                        <td><strong>${esc((m.title||'').substring(0,60))}</strong><br><code style="font-size:0.7rem;color:#888">${esc(a['@id'])}</code></td>
                        <td style="font-size:0.82rem">${esc((m.creator||'').substring(0,30))}</td>
                        <td>${isHidden ? '<span style="color:#e65100;font-size:0.8rem">🙈 Oculto</span>' : '<span style="color:#00a651;font-size:0.8rem">👁️ Visível</span>'}</td>
                        <td>
                            <button class="btn-sm-action" onclick="editAsset('${a['@id']}')">✏️ Editar</button>
                            ${isHidden
                                ? `<button class="btn-sm-action" onclick="toggleHideAsset('${a['@id']}', false)">👁️ Mostrar</button>`
                                : `<button class="btn-sm-action" onclick="toggleHideAsset('${a['@id']}', true)">🙈 Ocultar</button>`
                            }
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
        ${totalPages > 1 ? `<div class="pagination" style="margin-top:1rem">
            <button ${gestaoPage===0?'disabled':''} onclick="gestaoPage--;renderGestao()">← Anterior</button>
            <span>Página ${gestaoPage+1} de ${totalPages}</span>
            <button ${gestaoPage>=totalPages-1?'disabled':''} onclick="gestaoPage++;renderGestao()">Próxima →</button>
        </div>` : ''}`;
}

async function toggleHideAsset(assetId, hide) {
    // Update the asset metadata to mark as hidden/visible
    const asset = gestaoAssets.find(a => a['@id'] === assetId);
    if (!asset) return;
    const props = asset.properties || {};
    let metadata = {};
    if (props[METADATA_KEY]) { try { metadata = JSON.parse(props[METADATA_KEY]); } catch {} }
    metadata._hidden = hide;

    // Update asset via PUT (EDC v0.17.0 uses PUT for update)
    const res = await api('/management/v4/assets', 'PUT', {
        "@context": CTX, "@id": assetId, "@type": "Asset",
        "properties": {
            ...props,
            [METADATA_KEY]: JSON.stringify(metadata)
        },
        "dataAddress": asset.dataAddress || {"@type":"DataAddress","type":"HttpData","baseUrl":"http://example.com"}
    });
    if (res && !res.message) {
        loadGestao();
    } else {
        alert('❌ Erro ao atualizar: ' + (res?.message || 'desconhecido'));
    }
}

async function editAsset(assetId) {
    const asset = gestaoAssets.find(a => a['@id'] === assetId);
    if (!asset) return;
    const props = asset.properties || {};
    let m = {};
    if (props[METADATA_KEY]) { try { m = JSON.parse(props[METADATA_KEY]); } catch {} }
    editRecursoCount = 0; // Reset counter

    const el = document.getElementById('gestao-content');
    el.innerHTML = `
        <button class="back-btn" onclick="renderGestao()">← Voltar à lista</button>
        <h3 style="margin-top:1rem">Editar: ${esc(m.title || assetId)}</h3>
        <form id="edit-form" onsubmit="saveEditedAsset(event, '${esc(assetId)}')">
            <div class="form-row">
                <div class="form-group"><label>Dados Abertos *</label><select id="e-dadosAbertos"><option value="">Selecione</option></select></div>
            </div>
            <div class="form-row">
                <div class="form-group" style="flex:2"><label>Título *</label><input type="text" id="e-title" value="${esc(m.title||'')}" required></div>
                <div class="form-group"><label>Organização *</label><select id="e-creator"><option value="">Selecione</option></select></div>
            </div>
            <div class="form-group"><label>Descrição *</label><textarea id="e-description" rows="4">${esc(m.description||'')}</textarea></div>
            <div class="form-row">
                <div class="form-group"><label>Observância Legal *</label><select id="e-observancia"><option value="">Selecione</option></select></div>
                <div class="form-group"><label>Idioma *</label><select id="e-idioma"><option value="">Selecione</option></select></div>
                <div class="form-group"><label>Licença *</label><select id="e-licenca"><option value="">Selecione</option></select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Área Técnica (Publisher) *</label><input type="text" id="e-publisher" value="${esc(m.publisher||'')}"></div>
                <div class="form-group"><label>E-mail *</label><input type="email" id="e-email" value="${esc(m.email||m.contactPoint||'')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Periodicidade *</label><select id="e-periodicidade"><option value="">Selecione</option></select></div>
                <div class="form-group"><label>Versão</label><input type="text" id="e-versao" value="${esc(m.versao||m.version||'')}"></div>
            </div>
            <div class="form-group"><label>Temas *</label><select id="e-temas" multiple></select></div>
            <div class="form-group"><label>Palavras-chave (separar por vírgula)</label><input type="text" id="e-keywords" value="${esc((m.keywords||[]).join(', '))}"></div>
            <div class="form-row">
                <div class="form-group"><label>Cobertura Espacial</label><select id="e-espacial"><option value="">Selecione</option></select></div>
                <div class="form-group"><label>Granularidade Espacial</label><select id="e-granularidade"><option value="">Selecione</option></select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Temporal Início</label><input type="date" id="e-tempInicio" value="${esc(m.temporalInicio||'')}"></div>
                <div class="form-group"><label>Temporal Fim</label><input type="date" id="e-tempFim" value="${esc(m.temporalFim||'')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Possui relação com ODS?</label><select id="e-ods-rel"><option value="">Selecione</option></select></div>
                <div class="form-group"><label>Dados de Raça/Etnia?</label><select id="e-raca"><option value="">Selecione</option></select></div>
                <div class="form-group"><label>Dados de Gênero?</label><select id="e-genero"><option value="">Selecione</option></select></div>
            </div>
            <div class="form-group"><label>ODS</label><select id="e-ods" multiple></select></div>
            <div class="form-group"><label>Visibilidade</label><select id="e-visibilidade"><option value="">Selecione</option></select></div>
            <h3 style="margin-top:1.5rem">Recursos (dcat:Distribution)</h3>
            <p style="font-size:0.82rem;color:#666;margin-bottom:0.5rem">Cada conjunto pode ter vários recursos. Adicione pelo menos um.</p>
            <div id="e-recursos-container"></div>
            <button type="button" class="btn-add-resource" onclick="addEditRecurso()">➕ Adicionar Recurso</button>
            <div style="margin-top:1.5rem;display:flex;gap:1rem">
                <button type="submit" class="btn-publish">💾 Salvar Alterações</button>
                <button type="button" class="back-btn" onclick="renderGestao()">Cancelar</button>
            </div>
        </form>
        <div id="edit-result"></div>`;

    // Populate dropdowns from VCRs (same as publish form)
    await populateDropdownFromVcr('e-dadosAbertos', 'vcr-dados-abertos.json', 'Selecione');
    await populateDropdownFromVcr('e-idioma', 'vcr-idiomas.json', 'Selecione');
    await populateDropdownFromVcr('e-licenca', 'vcr-licencas.json', 'Selecione');
    await populateDropdownFromVcr('e-periodicidade', 'vcr-periodicidade.json', 'Selecione');
    await populateDropdownFromVcr('e-observancia', 'vcr-observancia-legal.json', 'Selecione');
    await populateDropdownFromVcr('e-espacial', 'vcr-cobertura-espacial.json', 'Selecione');
    await populateDropdownFromVcr('e-granularidade', 'vcr-granularidade-espacial.json', 'Selecione');
    await populateDropdownFromVcr('e-ods-rel', 'vcr-sim-nao.json', 'Selecione');
    await populateDropdownFromVcr('e-raca', 'vcr-sim-nao.json', 'Selecione');
    await populateDropdownFromVcr('e-genero', 'vcr-sim-nao.json', 'Selecione');
    await populateDropdownFromVcr('e-visibilidade', 'vcr-visibilidade.json', 'Selecione');
    await populateMultiselectFromVcr('e-temas', 'vcr-temas.json');
    await populateMultiselectFromVcr('e-ods', 'vcr-ods.json');

    // Populate organizações
    try {
        const res = await fetch('/config/vcr-organizacoes.json');
        const data = await res.json();
        const vals = data.values || (Array.isArray(data) ? data : []);
        const sel = document.getElementById('e-creator');
        sel.innerHTML = '<option value="">Selecione</option>' + vals.map(v => {
            const val = typeof v === 'string' ? v : (v.value || v.label || '');
            return `<option value="${esc(val)}">${esc(typeof v === 'string' ? v : (v.label || v.value || ''))}</option>`;
        }).join('');
    } catch {}

    // Set current values in dropdowns
    setSelectValue('e-dadosAbertos', m.dadosAbertos || '');
    setSelectValue('e-creator', m.creator || '');
    setSelectValue('e-observancia', m.observancia || m.accessRights || '');
    setSelectValue('e-idioma', m.idioma || m.language || '');
    setSelectValue('e-licenca', m.licenca || m.license || '');
    setSelectValue('e-periodicidade', m.periodicidade || '');
    setSelectValue('e-espacial', m.espacial || m.spatial || '');
    setSelectValue('e-granularidade', m.granularidade || '');
    setSelectValue('e-ods-rel', m.relacionadoODS || '');
    setSelectValue('e-raca', m.dadosRacaEtnia || '');
    setSelectValue('e-genero', m.dadosGenero || '');
    setSelectValue('e-visibilidade', m.visibilidade || '');
    setMultiselectValues('e-temas', m.temas || []);
    setMultiselectValues('e-ods', m.ods || []);

    // Populate existing distributions
    const dists = m.distributions || [];
    if (dists.length > 0) {
        for (const d of dists) { addEditRecurso(d); }
    } else {
        addEditRecurso(); // Add one empty resource
    }
}

function setSelectValue(id, value) {
    const sel = document.getElementById(id);
    if (!sel) return;
    for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === value) { sel.selectedIndex = i; return; }
    }
}

function setMultiselectValues(id, values) {
    const sel = document.getElementById(id);
    if (!sel || !Array.isArray(values)) return;
    for (let i = 0; i < sel.options.length; i++) {
        sel.options[i].selected = values.includes(sel.options[i].value);
    }
}

let editRecursoCount = 0;

function addEditRecurso(data) {
    const container = document.getElementById('e-recursos-container');
    const idx = editRecursoCount++;
    const d = data || {};
    const div = document.createElement('div');
    div.className = 'recurso-block';
    div.id = `e-recurso-${idx}`;
    div.innerHTML = `
        <div class="recurso-header">
            <strong>Recurso ${container.children.length + 1}</strong>
            <button type="button" onclick="removeEditRecurso(${idx})" class="btn-remove-resource">✕ Remover</button>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Título do Recurso *</label><input type="text" id="er-title-${idx}" value="${esc(d.title||'')}" placeholder="Ex: API REST - Dados"></div>
            <div class="form-group"><label>URL de Acesso *</label><input type="url" id="er-url-${idx}" value="${esc(d.url||d.accessURL||'')}" placeholder="https://api.exemplo.gov.br/dados"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Tipo do Recurso *</label><select id="er-tipo-${idx}"><option value="">Selecione</option></select></div>
            <div class="form-group"><label>Formato *</label><select id="er-formato-${idx}"><option value="">Selecione</option></select></div>
            <div class="form-group"><label>Observância Legal</label><select id="er-observancia-${idx}" multiple></select></div>
        </div>
        <div class="form-group"><label>Descrição do Recurso</label><textarea id="er-desc-${idx}" rows="2" placeholder="Breve descrição...">${esc(d.description||'')}</textarea></div>
        <div class="form-row">
            <div class="form-group"><label>Tamanho</label><input type="text" id="er-size-${idx}" value="${esc(d.byteSize||'')}" placeholder="Ex: 1024 ou 1,5 MB"></div>
            <div class="form-group"><label>Cobertura Temporal Início</label><input type="date" id="er-tempInicio-${idx}" value="${esc(d.temporalStart||'')}"></div>
            <div class="form-group"><label>Cobertura Temporal Fim</label><input type="date" id="er-tempFim-${idx}" value="${esc(d.temporalEnd||'')}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Checksum</label><input type="text" id="er-checksum-${idx}" value="${esc(d.checksum||'')}" placeholder="sha256:abc123..."></div>
        </div>
    `;
    container.appendChild(div);
    // Populate dropdowns
    populateDropdownFromVcr(`er-tipo-${idx}`, 'vcr-tipo-recurso.json', 'Selecione o tipo');
    populateDropdownFromVcr(`er-formato-${idx}`, 'vcr-formatos.json', 'Selecione o formato');
    populateMultiselectFromVcr(`er-observancia-${idx}`, 'vcr-observancia-legal.json');
    // Set values after dropdown loads
    setTimeout(() => {
        setSelectValue(`er-tipo-${idx}`, d.type || '');
        setSelectValue(`er-formato-${idx}`, d.format || '');
    }, 300);
}

function removeEditRecurso(idx) {
    const el = document.getElementById(`e-recurso-${idx}`);
    if (el) el.remove();
    const blocks = document.querySelectorAll('#e-recursos-container .recurso-block');
    blocks.forEach((b, i) => {
        const header = b.querySelector('.recurso-header strong');
        if (header) header.textContent = `Recurso ${i + 1}`;
    });
}

function collectEditRecursos() {
    const recursos = [];
    const blocks = document.querySelectorAll('#e-recursos-container .recurso-block');
    blocks.forEach(block => {
        const idx = block.id.replace('e-recurso-', '');
        const title = document.getElementById(`er-title-${idx}`)?.value?.trim();
        const url = document.getElementById(`er-url-${idx}`)?.value?.trim();
        if (!title && !url) return;
        recursos.push({
            title: title || '',
            description: document.getElementById(`er-desc-${idx}`)?.value?.trim() || '',
            url: url || '',
            type: document.getElementById(`er-tipo-${idx}`)?.value || '',
            format: document.getElementById(`er-formato-${idx}`)?.value || '',
            accessRights: Array.from(document.getElementById(`er-observancia-${idx}`)?.selectedOptions || []).map(o => o.value),
            byteSize: document.getElementById(`er-size-${idx}`)?.value?.trim() || '',
            temporalStart: document.getElementById(`er-tempInicio-${idx}`)?.value || '',
            temporalEnd: document.getElementById(`er-tempFim-${idx}`)?.value || '',
            checksum: document.getElementById(`er-checksum-${idx}`)?.value?.trim() || ''
        });
    });
    return recursos;
}

async function saveEditedAsset(event, assetId) {
    event.preventDefault();
    const asset = gestaoAssets.find(a => a['@id'] === assetId);
    if (!asset) return;
    const props = asset.properties || {};
    let metadata = {};
    if (props[METADATA_KEY]) { try { metadata = JSON.parse(props[METADATA_KEY]); } catch {} }

    // Update all metadata fields from form
    metadata.title = document.getElementById('e-title').value;
    metadata.description = document.getElementById('e-description').value;
    metadata.creator = document.getElementById('e-creator').value;
    metadata.dadosAbertos = document.getElementById('e-dadosAbertos').value;
    metadata.observancia = document.getElementById('e-observancia').value;
    metadata.idioma = document.getElementById('e-idioma').value;
    metadata.licenca = document.getElementById('e-licenca').value;
    metadata.periodicidade = document.getElementById('e-periodicidade').value;
    metadata.publisher = document.getElementById('e-publisher').value;
    metadata.email = document.getElementById('e-email').value;
    metadata.versao = document.getElementById('e-versao').value;
    metadata.espacial = document.getElementById('e-espacial').value;
    metadata.granularidade = document.getElementById('e-granularidade').value;
    metadata.temporalInicio = document.getElementById('e-tempInicio').value;
    metadata.temporalFim = document.getElementById('e-tempFim').value;
    metadata.relacionadoODS = document.getElementById('e-ods-rel').value;
    metadata.dadosRacaEtnia = document.getElementById('e-raca').value;
    metadata.dadosGenero = document.getElementById('e-genero').value;
    metadata.visibilidade = document.getElementById('e-visibilidade').value;
    metadata.keywords = document.getElementById('e-keywords').value.split(',').map(s=>s.trim()).filter(Boolean);
    metadata.temas = Array.from(document.getElementById('e-temas').selectedOptions).map(o => o.value);
    metadata.ods = Array.from(document.getElementById('e-ods').selectedOptions).map(o => o.value);
    metadata.distributions = collectEditRecursos();

    const res = await api('/management/v4/assets', 'PUT', {
        "@context": CTX, "@id": assetId, "@type": "Asset",
        "properties": {
            "name": metadata.title.substring(0, 100),
            "description": (metadata.description||'').substring(0, 200),
            "contenttype": "application/json",
            [METADATA_KEY]: JSON.stringify(metadata)
        },
        "dataAddress": asset.dataAddress || {"@type":"DataAddress","type":"HttpData","baseUrl":"http://example.com"}
    });

    const resultEl = document.getElementById('edit-result');
    if (res && !res.message) {
        resultEl.innerHTML = '<p class="success">✅ Salvo com sucesso!</p>';
        setTimeout(() => { loadGestao(); }, 1000);
    } else {
        resultEl.innerHTML = `<p class="error">❌ ${res?.message || 'Erro ao salvar'}</p>`;
    }
}
