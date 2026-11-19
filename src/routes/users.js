const express = require('express');
const bcrypt = require('bcryptjs');
const utilizadores = require('../db/repos/utilizadores');
const recuperacoes = require('../db/repos/recuperacoes');
const auditoria = require('../db/repos/auditoria');
const config = require('../config');
const limitadores = require('../limitadores');
const { validarPassword } = require('../politicaPasswords');
const { authMiddleware, requireRole, comErros } = require('../auth');

const router = express.Router();
const admin = [authMiddleware, requireRole('admin')];
const ROLES = ['admin', 'write', 'read'];

const utilizadorOu404 = (req, res) => {
  const u = utilizadores.obterPorId(req.params.id);
  if (!u) res.status(404).json({ message: 'Utilizador não encontrado.' });
  return u;
};

router.get('/users', ...admin, (_req, res) => res.json(utilizadores.listar()));

router.post('/users', ...admin, comErros(async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !role) return res.status(400).json({ message: 'username, password e role são obrigatórios.' });
  if (!ROLES.includes(role)) return res.status(400).json({ message: 'Role inválida. Use admin, write ou read.' });
  const nome = String(username).trim();
  const erroPassword = validarPassword(password, nome);
  if (erroPassword) return res.status(400).json({ message: erroPassword });
  if (utilizadores.obterPorUsername(nome)) return res.status(409).json({ message: 'Username já existe.' });

  const passwordHash = await bcrypt.hash(String(password), 10);
  const criado = utilizadores.criar({ username: nome, role, passwordHash });
  auditoria.registar({ utilizador: req.user.username, acao: 'utilizador_criado', ip: req.ip, detalhes: { username: nome, role } });
  return res.status(201).json(criado);
}));

router.patch('/users/:id/password', ...admin, comErros(async (req, res) => {
  const user = utilizadorOu404(req, res);
  if (!user) return undefined;
  if (user.origem !== 'local') return res.status(400).json({ message: 'Conta gerida pela autenticação da organização.' });
  const erroPassword = validarPassword(req.body?.password, user.username);
  if (erroPassword) return res.status(400).json({ message: erroPassword });
  utilizadores.definirPassword(user.id, await bcrypt.hash(String(req.body.password), 10), true);
  auditoria.registar({ utilizador: req.user.username, acao: 'password_reposta', ip: req.ip, detalhes: { username: user.username } });
  return res.json({ message: 'Password atualizada com sucesso.' });
}));

router.patch('/users/:id/role', ...admin, comErros(async (req, res) => {
  const user = utilizadorOu404(req, res);
  if (!user) return undefined;
  const { role } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ message: 'Role inválida. Use admin, write ou read.' });
  if (user.role === 'admin' && role !== 'admin' && utilizadores.contarAdmins() <= 1) {
    return res.status(400).json({ message: 'Tem de existir pelo menos um administrador.' });
  }
  utilizadores.definirRole(user.id, role);
  auditoria.registar({ utilizador: req.user.username, acao: 'role_alterada', ip: req.ip, detalhes: { username: user.username, de: user.role, para: role } });
  return res.json(utilizadores.paraApi(utilizadores.obterPorId(user.id)));
}));

router.post('/users/:id/desbloquear', ...admin, comErros(async (req, res) => {
  const user = utilizadorOu404(req, res);
  if (!user) return undefined;
  utilizadores.limparFalhas(user.id);
  limitadores.login.limparUtilizador(user.username);
  limitadores.recuperar.limparUtilizador(user.username);
  auditoria.registar({ utilizador: req.user.username, acao: 'conta_desbloqueada', ip: req.ip, detalhes: { username: user.username } });
  return res.json({ message: 'Conta desbloqueada.' });
}));

router.post('/users/:id/revogar-sessoes', ...admin, comErros(async (req, res) => {
  const user = utilizadorOu404(req, res);
  if (!user) return undefined;
  utilizadores.revogarSessoes(user.id);
  auditoria.registar({ utilizador: req.user.username, acao: 'sessoes_revogadas', ip: req.ip, detalhes: { username: user.username } });
  return res.json({ message: 'Sessões terminadas.' });
}));

// Emite um código de recuperação de uso único para entregar ao utilizador (mostrado uma só vez).
router.post('/users/:id/recuperacao', ...admin, comErros(async (req, res) => {
  const user = utilizadorOu404(req, res);
  if (!user) return undefined;
  if (user.origem !== 'local') return res.status(400).json({ message: 'Conta gerida pela autenticação da organização.' });
  const { recuperacao_validade_minutos: validade } = config.todas();
  const emitido = recuperacoes.emitir(user.id, req.user.username, validade);
  auditoria.registar({ utilizador: req.user.username, acao: 'recuperacao_emitida', ip: req.ip, detalhes: { username: user.username } });
  return res.status(201).json({ username: user.username, ...emitido });
}));

router.get('/admin/recuperacoes', ...admin, (_req, res) => res.json({ items: recuperacoes.listarPedidos() }));

router.delete('/users/:id', ...admin, (req, res) => {
  const user = utilizadores.obterPorId(req.params.id);
  if (req.user.sub === req.params.id) return res.status(400).json({ message: 'Não pode apagar o próprio utilizador.' });
  if (!user) return res.status(404).json({ message: 'Utilizador não encontrado.' });
  utilizadores.apagar(user.id);
  auditoria.registar({ utilizador: req.user.username, acao: 'utilizador_apagado', ip: req.ip, detalhes: { username: user.username } });
  return res.json({ message: 'Utilizador apagado com sucesso.' });
});

module.exports = router;
