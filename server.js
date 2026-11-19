const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const dataDir = () => process.env.SIGAT_DATA_DIR || path.join(__dirname, 'data');
const PORT = process.env.PORT || 3000;

const db = require('./src/db');
const utilizadores = require('./src/db/repos/utilizadores');
const authRouter = require('./src/routes/auth');
const usersRouter = require('./src/routes/users');
const documentosRouter = require('./src/routes/documentos');
const emprestimosRouter = require('./src/routes/emprestimos');
const importacoesRouter = require('./src/routes/importacoes');
const indicadoresRouter = require('./src/routes/indicadores');
const adminRouter = require('./src/routes/admin');
const anexosRouter = require('./src/routes/anexos');
const carrinhoRouter = require('./src/routes/carrinho');
const manutencao = require('./src/manutencao');
const { authMiddleware } = require('./src/auth');

const app = express();
app.disable('x-powered-by');

// Atrás de um proxy/balanceador (TLS terminado fora): TRUST_PROXY=true | nº de saltos | loopback ...
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', v === 'true' ? true : /^\d+$/.test(v) ? Number(v) : v);
}

// FORCE_HTTPS=1 redireciona HTTP -> HTTPS (e ativa HSTS); /api/health fica fora para sondas.
app.use((req, res, next) => {
  if (process.env.FORCE_HTTPS !== '1') return next();
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    return next();
  }
  if (req.path === '/api/health') return next();
  return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
});

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  next();
});

// CORS: o frontend é servido pela própria app. CORS_ORIGENS=https://a,https://b abre origens específicas;
// fora de produção fica aberto (servidor de desenvolvimento).
if (process.env.CORS_ORIGENS) {
  app.use(cors({ origin: process.env.CORS_ORIGENS.split(',').map((s) => s.trim()).filter(Boolean) }));
} else if (process.env.NODE_ENV !== 'production') {
  app.use(cors());
}
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'sigat', timestamp: new Date().toISOString() });
});

app.use('/api', authRouter);
app.use('/api', usersRouter);
app.use('/api', authMiddleware, adminRouter);
app.use('/api', authMiddleware, documentosRouter);
app.use('/api', authMiddleware, anexosRouter);
app.use('/api', authMiddleware, carrinhoRouter);
app.use('/api', authMiddleware, emprestimosRouter);
app.use('/api', authMiddleware, importacoesRouter);
app.use('/api', authMiddleware, indicadoresRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'Endpoint não encontrado.' });
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Abre a BD, aplica migrações e garante o utilizador admin inicial.
async function ensureStorage() {
  const dir = dataDir();
  const jaExistia = fs.existsSync(path.join(dir, 'sigat.db'));
  db.abrir(dir);

  if (utilizadores.contar() === 0) {
    utilizadores.criar({ username: 'admin', role: 'admin', passwordHash: await bcrypt.hash('admin123', 10), trocarPassword: true });
  }
  // Contas ainda com a password inicial conhecida têm de a alterar no primeiro acesso.
  for (const u of utilizadores.listarComHash()) {
    if (!u.trocar_password && bcrypt.compareSync('admin123', u.password_hash)) utilizadores.exigirTrocaPassword(u.id);
  }

  if (!jaExistia && fs.existsSync(path.join(dir, 'datasets.json'))) {
    // eslint-disable-next-line no-console
    console.warn('Foram encontrados dados antigos (data/datasets.json). Execute: node scripts/migrar-json-para-sqlite.js --aplicar');
  }
}

// Servidor HTTPS direto (SSL_KEY_FILE + SSL_CERT_FILE) ou HTTP simples (atrás de proxy TLS).
function criarServidor() {
  const { SSL_KEY_FILE: chave, SSL_CERT_FILE: certificado } = process.env;
  if (chave && certificado) {
    return https.createServer({ key: fs.readFileSync(chave), cert: fs.readFileSync(certificado) }, app);
  }
  return http.createServer(app);
}

module.exports = { app, ensureStorage };

if (require.main === module) {
  ensureStorage()
    .then(() => {
      criarServidor().listen(PORT, () => {
        manutencao.iniciar();
        // eslint-disable-next-line no-console
        console.log(`SIGAT server a correr em ${process.env.SSL_KEY_FILE ? 'https' : 'http'}://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Erro ao iniciar SIGAT:', error);
      process.exit(1);
    });
}
