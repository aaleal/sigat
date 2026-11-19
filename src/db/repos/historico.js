const { randomUUID } = require('crypto');
const { getDb } = require('../index');

const deJson = (s, fallback = {}) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

function registar({ colecao, documentoId = null, acao, utilizador, detalhes = {}, importacaoId = null, em = new Date().toISOString() }) {
  getDb().prepare(`INSERT INTO historico (id, colecao, documento_id, acao, utilizador, em, importacao_id, detalhes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), colecao, documentoId, acao, utilizador, em, importacaoId, JSON.stringify(detalhes));
}

// Ações em pt na BD; o frontend usa os nomes em inglês já existentes.
const ACAO_API = { criar: 'create', editar: 'edit', eliminar: 'delete', restaurar: 'restore', estado: 'estado', exportar: 'export' };

function paraApi(row) {
  const detalhes = deJson(row.detalhes);
  const dados = deJson(row.dados, {});
  const ref = row.documento_id
    ? { sourceEntryNumber: row.numero, cabecalho: dados.cabecalho || dados.titulo || '' }
    : { sourceEntryNumber: 0, cabecalho: detalhes.rotulo || '' };
  return {
    id: row.id,
    action: ACAO_API[row.acao] || row.acao,
    timestamp: row.em,
    user: row.utilizador,
    entryRef: ref,
    documentoId: row.documento_id,
    importacaoId: row.importacao_id,
    details: detalhes,
  };
}

const SELECT = `SELECT h.*, d.numero AS numero, d.dados AS dados FROM historico h LEFT JOIN documentos d ON d.id = h.documento_id`;

function listarColecao(colecao, limite = 2000) {
  return getDb().prepare(`${SELECT} WHERE h.colecao = ? ORDER BY h.em DESC, h.rowid DESC LIMIT ?`).all(colecao, limite).map(paraApi);
}

function listarDocumento(documentoId, limite = 500) {
  return getDb().prepare(`${SELECT} WHERE h.documento_id = ? ORDER BY h.em DESC, h.rowid DESC LIMIT ?`).all(documentoId, limite).map(paraApi);
}

module.exports = { registar, listarColecao, listarDocumento };
