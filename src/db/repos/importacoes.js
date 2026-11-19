const { randomUUID } = require('crypto');
const { getDb, transaction } = require('../index');

const deJson = (s, fallback = null) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

function paraApi(r) {
  if (!r) return null;
  return {
    id: r.id,
    colecao: r.colecao,
    ficheiro: r.ficheiro_nome,
    sha256: r.ficheiro_sha256,
    tamanho: r.tamanho,
    estado: r.estado,
    mapeamento: deJson(r.mapeamento, {}),
    resumo: deJson(r.resumo, null),
    erros: deJson(r.erros, []),
    avisos: deJson(r.avisos, []),
    criadaEm: r.criada_em,
    criadaPor: r.criada_por,
    aplicadaEm: r.aplicada_em,
    aplicadaPor: r.aplicada_por,
  };
}

function criar({ colecao, ficheiro, sha256, tamanho, utilizador, mapeamento, avisos = [] }) {
  const id = randomUUID();
  getDb().prepare(`INSERT INTO importacoes (id, colecao, ficheiro_nome, ficheiro_sha256, tamanho, estado, mapeamento, avisos, criada_em, criada_por)
                   VALUES (?, ?, ?, ?, ?, 'mapeamento', ?, ?, ?, ?)`)
    .run(id, colecao, ficheiro, sha256, tamanho, JSON.stringify(mapeamento), JSON.stringify(avisos), new Date().toISOString(), utilizador);
  return id;
}

const obter = (id) => paraApi(getDb().prepare('SELECT * FROM importacoes WHERE id = ?').get(id));
const listar = (colecao) => getDb().prepare(`SELECT * FROM importacoes ${colecao ? 'WHERE colecao = ?' : ''} ORDER BY criada_em DESC LIMIT 100`)
  .all(...(colecao ? [colecao] : [])).map(paraApi);
const porSha = (colecao, sha) => paraApi(getDb().prepare(`SELECT * FROM importacoes WHERE colecao = ? AND ficheiro_sha256 = ? AND estado = 'aplicada' ORDER BY aplicada_em DESC LIMIT 1`).get(colecao, sha));

function atualizar(id, campos) {
  const mapa = { estado: 'estado', mapeamento: 'mapeamento', resumo: 'resumo', erros: 'erros', avisos: 'avisos', aplicadaEm: 'aplicada_em', aplicadaPor: 'aplicada_por' };
  const sets = [];
  const args = [];
  for (const [k, v] of Object.entries(campos)) {
    if (!mapa[k]) continue;
    sets.push(`${mapa[k]} = ?`);
    args.push(['mapeamento', 'resumo', 'erros', 'avisos'].includes(k) ? JSON.stringify(v) : v);
  }
  if (sets.length) getDb().prepare(`UPDATE importacoes SET ${sets.join(', ')} WHERE id = ?`).run(...args, id);
}

/** Cancela pré-visualizações pendentes da coleção (só uma ativa) e as que expiraram (24 h). */
function cancelarPendentes(colecao) {
  const db = getDb();
  const limite = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const rows = db.prepare(`SELECT id FROM importacoes WHERE estado IN ('mapeamento','previsualizacao') AND (colecao = ? OR criada_em < ?)`).all(colecao, limite);
  for (const r of rows) {
    db.prepare("UPDATE importacoes SET estado = 'cancelada' WHERE id = ?").run(r.id);
    db.prepare('DELETE FROM importacao_itens WHERE importacao_id = ?').run(r.id);
  }
  return rows.map((r) => r.id);
}

function substituirItens(importacaoId, itens) {
  const db = getDb();
  const ins = db.prepare(`INSERT INTO importacao_itens (importacao_id, linha, acao, documento_id, candidatos, criterio, dados_ficheiro, diff, decisao)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  transaction(() => {
    db.prepare('DELETE FROM importacao_itens WHERE importacao_id = ?').run(importacaoId);
    for (const i of itens) {
      ins.run(importacaoId, i.linha, i.acao, i.documentoId || null, i.candidatos ? JSON.stringify(i.candidatos) : null,
        i.criterio || null, JSON.stringify(i.dadosFicheiro || {}), i.diff ? JSON.stringify(i.diff) : null, null);
    }
  });
}

function itemParaApi(r) {
  return {
    linha: r.linha,
    acao: r.acao,
    documentoId: r.documento_id,
    candidatos: deJson(r.candidatos, []),
    criterio: r.criterio,
    dadosFicheiro: deJson(r.dados_ficheiro, {}),
    diff: deJson(r.diff, null),
    decisao: deJson(r.decisao, null),
  };
}

const contagens = (id) => Object.fromEntries(getDb().prepare('SELECT acao, COUNT(*) AS n FROM importacao_itens WHERE importacao_id = ? GROUP BY acao').all(id).map((r) => [r.acao, r.n]));
const obterItem = (id, linha) => itemParaApi(getDb().prepare('SELECT * FROM importacao_itens WHERE importacao_id = ? AND linha = ?').get(id, linha));
const todosItens = (id) => getDb().prepare('SELECT * FROM importacao_itens WHERE importacao_id = ? ORDER BY linha').all(id).map(itemParaApi);

function listarItens(id, { acao, page = 1, pageSize = 25 } = {}) {
  const db = getDb();
  const where = acao ? 'AND acao = ?' : '';
  const args = acao ? [id, acao] : [id];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM importacao_itens WHERE importacao_id = ? ${where}`).get(...args).n;
  const rows = db.prepare(`SELECT * FROM importacao_itens WHERE importacao_id = ? ${where} ORDER BY ABS(linha) LIMIT ? OFFSET ?`)
    .all(...args, pageSize, (page - 1) * pageSize);
  return { total, items: rows.map(itemParaApi) };
}

function atualizarItem(id, linha, { acao, documentoId, diff, decisao }) {
  const sets = [];
  const args = [];
  if (acao !== undefined) { sets.push('acao = ?'); args.push(acao); }
  if (documentoId !== undefined) { sets.push('documento_id = ?'); args.push(documentoId); }
  if (diff !== undefined) { sets.push('diff = ?'); args.push(JSON.stringify(diff)); }
  if (decisao !== undefined) { sets.push('decisao = ?'); args.push(decisao === null ? null : JSON.stringify(decisao)); }
  if (sets.length) getDb().prepare(`UPDATE importacao_itens SET ${sets.join(', ')} WHERE importacao_id = ? AND linha = ?`).run(...args, id, linha);
}

module.exports = {
  criar, obter, listar, porSha, atualizar, cancelarPendentes, substituirItens, contagens, obterItem, todosItens, listarItens, atualizarItem,
};
