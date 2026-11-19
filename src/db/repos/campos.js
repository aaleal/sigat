const { getDb } = require('../index');

const aJson = (v) => JSON.stringify(v ?? null);
const deJson = (s, fallback = null) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

const cache = new Map(); // colecao -> campos mapeados
function invalidar() { cache.clear(); }

function mapear(row) {
  return {
    colecao: row.colecao,
    chave: row.chave,
    rotulo: row.rotulo,
    tipo: row.tipo,
    ordem: row.ordem,
    aliases: deJson(row.aliases, []),
    visivelTabela: !!row.visivel_tabela,
    pesquisavel: !!row.pesquisavel,
    numerico: !!row.filtro_numerico,
    obrigatorio: !!row.obrigatorio,
    peso: row.peso_pesquisa,
    sistema: !!row.sistema,
  };
}

function listar(colecao) {
  if (!cache.has(colecao)) {
    const rows = getDb().prepare('SELECT * FROM campos WHERE colecao = ? ORDER BY ordem, chave').all(colecao);
    cache.set(colecao, rows.map(mapear));
  }
  return cache.get(colecao);
}

// Chave segura derivada de um cabeçalho (camelCase sem acentos).
function chaveDeRotulo(rotulo) {
  const partes = String(rotulo).normalize('NFD').replace(/\p{M}/gu, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const chave = partes.map((p, i) => (i === 0 ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase())).join('');
  return /^[a-z]/.test(chave) ? chave : `c${chave}`;
}

function criar(colecao, { chave, rotulo, aliases = [], pesquisavel = true, visivelTabela = false, numerico = false, peso = 1 }) {
  const db = getDb();
  const ordem = (db.prepare('SELECT COALESCE(MAX(ordem), -1) + 1 AS o FROM campos WHERE colecao = ?').get(colecao).o);
  db.prepare(`INSERT INTO campos (colecao, chave, rotulo, ordem, aliases, visivel_tabela, pesquisavel, filtro_numerico, peso_pesquisa, sistema)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`)
    .run(colecao, chave, rotulo, ordem, JSON.stringify(aliases), visivelTabela ? 1 : 0, pesquisavel ? 1 : 0, numerico ? 1 : 0, peso);
  invalidar();
  return listar(colecao).find((c) => c.chave === chave);
}

function atualizar(colecao, chave, patch) {
  const db = getDb();
  const atual = listar(colecao).find((c) => c.chave === chave);
  if (!atual) return null;
  const novo = { ...atual, ...patch };
  db.prepare(`UPDATE campos SET rotulo = ?, aliases = ?, visivel_tabela = ?, pesquisavel = ?, filtro_numerico = ?, peso_pesquisa = ?
              WHERE colecao = ? AND chave = ?`)
    .run(String(novo.rotulo), JSON.stringify(novo.aliases || []), novo.visivelTabela ? 1 : 0, novo.pesquisavel ? 1 : 0,
      novo.numerico ? 1 : 0, Number(novo.peso) || 1, colecao, chave);
  invalidar();
  return listar(colecao).find((c) => c.chave === chave);
}

module.exports = { listar, criar, atualizar, chaveDeRotulo, invalidar };
