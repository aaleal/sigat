const { randomUUID, randomInt, createHash, timingSafeEqual } = require('crypto');
const { getDb, transaction } = require('../index');

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem caracteres ambíguos (0/O, 1/I)
const MAX_TENTATIVAS = 5;

const hash = (codigo) => createHash('sha256').update(codigo).digest('hex');
const normalizarCodigo = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function gerarCodigo() {
  let s = '';
  for (let i = 0; i < 8; i += 1) s += ALFABETO[randomInt(ALFABETO.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// Regista um pedido do utilizador (sem código); ignora se já existe um pedido em aberto.
function pedir(utilizadorId) {
  const aberto = getDb().prepare('SELECT 1 FROM recuperacoes WHERE utilizador_id = ? AND usado_em IS NULL').get(utilizadorId);
  if (aberto) return false;
  getDb().prepare('INSERT INTO recuperacoes (id, utilizador_id, pedido_em) VALUES (?, ?, ?)').run(randomUUID(), utilizadorId, new Date().toISOString());
  return true;
}

// O administrador emite um código de uso único (substitui qualquer pedido/código em aberto).
function emitir(utilizadorId, admin, validadeMinutos) {
  const codigo = gerarCodigo();
  const agora = new Date();
  const expira = new Date(agora.getTime() + validadeMinutos * 60_000).toISOString();
  transaction(() => {
    const anterior = getDb().prepare('SELECT MIN(pedido_em) AS p FROM recuperacoes WHERE utilizador_id = ? AND usado_em IS NULL').get(utilizadorId);
    getDb().prepare('DELETE FROM recuperacoes WHERE utilizador_id = ? AND usado_em IS NULL').run(utilizadorId);
    getDb().prepare(`INSERT INTO recuperacoes (id, utilizador_id, pedido_em, codigo_hash, emitido_por, emitido_em, expira_em)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), utilizadorId, anterior?.p || agora.toISOString(), hash(normalizarCodigo(codigo)), admin, agora.toISOString(), expira);
  });
  return { codigo, expiraEm: expira };
}

// Valida e consome o código. Devolve true se válido; após MAX_TENTATIVAS erradas o código é invalidado.
function consumir(utilizadorId, codigo) {
  const r = getDb().prepare('SELECT * FROM recuperacoes WHERE utilizador_id = ? AND usado_em IS NULL AND codigo_hash IS NOT NULL').get(utilizadorId);
  if (!r || new Date(r.expira_em) < new Date()) return false;
  const esperado = Buffer.from(r.codigo_hash, 'hex');
  const recebido = Buffer.from(hash(normalizarCodigo(codigo)), 'hex');
  if (esperado.length === recebido.length && timingSafeEqual(esperado, recebido)) {
    getDb().prepare('UPDATE recuperacoes SET usado_em = ? WHERE id = ?').run(new Date().toISOString(), r.id);
    return true;
  }
  if (r.tentativas + 1 >= MAX_TENTATIVAS) getDb().prepare('UPDATE recuperacoes SET usado_em = ? WHERE id = ?').run(new Date().toISOString(), r.id);
  else getDb().prepare('UPDATE recuperacoes SET tentativas = tentativas + 1 WHERE id = ?').run(r.id);
  return false;
}

// Pedidos feitos pelos utilizadores e ainda sem código emitido.
function listarPedidos() {
  return getDb().prepare(`SELECT r.id, r.utilizador_id AS utilizadorId, u.username, r.pedido_em AS pedidoEm
                          FROM recuperacoes r JOIN utilizadores u ON u.id = r.utilizador_id
                          WHERE r.usado_em IS NULL AND r.codigo_hash IS NULL ORDER BY r.pedido_em`).all();
}

module.exports = { pedir, emitir, consumir, listarPedidos, MAX_TENTATIVAS };
