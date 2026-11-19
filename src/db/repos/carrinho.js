const { getDb } = require('../index');
const documentos = require('./documentos');

const LIMITE = 500;

// Documentos do carrinho do utilizador (ignora os eliminados), pela ordem em que foram adicionados.
function listar(utilizadorId) {
  const ids = getDb().prepare('SELECT documento_id FROM carrinhos WHERE utilizador_id = ? ORDER BY adicionado_em, rowid').all(utilizadorId);
  return ids.map((r) => documentos.obter(r.documento_id, { incluirEliminados: false })).filter(Boolean);
}

// Devolve false se o carrinho está cheio.
function adicionar(utilizadorId, documentoId) {
  const db = getDb();
  if (db.prepare('SELECT 1 FROM carrinhos WHERE utilizador_id = ? AND documento_id = ?').get(utilizadorId, documentoId)) return true;
  if (db.prepare('SELECT COUNT(*) AS n FROM carrinhos WHERE utilizador_id = ?').get(utilizadorId).n >= LIMITE) return false;
  db.prepare('INSERT INTO carrinhos (utilizador_id, documento_id, adicionado_em) VALUES (?, ?, ?)').run(utilizadorId, documentoId, new Date().toISOString());
  return true;
}

const remover = (utilizadorId, documentoId) => getDb().prepare('DELETE FROM carrinhos WHERE utilizador_id = ? AND documento_id = ?').run(utilizadorId, documentoId).changes > 0;
const limpar = (utilizadorId) => getDb().prepare('DELETE FROM carrinhos WHERE utilizador_id = ?').run(utilizadorId).changes;

module.exports = { listar, adicionar, remover, limpar, LIMITE };
