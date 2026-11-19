const config = require('./config');

const COMUNS = new Set(['admin123', 'password1', 'password123', 'qwerty123', 'sigat123', 'lisboa123']);

// Devolve a mensagem de erro, ou null se a password cumpre a política configurada.
function validarPassword(password, username = '') {
  const p = String(password ?? '');
  const cfg = config.todas();
  if (p.length < cfg.password_min) return `A password deve ter pelo menos ${cfg.password_min} caracteres.`;
  if (Buffer.byteLength(p) > 72) return 'A password não pode exceder 72 bytes.';
  if (cfg.password_complexa && !(/\p{L}/u.test(p) && /\p{N}/u.test(p))) return 'A password deve conter letras e números.';
  if (username && p.toLowerCase().includes(String(username).toLowerCase()) && String(username).length >= 3) return 'A password não pode conter o nome de utilizador.';
  if (COMUNS.has(p.toLowerCase()) && cfg.password_complexa) return 'Essa password é demasiado comum.';
  return null;
}

module.exports = { validarPassword };
