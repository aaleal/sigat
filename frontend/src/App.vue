<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import ExportarBotao from './components/ExportarBotao.vue';
import EstadoControlo from './components/EstadoControlo.vue';
import Emprestimos from './components/Emprestimos.vue';
import Importacoes from './components/Importacoes.vue';
import Painel from './components/Painel.vue';

// ─── Auth ─────────────────────────────────────────────────────────────────

const token = ref(localStorage.getItem('sigat_token') || '');
const user = ref(null);
const currentPage = ref('painel');

const datasets = ref([]);
const selectedDatasetId = ref('');

const entries = ref([]);
const totalEntries = ref(0);
const page = ref(1);
const pageSize = ref(25);

const ESTADO_OPTIONS = ['Arquivo', 'Em Consulta', 'Empréstimo'];

const filters = reactive({
  q: '',
  cabecalho: '',
  descricao: '',
  notas: '',
  localizacao: '',
  assuntos: '',
  cota: '',
  cdr: '',
  tb: '',
  nrRegisto: '',
  autor: '',
  ano: '',
  tipo: '',
  cor: '',
  dimensao: '',
  estado: '',
  vazios: '',
  emprestimo: '',
});

const distinctOptions = ref({ autor: [], ano: [], tipo: [], cor: [], dimensao: [] });

const users = ref([]);

const loginForm = reactive({
  username: '',
  password: '',
});

const newUser = reactive({
  username: '',
  password: '',
  role: 'read',
});

const showAdvancedFilters = ref(false);
const entriesLoading = ref(false);
const loginLoading = ref(false);
const userLoading = ref(false);
const sortKeys = ref([]);
const ordenacao = ref('campos');
const aturbOrdenacao = ref('campos');

// ── UI state ─────────────────────────────────────────────────────────────
const sidebarCollapsed = ref(false);

// ── Cart ─────────────────────────────────────────────────────────────────
const cart = ref([]); // array of { key, datasetId, type, entry }

// ── Bin ──────────────────────────────────────────────────────────────────
const binEntries = ref([]);
const binAturbEntries = ref([]);
const binLoading = ref(false);
const binDatasetId = ref('');
const binAturbDatasetId = ref('');

// ── History ──────────────────────────────────────────────────────────────
const historyItems = ref([]);
const historyLoading = ref(false);
const historySelectedDatasetId = ref('');

// ── Entry form modal (create / edit) ─────────────────────────────────────
const entryFormModal = reactive({
  open: false,
  mode: 'create',
  type: 'cartografia',
  datasetId: '',
  loading: false,
  originalEntry: null,
  errors: {},
  form: {
    cabecalho: '', descricao: '', notas: '', localizacao: '', assuntos: '',
    cota: '', cdr: '', tb: '', nrRegisto: '', autor: '', ano: '', tipo: '', cor: '', dimensao: '',
    titulo: '', local: '', data: '', caixaNr: '',
  },
});

function resetEntryForm() {
  Object.assign(entryFormModal.form, {
    cabecalho: '', descricao: '', notas: '', localizacao: '', assuntos: '',
    cota: '', cdr: '', tb: '', nrRegisto: '', autor: '', ano: '', tipo: '', cor: '', dimensao: '',
    titulo: '', local: '', data: '', caixaNr: '',
  });
  entryFormModal.originalEntry = null;
  entryFormModal.errors = {};
}

// ── Empréstimo modal ──────────────────────────────────────────────────────
// ── Empréstimos (alertas) ─────────────────────────────────────────────────
const resumoEmprestimos = ref({ ativos: 0, emAtraso: 0, aVencer7dias: 0, semPrazo: 0 });
let resumoTimer = null;

async function carregarResumoEmprestimos() {
  try { resumoEmprestimos.value = await apiFetch('/api/emprestimos/resumo'); } catch { /* alerta é opcional */ }
}

async function onEmprestimoAlterado() {
  await carregarResumoEmprestimos();
  await loadEntries();
  await loadAturbEntries();
}

function iniciarAlertas() {
  carregarResumoEmprestimos();
  clearInterval(resumoTimer);
  resumoTimer = setInterval(carregarResumoEmprestimos, 5 * 60 * 1000);
}

// Abre a pesquisa de uma coleção com um filtro vindo do painel (estado, campos vazios, empréstimos).
async function abrirPesquisaDoPainel({ colecao, filtro }) {
  if (colecao === 'aturb') {
    clearAturbFilters();
    Object.assign(aturbFilters, filtro);
    aturbSortKeys.value = [];
    aturbPage.value = 1;
    currentPage.value = 'aturb';
    await loadAturbEntries();
  } else {
    clearSearchFilters();
    Object.assign(filters, filtro);
    sortKeys.value = [];
    page.value = 1;
    currentPage.value = 'search';
    await loadEntries();
  }
}

async function abrirEmprestimosDoPainel(estado) {
  currentPage.value = 'emprestimos';
  await nextTick();
  emprestimosRef.value?.abrirAba?.(estado);
}
const emprestimosRef = ref(null);

// Depois de aplicar uma importação: atualizar totais, listas e alertas.
async function onImportacaoAplicada() {
  await loadDatasets();
  await loadEntries();
  await loadDistinctOptions();
  await loadAturbEntries();
  await loadAturbDistinctOptions();
  await carregarResumoEmprestimos();
}

// Abre o detalhe de um documento (usado a partir da lista de empréstimos).
async function abrirDocumento(doc) {
  try {
    const entry = await apiFetch(`/api/documentos/${doc.id}`);
    if (entry.colecao === 'aturb') { aturbEntryModal.entry = entry; aturbEntryModal.open = true; }
    else { entryModal.entry = entry; entryModal.open = true; }
  } catch (error) {
    addToast(error.message, 'error');
  }
}

const entryModal = reactive({ open: false, entry: null });

// ── ATURB state ───────────────────────────────────────────────────────────
const aturbSelectedDatasetId = ref('');
const aturbEntries = ref([]);
const aturbTotalEntries = ref(0);
const aturbPage = ref(1);
const aturbEntriesLoading = ref(false);
const aturbSortKeys = ref([]);
const aturbShowAdvancedFilters = ref(false);

const aturbFilters = reactive({
  q: '',
  autor: '',
  titulo: '',
  local: '',
  data: '',
  caixaNr: '',
  estado: '',
  vazios: '',
  emprestimo: '',
});

const aturbDistinctOptions = ref({ autor: [], local: [], data: [], caixaNr: [] });

const aturbEntryModal = reactive({ open: false, entry: null });

// ── Helpers ───────────────────────────────────────────────────────────────
function extractMidNumber(str) {
  if (!str) return null;
  const m = String(str).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function displayNum(str) {
  if (!str) return '—';
  const n = extractMidNumber(str);
  return n != null ? String(n) : str;
}

function estadoClassSuffix(estado) {
  const map = { 'Arquivo': 'arquivo', 'Em Consulta': 'em-consulta', 'Empréstimo': 'emprestimo' };
  return map[estado] || 'default';
}

function formatEstadoDisplay(entry) {
  if (entry.estado === 'Empréstimo' && entry.estadoMeta) {
    return `Empréstimo · ${entry.estadoMeta.dataSaida || ''}`;
  }
  return entry.estado || '—';
}

// ── Autocomplete ─────────────────────────────────────────────────────────
const qSuggestions = computed(() => {
  const q = filters.q.trim().toLowerCase();
  if (!q || q.length < 2) return [];
  const seen = new Set();
  const result = [];
  const scanFields = ['cabecalho', 'descricao', 'notas', 'localizacao', 'assuntos',
                      'cota', 'cdr', 'tb', 'nrRegisto', 'autor', 'ano', 'tipo', 'cor', 'dimensao'];
  for (const entry of entries.value) {
    for (const key of scanFields) {
      const val = (entry[key] || '').trim();
      if (val && val.toLowerCase().includes(q) && !seen.has(val)) {
        seen.add(val);
        result.push(val);
        if (result.length >= 15) return result;
      }
    }
  }
  return result;
});

const filterSuggestions = computed(() => {
  const fields = ['cabecalho', 'descricao', 'notas', 'localizacao', 'assuntos',
                  'cota', 'cdr', 'tb', 'nrRegisto'];
  const result = {};
  for (const field of fields) {
    const q = (filters[field] || '').trim().toLowerCase();
    if (!q || q.length < 2) { result[field] = []; continue; }
    const seen = new Set();
    const matches = [];
    for (const entry of entries.value) {
      const val = (entry[field] || '').trim();
      if (val && val.toLowerCase().includes(q) && !seen.has(val)) {
        seen.add(val);
        matches.push(val);
        if (matches.length >= 15) break;
      }
    }
    result[field] = matches;
  }
  return result;
});

// ── ATURB Autocomplete ────────────────────────────────────────────────────
const aturbQSuggestions = computed(() => {
  const q = aturbFilters.q.trim().toLowerCase();
  if (!q || q.length < 2) return [];
  const seen = new Set();
  const result = [];
  const scanFields = ['autor', 'titulo', 'local', 'data', 'caixaNr'];
  for (const entry of aturbEntries.value) {
    for (const key of scanFields) {
      const val = (entry[key] || '').trim();
      if (val && val.toLowerCase().includes(q) && !seen.has(val)) {
        seen.add(val);
        result.push(val);
        if (result.length >= 15) return result;
      }
    }
  }
  return result;
});

const aturbFilterSuggestions = computed(() => {
  const fields = ['autor', 'titulo', 'local', 'caixaNr'];
  const result = {};
  for (const field of fields) {
    const q = (aturbFilters[field] || '').trim().toLowerCase();
    if (!q || q.length < 2) { result[field] = []; continue; }
    const seen = new Set();
    const matches = [];
    for (const entry of aturbEntries.value) {
      const val = (entry[field] || '').trim();
      if (val && val.toLowerCase().includes(q) && !seen.has(val)) {
        seen.add(val);
        matches.push(val);
        if (matches.length >= 15) break;
      }
    }
    result[field] = matches;
  }
  return result;
});

// ── Toast system ──────────────────────────────────────────────────────────
const toasts = ref([]);
let toastId = 0;

function addToast(message, type = 'info', duration = 4500) {
  const id = ++toastId;
  toasts.value.push({ id, message, type });
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, duration);
}

function removeToast(id) {
  toasts.value = toasts.value.filter(t => t.id !== id);
}

// ── Modal system ──────────────────────────────────────────────────────────
const modal = reactive({
  open: false,
  type: 'confirm',
  title: '',
  message: '',
  inputLabel: '',
  inputValue: '',
  inputPlaceholder: '',
  confirmLabel: 'Confirmar',
  confirmDanger: false,
  resolve: null,
});

function openModal(opts) {
  return new Promise((resolve) => {
    Object.assign(modal, {
      open: true,
      type: opts.type || 'confirm',
      title: opts.title || '',
      message: opts.message || '',
      inputLabel: opts.inputLabel || '',
      inputValue: opts.inputValue || '',
      inputPlaceholder: opts.inputPlaceholder || '',
      confirmLabel: opts.confirmLabel || 'Confirmar',
      confirmDanger: !!opts.confirmDanger,
      resolve,
    });
  });
}

function closeModal(result = null) {
  modal.open = false;
  if (modal.resolve) modal.resolve(result);
}

function confirmModal() {
  if (modal.type === 'input' || modal.type === 'password') {
    closeModal(modal.inputValue || '');
  } else {
    closeModal(true);
  }
}

const isAdmin = computed(() => user.value?.role === 'admin');
const isWrite = computed(() => ['admin', 'write'].includes(user.value?.role));
const isRead = computed(() => user.value?.role === 'read');
const canEditEstado = computed(() => isWrite.value);
const canManageEntries = computed(() => isWrite.value);
const canAccessSources = computed(() => isAdmin.value);
const totalPages = computed(() => Math.max(1, Math.ceil(totalEntries.value / pageSize.value)));
const selectedDataset = computed(() => datasets.value.find(d => d.id === selectedDatasetId.value) || null);
const userInitials = computed(() => (user.value?.username || '?').slice(0, 2).toUpperCase());
const hasActiveFilters = computed(() => Object.values(filters).some(v => String(v || '').trim() !== ''));

const NUMERIC_SORT_KEYS = new Set(['nrRegisto', 'caixaNr']);
const EXTRACT_NUM_SORT_KEYS = new Set(['cdr', 'tb', 'cota']);

const sortedEntries = computed(() => entries.value);

const activePageTitle = computed(() => {
  if (currentPage.value === 'sources') return 'Importações';
  if (currentPage.value === 'accounts') return 'Gestão de Contas';
  if (currentPage.value === 'aturb') return 'Arquivo Técnico de Urbanismo (ATURB)';
  if (currentPage.value === 'emprestimos') return 'Empréstimos';
  if (currentPage.value === 'painel') return 'Painel';
  if (currentPage.value === 'cart') return 'Impressão PDF';
  if (currentPage.value === 'bin') return 'Lixo (entradas eliminadas)';
  if (currentPage.value === 'history') return 'Histórico de Alterações';
  return 'Cartografia';
});

const cartografiaDatasets = computed(() =>
  datasets.value.filter((d) => !d.type || d.type === 'cartografia')
);
const aturbDatasets = computed(() =>
  datasets.value.filter((d) => d.type === 'aturb')
);
const aturbSelectedDataset = computed(() =>
  aturbDatasets.value.find((d) => d.id === aturbSelectedDatasetId.value) || null
);
const aturbTotalPages = computed(() => Math.max(1, Math.ceil(aturbTotalEntries.value / pageSize.value)));
const aturbSortedEntries = computed(() => aturbEntries.value);
const aturbHasActiveFilters = computed(() => Object.values(aturbFilters).some((v) => String(v || '').trim() !== ''));

const cartCount = computed(() => cart.value.length);

// Itens do carrinho agrupados por fonte de dados (a exportação é feita por fonte).
const cartGroups = computed(() => {
  const groups = new Map();
  for (const item of cart.value) {
    if (!groups.has(item.datasetId)) {
      const ds = datasets.value.find((d) => d.id === item.datasetId);
      groups.set(item.datasetId, { datasetId: item.datasetId, nome: ds?.name || (item.type === 'aturb' ? 'ATURB' : 'Cartografia'), ids: [] });
    }
    groups.get(item.datasetId).ids.push(item.entry.sourceEntryNumber);
  }
  return [...groups.values()];
});

function cartExportParams(group) {
  return new URLSearchParams({ ids: group.ids.join(',') });
}

function formatBytes(value) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(1)} ${units[idx]}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
}

// Returns sort info for a column or null if not active
function getSortEntry(key) {
  const idx = sortKeys.value.findIndex(s => s.key === key);
  return idx === -1 ? null : { ...sortKeys.value[idx], idx };
}

// Click: primary sort (replaces all). Shift/Ctrl/Meta+click: add to composite
function setSort(key, event) {
  const multi = event?.shiftKey || event?.ctrlKey || event?.metaKey;
  const existing = sortKeys.value.findIndex(s => s.key === key);
  if (multi) {
    if (existing !== -1) {
      const updated = [...sortKeys.value];
      updated[existing] = { key, dir: updated[existing].dir === 'asc' ? 'desc' : 'asc' };
      sortKeys.value = updated;
    } else {
      sortKeys.value = [...sortKeys.value, { key, dir: 'asc' }];
    }
  } else {
    if (existing !== -1 && sortKeys.value.length === 1) {
      sortKeys.value = [{ key, dir: sortKeys.value[0].dir === 'asc' ? 'desc' : 'asc' }];
    } else {
      sortKeys.value = [{ key, dir: 'asc' }];
    }
  }
  page.value = 1;
  loadEntries();
}

function clearSearchFilters() {
  filters.q = '';
  filters.cabecalho = '';
  filters.descricao = '';
  filters.notas = '';
  filters.localizacao = '';
  filters.assuntos = '';
  filters.cota = '';
  filters.cdr = '';
  filters.tb = '';
  filters.nrRegisto = '';
  filters.autor = '';
  filters.ano = '';
  filters.tipo = '';
  filters.cor = '';
  filters.dimensao = '';
  filters.estado = '';
  filters.vazios = '';
  filters.emprestimo = '';
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!options.skipJson && !headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token.value) {
    headers.set('Authorization', `Bearer ${token.value}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const ct = response.headers.get('content-type') || '';
  const payload = ct.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(payload?.message || `Erro HTTP ${response.status}`);
    error.details = payload;
    throw error;
  }

  return payload;
}

async function loadDistinctOptions() {
  if (!selectedDatasetId.value) {
    distinctOptions.value = { autor: [], ano: [], tipo: [], cor: [], dimensao: [] };
    return;
  }
  const fields = ['autor', 'ano', 'tipo', 'cor', 'dimensao'];
  const results = await Promise.all(
    fields.map((f) =>
      apiFetch(`/api/colecoes/${selectedDatasetId.value}/documentos/distinct?field=${f}`)
        .then((r) => ({ field: f, suggestions: r.suggestions || [] }))
        .catch(() => ({ field: f, suggestions: [] }))
    )
  );
  const opts = {};
  for (const { field, suggestions } of results) opts[field] = suggestions;
  distinctOptions.value = opts;
}

function openEntryModal(entry) {
  entryModal.entry = entry;
  entryModal.open = true;
  registarVisualizacao(entry, (fresco) => { if (entryModal.entry === entry) entryModal.entry = fresco; });
}

// Regista a consulta e atualiza o detalhe com os dados mais recentes do servidor.
async function registarVisualizacao(entry, aplicar) {
  try {
    const fresco = await apiFetch(`/api/documentos/${entry.id}`);
    aplicar(fresco);
  } catch { /* o detalhe já está aberto com os dados da lista */ }
}

async function loadUsers() {
  if (!isAdmin.value) {
    users.value = [];
    return;
  }
  users.value = await apiFetch('/api/users');
}

// As "fontes de dados" passaram a coleções fixas (cartografia e aturb); o id da coleção é usado como datasetId.
async function loadDatasets() {
  const lista = await apiFetch('/api/colecoes');
  datasets.value = lista.map((c) => ({ id: c.id, name: c.nome, type: c.id, entryCount: c.total }));
  selectedDatasetId.value = 'cartografia';
  aturbSelectedDatasetId.value = 'aturb';
  binDatasetId.value = 'cartografia';
  binAturbDatasetId.value = 'aturb';
  if (!historySelectedDatasetId.value) historySelectedDatasetId.value = 'cartografia';
}

function buildEntriesQuery() {
  const params = new URLSearchParams({
    page: String(page.value),
    pageSize: String(pageSize.value),
  });

  Object.entries(filters).forEach(([key, value]) => {
    if (String(value || '').trim()) {
      params.set(key, String(value).trim());
    }
  });

  if (sortKeys.value.length) {
    params.set('sortKeys', sortKeys.value.map(s => `${s.key}:${s.dir}`).join(','));
  }

  return params;
}

async function loadEntries() {
  if (!selectedDatasetId.value) {
    entries.value = [];
    totalEntries.value = 0;
    return;
  }
  entriesLoading.value = true;
  try {
    const payload = await apiFetch(`/api/colecoes/${selectedDatasetId.value}/documentos?${buildEntriesQuery().toString()}`);
    entries.value = payload.items || [];
    totalEntries.value = payload.total || 0;
    ordenacao.value = payload.ordenacao || 'campos';
  } finally {
    entriesLoading.value = false;
  }
}

async function bootstrap() {
  user.value = await apiFetch('/api/auth/me');
  if (!isAdmin.value && currentPage.value === 'accounts') {
    currentPage.value = 'search';
  }
  if (!canAccessSources.value && currentPage.value === 'sources') {
    currentPage.value = 'search';
  }
  await loadDatasets();
  await loadEntries();
  await loadDistinctOptions();
  await loadAturbEntries();
  await loadAturbDistinctOptions();
  await loadUsers();
  iniciarAlertas();
}

async function login() {
  loginLoading.value = true;
  try {
    const payload = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: loginForm.username,
        password: loginForm.password,
      }),
    });

    token.value = payload.token;
    user.value = payload.user;
    localStorage.setItem('sigat_token', token.value);

    loginForm.username = '';
    loginForm.password = '';
    currentPage.value = 'painel';

    await loadDatasets();
    await loadEntries();
    await loadDistinctOptions();
    await loadAturbEntries();
    await loadAturbDistinctOptions();
    await loadUsers();
    iniciarAlertas();
  } catch (error) {
    addToast(error.message, 'error');
  } finally {
    loginLoading.value = false;
  }
}

function logout() {
  clearInterval(resumoTimer);
  resumoEmprestimos.value = { ativos: 0, emAtraso: 0, aVencer7dias: 0, semPrazo: 0 };
  token.value = '';
  user.value = null;
  currentPage.value = 'painel';
  selectedDatasetId.value = '';
  datasets.value = [];
  entries.value = [];
  totalEntries.value = 0;
  users.value = [];
  distinctOptions.value = { autor: [], ano: [], tipo: [], cor: [], dimensao: [] };
  // reset ATURB
  aturbSelectedDatasetId.value = '';
  aturbEntries.value = [];
  aturbTotalEntries.value = 0;
  aturbDistinctOptions.value = { autor: [], local: [], data: [], caixaNr: [] };
  // reset new state
  cart.value = [];
  binEntries.value = [];
  binAturbEntries.value = [];
  historyItems.value = [];
  localStorage.removeItem('sigat_token');
}

async function searchEntries() {
  if (!selectedDatasetId.value) {
    entries.value = [];
    totalEntries.value = 0;
    return;
  }
  page.value = 1;
  await loadEntries();
}

async function clearSearch() {
  clearSearchFilters();
  showAdvancedFilters.value = false;
  sortKeys.value = [];
  page.value = 1;
  await loadEntries();
}

async function goPrevPage() {
  if (page.value <= 1 || !selectedDatasetId.value) return;
  page.value -= 1;
  await loadEntries();
}

async function goNextPage() {
  if (!selectedDatasetId.value || page.value >= totalPages.value) return;
  page.value += 1;
  await loadEntries();
}

async function createUser() {
  userLoading.value = true;
  try {
    await apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        username: newUser.username,
        password: newUser.password,
        role: newUser.role,
      }),
    });

    newUser.username = '';
    newUser.password = '';
    newUser.role = 'read';

    await loadUsers();
    addToast('Utilizador criado com sucesso.', 'success');
  } catch (error) {
    addToast(error.message, 'error');
  } finally {
    userLoading.value = false;
  }
}

async function deleteUser(userItem) {
  const confirmed = await openModal({
    type: 'confirm',
    title: 'Apagar utilizador',
    message: `Tem a certeza que pretende apagar o utilizador "${userItem.username}"?`,
    confirmLabel: 'Apagar',
    confirmDanger: true,
  });
  if (!confirmed) return;

  try {
    await apiFetch(`/api/users/${userItem.id}`, { method: 'DELETE' });
    await loadUsers();
    addToast('Utilizador removido com sucesso.', 'success');
  } catch (error) {
    addToast(error.message, 'error');
  }
}

async function changePassword(userItem) {
  const nextPassword = await openModal({
    type: 'password',
    title: 'Alterar password',
    message: `Nova password para o utilizador "${userItem.username}".`,
    inputLabel: 'Nova password',
    inputPlaceholder: '••••••••',
    confirmLabel: 'Guardar',
  });
  if (!nextPassword) return;

  try {
    await apiFetch(`/api/users/${userItem.id}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password: nextPassword }),
    });
    addToast(`Password de "${userItem.username}" atualizada.`, 'success');
  } catch (error) {
    addToast(error.message, 'error');
  }
}

function switchPage(pageName) {
  if (pageName === 'accounts' && !isAdmin.value) return;
  if (pageName === 'sources' && !canAccessSources.value) return;
  currentPage.value = pageName;
  if (pageName === 'bin') { loadBin(); loadAturbBin(); }
  if (pageName === 'history') loadHistory();
}

// ── ATURB helpers ─────────────────────────────────────────────────────────
function clearAturbFilters() {
  aturbFilters.q = '';
  aturbFilters.autor = '';
  aturbFilters.titulo = '';
  aturbFilters.local = '';
  aturbFilters.data = '';
  aturbFilters.caixaNr = '';
  aturbFilters.estado = '';
  aturbFilters.vazios = '';
  aturbFilters.emprestimo = '';
}

function buildAturbEntriesQuery() {
  const params = new URLSearchParams({
    page: String(aturbPage.value),
    pageSize: String(pageSize.value),
  });
  Object.entries(aturbFilters).forEach(([key, value]) => {
    if (String(value || '').trim()) params.set(key, String(value).trim());
  });
  if (aturbSortKeys.value.length) {
    params.set('sortKeys', aturbSortKeys.value.map(s => `${s.key}:${s.dir}`).join(','));
  }
  return params;
}

async function loadAturbEntries() {
  if (!aturbSelectedDatasetId.value) {
    aturbEntries.value = [];
    aturbTotalEntries.value = 0;
    return;
  }
  aturbEntriesLoading.value = true;
  try {
    const payload = await apiFetch(`/api/colecoes/${aturbSelectedDatasetId.value}/documentos?${buildAturbEntriesQuery().toString()}`);
    aturbEntries.value = payload.items || [];
    aturbTotalEntries.value = payload.total || 0;
    aturbOrdenacao.value = payload.ordenacao || 'campos';
  } finally {
    aturbEntriesLoading.value = false;
  }
}

async function loadAturbDistinctOptions() {
  if (!aturbSelectedDatasetId.value) {
    aturbDistinctOptions.value = { autor: [], local: [], data: [], caixaNr: [] };
    return;
  }
  const fields = ['autor', 'local', 'data', 'caixaNr'];
  const results = await Promise.all(
    fields.map((f) =>
      apiFetch(`/api/colecoes/${aturbSelectedDatasetId.value}/documentos/distinct?field=${f}`)
        .then((r) => ({ field: f, suggestions: r.suggestions || [] }))
        .catch(() => ({ field: f, suggestions: [] }))
    )
  );
  const opts = {};
  for (const { field, suggestions } of results) opts[field] = suggestions;
  aturbDistinctOptions.value = opts;
}

async function searchAturbEntries() {
  if (!aturbSelectedDatasetId.value) return;
  aturbPage.value = 1;
  await loadAturbEntries();
}

async function clearAturbSearch() {
  clearAturbFilters();
  aturbShowAdvancedFilters.value = false;
  aturbSortKeys.value = [];
  aturbPage.value = 1;
  await loadAturbEntries();
}

async function goAturbPrevPage() {
  if (aturbPage.value <= 1 || !aturbSelectedDatasetId.value) return;
  aturbPage.value -= 1;
  await loadAturbEntries();
}

async function goAturbNextPage() {
  if (!aturbSelectedDatasetId.value || aturbPage.value >= aturbTotalPages.value) return;
  aturbPage.value += 1;
  await loadAturbEntries();
}

function setAturbSort(key, event) {
  const multi = event?.shiftKey || event?.ctrlKey || event?.metaKey;
  const existing = aturbSortKeys.value.findIndex((s) => s.key === key);
  if (multi) {
    if (existing !== -1) {
      const updated = [...aturbSortKeys.value];
      updated[existing] = { key, dir: updated[existing].dir === 'asc' ? 'desc' : 'asc' };
      aturbSortKeys.value = updated;
    } else {
      aturbSortKeys.value = [...aturbSortKeys.value, { key, dir: 'asc' }];
    }
  } else {
    if (existing !== -1 && aturbSortKeys.value.length === 1) {
      aturbSortKeys.value = [{ key, dir: aturbSortKeys.value[0].dir === 'asc' ? 'desc' : 'asc' }];
    } else {
      aturbSortKeys.value = [{ key, dir: 'asc' }];
    }
  }
  aturbPage.value = 1;
  loadAturbEntries();
}

function getAturbSortEntry(key) {
  const idx = aturbSortKeys.value.findIndex((s) => s.key === key);
  return idx === -1 ? null : { ...aturbSortKeys.value[idx], idx };
}

function openAturbEntryModal(entry) {
  aturbEntryModal.entry = entry;
  aturbEntryModal.open = true;
  registarVisualizacao(entry, (fresco) => { if (aturbEntryModal.entry === entry) aturbEntryModal.entry = fresco; });
}

function cartKey(datasetId, entry) {
  return `${datasetId}__${entry.sourceEntryNumber}`;
}

function addToCart(datasetId, type, entry) {
  const key = cartKey(datasetId, entry);
  if (!cart.value.find(i => i.key === key)) {
    cart.value.push({ key, datasetId, type, entry: { ...entry } });
    addToast('Adicionado à impressão PDF.', 'success', 2000);
  }
}

function removeFromCart(key) {
  cart.value = cart.value.filter(i => i.key !== key);
}

function isInCart(datasetId, entry) {
  return !!cart.value.find(i => i.key === cartKey(datasetId, entry));
}

function clearCart() {
  cart.value = [];
}

function toggleCart(datasetId, type, entry) {
  if (isInCart(datasetId, entry)) {
    removeFromCart(cartKey(datasetId, entry));
  } else {
    addToCart(datasetId, type, entry);
  }
}

// ── PDF Export (browser print) ────────────────────────────────────────────
function exportCartPDF() {
  if (!cart.value.length) return;
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { addToast('Popup bloqueado. Permita popups para exportar PDF.', 'error'); return; }

  function escHtml(v) { return String(v || '—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function estadoHtml(entry) {
    let html = escHtml(entry.estado);
    if (entry.estado === 'Empréstimo' && entry.estadoMeta) {
      html += `<br><span class="meta-sm">Data de saída: ${escHtml(entry.estadoMeta.dataSaida)} · Registado por: ${escHtml(entry.estadoMeta.registadoPor)}</span>`;
    } else if (entry.estadoChangedAt) {
      html += `<br><span class="meta-sm">Alterado em: ${new Date(entry.estadoChangedAt).toLocaleString('pt-PT')} · Por: ${escHtml(entry.estadoChangedBy)}</span>`;
    }
    return html;
  }

  function renderCartografiaCard(entry, dsName) {
    return `<div class="entry-card">
      <div class="entry-card-header">
        <h3>${escHtml(entry.cabecalho)}</h3>
        <span class="entry-card-source">${escHtml(dsName)}</span>
      </div>
      <div class="entry-card-field entry-card-field--full">
        <span class="label">Descrição</span>
        <span class="value">${escHtml(entry.descricao)}</span>
      </div>
      <div class="entry-card-grid">
        <div class="entry-card-field"><span class="label">Nº Registo</span><span class="value">${escHtml(entry.nrRegisto)}</span></div>
        <div class="entry-card-field"><span class="label">Cota</span><span class="value">${escHtml(entry.cota)}</span></div>
        <div class="entry-card-field"><span class="label">CDR</span><span class="value">${escHtml(entry.cdr)}</span></div>
        <div class="entry-card-field"><span class="label">TB</span><span class="value">${escHtml(entry.tb)}</span></div>
        <div class="entry-card-field"><span class="label">Localização</span><span class="value">${escHtml(entry.localizacao)}</span></div>
        <div class="entry-card-field"><span class="label">Assuntos</span><span class="value">${escHtml(entry.assuntos)}</span></div>
        <div class="entry-card-field"><span class="label">Notas</span><span class="value">${escHtml(entry.notas)}</span></div>
        <div class="entry-card-field"><span class="label">Autor</span><span class="value">${escHtml(entry.autor)}</span></div>
        <div class="entry-card-field"><span class="label">Ano</span><span class="value">${escHtml(entry.ano)}</span></div>
        <div class="entry-card-field"><span class="label">Tipo</span><span class="value">${escHtml(entry.tipo)}</span></div>
        <div class="entry-card-field"><span class="label">Cor</span><span class="value">${escHtml(entry.cor)}</span></div>
        <div class="entry-card-field"><span class="label">Dimensão</span><span class="value">${escHtml(entry.dimensao)}</span></div>
        <div class="entry-card-field"><span class="label">Estado</span><span class="value">${estadoHtml(entry)}</span></div>
      </div>
    </div>`;
  }

  function renderAturbCard(entry, dsName) {
    return `<div class="entry-card">
      <div class="entry-card-header">
        <h3>${escHtml(entry.titulo)}</h3>
        <span class="entry-card-source">${escHtml(dsName)}</span>
      </div>
      <div class="entry-card-field entry-card-field--full">
        <span class="label">Título</span>
        <span class="value">${escHtml(entry.titulo)}</span>
      </div>
      <div class="entry-card-grid">
        <div class="entry-card-field"><span class="label">Autor</span><span class="value">${escHtml(entry.autor)}</span></div>
        <div class="entry-card-field"><span class="label">Local</span><span class="value">${escHtml(entry.local)}</span></div>
        <div class="entry-card-field"><span class="label">Data</span><span class="value">${escHtml(entry.data)}</span></div>
        <div class="entry-card-field"><span class="label">Caixa nº</span><span class="value">${escHtml(entry.caixaNr)}</span></div>
        <div class="entry-card-field"><span class="label">Estado</span><span class="value">${estadoHtml(entry)}</span></div>
      </div>
    </div>`;
  }

  const cartEntries = cart.value.filter(i => i.type !== 'aturb');
  const aturbItems = cart.value.filter(i => i.type === 'aturb');

  let content = '';
  if (cartEntries.length) {
    content += `<h2>Cartografia (${cartEntries.length})</h2>`;
    content += cartEntries.map(({ datasetId, entry }) => {
      const ds = datasets.value.find(d => d.id === datasetId);
      return renderCartografiaCard(entry, ds ? ds.name : datasetId);
    }).join('');
  }
  if (aturbItems.length) {
    content += `<h2>ATURB (${aturbItems.length})</h2>`;
    content += aturbItems.map(({ datasetId, entry }) => {
      const ds = datasets.value.find(d => d.id === datasetId);
      return renderAturbCard(entry, ds ? ds.name : datasetId);
    }).join('');
  }

  win.document.write(`<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
    <title>Câmara Municipal de Lisboa</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 20px; }
      .top-header { font-size: 12px; color: #444; margin-bottom: 6px; text-align: center; }
      h1 { font-size: 18px; margin-bottom: 4px; text-align: center; }
      h2 { font-size: 15px; margin: 24px 0 10px; color: #333; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
      .meta { font-size: 11px; color: #666; margin-bottom: 20px; text-align: center; }
      .entry-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; background: #fafbfc; }
      .entry-card-header { margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
      .entry-card-header h3 { font-size: 14px; margin: 0 0 2px; color: #1e293b; }
      .entry-card-source { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
      .entry-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
      .entry-card-field { margin-bottom: 6px; }
      .entry-card-field--full { margin-bottom: 10px; }
      .entry-card-field .label { display: block; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
      .entry-card-field .value { display: block; font-size: 12px; color: #1e293b; word-break: break-word; }
      .meta-sm { font-size: 10px; color: #94a3b8; }
      @media print { body { margin: 10px; } .entry-card { break-inside: avoid; } }
    </style>
  </head><body>
    <p class="top-header">Câmara Municipal de Lisboa</p>
    <h1><strong>Gabinete de Estudos Olisiponenses</strong></h1>
    <p class="meta">Exportado por: <strong>${user.value?.username || '—'}</strong> em ${new Date().toLocaleString('pt-PT')} &middot; ${cart.value.length} entrada(s) selecionada(s)</p>
    ${content}
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}

// ── Bin functions ─────────────────────────────────────────────────────────
async function loadBin() {
  binLoading.value = true;
  try {
    const payload = await apiFetch('/api/colecoes/cartografia/eliminados');
    binEntries.value = payload.deletedEntries || [];
  } catch { binEntries.value = []; }
  finally { binLoading.value = false; }
}

async function loadAturbBin() {
  binLoading.value = true;
  try {
    const payload = await apiFetch('/api/colecoes/aturb/eliminados');
    binAturbEntries.value = payload.deletedEntries || [];
  } catch { binAturbEntries.value = []; }
  finally { binLoading.value = false; }
}

async function restoreFromBin(entry) {
  try {
    await apiFetch(`/api/documentos/${entry.id}/restaurar`, { method: 'POST' });
    binEntries.value = binEntries.value.filter(e => e.id !== entry.id);
    binAturbEntries.value = binAturbEntries.value.filter(e => e.id !== entry.id);
    addToast('Entrada restaurada com sucesso.', 'success');
    await loadDatasets();
    await loadEntries();
    await loadAturbEntries();
  } catch (e) { addToast(e.message, 'error'); }
}

// ── History functions ─────────────────────────────────────────────────────
async function loadHistory() {
  const dsId = historySelectedDatasetId.value;
  if (!dsId) { historyItems.value = []; return; }
  historyLoading.value = true;
  try {
    const payload = await apiFetch(`/api/colecoes/${dsId}/historico`);
    historyItems.value = payload.history || [];
  } catch { historyItems.value = []; }
  finally { historyLoading.value = false; }
}

function historyActionLabel(action) {
  const labels = { create: 'Criação', edit: 'Edição', delete: 'Eliminação', restore: 'Restauro', estado: 'Estado', export: 'Exportação', emprestimo: 'Empréstimo', devolucao: 'Devolução', prolongar: 'Prorrogação', importar: 'Importação' };
  return labels[action] || action;
}

function historyActionClass(action) {
  const cls = { create: 'hist-create', edit: 'hist-edit', delete: 'hist-delete', restore: 'hist-restore', estado: 'hist-estado' };
  return cls[action] || 'hist-default';
}

function historyEntryRefDisplay(item) {
  if (!item.entryRef) return '—';
  if (typeof item.entryRef === 'string') return item.entryRef;
  const parts = [];
  if (item.entryRef.cabecalho || item.entryRef.titulo) parts.push(item.entryRef.cabecalho || item.entryRef.titulo);
  if (item.entryRef.sourceEntryNumber != null) parts.push(`#${item.entryRef.sourceEntryNumber}`);
  return parts.length ? parts.join(' — ') : '—';
}

function historyTimestamp(item) {
  const ts = item.timestamp || item.at;
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-PT');
}

function historyDetailsDisplay(item) {
  if (!item.details) return '';
  if (typeof item.details === 'string') return item.details;

  const d = item.details;

  // Estado change
  if (item.action === 'estado') {
    const parts = [];
    if (d.prevEstado || d.newEstado) {
      parts.push(`${d.prevEstado || '—'} → ${d.newEstado || '—'}`);
    }
    if (d.estadoMeta && d.estadoMeta.dataSaida) {
      parts.push(`Data saída: ${d.estadoMeta.dataSaida}`);
    }
    return parts.join(' · ');
  }

  // Edit — formato novo (diff por campo)
  if (item.action === 'edit' && d.alteracoes) {
    const corta = (v) => { const s = String(v ?? ''); return s.length > 40 ? `${s.slice(0, 40)}…` : s; };
    return Object.entries(d.alteracoes).map(([k, v]) => `${k}: "${corta(v.de)}" → "${corta(v.para)}"`).join(' · ') || 'Sem alterações visíveis';
  }

  // Create / Delete / Restore — formato novo
  if (['create', 'delete', 'restore'].includes(item.action) && typeof d.entrada === 'string') {
    return d.entrada ? `Entrada: ${d.entrada}` : '';
  }

  // Edit — show changed fields (formato antigo)
  if (item.action === 'edit' && d.prev && d.next) {
    const ignore = new Set(['sourceEntryNumber', 'updatedAt', 'updatedBy', 'createdAt', 'createdBy', 'estadoChangedAt', 'estadoChangedBy', 'estadoMeta']);
    const changed = [];
    for (const k of Object.keys(d.next)) {
      if (ignore.has(k)) continue;
      const pv = d.prev[k] ?? '';
      const nv = d.next[k] ?? '';
      if (String(pv) !== String(nv)) changed.push(k);
    }
    if (changed.length) return `Campos alterados: ${changed.join(', ')}`;
    return 'Sem alterações visíveis';
  }

  // Create — show key info
  if (item.action === 'create' && d.entry) {
    const e = d.entry;
    const info = e.cabecalho || e.titulo || '';
    return info ? `Entrada: ${info}` : '';
  }

  // Delete / Restore
  if ((item.action === 'delete' || item.action === 'restore') && d.entry) {
    const e = d.entry;
    const info = e.cabecalho || e.titulo || '';
    return info ? `Entrada: ${info}` : '';
  }

  // Empréstimo / devolução / prorrogação
  if (item.action === 'emprestimo' && d.requisitante) {
    return `Requisitante: ${d.requisitante} · saída ${d.dataSaida || '—'}${d.dataPrevista ? ` · previsto ${d.dataPrevista}` : ''}`;
  }
  if (item.action === 'devolucao') return `Requisitante: ${d.requisitante || '—'} · devolvido em ${d.dataDevolucao || '—'}`;
  if ((item.action === 'prolongar' || item.action === 'emprestimo') && d.alteracoes) {
    return Object.entries(d.alteracoes).map(([k, v]) => `${k}: "${v.de}" → "${v.para}"`).join(' · ');
  }

  // Export — total e critérios
  if (item.action === 'export') {
    const parts = [`${d.total ?? 0} linha(s)`];
    if (d.q) parts.push(`pesquisa: "${d.q}"`);
    const fs = Object.entries(d.filtros || {}).map(([k, v]) => `${k}=${v}`);
    if (fs.length) parts.push(`filtros: ${fs.join(', ')}`);
    return parts.join(' · ');
  }

  // Fallback: try to stringify
  try { return JSON.stringify(d); } catch { return ''; }
}

// ── Entry CRUD ────────────────────────────────────────────────────────────
function openCreateEntry(datasetId, type) {
  resetEntryForm();
  entryFormModal.mode = 'create';
  entryFormModal.type = type;
  entryFormModal.datasetId = datasetId;
  entryFormModal.open = true;
}

function openEditEntry(datasetId, type, entry) {
  resetEntryForm();
  entryFormModal.mode = 'edit';
  entryFormModal.type = type;
  entryFormModal.datasetId = datasetId;
  entryFormModal.originalEntry = entry;
  // populate form
  const fields = ['cabecalho', 'descricao', 'notas', 'localizacao', 'assuntos',
    'cota', 'cdr', 'tb', 'nrRegisto', 'autor', 'ano', 'tipo', 'cor', 'dimensao',
    'titulo', 'local', 'data', 'caixaNr'];
  for (const f of fields) entryFormModal.form[f] = entry[f] || '';
  entryFormModal.open = true;
}

function validateEntryForm() {
  const errors = {};
  const { type, form } = entryFormModal;

  if (type === 'aturb') {
    const requiredFields = {
      titulo: 'Título',
      autor: 'Autor',
      local: 'Local',
      data: 'Data',
      caixaNr: 'Caixa nº',
    };
    for (const [key, label] of Object.entries(requiredFields)) {
      if (!String(form[key] || '').trim()) {
        errors[key] = `${label} é obrigatório.`;
      }
    }
  } else {
    const requiredFields = {
      cabecalho: 'Cabeçalho',
      descricao: 'Descrição',
      cota: 'Cota',
      autor: 'Autor',
    };
    for (const [key, label] of Object.entries(requiredFields)) {
      if (!String(form[key] || '').trim()) {
        errors[key] = `${label} é obrigatório.`;
      }
    }
  }

  return errors;
}

async function saveEntry() {
  // Validate
  const errors = validateEntryForm();
  entryFormModal.errors = errors;
  if (Object.keys(errors).length > 0) {
    addToast('Preencha todos os campos obrigatórios.', 'error');
    return;
  }

  entryFormModal.loading = true;
  try {
    const { mode, type, datasetId, form, originalEntry } = entryFormModal;
    // Normalize: trim all string values, convert numeric fields
    const data = { ...form };
    const numericFields = type === 'aturb' ? ['caixaNr'] : ['nrRegisto'];
    for (const f of numericFields) {
      if (data[f]) data[f] = Number(data[f]) || data[f];
    }

    if (mode === 'create') {
      await apiFetch(`/api/colecoes/${datasetId}/documentos`, { method: 'POST', body: JSON.stringify(data) });
      addToast('Entrada criada com sucesso.', 'success');
    } else {
      await apiFetch(`/api/documentos/${originalEntry.id}`, {
        method: 'PUT', body: JSON.stringify(data),
      });
      addToast('Entrada atualizada com sucesso.', 'success');
    }
    entryFormModal.open = false;
    await loadDatasets();
    if (type === 'cartografia') await loadEntries();
    else await loadAturbEntries();
  } catch (e) { addToast(e.message, 'error'); }
  finally { entryFormModal.loading = false; }
}

async function deleteEntry(datasetId, type, entry) {
  const confirmed = await openModal({
    type: 'confirm',
    title: 'Mover para o lixo',
    message: `"${entry.cabecalho || entry.titulo || 'Entrada ' + entry.sourceEntryNumber}" será movida para o lixo. Pode ser restaurada posteriormente.`,
    confirmLabel: 'Mover para o lixo',
    confirmDanger: true,
  });
  if (!confirmed) return;
  try {
    await apiFetch(`/api/documentos/${entry.id}`, { method: 'DELETE' });
    addToast('Entrada movida para o lixo.', 'success');
    await loadDatasets();
    if (type === 'cartografia') await loadEntries();
    else await loadAturbEntries();
  } catch (e) { addToast(e.message, 'error'); }
}

watch(pageSize, () => {
  page.value = 1;
  aturbPage.value = 1;
  loadEntries();
  loadAturbEntries();
});

onMounted(async () => {
  if (!token.value) return;
  try { await bootstrap(); } catch { logout(); }
});

onBeforeUnmount(() => {
  // cleanup omitted (root component)
});
</script>

<template>
  <!-- ── Toast container ──────────────────────────────────────────────── -->
  <Teleport to="body">
    <div class="toast-container" aria-live="polite">
      <div
        v-for="t in toasts"
        :key="t.id"
        :class="['toast', `toast-${t.type}`]"
        role="alert"
      >
        <span class="toast-dot"></span>
        <span class="toast-msg">{{ t.message }}</span>
        <button class="toast-close" @click="removeToast(t.id)" aria-label="Fechar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>

    <!-- ── Modal ──────────────────────────────────────────────────────── -->
    <div v-if="modal.open" class="modal-backdrop" @click.self="closeModal()" role="dialog" aria-modal="true" :aria-labelledby="'modal-title'">
      <div class="modal-box">
        <div class="modal-header">
          <div v-if="modal.confirmDanger" class="modal-danger-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div class="modal-header-info">
            <h2 class="modal-title" id="modal-title">{{ modal.title }}</h2>
            <p class="modal-message">{{ modal.message }}</p>
          </div>
          <button class="btn btn-ghost btn-icon" @click="closeModal()" aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div v-if="modal.type === 'input' || modal.type === 'password'" class="modal-body">
          <div class="field">
            <label class="field-label">{{ modal.inputLabel }}</label>
            <input
              v-model="modal.inputValue"
              :type="modal.type === 'password' ? 'password' : 'text'"
              :placeholder="modal.inputPlaceholder"
              @keydown.enter="confirmModal"
              @keydown.esc="closeModal()"
              ref="modalInput"
            />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal()">Cancelar</button>
          <button
            :class="['btn', modal.confirmDanger ? 'btn-danger-solid' : 'btn-primary']"
            @click="confirmModal"
          >
            {{ modal.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
    <!-- ── Detalhe das entradas ─────────────────────────────────────────── -->
    <!-- ── Modais de detalhe ─────────────────────────────────────────── -->
    <!-- ── Entry Detail Modal ─────────────────────────────────────────── -->
    <div v-if="entryModal.open" class="modal-backdrop" @click.self="entryModal.open = false" role="dialog" aria-modal="true">
      <div class="modal-box entry-detail-box" style="max-width:900px;width:96vw">
        <div class="modal-header">
          <div class="modal-header-info">
            <h2 class="modal-title">{{ entryModal.entry?.cabecalho }}</h2>
            <p class="modal-message">Nº Registo: <strong>{{ entryModal.entry?.nrRegisto }}</strong> &middot; {{ entryModal.entry?.cota || '' }}</p>
          </div>
          <button class="btn btn-ghost btn-icon" @click="entryModal.open = false" aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body entry-detail-body">
          <!-- Descrição full width -->
          <div class="entry-field entry-field--full">
            <span class="entry-field-label">Descrição</span>
            <span class="entry-field-value">{{ entryModal.entry?.descricao || '—' }}</span>
          </div>
          <!-- 2-col grid -->
          <div class="entry-detail-grid">
            <div class="entry-field">
              <span class="entry-field-label">Assuntos</span>
              <span class="entry-field-value">{{ entryModal.entry?.assuntos || '—' }}</span>
            </div>
            <div class="entry-field">
              <span class="entry-field-label">Localização</span>
              <span class="entry-field-value">{{ entryModal.entry?.localizacao || '—' }}</span>
            </div>
            <div class="entry-field">
              <span class="entry-field-label">Notas</span>
              <span class="entry-field-value">{{ entryModal.entry?.notas || '—' }}</span>
            </div>
            <div class="entry-field">
              <span class="entry-field-label">Cota</span>
              <span class="entry-field-value entry-field-mono">{{ entryModal.entry?.cota || '—' }}</span>
            </div>
            <div class="entry-field">
              <span class="entry-field-label">CDR</span>
              <span class="entry-field-value entry-field-mono">{{ entryModal.entry?.cdr || '—' }}</span>
            </div>
            <div class="entry-field">
              <span class="entry-field-label">TB</span>
              <span class="entry-field-value entry-field-mono">{{ entryModal.entry?.tb || '—' }}</span>
            </div>
          </div>
          <!-- Metadata strip -->
          <div class="entry-meta-strip">
            <div class="entry-meta-item">
              <span class="entry-field-label">Autor</span>
              <span>{{ entryModal.entry?.autor || '—' }}</span>
            </div>
            <div class="entry-meta-item">
              <span class="entry-field-label">Ano</span>
              <span>{{ entryModal.entry?.ano || '—' }}</span>
            </div>
            <div class="entry-meta-item">
              <span class="entry-field-label">Tipo</span>
              <span>{{ entryModal.entry?.tipo || '—' }}</span>
            </div>
            <div class="entry-meta-item">
              <span class="entry-field-label">Cor</span>
              <span>{{ entryModal.entry?.cor || '—' }}</span>
            </div>
            <div class="entry-meta-item">
              <span class="entry-field-label">Dimensão</span>
              <span>{{ entryModal.entry?.dimensao || '—' }}</span>
            </div>
            <div class="entry-meta-item">
              <span class="entry-field-label">Estado</span>
              <EstadoControlo v-if="entryModal.entry" :entry="entryModal.entry" :can-edit="canEditEstado" :api="apiFetch" @changed="onEmprestimoAlterado" @erro="addToast($event, 'error')" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="entryModal.open = false">Fechar</button>
        </div>
      </div>
    </div>
    <!-- ── ATURB Entry Detail Modal ───────────────────────────────────── -->
    <div v-if="aturbEntryModal.open" class="modal-backdrop" @click.self="aturbEntryModal.open = false" role="dialog" aria-modal="true">
      <div class="modal-box entry-detail-box" style="max-width:760px;width:96vw">
        <div class="modal-header">
          <div class="modal-header-info">
            <h2 class="modal-title">{{ aturbEntryModal.entry?.titulo }}</h2>
            <p class="modal-message">Caixa nº <strong>{{ aturbEntryModal.entry?.caixaNr || '—' }}</strong></p>
          </div>
          <button class="btn btn-ghost btn-icon" @click="aturbEntryModal.open = false" aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body entry-detail-body">
          <div class="entry-field entry-field--full">
            <span class="entry-field-label">Título</span>
            <span class="entry-field-value">{{ aturbEntryModal.entry?.titulo || '—' }}</span>
          </div>
          <div class="entry-detail-grid">
            <div class="entry-field">
              <span class="entry-field-label">Autor</span>
              <span class="entry-field-value">{{ aturbEntryModal.entry?.autor || '—' }}</span>
            </div>
            <div class="entry-field">
              <span class="entry-field-label">Local</span>
              <span class="entry-field-value">{{ aturbEntryModal.entry?.local || '—' }}</span>
            </div>
            <div class="entry-field">
              <span class="entry-field-label">Data</span>
              <span class="entry-field-value entry-field-mono">{{ aturbEntryModal.entry?.data || '—' }}</span>
            </div>
            <div class="entry-field">
              <span class="entry-field-label">Caixa nº</span>
              <span class="entry-field-value entry-field-mono">{{ aturbEntryModal.entry?.caixaNr || '—' }}</span>
            </div>
          </div>
          <div class="entry-meta-strip">
            <div class="entry-meta-item">
              <span class="entry-field-label">Estado</span>
              <EstadoControlo v-if="aturbEntryModal.entry" :entry="aturbEntryModal.entry" :can-edit="canEditEstado" :api="apiFetch" @changed="onEmprestimoAlterado" @erro="addToast($event, 'error')" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <div style="display:flex;gap:8px;">
            <button v-if="canManageEntries && aturbEntryModal.entry" class="btn btn-secondary btn-sm" type="button" @click="openEditEntry(aturbSelectedDatasetId, 'aturb', aturbEntryModal.entry); aturbEntryModal.open = false">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Editar
            </button>
            <button v-if="canManageEntries && aturbEntryModal.entry" class="btn btn-danger btn-sm" type="button" @click="deleteEntry(aturbSelectedDatasetId, 'aturb', aturbEntryModal.entry); aturbEntryModal.open = false">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              Eliminar
            </button>
          </div>
          <button class="btn btn-secondary" @click="aturbEntryModal.open = false">Fechar</button>
        </div>
      </div>
    </div>
  <!-- ── Entry form modal (create / edit) ─────────────────────────────── -->
  <div v-if="entryFormModal.open" class="modal-backdrop" @click.self="entryFormModal.open = false" role="dialog" aria-modal="true">
    <div class="modal-box" style="max-width:680px;max-height:90vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <div class="modal-header-info">
          <h2 class="modal-title">{{ entryFormModal.mode === 'create' ? 'Nova entrada' : 'Editar entrada' }}</h2>
          <p class="modal-message">{{ entryFormModal.type === 'aturb' ? 'Arquivo Técnico de Urbanismo' : 'Cartografia' }}</p>
        </div>
        <button class="modal-close-btn" type="button" @click="entryFormModal.open = false" aria-label="Fechar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body" style="overflow-y:auto;flex:1;">

        <!-- ATURB fields -->
        <template v-if="entryFormModal.type === 'aturb'">
          <div class="field-grid">
            <div class="field">
              <label class="field-label">Autor <span style="color:var(--danger)">*</span></label>
              <input type="text" :class="['input', entryFormModal.errors.autor ? 'input-error' : '']" v-model="entryFormModal.form.autor" placeholder="ex. Arq. José da Silva" />
              <span v-if="entryFormModal.errors.autor" class="field-error">{{ entryFormModal.errors.autor }}</span>
            </div>
            <div class="field">
              <label class="field-label">Data <span style="color:var(--danger)">*</span></label>
              <input type="text" :class="['input', entryFormModal.errors.data ? 'input-error' : '']" v-model="entryFormModal.form.data" placeholder="ex. 1964" />
              <span v-if="entryFormModal.errors.data" class="field-error">{{ entryFormModal.errors.data }}</span>
            </div>
            <div class="field">
              <label class="field-label">Local <span style="color:var(--danger)">*</span></label>
              <input type="text" :class="['input', entryFormModal.errors.local ? 'input-error' : '']" v-model="entryFormModal.form.local" placeholder="ex. Rua Augusta, Lisboa" />
              <span v-if="entryFormModal.errors.local" class="field-error">{{ entryFormModal.errors.local }}</span>
            </div>
            <div class="field">
              <label class="field-label">Caixa nº <span style="color:var(--danger)">*</span></label>
              <input type="text" :class="['input', entryFormModal.errors.caixaNr ? 'input-error' : '']" v-model="entryFormModal.form.caixaNr" placeholder="ex. 42" />
              <span v-if="entryFormModal.errors.caixaNr" class="field-error">{{ entryFormModal.errors.caixaNr }}</span>
            </div>
          </div>
          <div class="field">
            <label class="field-label">Título <span style="color:var(--danger)">*</span></label>
            <textarea :class="['input', entryFormModal.errors.titulo ? 'input-error' : '']" rows="3" v-model="entryFormModal.form.titulo" placeholder="ex. Projecto de alterações ao prédio sito na Rua Augusta nº 25"></textarea>
            <span v-if="entryFormModal.errors.titulo" class="field-error">{{ entryFormModal.errors.titulo }}</span>
          </div>
        </template>

        <!-- Cartografia fields -->
        <template v-else>
          <div class="field">
            <label class="field-label">Cabeçalho <span style="color:var(--danger)">*</span></label>
            <input type="text" :class="['input', entryFormModal.errors.cabecalho ? 'input-error' : '']" v-model="entryFormModal.form.cabecalho" placeholder="ex. Planta topográfica de Lisboa" />
            <span v-if="entryFormModal.errors.cabecalho" class="field-error">{{ entryFormModal.errors.cabecalho }}</span>
          </div>
          <div class="field">
            <label class="field-label">Descrição <span style="color:var(--danger)">*</span></label>
            <textarea :class="['input', entryFormModal.errors.descricao ? 'input-error' : '']" rows="3" v-model="entryFormModal.form.descricao" placeholder="ex. Planta topográfica da cidade de Lisboa na escala 1:1000"></textarea>
            <span v-if="entryFormModal.errors.descricao" class="field-error">{{ entryFormModal.errors.descricao }}</span>
          </div>
          <div class="field-grid">
            <div class="field">
              <label class="field-label">Nr. de Registo</label>
              <input type="text" :class="['input', entryFormModal.errors.nrRegisto ? 'input-error' : '']" v-model="entryFormModal.form.nrRegisto" placeholder="ex. 1234" />
              <span v-if="entryFormModal.errors.nrRegisto" class="field-error">{{ entryFormModal.errors.nrRegisto }}</span>
            </div>
            <div class="field">
              <label class="field-label">CDR</label>
              <input type="text" :class="['input', entryFormModal.errors.cdr ? 'input-error' : '']" v-model="entryFormModal.form.cdr" placeholder="ex. CDR  23 CMLEO" />
              <span v-if="entryFormModal.errors.cdr" class="field-error">{{ entryFormModal.errors.cdr }}</span>
            </div>
            <div class="field">
              <label class="field-label">TB</label>
              <input type="text" :class="['input', entryFormModal.errors.tb ? 'input-error' : '']" v-model="entryFormModal.form.tb" placeholder="ex. TB  12 CMLEO" />
              <span v-if="entryFormModal.errors.tb" class="field-error">{{ entryFormModal.errors.tb }}</span>
            </div>
            <div class="field">
              <label class="field-label">Cota <span style="color:var(--danger)">*</span></label>
              <input type="text" :class="['input', entryFormModal.errors.cota ? 'input-error' : '']" v-model="entryFormModal.form.cota" placeholder="ex. Cota: MP 446 CMLEO" />
              <span v-if="entryFormModal.errors.cota" class="field-error">{{ entryFormModal.errors.cota }}</span>
            </div>
            <div class="field">
              <label class="field-label">Autor <span style="color:var(--danger)">*</span></label>
              <input type="text" :class="['input', entryFormModal.errors.autor ? 'input-error' : '']" v-model="entryFormModal.form.autor" placeholder="ex. Filipe Folque" />
              <span v-if="entryFormModal.errors.autor" class="field-error">{{ entryFormModal.errors.autor }}</span>
            </div>
            <div class="field">
              <label class="field-label">Ano</label>
              <input type="text" :class="['input', entryFormModal.errors.ano ? 'input-error' : '']" v-model="entryFormModal.form.ano" placeholder="ex. 1856" />
              <span v-if="entryFormModal.errors.ano" class="field-error">{{ entryFormModal.errors.ano }}</span>
            </div>
            <div class="field">
              <label class="field-label">Tipo</label>
              <input type="text" :class="['input', entryFormModal.errors.tipo ? 'input-error' : '']" v-model="entryFormModal.form.tipo" placeholder="ex. Planta" />
              <span v-if="entryFormModal.errors.tipo" class="field-error">{{ entryFormModal.errors.tipo }}</span>
            </div>
            <div class="field">
              <label class="field-label">Cor</label>
              <input type="text" :class="['input', entryFormModal.errors.cor ? 'input-error' : '']" v-model="entryFormModal.form.cor" placeholder="ex. Policromia" />
              <span v-if="entryFormModal.errors.cor" class="field-error">{{ entryFormModal.errors.cor }}</span>
            </div>
            <div class="field">
              <label class="field-label">Dimensão</label>
              <input type="text" :class="['input', entryFormModal.errors.dimensao ? 'input-error' : '']" v-model="entryFormModal.form.dimensao" placeholder="ex. 60x90 cm" />
              <span v-if="entryFormModal.errors.dimensao" class="field-error">{{ entryFormModal.errors.dimensao }}</span>
            </div>
          </div>
          <div class="field">
            <label class="field-label">Localização</label>
            <input type="text" :class="['input', entryFormModal.errors.localizacao ? 'input-error' : '']" v-model="entryFormModal.form.localizacao" placeholder="ex. Gaveta 3, Armário B" />
            <span v-if="entryFormModal.errors.localizacao" class="field-error">{{ entryFormModal.errors.localizacao }}</span>
          </div>
          <div class="field">
            <label class="field-label">Assuntos</label>
            <textarea :class="['input', entryFormModal.errors.assuntos ? 'input-error' : '']" rows="2" v-model="entryFormModal.form.assuntos" placeholder="ex. Topografia; Urbanismo; Infraestruturas"></textarea>
            <span v-if="entryFormModal.errors.assuntos" class="field-error">{{ entryFormModal.errors.assuntos }}</span>
          </div>
          <div class="field">
            <label class="field-label">Notas</label>
            <textarea :class="['input', entryFormModal.errors.notas ? 'input-error' : '']" rows="2" v-model="entryFormModal.form.notas" placeholder="ex. Documento em bom estado de conservação"></textarea>
            <span v-if="entryFormModal.errors.notas" class="field-error">{{ entryFormModal.errors.notas }}</span>
          </div>
        </template>

      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" type="button" @click="entryFormModal.open = false">Cancelar</button>
        <button class="btn btn-primary" type="button" :disabled="entryFormModal.loading" @click="saveEntry()">
          <span v-if="entryFormModal.loading">A guardar…</span>
          <span v-else>{{ entryFormModal.mode === 'create' ? 'Criar entrada' : 'Guardar alterações' }}</span>
        </button>
      </div>
    </div>
  </div>

  </Teleport>

  <!-- ── Login page ────────────────────────────────────────────────────── -->
  <div v-if="!token" class="login-page">
    <div class="login-side">
      <div class="login-box">
        <div class="login-header">
          <div class="login-logo">
            <div class="login-logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            </div>
            <span class="login-logo-text">SIGAT</span>
          </div>
          <h1>Bem-vindo de volta</h1>
          <p>Sistema de Informação Cartográfica — introduza as suas credenciais para continuar.</p>
        </div>

        <form class="login-form" @submit.prevent="login">
          <div class="field">
            <label class="field-label required" for="login-username">Username</label>
            <input id="login-username" v-model="loginForm.username" required placeholder="admin" autocomplete="username" />
          </div>
          <div class="field">
            <label class="field-label required" for="login-password">Password</label>
            <input id="login-password" v-model="loginForm.password" required type="password" placeholder="••••••••" autocomplete="current-password" />
          </div>
          <button class="btn btn-primary btn-full" type="submit" :disabled="loginLoading">
            <span v-if="loginLoading" class="spinner spinner-sm"></span>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            {{ loginLoading ? 'A autenticar...' : 'Entrar' }}
          </button>
        </form>

      </div>
    </div>

    <div class="login-visual" aria-hidden="true">
      <div class="login-visual-content">
        <h2>Cartografia Digital</h2>
        <p>Gerencie e pesquise entradas cartográficas de forma eficiente, segura e centralizada.</p>
      </div>
      <div class="login-visual-cards">
        <div class="login-visual-card">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
          Upload e validação de dados
        </div>
        <div class="login-visual-card">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Pesquisa avançada por campos
        </div>
        <div class="login-visual-card">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>
          Controlo de acessos por role
        </div>
      </div>
    </div>
  </div>

  <!-- ── App layout ────────────────────────────────────────────────────── -->
  <div v-else :class="['app-layout', { 'sidebar-is-collapsed': sidebarCollapsed }]">
    <!-- Sidebar -->
    <aside :class="['sidebar', { 'sidebar-collapsed': sidebarCollapsed }]">
      <div class="sidebar-logo">
        <div class="sidebar-logo-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
        </div>
        <span v-if="!sidebarCollapsed" class="sidebar-logo-text">SIGAT</span>
        <span v-if="!sidebarCollapsed" class="sidebar-logo-badge">GEO</span>
        <button class="sidebar-collapse-btn" type="button"
          :title="sidebarCollapsed ? 'Expandir menu' : 'Colapsar menu'"
          :aria-label="sidebarCollapsed ? 'Expandir menu' : 'Colapsar menu'"
          @click="sidebarCollapsed = !sidebarCollapsed">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline :points="sidebarCollapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6'"/>
          </svg>
        </button>
      </div>

      <nav class="sidebar-nav" aria-label="Navegação principal">
        <span v-if="!sidebarCollapsed" class="sidebar-section-label">Menu</span>

        <button
          type="button"
          :class="['nav-btn', { active: currentPage === 'painel', 'nav-btn-collapsed': sidebarCollapsed }]"
          @click="switchPage('painel')"
          :title="sidebarCollapsed ? 'Painel' : ''"
        >
          <span class="nav-btn-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
          </span>
          <span v-if="!sidebarCollapsed">Painel</span>
        </button>

        <button
          type="button"
          :class="['nav-btn', { active: currentPage === 'search', 'nav-btn-collapsed': sidebarCollapsed }]"
          @click="switchPage('search')"
          :title="sidebarCollapsed ? 'Cartografia' : ''"
        >
          <span class="nav-btn-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <span v-if="!sidebarCollapsed">Cartografia</span>
        </button>

        <button
          type="button"
          :class="['nav-btn', { active: currentPage === 'aturb', 'nav-btn-collapsed': sidebarCollapsed }]"
          @click="switchPage('aturb')"
          :title="sidebarCollapsed ? 'ATURB' : ''"
        >
          <span class="nav-btn-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </span>
          <span v-if="!sidebarCollapsed">Arquivo Técnico de Urbanismo (ATURB)</span>
        </button>

        <button
          v-if="canAccessSources"
          type="button"
          :class="['nav-btn', { active: currentPage === 'sources', 'nav-btn-collapsed': sidebarCollapsed }]"
          @click="switchPage('sources')"
          :title="sidebarCollapsed ? 'Importações' : ''"
        >
          <span class="nav-btn-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
          </span>
          <span v-if="!sidebarCollapsed">Importações</span>
        </button>

        <button
          type="button"
          :class="['nav-btn', { active: currentPage === 'emprestimos', 'nav-btn-collapsed': sidebarCollapsed }]"
          @click="switchPage('emprestimos')"
          :title="sidebarCollapsed ? 'Empréstimos' : ''"
          style="position:relative"
        >
          <span class="nav-btn-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          </span>
          <span v-if="!sidebarCollapsed">Empréstimos</span>
          <span v-if="resumoEmprestimos.emAtraso > 0" :class="['cart-badge', { 'cart-badge-collapsed': sidebarCollapsed }]" style="background:var(--danger, #dc2626)" title="Empréstimos em atraso">{{ resumoEmprestimos.emAtraso }}</span>
        </button>

        <button
          v-if="isAdmin"
          type="button"
          :class="['nav-btn', { active: currentPage === 'accounts', 'nav-btn-collapsed': sidebarCollapsed }]"
          @click="switchPage('accounts')"
          :title="sidebarCollapsed ? 'Gestão de Contas' : ''"
        >
          <span class="nav-btn-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </span>
          <span v-if="!sidebarCollapsed">Gestão de Contas</span>
        </button>

        <div v-if="!sidebarCollapsed" class="sidebar-divider"></div>
        <span v-if="!sidebarCollapsed" class="sidebar-section-label">Ferramentas</span>

        <!-- Impressão PDF -->
        <button
          type="button"
          :class="['nav-btn', { active: currentPage === 'cart', 'nav-btn-collapsed': sidebarCollapsed }]"
          @click="switchPage('cart')"
          :title="sidebarCollapsed ? 'Impressão PDF' : ''"
          style="position:relative"
        >
          <span class="nav-btn-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          </span>
          <span v-if="!sidebarCollapsed">Impressão PDF</span>
          <span v-if="cartCount > 0" :class="['cart-badge', { 'cart-badge-collapsed': sidebarCollapsed }]">{{ cartCount }}</span>
        </button>

        <!-- Bin (write/admin) -->
        <button
          v-if="canManageEntries"
          type="button"
          :class="['nav-btn', { active: currentPage === 'bin', 'nav-btn-collapsed': sidebarCollapsed }]"
          @click="switchPage('bin')"
          :title="sidebarCollapsed ? 'Lixo' : ''"
        >
          <span class="nav-btn-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </span>
          <span v-if="!sidebarCollapsed">Lixo</span>
        </button>

        <!-- History (write/admin) -->
        <button
          v-if="canManageEntries"
          type="button"
          :class="['nav-btn', { active: currentPage === 'history', 'nav-btn-collapsed': sidebarCollapsed }]"
          @click="switchPage('history')"
          :title="sidebarCollapsed ? 'Histórico' : ''"
        >
          <span class="nav-btn-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4"/><polyline points="3 16 3 11 8 11"/></svg>
          </span>
          <span v-if="!sidebarCollapsed">Histórico</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <div v-if="!sidebarCollapsed" class="sidebar-user">
          <div class="sidebar-user-avatar">{{ userInitials }}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">{{ user?.username }}</div>
            <div class="sidebar-user-role">{{ user?.role }}</div>
          </div>
        </div>
        <button class="btn-logout" :class="{ 'btn-logout-collapsed': sidebarCollapsed }" type="button" @click="logout" :title="sidebarCollapsed ? 'Terminar sessão' : ''">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span v-if="!sidebarCollapsed">Terminar sessão</span>
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <main class="main-content">
      <header class="topbar">
        <h1>{{ activePageTitle }}</h1>
        <div class="topbar-separator"></div>
        <span v-if="currentPage === 'search' && selectedDataset" class="topbar-meta">
          {{ selectedDataset.name }} · {{ totalEntries.toLocaleString('pt-PT') }} resultados
        </span>
        <span v-else-if="currentPage === 'aturb' && aturbSelectedDataset" class="topbar-meta">
          {{ aturbSelectedDataset.name }} · {{ aturbTotalEntries.toLocaleString('pt-PT') }} resultados
        </span>
        <span v-else-if="currentPage === 'accounts'" class="topbar-meta">
          {{ users.length }} utilizador{{ users.length !== 1 ? 'es' : '' }}
        </span>
        <span v-else-if="currentPage === 'cart'" class="topbar-meta">
          {{ cartCount }} entrada{{ cartCount !== 1 ? 's' : '' }} selecionada{{ cartCount !== 1 ? 's' : '' }}
        </span>
        <div class="topbar-spacer"></div>
        <!-- Cart shortcut in topbar -->
        <button v-if="currentPage !== 'cart'" class="btn btn-secondary btn-sm topbar-cart-btn" type="button" @click="switchPage('cart')" title="Ver lista para PDF">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="16" y1="11" x2="8" y2="11"/><line x1="16" y1="15" x2="8" y2="15"/><line x1="12" y1="19" x2="8" y2="19"/></svg>
          <span v-if="cartCount > 0" class="topbar-cart-count">{{ cartCount }}</span>
        </button>
      </header>

      <div class="page-body">

        <!-- Alertas de empréstimos -->
        <div v-if="(resumoEmprestimos.emAtraso > 0 || resumoEmprestimos.aVencer7dias > 0) && currentPage !== 'emprestimos'" class="alerta-emprestimos" role="status">
          <span>
            <strong v-if="resumoEmprestimos.emAtraso > 0">{{ resumoEmprestimos.emAtraso }} empréstimo{{ resumoEmprestimos.emAtraso > 1 ? 's' : '' }} em atraso</strong>
            <template v-if="resumoEmprestimos.emAtraso > 0 && resumoEmprestimos.aVencer7dias > 0"> · </template>
            <span v-if="resumoEmprestimos.aVencer7dias > 0">{{ resumoEmprestimos.aVencer7dias }} vence{{ resumoEmprestimos.aVencer7dias > 1 ? 'm' : '' }} nos próximos 7 dias</span>
          </span>
          <button class="btn btn-secondary btn-sm" type="button" @click="switchPage('emprestimos')">Ver empréstimos</button>
        </div>

        <!-- ── Empréstimos page ── -->
        <section v-if="currentPage === 'painel'">
          <Painel :api="apiFetch" @pesquisar="abrirPesquisaDoPainel" @emprestimos="abrirEmprestimosDoPainel" @erro="addToast($event, 'error')" />
        </section>

        <section v-if="currentPage === 'emprestimos'">
          <Emprestimos
            ref="emprestimosRef"
            :api="apiFetch"
            :token="token"
            :can-edit="canEditEstado"
            :resumo="resumoEmprestimos"
            @changed="onEmprestimoAlterado"
            @abrir="abrirDocumento"
            @ok="addToast($event, 'success')"
            @erro="addToast($event, 'error')"
          />
        </section>

        <!-- ── Search page ──────────────────────────────────────────────── -->
        <section v-if="currentPage === 'search'">
          <!-- Search form card -->
          <div class="card" style="margin-bottom: 20px;">
            <div class="card-header">
              <div class="card-header-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <div>
                <p class="card-title">Pesquisa de Entradas</p>
                <p class="card-subtitle">Pesquise por qualquer campo</p>
              </div>
            </div>
            <div class="card-body">
              <form @submit.prevent="searchEntries">
                <!-- Search input + buttons inline -->
                <div class="search-inline-row" style="margin-bottom: 12px;">
                  <div class="field" style="flex: 1; min-width: 0;">
                    <label class="field-label" for="search-q">Pesquisa livre</label>
                    <input id="search-q" v-model="filters.q" list="suggest-q" placeholder="Ex: Avenida da Liberdade..." :disabled="!selectedDatasetId" />
                    <datalist id="suggest-q"><option v-for="s in qSuggestions" :key="s" :value="s" /></datalist>
                    <p class="field-hint" style="margin:4px 0 0;font-size:11px;color:var(--muted);">Ignora acentos e maiúsculas; aceita partes de palavras. Use "aspas" para uma frase exata e -termo para excluir.</p>
                  </div>
                  <div class="search-inline-actions">
                    <button class="btn btn-primary" type="submit" :disabled="!selectedDatasetId || entriesLoading">
                      <span v-if="entriesLoading" class="spinner spinner-sm"></span>
                      <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      Pesquisar
                    </button>
                    <button
                      class="btn btn-secondary"
                      type="button"
                      :disabled="!selectedDatasetId"
                      @click="showAdvancedFilters = !showAdvancedFilters"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                      {{ showAdvancedFilters ? 'Ocultar' : 'Filtros avançados' }}
                      <span v-if="hasActiveFilters && !showAdvancedFilters" style="width:6px;height:6px;border-radius:50%;background:var(--primary);flex-shrink:0;"></span>
                    </button>
                    <button v-if="hasActiveFilters" class="btn btn-ghost btn-sm" type="button" @click="clearSearch">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      Limpar
                    </button>
                  </div>
                </div>

                <!-- Advanced filters -->
                <div v-if="showAdvancedFilters" class="advanced-filters" style="margin-bottom: 4px;">
                  <div class="advanced-filters-section">
                    <p class="advanced-filters-label">Campos bibliográficos</p>
                    <div class="advanced-filters-grid">
                      <div class="field"><label class="field-label">Cabeçalho</label><input v-model="filters.cabecalho" list="suggest-cabecalho" placeholder="Cabeçalho" :disabled="!selectedDatasetId" /><datalist id="suggest-cabecalho"><option v-for="s in filterSuggestions.cabecalho" :key="s" :value="s" /></datalist></div>
                      <div class="field"><label class="field-label">Descrição</label><input v-model="filters.descricao" list="suggest-descricao" placeholder="Descrição" :disabled="!selectedDatasetId" /><datalist id="suggest-descricao"><option v-for="s in filterSuggestions.descricao" :key="s" :value="s" /></datalist></div>
                      <div class="field"><label class="field-label">Notas</label><input v-model="filters.notas" list="suggest-notas" placeholder="Notas" :disabled="!selectedDatasetId" /><datalist id="suggest-notas"><option v-for="s in filterSuggestions.notas" :key="s" :value="s" /></datalist></div>
                      <div class="field"><label class="field-label">Localização</label><input v-model="filters.localizacao" list="suggest-localizacao" placeholder="Localização" :disabled="!selectedDatasetId" /><datalist id="suggest-localizacao"><option v-for="s in filterSuggestions.localizacao" :key="s" :value="s" /></datalist></div>
                      <div class="field"><label class="field-label">Assuntos</label><input v-model="filters.assuntos" list="suggest-assuntos" placeholder="Assuntos" :disabled="!selectedDatasetId" /><datalist id="suggest-assuntos"><option v-for="s in filterSuggestions.assuntos" :key="s" :value="s" /></datalist></div>
                      <div class="field"><label class="field-label">Cota</label><input v-model="filters.cota" list="suggest-cota" placeholder="Cota" :disabled="!selectedDatasetId" /><datalist id="suggest-cota"><option v-for="s in filterSuggestions.cota" :key="s" :value="s" /></datalist></div>
                      <div class="field"><label class="field-label">CDR</label><input v-model="filters.cdr" list="suggest-cdr" placeholder="CDR" :disabled="!selectedDatasetId" /><datalist id="suggest-cdr"><option v-for="s in filterSuggestions.cdr" :key="s" :value="s" /></datalist></div>
                      <div class="field"><label class="field-label">TB</label><input v-model="filters.tb" list="suggest-tb" placeholder="TB" :disabled="!selectedDatasetId" /><datalist id="suggest-tb"><option v-for="s in filterSuggestions.tb" :key="s" :value="s" /></datalist></div>
                      <div class="field"><label class="field-label">Nº Registo</label><input v-model="filters.nrRegisto" list="suggest-nrRegisto" placeholder="Nº" :disabled="!selectedDatasetId" /><datalist id="suggest-nrRegisto"><option v-for="s in filterSuggestions.nrRegisto" :key="s" :value="s" /></datalist></div>
                      <div class="field">
                        <label class="field-label">Estado</label>
                        <select v-model="filters.estado" :disabled="!selectedDatasetId">
                          <option value="">— Todos —</option>
                          <option v-for="s in ESTADO_OPTIONS" :key="s" :value="s">{{ s }}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>

          <!-- Results card -->
          <div class="card">
            <div v-if="!selectedDatasetId" class="table-wrap" style="border: none;">
              <div class="empty-state">
                <div class="empty-state-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                </div>
                <h3>Nenhuma fonte selecionada</h3>
                <p>Selecione uma fonte de dados no formulário acima para visualizar e pesquisar entradas cartográficas.</p>
              </div>
            </div>

            <template v-else>
              <div class="search-meta-bar" style="border-radius: var(--radius-lg) var(--radius-lg) 0 0; border-bottom: 1px solid var(--border); border-top: none; border-left: none; border-right: none;">
                <span>{{ selectedDataset?.name }}</span>
                <span>{{ totalEntries.toLocaleString('pt-PT') }} resultado{{ totalEntries !== 1 ? 's' : '' }}</span>
                <span v-if="filters.vazios" class="badge" title="Filtro vindo do painel">Campo vazio: {{ filters.vazios }}</span>
                <span v-if="filters.emprestimo" class="badge" title="Filtro vindo do painel">Empréstimos: {{ filters.emprestimo === 'atraso' ? 'em atraso' : 'ativos' }}</span>
                <span v-if="filters.q.trim() && ordenacao === 'relevancia'" class="badge" title="Resultados ordenados pela relevância da pesquisa. Clique num cabeçalho para ordenar por coluna.">Ordenado por relevância</span>
                <button v-else-if="filters.q.trim() && sortKeys.length" class="btn btn-ghost btn-sm" type="button" @click="sortKeys = []; page = 1; loadEntries()">Voltar à ordenação por relevância</button>
                <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
                  <ExportarBotao :url="`/api/colecoes/${selectedDatasetId}/exportar`" :get-params="buildEntriesQuery" :token="token" :disabled="totalEntries === 0" @ok="addToast($event, 'success')" @erro="addToast($event, 'error')" />
                  <button v-if="canManageEntries" class="btn btn-primary btn-sm" type="button" @click="openCreateEntry(selectedDatasetId, 'cartografia')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Adicionar entrada
                  </button>
                </div>
              </div>

              <div class="table-wrap" style="border: none; border-radius: 0; position: relative; overflow-x: auto;">
                <div v-if="entriesLoading" class="table-loading-overlay">
                  <div class="spinner"></div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th style="width:36px;padding:10px 8px;text-align:center;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" title="Impressão PDF"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      </th>
                      <th class="th-sortable" style="min-width:160px" @click="setSort('cabecalho', $event)">
                        Cabeçalho
                        <span class="sort-icon" :class="{ active: !!getSortEntry('cabecalho'), desc: getSortEntry('cabecalho')?.dir === 'desc' }">
                          <span v-if="sortKeys.length > 1 && getSortEntry('cabecalho')" class="sort-badge">{{ getSortEntry('cabecalho').idx + 1 }}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </span>
                      </th>
                      <th class="th-sortable" style="min-width:260px;width:35%" @click="setSort('descricao', $event)">
                        Descrição
                        <span class="sort-icon" :class="{ active: !!getSortEntry('descricao'), desc: getSortEntry('descricao')?.dir === 'desc' }">
                          <span v-if="sortKeys.length > 1 && getSortEntry('descricao')" class="sort-badge">{{ getSortEntry('descricao').idx + 1 }}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </span>
                      </th>
                      <th class="th-sortable" style="min-width:160px" @click="setSort('assuntos', $event)">
                        Assuntos
                        <span class="sort-icon" :class="{ active: !!getSortEntry('assuntos'), desc: getSortEntry('assuntos')?.dir === 'desc' }">
                          <span v-if="sortKeys.length > 1 && getSortEntry('assuntos')" class="sort-badge">{{ getSortEntry('assuntos').idx + 1 }}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </span>
                      </th>
                      <th class="th-sortable" @click="setSort('cota', $event)" title="Ordenar por número extraído">
                        Cota
                        <span class="sort-icon" :class="{ active: !!getSortEntry('cota'), desc: getSortEntry('cota')?.dir === 'desc' }">
                          <span v-if="sortKeys.length > 1 && getSortEntry('cota')" class="sort-badge">{{ getSortEntry('cota').idx + 1 }}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </span>
                      </th>
                      <th class="th-sortable" @click="setSort('cdr', $event)" title="Ordenar por número extraído">
                        CDR
                        <span class="sort-icon" :class="{ active: !!getSortEntry('cdr'), desc: getSortEntry('cdr')?.dir === 'desc' }">
                          <span v-if="sortKeys.length > 1 && getSortEntry('cdr')" class="sort-badge">{{ getSortEntry('cdr').idx + 1 }}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </span>
                      </th>
                      <th class="th-sortable" @click="setSort('tb', $event)" title="Ordenar por número extraído">
                        TB
                        <span class="sort-icon" :class="{ active: !!getSortEntry('tb'), desc: getSortEntry('tb')?.dir === 'desc' }">
                          <span v-if="sortKeys.length > 1 && getSortEntry('tb')" class="sort-badge">{{ getSortEntry('tb').idx + 1 }}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </span>
                      </th>
                      <th class="th-sortable" style="min-width:160px" @click="setSort('localizacao', $event)">
                        Localização
                        <span class="sort-icon" :class="{ active: !!getSortEntry('localizacao'), desc: getSortEntry('localizacao')?.dir === 'desc' }">
                          <span v-if="sortKeys.length > 1 && getSortEntry('localizacao')" class="sort-badge">{{ getSortEntry('localizacao').idx + 1 }}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </span>
                      </th>
                      <th class="th-sortable" @click="setSort('nrRegisto', $event)" title="Ordenar como número">
                        Nº Reg.
                        <span class="sort-icon" :class="{ active: !!getSortEntry('nrRegisto'), desc: getSortEntry('nrRegisto')?.dir === 'desc' }">
                          <span v-if="sortKeys.length > 1 && getSortEntry('nrRegisto')" class="sort-badge">{{ getSortEntry('nrRegisto').idx + 1 }}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </span>
                      </th>
                      <th style="min-width:150px">Estado</th>
                      <th v-if="canManageEntries" style="min-width:100px">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="entries.length === 0 && !entriesLoading">
                      <td :colspan="canManageEntries ? 11 : 10">
                        <div class="empty-state">
                          <div class="empty-state-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                          </div>
                          <h3>Sem resultados</h3>
                          <p>Nenhuma entrada corresponde aos filtros aplicados. Tente ajustar os critérios de pesquisa.</p>
                        </div>
                      </td>
                    </tr>
                    <tr v-for="(entry, i) in sortedEntries" :key="`${entry.nrRegisto}-${i}`" class="tr-clickable" @click="openEntryModal(entry)">
                      <td style="text-align:center;padding:8px;" @click.stop>
                        <button
                          :class="['cart-checkbox-btn', { 'in-cart': isInCart(selectedDatasetId, entry) }]"
                          type="button"
                          :title="isInCart(selectedDatasetId, entry) ? 'Remover da impressão' : 'Adicionar à impressão PDF'"
                          @click="toggleCart(selectedDatasetId, 'cartografia', entry)"
                        >
                          <svg v-if="isInCart(selectedDatasetId, entry)" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polyline points="20 6 9 17 4 12"/></svg>
                          <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        </button>
                      </td>
                      <td><span class="cell-clamp" :title="entry.cabecalho">{{ entry.cabecalho }}</span></td>
                      <td><span :title="entry.descricao" style="display:block;white-space:normal;word-break:break-word;max-width:460px">{{ entry.descricao }}</span></td>
                      <td><span class="cell-clamp cell-clamp-sm" :title="entry.assuntos">{{ entry.assuntos || '—' }}</span></td>
                      <td class="cell-nowrap"><span :title="entry.cota" style="font-size:12px">{{ displayNum(entry.cota) }}</span></td>
                      <td class="cell-nowrap"><span :title="entry.cdr" style="font-size:12px">{{ displayNum(entry.cdr) }}</span></td>
                      <td class="cell-nowrap"><span :title="entry.tb" style="font-size:12px">{{ displayNum(entry.tb) }}</span></td>
                      <td><span class="cell-clamp cell-clamp-sm" :title="entry.localizacao" style="font-size:12px">{{ entry.localizacao || '—' }}</span></td>
                      <td class="cell-nowrap"><strong>{{ entry.nrRegisto }}</strong></td>
                      <td class="cell-nowrap" @click.stop>
                        <EstadoControlo :entry="entry" :can-edit="canEditEstado" :api="apiFetch" @changed="carregarResumoEmprestimos" @erro="addToast($event, 'error')" />
                      </td>
                      <td v-if="canManageEntries" class="cell-nowrap" @click.stop>
                        <div class="td-actions">
                          <button class="btn btn-secondary btn-sm" type="button" @click="openEditEntry(selectedDatasetId, 'cartografia', entry)" title="Editar">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button class="btn btn-danger btn-sm" type="button" @click="deleteEntry(selectedDatasetId, 'cartografia', entry)" title="Mover para lixo">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="pagination" style="padding: 12px 16px; border-top: 1px solid var(--border);">
                <span class="pagination-info">Página {{ page }} de {{ totalPages }}</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <button class="btn btn-secondary btn-sm" :disabled="page <= 1 || entriesLoading" @click="goPrevPage">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                    Anterior
                  </button>
                  <select v-model.number="pageSize" class="pagination-select">
                    <option :value="5">5</option>
                    <option :value="10">10</option>
                    <option :value="15">15</option>
                    <option :value="20">20</option>
                    <option :value="25">25</option>
                    <option :value="50">50</option>
                  </select>
                  <button class="btn btn-secondary btn-sm" :disabled="page >= totalPages || entriesLoading" @click="goNextPage">
                    Seguinte
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              </div>
            </template>
          </div>
        </section>

        <!-- ── Sources page (temporário até à Fase 4: importação incremental) ── -->
        <section v-if="currentPage === 'sources'">
          <Importacoes :api="apiFetch" @ok="addToast($event, 'success')" @erro="addToast($event, 'error')" @aplicada="onImportacaoAplicada" />
        </section>

        <!-- ── Accounts page ─────────────────────────────────────────────── -->
        <section v-if="currentPage === 'accounts' && isAdmin">
          <!-- Create user card -->
          <div class="card" style="margin-bottom: 20px;">
            <div class="card-header">
              <div class="card-header-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </div>
              <div>
                <p class="card-title">Adicionar utilizador</p>
                <p class="card-subtitle">Criar uma nova conta de acesso ao sistema</p>
              </div>
            </div>
            <div class="card-body">
              <form @submit.prevent="createUser">
                <div class="upload-form-grid" style="margin-bottom: 14px;">
                  <div class="field">
                    <label class="field-label required" for="new-username">Username</label>
                    <input id="new-username" v-model="newUser.username" required placeholder="nome.utilizador" autocomplete="off" />
                  </div>
                  <div class="field">
                    <label class="field-label required" for="new-password">Password</label>
                    <input id="new-password" v-model="newUser.password" required type="password" placeholder="••••••••" autocomplete="new-password" />
                  </div>
                  <div class="field">
                    <label class="field-label required" for="new-role">Role</label>
                    <select id="new-role" v-model="newUser.role" required>
                      <option value="read">read — só leitura</option>
                      <option value="write">write — leitura e escrita</option>
                      <option value="admin">admin — acesso total</option>
                    </select>
                  </div>
                </div>
                <button class="btn btn-primary" type="submit" :disabled="userLoading">
                  <span v-if="userLoading" class="spinner spinner-sm"></span>
                  <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {{ userLoading ? 'A criar...' : 'Adicionar utilizador' }}
                </button>
              </form>
            </div>
          </div>

          <!-- Users table -->
          <div class="card">
            <div class="card-header">
              <div class="card-header-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div>
                <p class="card-title">Utilizadores registados</p>
                <p class="card-subtitle">{{ users.length }} utilizador{{ users.length !== 1 ? 'es' : '' }}</p>
              </div>
            </div>
            <div class="table-wrap" style="border: none; border-top: 1px solid var(--border); border-radius: 0 0 var(--radius-lg) var(--radius-lg);">
              <table>
                <thead>
                  <tr>
                    <th>Utilizador</th>
                    <th>Role</th>
                    <th>Criado em</th>
                    <th style="width: 200px;">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="users.length === 0">
                    <td colspan="4">
                      <div class="empty-state">
                        <h3>Sem utilizadores</h3>
                        <p>Não existem utilizadores para apresentar.</p>
                      </div>
                    </td>
                  </tr>
                  <tr v-for="u in users" :key="u.id">
                    <td>
                      <div class="flex items-center gap-2">
                        <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:grid;place-items:center;color:white;font-size:10px;font-weight:700;flex-shrink:0;text-transform:uppercase;">{{ u.username.slice(0,2) }}</div>
                        <strong>{{ u.username }}</strong>
                      </div>
                    </td>
                    <td><span :class="['badge', `badge-${u.role}`]">{{ u.role }}</span></td>
                    <td class="text-muted">{{ formatDate(u.createdAt) }}</td>
                    <td>
                      <div class="td-actions">
                        <button class="btn btn-secondary btn-sm" type="button" @click="changePassword(u)">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                          Password
                        </button>
                        <button class="btn btn-danger btn-sm" type="button" @click="deleteUser(u)">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          Apagar
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- ── ATURB page ─────────────────────────────────────────────────── -->
        <section v-if="currentPage === 'aturb'">
          <!-- Search form card -->
          <div class="card" style="margin-bottom: 20px;">
            <div class="card-header">
              <div class="card-header-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <div>
                <p class="card-title">Pesquisa de Entradas — ATURB</p>
                <p class="card-subtitle">Pesquise por qualquer campo</p>
              </div>
            </div>
            <div class="card-body">
              <form @submit.prevent="searchAturbEntries">
                <!-- Search + buttons -->
                <div class="search-inline-row" style="margin-bottom: 12px;">
                  <div class="field" style="flex: 1; min-width: 0;">
                    <label class="field-label" for="aturb-search-q">Pesquisa livre</label>
                    <input id="aturb-search-q" v-model="aturbFilters.q" list="suggest-aturb-q" placeholder="Ex: Ajuda, Belém..." :disabled="!aturbSelectedDatasetId" />
                    <datalist id="suggest-aturb-q"><option v-for="s in aturbQSuggestions" :key="s" :value="s" /></datalist>
                    <p class="field-hint" style="margin:4px 0 0;font-size:11px;color:var(--muted);">Ignora acentos e maiúsculas; aceita partes de palavras. Use "aspas" para uma frase exata e -termo para excluir.</p>
                  </div>
                  <div class="search-inline-actions">
                    <button class="btn btn-primary" type="submit" :disabled="!aturbSelectedDatasetId || aturbEntriesLoading">
                      <span v-if="aturbEntriesLoading" class="spinner spinner-sm"></span>
                      <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      Pesquisar
                    </button>
                    <button
                      class="btn btn-secondary"
                      type="button"
                      :disabled="!aturbSelectedDatasetId"
                      @click="aturbShowAdvancedFilters = !aturbShowAdvancedFilters"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                      {{ aturbShowAdvancedFilters ? 'Ocultar' : 'Filtros avançados' }}
                      <span v-if="aturbHasActiveFilters && !aturbShowAdvancedFilters" style="width:6px;height:6px;border-radius:50%;background:var(--primary);flex-shrink:0;"></span>
                    </button>
                    <button v-if="aturbHasActiveFilters" class="btn btn-ghost btn-sm" type="button" @click="clearAturbSearch">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      Limpar
                    </button>
                  </div>
                </div>

                <!-- Advanced filters -->
                <div v-if="aturbShowAdvancedFilters" class="advanced-filters" style="margin-bottom: 4px;">
                  <div class="advanced-filters-section">
                    <p class="advanced-filters-label">Filtros rápidos</p>
                    <div class="advanced-filters-grid">
                      <div class="field">
                        <label class="field-label">Autor</label>
                        <select v-model="aturbFilters.autor" :disabled="!aturbSelectedDatasetId">
                          <option value="">— Todos —</option>
                          <option v-for="s in aturbDistinctOptions.autor" :key="s" :value="s">{{ s }}</option>
                        </select>
                      </div>
                      <div class="field">
                        <label class="field-label">Local</label>
                        <select v-model="aturbFilters.local" :disabled="!aturbSelectedDatasetId">
                          <option value="">— Todos —</option>
                          <option v-for="s in aturbDistinctOptions.local" :key="s" :value="s">{{ s }}</option>
                        </select>
                      </div>
                      <div class="field">
                        <label class="field-label">Data</label>
                        <select v-model="aturbFilters.data" :disabled="!aturbSelectedDatasetId">
                          <option value="">— Todas —</option>
                          <option v-for="s in aturbDistinctOptions.data" :key="s" :value="s">{{ s }}</option>
                        </select>
                      </div>
                      <div class="field">
                        <label class="field-label">Estado</label>
                        <select v-model="aturbFilters.estado" :disabled="!aturbSelectedDatasetId">
                          <option value="">— Todos —</option>
                          <option v-for="s in ESTADO_OPTIONS" :key="s" :value="s">{{ s }}</option>
                        </select>
                      </div>
                      <div class="field">
                        <label class="field-label">Caixa nº</label>
                        <select v-model="aturbFilters.caixaNr" :disabled="!aturbSelectedDatasetId">
                          <option value="">— Todas —</option>
                          <option v-for="s in aturbDistinctOptions.caixaNr" :key="s" :value="s">{{ s }}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div class="advanced-filters-section">
                    <p class="advanced-filters-label">Campos de texto</p>
                    <div class="advanced-filters-grid">
                      <div class="field">
                        <label class="field-label">Autor</label>
                        <input v-model="aturbFilters.autor" list="suggest-aturb-autor" placeholder="Pesquisar por autor" :disabled="!aturbSelectedDatasetId" />
                        <datalist id="suggest-aturb-autor"><option v-for="s in aturbFilterSuggestions.autor" :key="s" :value="s" /></datalist>
                      </div>
                      <div class="field">
                        <label class="field-label">Título</label>
                        <input v-model="aturbFilters.titulo" list="suggest-aturb-titulo" placeholder="Pesquisar por título" :disabled="!aturbSelectedDatasetId" />
                        <datalist id="suggest-aturb-titulo"><option v-for="s in aturbFilterSuggestions.titulo" :key="s" :value="s" /></datalist>
                      </div>
                      <div class="field">
                        <label class="field-label">Local</label>
                        <input v-model="aturbFilters.local" list="suggest-aturb-local" placeholder="Pesquisar por local" :disabled="!aturbSelectedDatasetId" />
                        <datalist id="suggest-aturb-local"><option v-for="s in aturbFilterSuggestions.local" :key="s" :value="s" /></datalist>
                      </div>
                      <div class="field">
                        <label class="field-label">Caixa nº</label>
                        <input v-model="aturbFilters.caixaNr" list="suggest-aturb-caixaNr" placeholder="Nº caixa" :disabled="!aturbSelectedDatasetId" />
                        <datalist id="suggest-aturb-caixaNr"><option v-for="s in aturbFilterSuggestions.caixaNr" :key="s" :value="s" /></datalist>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>

          <!-- Results card -->
          <div class="card">
            <div v-if="!aturbSelectedDatasetId" class="table-wrap" style="border: none;">
              <div class="empty-state">
                <div class="empty-state-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                </div>
                <h3>Nenhuma fonte selecionada</h3>
                <p>Selecione uma fonte ATURB no formulário acima para visualizar e pesquisar entradas.</p>
              </div>
            </div>

            <template v-else>
              <div class="search-meta-bar" style="border-radius: var(--radius-lg) var(--radius-lg) 0 0; border-bottom: 1px solid var(--border); border-top: none; border-left: none; border-right: none;">
                <span>{{ aturbSelectedDataset?.name }}</span>
                <span>{{ aturbTotalEntries.toLocaleString('pt-PT') }} resultado{{ aturbTotalEntries !== 1 ? 's' : '' }}</span>
                <span v-if="aturbFilters.vazios" class="badge" title="Filtro vindo do painel">Campo vazio: {{ aturbFilters.vazios }}</span>
                <span v-if="aturbFilters.emprestimo" class="badge" title="Filtro vindo do painel">Empréstimos: {{ aturbFilters.emprestimo === 'atraso' ? 'em atraso' : 'ativos' }}</span>
                <span v-if="aturbFilters.q.trim() && aturbOrdenacao === 'relevancia'" class="badge" title="Resultados ordenados pela relevância da pesquisa. Clique num cabeçalho para ordenar por coluna.">Ordenado por relevância</span>
                <button v-else-if="aturbFilters.q.trim() && aturbSortKeys.length" class="btn btn-ghost btn-sm" type="button" @click="aturbSortKeys = []; aturbPage = 1; loadAturbEntries()">Voltar à ordenação por relevância</button>
                <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
                  <ExportarBotao :url="`/api/colecoes/${aturbSelectedDatasetId}/exportar`" :get-params="buildAturbEntriesQuery" :token="token" :disabled="aturbTotalEntries === 0" @ok="addToast($event, 'success')" @erro="addToast($event, 'error')" />
                  <button v-if="canManageEntries" class="btn btn-primary btn-sm" type="button" @click="openCreateEntry(aturbSelectedDatasetId, 'aturb')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Adicionar entrada
                  </button>
                </div>
              </div>

              <div class="table-wrap" style="border: none; border-radius: 0; position: relative; overflow-x: auto;">
                <div v-if="aturbEntriesLoading" class="table-loading-overlay">
                  <div class="spinner"></div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th style="width:36px;padding:10px 8px;text-align:center;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" title="Impressão PDF"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      </th>
                      <th class="th-sortable" style="min-width:160px" @click="setAturbSort('autor', $event)">
                        Autor
                        <span class="sort-icon" :class="{ active: !!getAturbSortEntry('autor'), desc: getAturbSortEntry('autor')?.dir === 'desc' }">
                          <span v-if="aturbSortKeys.length > 1 && getAturbSortEntry('autor')" class="sort-badge">{{ getAturbSortEntry('autor').idx + 1 }}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </span>
                      </th>
                      <th class="th-sortable" style="min-width:280px;width:40%" @click="setAturbSort('titulo', $event)">
                        Título
                        <span class="sort-icon" :class="{ active: !!getAturbSortEntry('titulo'), desc: getAturbSortEntry('titulo')?.dir === 'desc' }">
                          <span v-if="aturbSortKeys.length > 1 && getAturbSortEntry('titulo')" class="sort-badge">{{ getAturbSortEntry('titulo').idx + 1 }}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </span>
                      </th>
                      <th class="th-sortable" style="min-width:140px" @click="setAturbSort('local', $event)">
                        Local
                        <span class="sort-icon" :class="{ active: !!getAturbSortEntry('local'), desc: getAturbSortEntry('local')?.dir === 'desc' }">
                          <span v-if="aturbSortKeys.length > 1 && getAturbSortEntry('local')" class="sort-badge">{{ getAturbSortEntry('local').idx + 1 }}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </span>
                      </th>
                      <th class="th-sortable" @click="setAturbSort('data', $event)">
                        Data
                        <span class="sort-icon" :class="{ active: !!getAturbSortEntry('data'), desc: getAturbSortEntry('data')?.dir === 'desc' }">
                          <span v-if="aturbSortKeys.length > 1 && getAturbSortEntry('data')" class="sort-badge">{{ getAturbSortEntry('data').idx + 1 }}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </span>
                      </th>
                      <th class="th-sortable" @click="setAturbSort('caixaNr', $event)" title="Ordenar como número">
                        Caixa nº
                        <span class="sort-icon" :class="{ active: !!getAturbSortEntry('caixaNr'), desc: getAturbSortEntry('caixaNr')?.dir === 'desc' }">
                          <span v-if="aturbSortKeys.length > 1 && getAturbSortEntry('caixaNr')" class="sort-badge">{{ getAturbSortEntry('caixaNr').idx + 1 }}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </span>
                      </th>
                      <th style="min-width:150px">Estado</th>
                      <th v-if="canManageEntries" style="min-width:100px">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="aturbEntries.length === 0 && !aturbEntriesLoading">
                      <td :colspan="canManageEntries ? 8 : 7">
                        <div class="empty-state">
                          <div class="empty-state-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                          </div>
                          <h3>Sem resultados</h3>
                          <p>Nenhuma entrada corresponde aos filtros aplicados.</p>
                        </div>
                      </td>
                    </tr>
                    <tr v-for="(entry, i) in aturbSortedEntries" :key="`aturb-${entry.sourceEntryNumber}-${i}`" class="tr-clickable" @click="openAturbEntryModal(entry)">
                      <td style="text-align:center;padding:8px;" @click.stop>
                        <button
                          :class="['cart-checkbox-btn', { 'in-cart': isInCart(aturbSelectedDatasetId, entry) }]"
                          type="button"
                          :title="isInCart(aturbSelectedDatasetId, entry) ? 'Remover da impressão' : 'Adicionar à impressão PDF'"
                          @click="toggleCart(aturbSelectedDatasetId, 'aturb', entry)"
                        >
                          <svg v-if="isInCart(aturbSelectedDatasetId, entry)" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polyline points="20 6 9 17 4 12"/></svg>
                          <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        </button>
                      </td>
                      <td><span class="cell-clamp" :title="entry.autor">{{ entry.autor || '—' }}</span></td>
                      <td><span :title="entry.titulo" style="display:block;white-space:normal;word-break:break-word;max-width:480px">{{ entry.titulo || '—' }}</span></td>
                      <td><span class="cell-clamp cell-clamp-sm" :title="entry.local">{{ entry.local || '—' }}</span></td>
                      <td class="cell-nowrap"><span style="font-size:12px">{{ entry.data || '—' }}</span></td>
                      <td class="cell-nowrap"><strong style="font-size:12px">{{ entry.caixaNr || '—' }}</strong></td>
                      <td class="cell-nowrap" @click.stop>
                        <EstadoControlo :entry="entry" :can-edit="canEditEstado" :api="apiFetch" @changed="carregarResumoEmprestimos" @erro="addToast($event, 'error')" />
                      </td>
                      <td v-if="canManageEntries" class="cell-nowrap" @click.stop>
                        <div class="td-actions">
                          <button class="btn btn-secondary btn-sm" type="button" @click="openEditEntry(aturbSelectedDatasetId, 'aturb', entry)" title="Editar">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button class="btn btn-danger btn-sm" type="button" @click="deleteEntry(aturbSelectedDatasetId, 'aturb', entry)" title="Mover para lixo">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="pagination" style="padding: 12px 16px; border-top: 1px solid var(--border);">
                <span class="pagination-info">Página {{ aturbPage }} de {{ aturbTotalPages }}</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <button class="btn btn-secondary btn-sm" :disabled="aturbPage <= 1 || aturbEntriesLoading" @click="goAturbPrevPage">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                    Anterior
                  </button>
                  <select v-model.number="pageSize" class="pagination-select">
                    <option :value="5">5</option>
                    <option :value="10">10</option>
                    <option :value="15">15</option>
                    <option :value="20">20</option>
                    <option :value="25">25</option>
                    <option :value="50">50</option>
                  </select>
                  <button class="btn btn-secondary btn-sm" :disabled="aturbPage >= aturbTotalPages || aturbEntriesLoading" @click="goAturbNextPage">
                    Seguinte
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              </div>
            </template>
          </div>
        </section>

        <!-- ── Cart page ────────────────────────────────────────────── -->
        <section v-if="currentPage === 'cart'" class="page-section">
          <div class="card">
            <div class="card-header" style="display:flex;align-items:center;gap:12px;">
              <div>
                <h2 class="card-title">Impressão PDF</h2>
                <p class="card-subtitle">{{ cartCount }} entrada{{ cartCount !== 1 ? 's' : '' }} selecionada{{ cartCount !== 1 ? 's' : '' }}</p>
              </div>
              <div style="margin-left:auto;display:flex;gap:8px;">
                <button class="btn btn-secondary btn-sm" type="button" :disabled="cartCount === 0" @click="clearCart()">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Limpar lista
                </button>
                <ExportarBotao v-for="g in cartGroups" :key="g.datasetId" :url="`/api/colecoes/${g.datasetId}/exportar`" :get-params="() => cartExportParams(g)" :token="token" :rotulo="`Exportar ${g.nome} (${g.ids.length})`" @ok="addToast($event, 'success')" @erro="addToast($event, 'error')" />
                <button class="btn btn-primary btn-sm" type="button" :disabled="cartCount === 0" @click="exportCartPDF()">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Imprimir PDF
                </button>
              </div>
            </div>
            <div v-if="cartCount === 0" class="empty-state" style="padding:48px 0;">
              <div class="empty-state-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              </div>
              <h3>Nenhuma entrada selecionada</h3>
              <p>Selecione entradas nas tabelas de Cartografia ou ATURB clicando no ícone <strong>🖨️</strong> para as adicionar aqui.</p>
            </div>
            <div v-else class="table-wrap" style="overflow-x:auto;">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Identificador</th>
                    <th style="min-width:280px">Título / Cabeçalho</th>
                    <th>Estado</th>
                    <th style="width:40px"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in cart" :key="item.key">
                    <td>
                      <span class="badge" :style="item.type === 'aturb' ? 'background:var(--accent-soft);color:var(--accent)' : 'background:var(--primary-soft);color:var(--primary)'">
                        {{ item.type === 'aturb' ? 'ATURB' : 'Carto.' }}
                      </span>
                    </td>
                    <td class="cell-nowrap" style="font-size:12px">
                      <template v-if="item.type === 'aturb'">{{ item.entry.autor || '—' }} ({{ item.entry.data || '—' }})</template>
                      <template v-else>Reg. {{ item.entry.nrRegisto || '—' }}</template>
                    </td>
                    <td>
                      <span style="display:block;white-space:normal;word-break:break-word;max-width:480px;font-size:13px;">
                        {{ item.type === 'aturb' ? item.entry.titulo : item.entry.cabecalho || '—' }}
                      </span>
                    </td>
                    <td>
                      <span :class="['estado-badge', `estado-${estadoClassSuffix(item.entry.estado)}`]">{{ item.entry.estado || '—' }}</span>
                    </td>
                    <td style="text-align:center;">
                      <button class="btn btn-danger btn-sm" type="button" title="Remover da lista" @click="removeFromCart(item.key)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- ── Bin page ─────────────────────────────────────────────── -->
        <section v-if="currentPage === 'bin'" class="page-section">
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">Lixo</h2>
              <p class="card-subtitle">Entradas eliminadas — podem ser restauradas</p>
            </div>
            <div v-if="binLoading" style="padding:32px;text-align:center;">
              <div class="spinner" style="margin:0 auto;"></div>
            </div>
            <div v-else-if="binEntries.length === 0 && binAturbEntries.length === 0">
              <div class="empty-state" style="padding:40px 0;">
                <div class="empty-state-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </div>
                <h3>Lixo vazio</h3>
                <p>Não há entradas eliminadas.</p>
              </div>
            </div>
            <div v-else class="table-wrap" style="overflow-x:auto;">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th style="min-width:240px">Entrada</th>
                    <th>Eliminado por</th>
                    <th>Data de eliminação</th>
                    <th style="width:100px"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="entry in binEntries" :key="`bin-carto-${entry.sourceEntryNumber}`">
                    <td><span class="badge" style="background:var(--primary-soft);color:var(--primary)">Carto.</span></td>
                    <td>
                      <span style="font-size:13px;">{{ entry.cabecalho || '—' }}</span>
                      <span v-if="entry.nrRegisto" style="font-size:11px;color:var(--muted);display:block;">Reg. {{ entry.nrRegisto }}</span>
                    </td>
                    <td style="font-size:13px;">{{ entry.deletedBy || '—' }}</td>
                    <td class="cell-nowrap" style="font-size:12px;">{{ entry.deletedAt ? new Date(entry.deletedAt).toLocaleString('pt-PT') : '—' }}</td>
                    <td>
                      <button class="btn btn-secondary btn-sm" type="button" @click="restoreFromBin(entry)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                        Restaurar
                      </button>
                    </td>
                  </tr>
                  <tr v-for="entry in binAturbEntries" :key="`bin-aturb-${entry.sourceEntryNumber}`">
                    <td><span class="badge" style="background:var(--accent-soft);color:var(--accent)">ATURB</span></td>
                    <td>
                      <span style="font-size:13px;">{{ entry.titulo || '—' }}</span>
                      <span v-if="entry.autor" style="font-size:11px;color:var(--muted);display:block;">{{ entry.autor }}</span>
                    </td>
                    <td style="font-size:13px;">{{ entry.deletedBy || '—' }}</td>
                    <td class="cell-nowrap" style="font-size:12px;">{{ entry.deletedAt ? new Date(entry.deletedAt).toLocaleString('pt-PT') : '—' }}</td>
                    <td>
                      <button class="btn btn-secondary btn-sm" type="button" @click="restoreFromBin(entry)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                        Restaurar
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- ── History page ──────────────────────────────────────────── -->
        <section v-if="currentPage === 'history'" class="page-section">
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">Histórico</h2>
              <p class="card-subtitle">Registo de todas as alterações por coleção</p>
            </div>
            <div class="card-body" style="padding:16px;border-bottom:1px solid var(--border);">
              <label class="field-label" style="margin-bottom:4px;display:block;">Coleção</label>
              <select class="input" style="max-width:340px;" v-model="historySelectedDatasetId" @change="loadHistory()">
                <option v-for="ds in datasets" :key="ds.id" :value="ds.id">{{ ds.name }}</option>
              </select>
            </div>

            <div v-if="historyLoading" style="padding:32px;text-align:center;">
              <div class="spinner" style="margin:0 auto;"></div>
            </div>
            <div v-else-if="historyItems.length === 0 && historySelectedDatasetId">
              <div class="empty-state" style="padding:40px 0;">
                <div class="empty-state-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <h3>Sem histórico</h3>
                <p>Não há alterações registadas nesta coleção.</p>
              </div>
            </div>
            <div v-else-if="!historySelectedDatasetId">
              <div class="empty-state" style="padding:40px 0;">
                <p>Selecione um dataset acima para ver o histórico de alterações.</p>
              </div>
            </div>
            <div v-else class="table-wrap" style="overflow-x:auto;">
              <table>
                <thead>
                  <tr>
                    <th style="min-width:100px">Ação</th>
                    <th style="min-width:200px">Entrada</th>
                    <th>Utilizador</th>
                    <th style="min-width:160px">Data / Hora</th>
                    <th style="min-width:260px">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, idx) in historyItems" :key="item.id || idx">
                    <td class="cell-nowrap">
                      <span :class="['badge', historyActionClass(item.action)]">{{ historyActionLabel(item.action) }}</span>
                    </td>
                    <td style="font-size:13px;">
                      <span>{{ historyEntryRefDisplay(item) }}</span>
                    </td>
                    <td style="font-size:13px;font-weight:500;">{{ item.user || '—' }}</td>
                    <td class="cell-nowrap" style="font-size:12px;color:var(--muted);">
                      {{ historyTimestamp(item) }}
                    </td>
                    <td style="font-size:12px;color:var(--text-secondary);white-space:normal;word-break:break-word;max-width:320px;">
                      {{ historyDetailsDisplay(item) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>
    </main>
  </div>
</template>
