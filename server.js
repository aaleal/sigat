const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs/promises');
const { existsSync } = require('fs');
const { randomUUID } = require('crypto');
const { parseDatabaseTxt } = require('./src/parser');
const { parseAturbXlsx } = require('./src/parserXlsx');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'sigat-dev-secret-change-me';

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DATASETS_FILE = path.join(DATA_DIR, 'datasets.json');
const DATASET_CONTENT_DIR = path.join(DATA_DIR, 'datasets');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const uploadXlsx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls)$/i.test(file.originalname);
    cb(ok ? null : new Error('Apenas ficheiros .xlsx são aceites.'), ok);
  },
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(DATASET_CONTENT_DIR, { recursive: true });

  if (!existsSync(USERS_FILE)) {
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    const adminUser = {
      id: randomUUID(),
      username: 'admin',
      role: 'admin',
      passwordHash: adminPasswordHash,
      createdAt: new Date().toISOString(),
    };
    await writeJson(USERS_FILE, [adminUser]);
  }

  if (!existsSync(DATASETS_FILE)) {
    await writeJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  }
}

async function readJson(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (_error) {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

function buildToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: '8h',
  });
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Token em falta.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Token inválido.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Sem permissões para esta ação.' });
    }
    return next();
  };
}

// ── Helper: exact numeric matching for filter fields ─────────────────────
function matchesNumericFilter(fieldValue, filterValue) {
  const fv = String(fieldValue || '');
  const filt = String(filterValue || '').trim();
  if (!filt) return true;
  // Extract filter number (first sequence of digits)
  const filterMatch = filt.match(/\d+/);
  if (!filterMatch) {
    // No number in filter → fallback to substring
    return fv.toLowerCase().includes(filt.toLowerCase());
  }
  const searchNum = parseInt(filterMatch[0], 10);
  // Extract all numbers from field value
  const fieldNums = fv.match(/\d+/g);
  if (!fieldNums) return false;
  return fieldNums.some((n) => parseInt(n, 10) === searchNum);
}

async function getActiveDatasetMeta() {
  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  if (!registry.activeDatasetId) return { registry, active: null };
  const active = registry.datasets.find((dataset) => dataset.id === registry.activeDatasetId) || null;
  return { registry, active };
}

async function getActiveEntries() {
  const { active } = await getActiveDatasetMeta();
  if (!active) return [];
  const datasetFile = path.join(DATASET_CONTENT_DIR, `${active.id}.json`);
  const payload = await readJson(datasetFile, { entries: [] });
  return payload.entries || [];
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'sigat', timestamp: new Date().toISOString() });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Username e password são obrigatórios.' });
  }

  const users = await readJson(USERS_FILE, []);
  const user = users.find((candidate) => candidate.username.toLowerCase() === String(username).toLowerCase());

  if (!user) {
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }

  const token = buildToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const users = await readJson(USERS_FILE, []);
  const user = users.find((entry) => entry.id === req.user.sub);

  if (!user) {
    return res.status(404).json({ message: 'Utilizador não encontrado.' });
  }

  return res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  });
});

app.get('/api/users', authMiddleware, requireRole('admin'), async (_req, res) => {
  const users = await readJson(USERS_FILE, []);
  const response = users.map((entry) => ({
    id: entry.id,
    username: entry.username,
    role: entry.role,
    createdAt: entry.createdAt,
  }));
  res.json(response);
});

app.post('/api/users', authMiddleware, requireRole('admin'), async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !role) {
    return res.status(400).json({ message: 'username, password e role são obrigatórios.' });
  }

  if (!['admin', 'write', 'read'].includes(role)) {
    return res.status(400).json({ message: 'Role inválida. Use admin, write ou read.' });
  }

  const users = await readJson(USERS_FILE, []);
  const usernameTaken = users.some((entry) => entry.username.toLowerCase() === String(username).toLowerCase());
  if (usernameTaken) {
    return res.status(409).json({ message: 'Username já existe.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: randomUUID(),
    username: String(username).trim(),
    role,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  await writeJson(USERS_FILE, users);

  return res.status(201).json({
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  });
});

app.patch('/api/users/:id/password', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { password } = req.body || {};

  if (!password || String(password).trim().length < 4) {
    return res.status(400).json({ message: 'Password inválida. Use pelo menos 4 caracteres.' });
  }

  const users = await readJson(USERS_FILE, []);
  const userIndex = users.findIndex((entry) => entry.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'Utilizador não encontrado.' });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  users[userIndex] = {
    ...users[userIndex],
    passwordHash,
  };

  await writeJson(USERS_FILE, users);
  return res.json({ message: 'Password atualizada com sucesso.' });
});

app.delete('/api/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  if (req.user.sub === id) {
    return res.status(400).json({ message: 'Não pode apagar o próprio utilizador.' });
  }

  const users = await readJson(USERS_FILE, []);
  const existing = users.find((entry) => entry.id === id);
  if (!existing) {
    return res.status(404).json({ message: 'Utilizador não encontrado.' });
  }

  const updatedUsers = users.filter((entry) => entry.id !== id);
  await writeJson(USERS_FILE, updatedUsers);
  return res.json({ message: 'Utilizador apagado com sucesso.' });
});

app.get('/api/datasets', authMiddleware, async (_req, res) => {
  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const datasets = registry.datasets
    .slice()
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    .map((entry) => ({ ...entry, active: entry.id === registry.activeDatasetId }));
  return res.json({ activeDatasetId: registry.activeDatasetId, datasets });
});

app.post('/api/datasets/upload', authMiddleware, requireRole('admin', 'write'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Ficheiro TXT obrigatório.' });
  }

  const inputName = (req.body?.name || '').trim();
  const datasetName = inputName || req.file.originalname.replace(/\.txt$/i, '');
  if (!datasetName) {
    return res.status(400).json({ message: 'Nome da base de dados inválido.' });
  }

  const txtContent = req.file.buffer.toString('utf-8');
  const parsed = parseDatabaseTxt(txtContent);

  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const datasetId = randomUUID();
  const metadata = {
    id: datasetId,
    name: datasetName,
    type: 'cartografia',
    uploadedAt: new Date().toISOString(),
    uploadedBy: req.user.username,
    entryCount: parsed.entries.length,
    parseErrorCount: parsed.errors.length,
    sizeBytes: req.file.size,
  };

  const contentFile = path.join(DATASET_CONTENT_DIR, `${datasetId}.json`);
  await writeJson(contentFile, {
    id: datasetId,
    name: datasetName,
    entries: parsed.entries,
    parseErrors: parsed.errors,
    parseWarnings: parsed.warnings,
  });

  registry.datasets.push(metadata);
  if (!registry.activeDatasetId) {
    registry.activeDatasetId = datasetId;
  }
  await writeJson(DATASETS_FILE, registry);

  return res.status(201).json({
    valid: true,
    message: parsed.errors.length > 0
      ? `Upload efetuado com ${parsed.errors.length} erro(s) de extração. Verifique os detalhes na fonte de dados.`
      : 'Upload efetuado com sucesso.',
    metadata: { ...metadata, active: metadata.id === registry.activeDatasetId },
    errors: parsed.errors,
    warnings: parsed.warnings,
  });
});

// ── ATURB xlsx upload ────────────────────────────────────────────────────
app.post('/api/datasets/upload-aturb', authMiddleware, requireRole('admin', 'write'), uploadXlsx.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Ficheiro xlsx obrigatório.' });
  }

  const inputName = (req.body?.name || '').trim();
  const datasetName = inputName || req.file.originalname.replace(/\.(xlsx|xls)$/i, '');
  if (!datasetName) {
    return res.status(400).json({ message: 'Nome da base de dados inválido.' });
  }

  const parsed = parseAturbXlsx(req.file.buffer);

  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const datasetId = randomUUID();
  const metadata = {
    id: datasetId,
    name: datasetName,
    type: 'aturb',
    uploadedAt: new Date().toISOString(),
    uploadedBy: req.user.username,
    entryCount: parsed.entries.length,
    parseErrorCount: parsed.errors.length,
    sizeBytes: req.file.size,
  };

  const contentFile = path.join(DATASET_CONTENT_DIR, `${datasetId}.json`);
  await writeJson(contentFile, {
    id: datasetId,
    name: datasetName,
    type: 'aturb',
    entries: parsed.entries,
    parseErrors: parsed.errors,
    parseWarnings: parsed.warnings,
  });

  registry.datasets.push(metadata);
  await writeJson(DATASETS_FILE, registry);

  return res.status(201).json({
    valid: true,
    message: parsed.errors.length > 0
      ? `Upload efetuado com ${parsed.errors.length} erro(s) de extração. Verifique os detalhes na fonte de dados.`
      : 'Upload ATURB efetuado com sucesso.',
    metadata: { ...metadata, active: metadata.id === registry.activeDatasetId },
    errors: parsed.errors,
    warnings: parsed.warnings,
  });
});

app.post('/api/datasets/:id/activate', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const exists = registry.datasets.some((entry) => entry.id === id);

  if (!exists) {
    return res.status(404).json({ message: 'Base de dados não encontrada.' });
  }

  registry.activeDatasetId = id;
  await writeJson(DATASETS_FILE, registry);
  return res.json({ message: 'Base de dados ativa atualizada com sucesso.', activeDatasetId: id });
});

app.patch('/api/datasets/:id', authMiddleware, requireRole('admin', 'write'), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body || {};
  const trimmedName = String(name || '').trim();

  if (!trimmedName) {
    return res.status(400).json({ message: 'Nome da fonte de dados é obrigatório.' });
  }

  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const datasetIndex = registry.datasets.findIndex((entry) => entry.id === id);
  if (datasetIndex === -1) {
    return res.status(404).json({ message: 'Base de dados não encontrada.' });
  }

  registry.datasets[datasetIndex] = {
    ...registry.datasets[datasetIndex],
    name: trimmedName,
  };
  await writeJson(DATASETS_FILE, registry);

  const contentFile = path.join(DATASET_CONTENT_DIR, `${id}.json`);
  if (existsSync(contentFile)) {
    const content = await readJson(contentFile, { id, name: trimmedName, entries: [] });
    await writeJson(contentFile, {
      ...content,
      name: trimmedName,
    });
  }

  return res.json({
    message: 'Fonte de dados atualizada com sucesso.',
    dataset: { ...registry.datasets[datasetIndex], active: id === registry.activeDatasetId },
  });
});

app.delete('/api/datasets/:id', authMiddleware, requireRole('admin', 'write'), async (req, res) => {
  const { id } = req.params;
  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const existing = registry.datasets.find((entry) => entry.id === id);

  if (!existing) {
    return res.status(404).json({ message: 'Base de dados não encontrada.' });
  }

  registry.datasets = registry.datasets.filter((entry) => entry.id !== id);
  if (registry.activeDatasetId === id) {
    registry.activeDatasetId = registry.datasets[0]?.id || null;
  }

  await writeJson(DATASETS_FILE, registry);
  const contentFile = path.join(DATASET_CONTENT_DIR, `${id}.json`);
  if (existsSync(contentFile)) {
    await fs.unlink(contentFile);
  }

  return res.json({ message: 'Base de dados removida com sucesso.', activeDatasetId: registry.activeDatasetId });
});

app.get('/api/entries', authMiddleware, async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
  const datasetId = (req.query.datasetId || '').toString().trim();

  if (!datasetId) {
    return res.status(400).json({ message: 'datasetId é obrigatório.' });
  }

  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const selectedDataset = registry.datasets.find((dataset) => dataset.id === datasetId) || null;

  if (!selectedDataset) {
    return res.status(404).json({ message: 'Fonte de dados não encontrada.' });
  }

  const datasetFile = path.join(DATASET_CONTENT_DIR, `${datasetId}.json`);
  const payload = await readJson(datasetFile, { entries: [] });
  const entries = payload.entries || [];

  if (entries.length === 0) {
    return res.json({
      activeDataset: selectedDataset,
      total: 0,
      page,
      pageSize,
      items: [],
    });
  }

  const dsType = selectedDataset.type || 'cartografia';
  const q = (req.query.q || '').toString().trim().toLowerCase();

  let filtered;
  if (dsType === 'aturb') {
    const f = {
      autor:   (req.query.autor   || '').toString().trim().toLowerCase(),
      titulo:  (req.query.titulo  || '').toString().trim().toLowerCase(),
      local:   (req.query.local   || '').toString().trim().toLowerCase(),
      data:    (req.query.data    || '').toString().trim().toLowerCase(),
      caixaNr: (req.query.caixaNr || '').toString().trim().toLowerCase(),
      estado:  (req.query.estado  || '').toString().trim().toLowerCase(),
    };
    filtered = entries.filter((entry) => {
      const v = {
        autor:   String(entry.autor   ?? '').toLowerCase(),
        titulo:  String(entry.titulo  ?? '').toLowerCase(),
        local:   String(entry.local   ?? '').toLowerCase(),
        data:    String(entry.data    ?? '').toLowerCase(),
        caixaNr: String(entry.caixaNr ?? '').toLowerCase(),
        estado:  String(entry.estado  ?? '').toLowerCase(),
      };
      if (f.autor   && !v.autor.includes(f.autor))     return false;
      if (f.titulo  && !v.titulo.includes(f.titulo))   return false;
      if (f.local   && !v.local.includes(f.local))     return false;
      if (f.data    && !v.data.includes(f.data))       return false;
      if (f.caixaNr && !matchesNumericFilter(entry.caixaNr, f.caixaNr)) return false;
      if (f.estado  && !v.estado.includes(f.estado))   return false;
      if (!q) return true;
      return Object.values(v).join(' ').includes(q);
    });
  } else {
    const filters = {
      q,
      cabecalho:   (req.query.cabecalho   || '').toString().trim().toLowerCase(),
      descricao:   (req.query.descricao   || '').toString().trim().toLowerCase(),
      notas:       (req.query.notas       || '').toString().trim().toLowerCase(),
      localizacao: (req.query.localizacao || '').toString().trim().toLowerCase(),
      assuntos:    (req.query.assuntos    || '').toString().trim().toLowerCase(),
      cota:        (req.query.cota        || '').toString().trim().toLowerCase(),
      cdr:         (req.query.cdr         || '').toString().trim().toLowerCase(),
      tb:          (req.query.tb          || '').toString().trim().toLowerCase(),
      nrRegisto:   (req.query.nrRegisto   || '').toString().trim().toLowerCase(),
      autor:       (req.query.autor       || '').toString().trim().toLowerCase(),
      ano:         (req.query.ano         || '').toString().trim().toLowerCase(),
      tipo:        (req.query.tipo        || '').toString().trim().toLowerCase(),
      cor:         (req.query.cor         || '').toString().trim().toLowerCase(),
      dimensao:    (req.query.dimensao    || '').toString().trim().toLowerCase(),
      estado:      (req.query.estado      || '').toString().trim().toLowerCase(),
    };
    filtered = entries.filter((entry) => {
      const values = {
        cabecalho:   String(entry.cabecalho   ?? '').toLowerCase(),
        descricao:   String(entry.descricao   ?? '').toLowerCase(),
        notas:       String(entry.notas       ?? '').toLowerCase(),
        localizacao: String(entry.localizacao ?? '').toLowerCase(),
        assuntos:    String(entry.assuntos    ?? '').toLowerCase(),
        cota:        String(entry.cota        ?? '').toLowerCase(),
        cdr:         String(entry.cdr         ?? '').toLowerCase(),
        tb:          String(entry.tb          ?? '').toLowerCase(),
        nrRegisto:   String(entry.nrRegisto   ?? '').toLowerCase(),
        autor:       String(entry.autor       ?? '').toLowerCase(),
        ano:         String(entry.ano         ?? '').toLowerCase(),
        tipo:        String(entry.tipo        ?? '').toLowerCase(),
        cor:         String(entry.cor         ?? '').toLowerCase(),
        dimensao:    String(entry.dimensao    ?? '').toLowerCase(),
        estado:      String(entry.estado      ?? '').toLowerCase(),
      };
      if (filters.cabecalho   && !values.cabecalho.includes(filters.cabecalho))     return false;
      if (filters.descricao   && !values.descricao.includes(filters.descricao))     return false;
      if (filters.notas       && !values.notas.includes(filters.notas))             return false;
      if (filters.localizacao && !values.localizacao.includes(filters.localizacao)) return false;
      if (filters.assuntos    && !values.assuntos.includes(filters.assuntos))       return false;
      if (filters.cota        && !matchesNumericFilter(entry.cota, filters.cota))               return false;
      if (filters.cdr         && !matchesNumericFilter(entry.cdr, filters.cdr))                 return false;
      if (filters.tb          && !matchesNumericFilter(entry.tb, filters.tb))                   return false;
      if (filters.nrRegisto   && !matchesNumericFilter(entry.nrRegisto, filters.nrRegisto))     return false;
      if (filters.autor       && !values.autor.includes(filters.autor))             return false;
      if (filters.ano         && !values.ano.includes(filters.ano))                 return false;
      if (filters.tipo        && !values.tipo.includes(filters.tipo))               return false;
      if (filters.cor         && !values.cor.includes(filters.cor))                 return false;
      if (filters.dimensao    && !values.dimensao.includes(filters.dimensao))       return false;
      if (filters.estado      && !values.estado.includes(filters.estado))           return false;
      if (!filters.q) return true;
      const aggregate = Object.values(values).join(' ');
      return aggregate.includes(filters.q);
    });
  }

  // ── Server-side sorting ───────────────────────────────────────────────
  const sortKeysParam = (req.query.sortKeys || '').toString().trim();
  if (sortKeysParam) {
    const NUMERIC_SORT_KEYS = new Set(['nrRegisto', 'caixaNr']);
    const EXTRACT_NUM_SORT_KEYS = new Set(['cdr', 'tb', 'cota']);
    const sortSpecs = sortKeysParam.split(',').map(s => {
      const [key, dir] = s.split(':');
      return { key, dir: dir === 'desc' ? 'desc' : 'asc' };
    });
    filtered.sort((a, b) => {
      for (const { key, dir } of sortSpecs) {
        const d = dir === 'asc' ? 1 : -1;
        let cmp;
        if (NUMERIC_SORT_KEYS.has(key)) {
          cmp = (Number(a[key]) || 0) - (Number(b[key]) || 0);
        } else if (EXTRACT_NUM_SORT_KEYS.has(key)) {
          const extractNum = (str) => { if (!str) return null; const m = String(str).match(/\d+/); return m ? parseInt(m[0], 10) : null; };
          const na = extractNum(a[key]);
          const nb = extractNum(b[key]);
          if (na != null && nb != null) cmp = na - nb;
          else cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'pt-PT', { numeric: true });
        } else {
          cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'pt-PT', { numeric: true });
        }
        if (cmp !== 0) return cmp * d;
      }
      return 0;
    });
  }

  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return res.json({
    activeDataset: selectedDataset,
    total: filtered.length,
    page,
    pageSize,
    items,
  });
});

app.get('/api/bootstrap', authMiddleware, async (req, res) => {
  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  res.json({
    user: {
      id: req.user.sub,
      username: req.user.username,
      role: req.user.role,
    },
    datasets: registry.datasets.map((entry) => ({ ...entry, active: entry.id === registry.activeDatasetId })),
  });
});

app.get('/api/entries/distinct', authMiddleware, async (req, res) => {
  const datasetId = (req.query.datasetId || '').toString().trim();
  const field = (req.query.field || '').toString().trim();
  const q = (req.query.q || '').toString().trim().toLowerCase();

  const cartografiaFields = ['cabecalho', 'descricao', 'notas', 'localizacao', 'assuntos',
                              'cota', 'cdr', 'tb', 'nrRegisto', 'autor', 'ano', 'tipo', 'cor', 'dimensao', 'estado'];
  const aturbFields = ['autor', 'titulo', 'local', 'data', 'caixaNr', 'estado'];
  const validFields = [...new Set([...cartografiaFields, ...aturbFields])];
  if (!datasetId || !validFields.includes(field)) {
    return res.status(400).json({ message: 'datasetId e field válidos são obrigatórios.' });
  }

  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const selected = registry.datasets.find((d) => d.id === datasetId);
  if (!selected) {
    return res.status(404).json({ message: 'Fonte de dados não encontrada.' });
  }

  const datasetFile = path.join(DATASET_CONTENT_DIR, `${datasetId}.json`);
  const payload = await readJson(datasetFile, { entries: [] });
  const entries = payload.entries || [];

  const seen = new Set();
  const results = [];
  for (const entry of entries) {
    const val = (entry[field] || '').trim();
    if (!val || seen.has(val)) continue;
    if (q && !val.toLowerCase().includes(q)) continue;
    seen.add(val);
    results.push(val);
  }

  results.sort((a, b) => {
    const na = parseInt(String(a).match(/\d+/)?.[0], 10);
    const nb = parseInt(String(b).match(/\d+/)?.[0], 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b), 'pt-PT', { numeric: true });
  });

  return res.json({ suggestions: results });
});

// ── Dataset parse errors ─────────────────────────────────────────────────
app.get('/api/datasets/:id/errors', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const exists = registry.datasets.find((d) => d.id === id);
  if (!exists) return res.status(404).json({ message: 'Fonte de dados não encontrada.' });

  const contentFile = path.join(DATASET_CONTENT_DIR, `${id}.json`);
  const payload = await readJson(contentFile, { entries: [], parseErrors: [], parseWarnings: [] });
  return res.json({
    parseErrors: payload.parseErrors || [],
    parseWarnings: payload.parseWarnings || [],
  });
});

// ── Helper: append to history log ─────────────────────────────────────────
function appendHistory(payload, action, user, entryRef, details = {}) {
  const history = payload.history || [];
  history.push({
    id: randomUUID(),
    action,
    timestamp: new Date().toISOString(),
    user,
    entryRef,
    details,
  });
  return history;
}

// ── Entry estado update ───────────────────────────────────────────────────
app.patch('/api/entries/:datasetId/estado', authMiddleware, requireRole('admin', 'write'), async (req, res) => {
  const { datasetId } = req.params;
  const { sourceEntryNumber, estado, estadoMeta } = req.body || {};

  if (sourceEntryNumber == null || estado === undefined) {
    return res.status(400).json({ message: 'sourceEntryNumber e estado são obrigatórios.' });
  }

  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const exists = registry.datasets.find((d) => d.id === datasetId);
  if (!exists) return res.status(404).json({ message: 'Fonte de dados não encontrada.' });

  const contentFile = path.join(DATASET_CONTENT_DIR, `${datasetId}.json`);
  const payload = await readJson(contentFile, { entries: [] });
  const entries = payload.entries || [];

  const idx = entries.findIndex((e) => e.sourceEntryNumber === Number(sourceEntryNumber));
  if (idx === -1) return res.status(404).json({ message: 'Entrada não encontrada.' });

  const prevEstado = entries[idx].estado;
  entries[idx] = {
    ...entries[idx],
    estado: String(estado),
    estadoMeta: estadoMeta || null,
    estadoChangedAt: new Date().toISOString(),
    estadoChangedBy: req.user.username,
  };
  const history = appendHistory(payload, 'estado', req.user.username,
    { sourceEntryNumber: entries[idx].sourceEntryNumber, cabecalho: entries[idx].cabecalho || entries[idx].titulo || '' },
    { prevEstado, newEstado: estado, estadoMeta: estadoMeta || null });
  await writeJson(contentFile, { ...payload, entries, history });
  return res.json({
    message: 'Estado atualizado com sucesso.',
    estado: entries[idx].estado,
    estadoMeta: entries[idx].estadoMeta,
    estadoChangedAt: entries[idx].estadoChangedAt,
    estadoChangedBy: entries[idx].estadoChangedBy,
  });
});

// ── Create entry ──────────────────────────────────────────────────────────
app.post('/api/entries/:datasetId', authMiddleware, requireRole('admin', 'write'), async (req, res) => {
  try {
    const { datasetId } = req.params;
    const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
    const dsInfo = registry.datasets.find((d) => d.id === datasetId);
    if (!dsInfo) return res.status(404).json({ message: 'Fonte de dados não encontrada.' });

    const contentFile = path.join(DATASET_CONTENT_DIR, `${datasetId}.json`);
    const payload = await readJson(contentFile, { id: datasetId, entries: [] });
    const entries = payload.entries || [];

    const maxNum = entries.reduce((m, e) => Math.max(m, Number(e.sourceEntryNumber) || 0), 0);

    // Build clean entry: only keep non-empty fields from body
    const body = req.body || {};
    const cleanBody = {};
    for (const [k, v] of Object.entries(body)) {
      if (v !== '' && v !== null && v !== undefined) cleanBody[k] = v;
    }

    const newEntry = {
      sourceEntryNumber: maxNum + 1,
      estado: '-',
      estadoMeta: null,
      createdAt: new Date().toISOString(),
      createdBy: req.user.username,
      ...cleanBody,
    };

    entries.push(newEntry);

    // Update entryCount in registry
    const dsIdx = registry.datasets.findIndex((d) => d.id === datasetId);
    if (dsIdx !== -1) registry.datasets[dsIdx].entryCount = entries.length;
    await writeJson(DATASETS_FILE, registry);

    const history = appendHistory(payload, 'create', req.user.username,
      { sourceEntryNumber: newEntry.sourceEntryNumber, cabecalho: newEntry.cabecalho || newEntry.titulo || '' },
      { entry: newEntry });
    await writeJson(contentFile, { ...payload, entries, history });
    return res.status(201).json({ message: 'Entrada criada com sucesso.', entry: newEntry });
  } catch (err) {
    console.error('Erro ao criar entrada:', err);
    return res.status(500).json({ message: 'Erro interno ao criar entrada: ' + (err.message || 'erro desconhecido') });
  }
});

// ── Edit entry ────────────────────────────────────────────────────────────
app.put('/api/entries/:datasetId/:sourceEntryNumber', authMiddleware, requireRole('admin', 'write'), async (req, res) => {
  try {
    const { datasetId, sourceEntryNumber } = req.params;
    const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
    const exists = registry.datasets.find((d) => d.id === datasetId);
    if (!exists) return res.status(404).json({ message: 'Fonte de dados não encontrada.' });

    const contentFile = path.join(DATASET_CONTENT_DIR, `${datasetId}.json`);
    const payload = await readJson(contentFile, { entries: [] });
    const entries = payload.entries || [];

    const numSEN = Number(sourceEntryNumber);
    const idx = entries.findIndex((e) => Number(e.sourceEntryNumber) === numSEN);
    if (idx === -1) return res.status(404).json({ message: 'Entrada não encontrada.' });

    const prev = { ...entries[idx] };

    // Build clean body: only keep non-empty fields
    const body = req.body || {};
    const cleanBody = {};
    for (const [k, v] of Object.entries(body)) {
      if (v !== '' && v !== null && v !== undefined) cleanBody[k] = v;
    }

    entries[idx] = {
      ...entries[idx],
      ...cleanBody,
      sourceEntryNumber: entries[idx].sourceEntryNumber, // preserve
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.username,
    };

    const history = appendHistory(payload, 'edit', req.user.username,
      { sourceEntryNumber: entries[idx].sourceEntryNumber, cabecalho: entries[idx].cabecalho || entries[idx].titulo || '' },
      { prev, next: entries[idx] });
    await writeJson(contentFile, { ...payload, entries, history });
    return res.json({ message: 'Entrada atualizada com sucesso.', entry: entries[idx] });
  } catch (err) {
    console.error('Erro ao editar entrada:', err);
    return res.status(500).json({ message: 'Erro interno ao editar entrada: ' + (err.message || 'erro desconhecido') });
  }
});

// ── Soft-delete entry (move to bin) ──────────────────────────────────────
app.delete('/api/entries/:datasetId/:sourceEntryNumber', authMiddleware, requireRole('admin', 'write'), async (req, res) => {
  const { datasetId, sourceEntryNumber } = req.params;
  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const dsIdx = registry.datasets.findIndex((d) => d.id === datasetId);
  if (dsIdx === -1) return res.status(404).json({ message: 'Fonte de dados não encontrada.' });

  const contentFile = path.join(DATASET_CONTENT_DIR, `${datasetId}.json`);
  const payload = await readJson(contentFile, { entries: [] });
  const entries = payload.entries || [];
  const deletedEntries = payload.deletedEntries || [];

  const idx = entries.findIndex((e) => e.sourceEntryNumber === Number(sourceEntryNumber));
  if (idx === -1) return res.status(404).json({ message: 'Entrada não encontrada.' });

  const [removed] = entries.splice(idx, 1);
  removed.deletedAt = new Date().toISOString();
  removed.deletedBy = req.user.username;
  deletedEntries.push(removed);

  registry.datasets[dsIdx].entryCount = entries.length;
  await writeJson(DATASETS_FILE, registry);

  const history = appendHistory(payload, 'delete', req.user.username,
    { sourceEntryNumber: removed.sourceEntryNumber, cabecalho: removed.cabecalho || removed.titulo || '' },
    { entry: removed });
  await writeJson(contentFile, { ...payload, entries, deletedEntries, history });
  return res.json({ message: 'Entrada movida para o lixo.' });
});

// ── Restore entry from bin ────────────────────────────────────────────────
app.post('/api/entries/:datasetId/:sourceEntryNumber/restore', authMiddleware, requireRole('admin', 'write'), async (req, res) => {
  const { datasetId, sourceEntryNumber } = req.params;
  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const dsIdx = registry.datasets.findIndex((d) => d.id === datasetId);
  if (dsIdx === -1) return res.status(404).json({ message: 'Fonte de dados não encontrada.' });

  const contentFile = path.join(DATASET_CONTENT_DIR, `${datasetId}.json`);
  const payload = await readJson(contentFile, { entries: [], deletedEntries: [] });
  const entries = payload.entries || [];
  const deletedEntries = payload.deletedEntries || [];

  const idx = deletedEntries.findIndex((e) => e.sourceEntryNumber === Number(sourceEntryNumber));
  if (idx === -1) return res.status(404).json({ message: 'Entrada não encontrada no lixo.' });

  const [restored] = deletedEntries.splice(idx, 1);
  delete restored.deletedAt;
  delete restored.deletedBy;
  restored.restoredAt = new Date().toISOString();
  restored.restoredBy = req.user.username;
  entries.push(restored);

  registry.datasets[dsIdx].entryCount = entries.length;
  await writeJson(DATASETS_FILE, registry);

  const history = appendHistory(payload, 'restore', req.user.username,
    { sourceEntryNumber: restored.sourceEntryNumber, cabecalho: restored.cabecalho || restored.titulo || '' },
    { entry: restored });
  await writeJson(contentFile, { ...payload, entries, deletedEntries, history });
  return res.json({ message: 'Entrada restaurada com sucesso.', entry: restored });
});

// ── Get bin (deleted entries) ────────────────────────────────────────────
app.get('/api/entries/:datasetId/deleted', authMiddleware, async (req, res) => {
  const { datasetId } = req.params;
  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const exists = registry.datasets.find((d) => d.id === datasetId);
  if (!exists) return res.status(404).json({ message: 'Fonte de dados não encontrada.' });

  const contentFile = path.join(DATASET_CONTENT_DIR, `${datasetId}.json`);
  const payload = await readJson(contentFile, { deletedEntries: [] });
  return res.json({ deletedEntries: payload.deletedEntries || [] });
});

// ── Get history ──────────────────────────────────────────────────────────
app.get('/api/history/:datasetId', authMiddleware, async (req, res) => {
  const { datasetId } = req.params;
  const registry = await readJson(DATASETS_FILE, { activeDatasetId: null, datasets: [] });
  const exists = registry.datasets.find((d) => d.id === datasetId);
  if (!exists) return res.status(404).json({ message: 'Fonte de dados não encontrada.' });

  const contentFile = path.join(DATASET_CONTENT_DIR, `${datasetId}.json`);
  const payload = await readJson(contentFile, { history: [] });
  const history = (payload.history || []).slice().reverse(); // newest first
  return res.json({ history });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'Endpoint não encontrado.' });
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

ensureStorage()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`SIGAT server a correr em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Erro ao iniciar SIGAT:', error);
    process.exit(1);
  });