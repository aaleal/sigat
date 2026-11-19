const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { getDb, getDir } = require('./db');
const config = require('./config');
const auditoria = require('./db/repos/auditoria');

const NOME_VALIDO = /^sigat-\d{8}-\d{6}(-\d+)?\.db$/;

// Pasta das cópias: SIGAT_BACKUP_DIR (ideal: outro volume/servidor) ou data/backups.
const pasta = () => process.env.SIGAT_BACKUP_DIR || path.join(getDir(), 'backups');

function carimbo(d = new Date()) {
  const p = (n, t = 2) => String(n).padStart(t, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function listar() {
  const dir = pasta();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => NOME_VALIDO.test(f)).map((nome) => {
    const st = fs.statSync(path.join(dir, nome));
    return { nome, tamanho: st.size, criadoEm: st.mtime.toISOString() };
  }).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : a.criadoEm > b.criadoEm ? -1 : b.nome.localeCompare(a.nome)));
}

// Caminho absoluto de uma cópia existente (nome validado: sem path traversal).
function caminho(nome) {
  if (!NOME_VALIDO.test(String(nome))) return null;
  const p = path.join(pasta(), nome);
  return fs.existsSync(p) ? p : null;
}

function verificar(ficheiro) {
  const copia = new Database(ficheiro, { readonly: true, fileMustExist: true });
  try { return copia.pragma('quick_check', { simple: true }) === 'ok'; } finally { copia.close(); }
}

function aplicarRetencao(manter) {
  const apagadas = listar().slice(manter);
  for (const b of apagadas) fs.rmSync(path.join(pasta(), b.nome), { force: true });
  return apagadas.length;
}

// Cópia consistente (API de backup do SQLite, segura com a BD em uso) + verificação de integridade.
async function criarBackup({ utilizador = 'sistema', motivo = 'automatico' } = {}) {
  fs.mkdirSync(pasta(), { recursive: true });
  const base = `sigat-${carimbo()}`;
  let nome = `${base}.db`;
  for (let i = 1; fs.existsSync(path.join(pasta(), nome)); i += 1) nome = `${base}-${i}.db`;
  const destino = path.join(pasta(), nome);
  await getDb().backup(destino);
  if (!verificar(destino)) {
    fs.rmSync(destino, { force: true });
    throw new Error('A cópia de segurança falhou a verificação de integridade.');
  }
  const removidas = aplicarRetencao(config.todas().backup_retencao);
  const tamanho = fs.statSync(destino).size;
  auditoria.registar({ utilizador, acao: 'backup', detalhes: { nome, tamanho, motivo, removidas } });
  return { nome, tamanho, removidas };
}

module.exports = { criarBackup, listar, caminho, aplicarRetencao, pasta };
