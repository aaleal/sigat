const { randomUUID } = require('crypto');
const { getDb } = require('../index');

const paraApi = (r) => (r ? {
  id: r.id,
  username: r.username,
  role: r.role,
  createdAt: r.criado_em,
  trocarPassword: !!r.trocar_password,
  origem: r.origem,
  bloqueadoAte: r.bloqueado_ate && new Date(r.bloqueado_ate) > new Date() ? r.bloqueado_ate : null,
} : null);

const listar = () => getDb().prepare('SELECT * FROM utilizadores ORDER BY username').all().map(paraApi);
const contar = () => getDb().prepare('SELECT COUNT(*) AS n FROM utilizadores').get().n;
const obterPorId = (id) => getDb().prepare('SELECT * FROM utilizadores WHERE id = ?').get(id) || null;
const obterPorUsername = (username) => getDb().prepare('SELECT * FROM utilizadores WHERE username = ?').get(String(username)) || null;

function criar({ id = randomUUID(), username, role, passwordHash, criadoEm = new Date().toISOString(), trocarPassword = false, origem = 'local' }) {
  getDb().prepare('INSERT INTO utilizadores (id, username, role, password_hash, criado_em, trocar_password, password_alterada_em, origem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, username, role, passwordHash, criadoEm, trocarPassword ? 1 : 0, criadoEm, origem);
  return paraApi(obterPorId(id));
}

// Nova password: termina as sessões abertas, limpa bloqueios e regista a data da alteração.
function definirPassword(id, passwordHash, trocarPassword = false) {
  return getDb().prepare(`UPDATE utilizadores SET password_hash = ?, trocar_password = ?, password_alterada_em = ?,
                          sessao_versao = sessao_versao + 1, tentativas_falhadas = 0, bloqueado_ate = NULL WHERE id = ?`)
    .run(passwordHash, trocarPassword ? 1 : 0, new Date().toISOString(), id).changes > 0;
}

const apagar = (id) => getDb().prepare('DELETE FROM utilizadores WHERE id = ?').run(id).changes > 0;
const listarComHash = () => getDb().prepare('SELECT * FROM utilizadores').all();
const exigirTrocaPassword = (id) => getDb().prepare('UPDATE utilizadores SET trocar_password = 1 WHERE id = ?').run(id);

// Conta uma falha de login; ao atingir o máximo bloqueia a conta. Devolve { bloqueada }.
function registarFalha(id, maximo, minutos) {
  const u = obterPorId(id);
  const n = (u?.tentativas_falhadas || 0) + 1;
  if (n >= maximo) {
    const ate = new Date(Date.now() + minutos * 60_000).toISOString();
    getDb().prepare('UPDATE utilizadores SET tentativas_falhadas = 0, bloqueado_ate = ? WHERE id = ?').run(ate, id);
    return { bloqueada: true, ate };
  }
  getDb().prepare('UPDATE utilizadores SET tentativas_falhadas = ? WHERE id = ?').run(n, id);
  return { bloqueada: false };
}

const limparFalhas = (id) => getDb().prepare('UPDATE utilizadores SET tentativas_falhadas = 0, bloqueado_ate = NULL WHERE id = ?').run(id).changes > 0;
const revogarSessoes = (id) => getDb().prepare('UPDATE utilizadores SET sessao_versao = sessao_versao + 1 WHERE id = ?').run(id).changes > 0;
const definirRole = (id, role) => getDb().prepare('UPDATE utilizadores SET role = ? WHERE id = ?').run(role, id).changes > 0;
const contarAdmins = () => getDb().prepare("SELECT COUNT(*) AS n FROM utilizadores WHERE role = 'admin'").get().n;

module.exports = {
  listar, contar, obterPorId, obterPorUsername, criar, definirPassword, apagar, paraApi, listarComHash, exigirTrocaPassword,
  registarFalha, limparFalhas, revogarSessoes, definirRole, contarAdmins,
};
