const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = () => process.env.SIGAT_DATA_DIR || path.join(__dirname, 'data');
const PORT = process.env.PORT || 3000;

const db = require('./src/db');
const utilizadores = require('./src/db/repos/utilizadores');
const usersRouter = require('./src/routes/users');
const documentosRouter = require('./src/routes/documentos');
const emprestimosRouter = require('./src/routes/emprestimos');
const importacoesRouter = require('./src/routes/importacoes');
const { authMiddleware } = require('./src/auth');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'sigat', timestamp: new Date().toISOString() });
});

app.use('/api', usersRouter);
app.use('/api', authMiddleware, documentosRouter);
app.use('/api', authMiddleware, emprestimosRouter);
app.use('/api', authMiddleware, importacoesRouter);

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
    utilizadores.criar({ username: 'admin', role: 'admin', passwordHash: await bcrypt.hash('admin123', 10) });
  }

  if (!jaExistia && fs.existsSync(path.join(dir, 'datasets.json'))) {
    // eslint-disable-next-line no-console
    console.warn('Foram encontrados dados antigos (data/datasets.json). Execute: node scripts/migrar-json-para-sqlite.js --aplicar');
  }
}

module.exports = { app, ensureStorage };

if (require.main === module) {
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
}
