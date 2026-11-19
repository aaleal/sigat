const jwt = require('jsonwebtoken');
const utilizadores = require('./db/repos/utilizadores');

const DEFAULT_JWT_SECRET = 'sigat-dev-secret-change-me';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.error('JWT_SECRET não definido (ou igual ao valor por omissão). Defina um segredo próprio em produção.');
  process.exit(1);
}

function buildToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
}

// Rotas permitidas enquanto a password inicial não for alterada.
const ROTAS_COM_TROCA_PENDENTE = new Set(['/auth/me', '/auth/password']);

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token em falta.' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (_error) {
    return res.status(401).json({ message: 'Token inválido.' });
  }
  // O utilizador e o role vêm da BD: contas apagadas ou com role alterado têm efeito imediato.
  const user = utilizadores.obterPorId(payload.sub);
  if (!user) return res.status(401).json({ message: 'Utilizador inexistente.' });
  req.user = { sub: user.id, username: user.username, role: user.role };
  if (user.trocar_password && !ROTAS_COM_TROCA_PENDENTE.has(req.path)) {
    return res.status(403).json({ message: 'Tem de alterar a password inicial antes de continuar.', trocarPassword: true });
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Sem permissões para esta ação.' });
    }
    return next();
  };
}

// Converte exceções de validação/negócio em respostas JSON { message, erros }.
function comErros(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (err) {
      if (err && err.status) return res.status(err.status).json({ message: err.message, erros: err.erros || {} });
      // eslint-disable-next-line no-console
      console.error(err);
      return res.status(500).json({ message: 'Erro interno do servidor.' });
    }
  };
}

module.exports = { buildToken, authMiddleware, requireRole, comErros };
