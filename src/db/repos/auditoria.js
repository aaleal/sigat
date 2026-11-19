const { getDb } = require('../index');

const deJson = (s) => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };

function registar({ utilizador = null, acao, ip = null, detalhes = {} }) {
  getDb().prepare('INSERT INTO auditoria (em, utilizador, acao, ip, detalhes) VALUES (?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), utilizador, acao, ip, JSON.stringify(detalhes));
}

function listar({ limite = 200, acao } = {}) {
  const rows = acao
    ? getDb().prepare('SELECT * FROM auditoria WHERE acao = ? ORDER BY id DESC LIMIT ?').all(acao, limite)
    : getDb().prepare('SELECT * FROM auditoria ORDER BY id DESC LIMIT ?').all(limite);
  return rows.map((r) => ({ id: r.id, em: r.em, utilizador: r.utilizador, acao: r.acao, ip: r.ip, detalhes: deJson(r.detalhes) }));
}

const purgar = (antesDe) => getDb().prepare('DELETE FROM auditoria WHERE em < ?').run(antesDe).changes;

module.exports = { registar, listar, purgar };
