const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { COLECOES, CAMPOS } = require('../campos');

const MIGRACOES_DIR = path.join(__dirname, 'migrations');
let db = null;
let diretorio = null;

function aplicarMigracoes(conexao) {
  conexao.exec('CREATE TABLE IF NOT EXISTS schema_migrations (versao INTEGER PRIMARY KEY, aplicada_em TEXT NOT NULL)');
  const aplicadas = new Set(conexao.prepare('SELECT versao FROM schema_migrations').all().map((r) => r.versao));
  const ficheiros = fs.readdirSync(MIGRACOES_DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  for (const f of ficheiros) {
    const versao = parseInt(f, 10);
    if (aplicadas.has(versao)) continue;
    conexao.transaction(() => {
      conexao.exec(fs.readFileSync(path.join(MIGRACOES_DIR, f), 'utf-8'));
      conexao.prepare('INSERT INTO schema_migrations (versao, aplicada_em) VALUES (?, ?)').run(versao, new Date().toISOString());
    })();
  }
}

// Insere coleções/campos de sistema em falta (não altera rótulos/pesos já editados pelo admin).
function semear(conexao) {
  const inserirColecao = conexao.prepare('INSERT OR IGNORE INTO colecoes (id, nome) VALUES (?, ?)');
  const inserirCampo = conexao.prepare(`INSERT OR IGNORE INTO campos
    (colecao, chave, rotulo, tipo, ordem, aliases, visivel_tabela, pesquisavel, filtro_numerico, obrigatorio, peso_pesquisa, sistema)
    VALUES (@colecao, @chave, @rotulo, 'texto', @ordem, @aliases, @visivel, 1, @numerico, @obrigatorio, @peso, @sistema)`);
  conexao.transaction(() => {
    for (const c of COLECOES) inserirColecao.run(c.id, c.nome);
    for (const [colecao, lista] of Object.entries(CAMPOS)) {
      lista.forEach((c, i) => inserirCampo.run({
        colecao,
        chave: c.chave,
        rotulo: c.rotulo,
        ordem: i,
        aliases: JSON.stringify(c.aliases || []),
        visivel: c.visivelTabela ? 1 : 0,
        numerico: c.numerico ? 1 : 0,
        obrigatorio: c.obrigatorio ? 1 : 0,
        peso: c.peso ?? 1,
        sistema: c.sistema ? 1 : 0,
      }));
    }
  })();
}

function abrir(dir) {
  fecharBd();
  diretorio = dir;
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'sigat.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  aplicarMigracoes(db);
  semear(db);
  return db;
}

function getDb() {
  if (!db) throw new Error('Base de dados não inicializada.');
  return db;
}

function fecharBd() {
  if (db) { db.close(); db = null; }
}

// Executa fn numa transação (síncrona: better-sqlite3).
function transaction(fn) {
  return getDb().transaction(fn)();
}

module.exports = { abrir, getDb, fecharBd, transaction, getDir: () => diretorio };
