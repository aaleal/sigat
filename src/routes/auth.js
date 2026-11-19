const express = require('express');
const bcrypt = require('bcryptjs');
const { randomBytes, timingSafeEqual } = require('crypto');
const utilizadores = require('../db/repos/utilizadores');
const recuperacoes = require('../db/repos/recuperacoes');
const auditoria = require('../db/repos/auditoria');
const config = require('../config');
const { validarPassword } = require('../politicaPasswords');
const { buildToken, authMiddleware, comErros } = require('../auth');

const limitadores = require('../limitadores');

const router = express.Router();

// Hash fictício para que a verificação de um utilizador inexistente demore o mesmo tempo.
const HASH_FICTICIO = bcrypt.hashSync('sigat-hash-ficticio', 10);

const limiteLogin = limitadores.login;
const limitePedidos = limitadores.pedidosRecuperacao;
const limiteRecuperar = limitadores.recuperar;
const JANELA_RECUPERACAO_MS = 15 * 60_000;
const MSG_BLOQUEIO = 'Demasiadas tentativas falhadas. Tente novamente dentro de alguns minutos ou contacte o administrador.';
const chaveLogin = (req, username) => `${req.ip}|${String(username).toLowerCase()}`;

router.post('/auth/login', comErros(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'Username e password são obrigatórios.' });
  const cfg = config.todas();
  const janelaMs = cfg.bloqueio_minutos * 60_000;

  const chave = chaveLogin(req, username);
  if (limiteLogin.bloqueado(chave, cfg.max_tentativas, janelaMs)) return res.status(429).json({ message: MSG_BLOQUEIO });

  let user = utilizadores.obterPorUsername(String(username));
  if (user?.bloqueado_ate && new Date(user.bloqueado_ate) > new Date()) {
    auditoria.registar({ utilizador: user.username, acao: 'login_bloqueado', ip: req.ip });
    return res.status(429).json({ message: MSG_BLOQUEIO });
  }

  const hash = user && user.origem === 'local' ? user.password_hash : HASH_FICTICIO;
  const correta = await bcrypt.compare(String(password), hash);
  if (!user || user.origem !== 'local' || !correta) {
    limiteLogin.falha(chave, janelaMs);
    auditoria.registar({ utilizador: String(username).slice(0, 100), acao: 'login_falhou', ip: req.ip });
    if (user) {
      const r = utilizadores.registarFalha(user.id, cfg.max_tentativas, cfg.bloqueio_minutos);
      if (r.bloqueada) auditoria.registar({ utilizador: user.username, acao: 'conta_bloqueada', ip: req.ip, detalhes: { ate: r.ate } });
    }
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }

  limiteLogin.limpar(chave);
  utilizadores.limparFalhas(user.id);
  if (!user.trocar_password && cfg.password_validade_dias > 0) {
    const desde = new Date(user.password_alterada_em || user.criado_em).getTime();
    if (Date.now() - desde > cfg.password_validade_dias * 86_400_000) {
      utilizadores.exigirTrocaPassword(user.id);
      user = utilizadores.obterPorId(user.id);
    }
  }
  auditoria.registar({ utilizador: user.username, acao: 'login_ok', ip: req.ip });
  return res.json({ token: buildToken(user), user: utilizadores.paraApi(user) });
}));

// Altera a própria password (obrigatório no primeiro acesso). As outras sessões ficam terminadas.
router.post('/auth/password', authMiddleware, comErros(async (req, res) => {
  const { atual, nova } = req.body || {};
  const user = utilizadores.obterPorId(req.user.sub);
  if (!user || user.origem !== 'local') return res.status(400).json({ message: 'Esta conta usa a autenticação da organização.' });
  if (!(await bcrypt.compare(String(atual || ''), user.password_hash))) {
    return res.status(400).json({ message: 'A password atual está incorreta.' });
  }
  const erro = validarPassword(nova, user.username);
  if (erro) return res.status(400).json({ message: erro });
  if (String(nova) === String(atual)) return res.status(400).json({ message: 'A nova password tem de ser diferente da atual.' });
  utilizadores.definirPassword(user.id, await bcrypt.hash(String(nova), 10), false);
  auditoria.registar({ utilizador: user.username, acao: 'password_alterada', ip: req.ip });
  return res.json({ message: 'Password alterada com sucesso.', token: buildToken(utilizadores.obterPorId(user.id)) });
}));

router.get('/auth/me', authMiddleware, comErros(async (req, res) => {
  const user = utilizadores.obterPorId(req.user.sub);
  if (!user) return res.status(404).json({ message: 'Utilizador não encontrado.' });
  return res.json(utilizadores.paraApi(user));
}));

router.get('/auth/politica', (_req, res) => {
  const c = config.todas();
  res.json({ passwordMin: c.password_min, passwordComplexa: c.password_complexa, sessaoHoras: c.sessao_horas });
});

// ── Recuperação de password (sem email: o administrador entrega um código de uso único) ──
router.post('/auth/recuperar/pedir', comErros(async (req, res) => {
  const resposta = { message: 'Se a conta existir, o administrador foi avisado e poderá fornecer-lhe um código de recuperação.' };
  if (limitePedidos.bloqueado(req.ip, 10, JANELA_RECUPERACAO_MS)) return res.json(resposta);
  limitePedidos.falha(req.ip, JANELA_RECUPERACAO_MS);
  const user = utilizadores.obterPorUsername(String(req.body?.username || ''));
  if (user && user.origem === 'local' && recuperacoes.pedir(user.id)) {
    auditoria.registar({ utilizador: user.username, acao: 'recuperacao_pedida', ip: req.ip });
  }
  return res.json(resposta);
}));

router.post('/auth/recuperar', comErros(async (req, res) => {
  const { username, codigo, nova } = req.body || {};
  const invalido = () => res.status(400).json({ message: 'Código inválido ou expirado.' });
  if (!username || !codigo || !nova) return res.status(400).json({ message: 'Utilizador, código e nova password são obrigatórios.' });
  const chave = chaveLogin(req, username);
  if (limiteRecuperar.bloqueado(chave, 5, JANELA_RECUPERACAO_MS)) return res.status(429).json({ message: MSG_BLOQUEIO });

  const erroPolitica = validarPassword(nova, String(username));
  if (erroPolitica) return res.status(400).json({ message: erroPolitica });

  const user = utilizadores.obterPorUsername(String(username));
  if (!user || user.origem !== 'local' || !recuperacoes.consumir(user.id, codigo)) {
    limiteRecuperar.falha(chave, JANELA_RECUPERACAO_MS);
    auditoria.registar({ utilizador: String(username).slice(0, 100), acao: 'recuperacao_falhou', ip: req.ip });
    return invalido();
  }
  utilizadores.definirPassword(user.id, await bcrypt.hash(String(nova), 10), false);
  limiteRecuperar.limpar(chave);
  limiteLogin.limpar(chave);
  auditoria.registar({ utilizador: user.username, acao: 'recuperacao_usada', ip: req.ip });
  return res.json({ message: 'Password redefinida. Já pode iniciar sessão.' });
}));

// ── SSO por proxy de autenticação (IIS/Windows, oauth2-proxy, Azure Easy Auth, ...) ──
// O proxy autentica o utilizador, remove o cabeçalho enviado pelo cliente e injeta o cabeçalho de
// identidade e o segredo partilhado. Sem SSO_HEADER e SSO_SEGREDO o SSO fica desativado.
function ssoConfig() {
  const header = String(process.env.SSO_HEADER || '').trim().toLowerCase();
  const segredo = String(process.env.SSO_SEGREDO || '');
  const papel = ['read', 'write', 'admin'].includes(process.env.SSO_ROLE_POR_OMISSAO) ? process.env.SSO_ROLE_POR_OMISSAO : '';
  return {
    ativo: !!header && segredo.length >= 16,
    header,
    segredo,
    papel,
    removerDominio: process.env.SSO_REMOVER_DOMINIO === '1',
    logoutUrl: process.env.SSO_LOGOUT_URL || '',
  };
}

function segredoCoincide(recebido, esperado) {
  const a = Buffer.from(String(recebido || ''));
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

router.get('/auth/sso/estado', (_req, res) => {
  const c = ssoConfig();
  res.json({ ativo: c.ativo, logoutUrl: c.ativo ? c.logoutUrl : '' });
});

router.post('/auth/sso', comErros(async (req, res) => {
  const c = ssoConfig();
  if (!c.ativo) return res.status(404).json({ message: 'SSO não está ativo.' });
  if (!segredoCoincide(req.headers['x-sigat-sso-secret'], c.segredo)) {
    auditoria.registar({ acao: 'sso_recusado', ip: req.ip, detalhes: { motivo: 'segredo' } });
    return res.status(401).json({ message: 'Autenticação da organização não disponível.' });
  }
  let nome = String(req.headers[c.header] || '').trim();
  if (c.removerDominio) nome = nome.replace(/@.*$/, '').replace(/^.*\\/, '');
  if (!nome || nome.length > 100 || !/^[\p{L}\p{N}._@\\-]+$/u.test(nome)) {
    auditoria.registar({ acao: 'sso_recusado', ip: req.ip, detalhes: { motivo: 'identidade' } });
    return res.status(401).json({ message: 'Identidade inválida.' });
  }
  let user = utilizadores.obterPorUsername(nome);
  if (!user) {
    if (!c.papel) {
      auditoria.registar({ utilizador: nome, acao: 'sso_recusado', ip: req.ip, detalhes: { motivo: 'sem_conta' } });
      return res.status(403).json({ message: 'A sua conta não está autorizada no SIGAT. Contacte o administrador.' });
    }
    const hash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    utilizadores.criar({ username: nome, role: c.papel, passwordHash: hash, origem: 'sso' });
    user = utilizadores.obterPorUsername(nome);
    auditoria.registar({ utilizador: nome, acao: 'sso_conta_criada', ip: req.ip, detalhes: { role: c.papel } });
  }
  if (user.bloqueado_ate && new Date(user.bloqueado_ate) > new Date()) return res.status(429).json({ message: MSG_BLOQUEIO });
  auditoria.registar({ utilizador: user.username, acao: 'login_sso', ip: req.ip });
  return res.json({ token: buildToken(user), user: utilizadores.paraApi(user) });
}));

module.exports = router;
