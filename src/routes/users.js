const express = require('express');
const bcrypt = require('bcryptjs');
const utilizadores = require('../db/repos/utilizadores');
const { buildToken, authMiddleware, requireRole, comErros } = require('../auth');

const router = express.Router();

const PASSWORD_MIN = 8;
const validarPassword = (p) => (String(p || '').length >= PASSWORD_MIN ? null : `A password deve ter pelo menos ${PASSWORD_MIN} caracteres.`);

// Limita tentativas falhadas de login (em memória): 5 por IP+utilizador em 15 minutos.
const falhas = new Map();
const JANELA_MS = 15 * 60 * 1000;
const MAX_FALHAS = 5;
const chaveFalhas = (req, username) => `${req.ip}|${String(username).toLowerCase()}`;
function bloqueado(chave) {
  const f = falhas.get(chave);
  if (!f) return false;
  if (Date.now() - f.desde > JANELA_MS) { falhas.delete(chave); return false; }
  return f.n >= MAX_FALHAS;
}
function registarFalha(chave) {
  const f = falhas.get(chave);
  if (!f || Date.now() - f.desde > JANELA_MS) falhas.set(chave, { n: 1, desde: Date.now() });
  else f.n += 1;
}

router.post('/auth/login', comErros(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'Username e password são obrigatórios.' });

  const chave = chaveFalhas(req, username);
  if (bloqueado(chave)) return res.status(429).json({ message: 'Demasiadas tentativas falhadas. Tente novamente dentro de alguns minutos.' });

  const user = utilizadores.obterPorUsername(username);
  if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
    registarFalha(chave);
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }
  falhas.delete(chave);
  return res.json({ token: buildToken(user), user: utilizadores.paraApi(user) });
}));

// Altera a própria password (obrigatório no primeiro acesso com a password inicial).
router.post('/auth/password', authMiddleware, comErros(async (req, res) => {
  const { atual, nova } = req.body || {};
  const user = utilizadores.obterPorId(req.user.sub);
  if (!user || !(await bcrypt.compare(String(atual || ''), user.password_hash))) {
    return res.status(400).json({ message: 'A password atual está incorreta.' });
  }
  const erro = validarPassword(nova);
  if (erro) return res.status(400).json({ message: erro });
  if (String(nova) === String(atual)) return res.status(400).json({ message: 'A nova password tem de ser diferente da atual.' });
  utilizadores.definirPassword(user.id, await bcrypt.hash(String(nova), 10), false);
  return res.json({ message: 'Password alterada com sucesso.' });
}));

router.get('/auth/me', authMiddleware, comErros(async (req, res) => {
  const user = utilizadores.obterPorId(req.user.sub);
  if (!user) return res.status(404).json({ message: 'Utilizador não encontrado.' });
  return res.json(utilizadores.paraApi(user));
}));

router.get('/users', authMiddleware, requireRole('admin'), (_req, res) => res.json(utilizadores.listar()));

router.post('/users', authMiddleware, requireRole('admin'), comErros(async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !role) return res.status(400).json({ message: 'username, password e role são obrigatórios.' });
  if (!['admin', 'write', 'read'].includes(role)) return res.status(400).json({ message: 'Role inválida. Use admin, write ou read.' });
  const erroPassword = validarPassword(password);
  if (erroPassword) return res.status(400).json({ message: erroPassword });
  if (utilizadores.obterPorUsername(String(username).trim())) return res.status(409).json({ message: 'Username já existe.' });

  const passwordHash = await bcrypt.hash(String(password), 10);
  return res.status(201).json(utilizadores.criar({ username: String(username).trim(), role, passwordHash }));
}));

router.patch('/users/:id/password', authMiddleware, requireRole('admin'), comErros(async (req, res) => {
  const { password } = req.body || {};
  const erroPassword = validarPassword(password);
  if (erroPassword) return res.status(400).json({ message: erroPassword });
  if (!utilizadores.definirPassword(req.params.id, await bcrypt.hash(String(password), 10), true)) {
    return res.status(404).json({ message: 'Utilizador não encontrado.' });
  }
  return res.json({ message: 'Password atualizada com sucesso.' });
}));

router.delete('/users/:id', authMiddleware, requireRole('admin'), (req, res) => {
  if (req.user.sub === req.params.id) return res.status(400).json({ message: 'Não pode apagar o próprio utilizador.' });
  if (!utilizadores.apagar(req.params.id)) return res.status(404).json({ message: 'Utilizador não encontrado.' });
  return res.json({ message: 'Utilizador apagado com sucesso.' });
});

module.exports = router;
