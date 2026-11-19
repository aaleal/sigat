const express = require('express');
const bcrypt = require('bcryptjs');
const utilizadores = require('../db/repos/utilizadores');
const { buildToken, authMiddleware, requireRole, comErros } = require('../auth');

const router = express.Router();

router.post('/auth/login', comErros(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'Username e password são obrigatórios.' });

  const user = utilizadores.obterPorUsername(username);
  if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }
  return res.json({ token: buildToken(user), user: utilizadores.paraApi(user) });
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
  if (utilizadores.obterPorUsername(String(username).trim())) return res.status(409).json({ message: 'Username já existe.' });

  const passwordHash = await bcrypt.hash(String(password), 10);
  return res.status(201).json(utilizadores.criar({ username: String(username).trim(), role, passwordHash }));
}));

router.patch('/users/:id/password', authMiddleware, requireRole('admin'), comErros(async (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).trim().length < 4) {
    return res.status(400).json({ message: 'Password inválida. Use pelo menos 4 caracteres.' });
  }
  if (!utilizadores.definirPassword(req.params.id, await bcrypt.hash(String(password), 10))) {
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
