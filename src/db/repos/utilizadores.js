const { randomUUID } = require('crypto');
const { getDb } = require('../index');

const paraApi = (r) => (r ? { id: r.id, username: r.username, role: r.role, createdAt: r.criado_em, trocarPassword: !!r.trocar_password } : null);

const listar = () => getDb().prepare('SELECT * FROM utilizadores ORDER BY username').all().map(paraApi);
const contar = () => getDb().prepare('SELECT COUNT(*) AS n FROM utilizadores').get().n;
const obterPorId = (id) => getDb().prepare('SELECT * FROM utilizadores WHERE id = ?').get(id) || null;
const obterPorUsername = (username) => getDb().prepare('SELECT * FROM utilizadores WHERE username = ?').get(String(username)) || null;

function criar({ id = randomUUID(), username, role, passwordHash, criadoEm = new Date().toISOString(), trocarPassword = false }) {
  getDb().prepare('INSERT INTO utilizadores (id, username, role, password_hash, criado_em, trocar_password) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, username, role, passwordHash, criadoEm, trocarPassword ? 1 : 0);
  return paraApi(obterPorId(id));
}

function definirPassword(id, passwordHash, trocarPassword = false) {
  return getDb().prepare('UPDATE utilizadores SET password_hash = ?, trocar_password = ? WHERE id = ?')
    .run(passwordHash, trocarPassword ? 1 : 0, id).changes > 0;
}

const apagar = (id) => getDb().prepare('DELETE FROM utilizadores WHERE id = ?').run(id).changes > 0;
const listarComHash = () => getDb().prepare('SELECT * FROM utilizadores').all();
const exigirTrocaPassword = (id) => getDb().prepare('UPDATE utilizadores SET trocar_password = 1 WHERE id = ?').run(id);

module.exports = { listar, contar, obterPorId, obterPorUsername, criar, definirPassword, apagar, paraApi, listarComHash, exigirTrocaPassword };
