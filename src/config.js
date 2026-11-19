const { getDb } = require('./db');

class ErroConfiguracao extends Error {
  constructor(message, erros = {}) {
    super(message);
    this.status = 400;
    this.erros = erros;
  }
}

const DATA_URL_LOGO = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;
const COR_HEX = /^#[0-9a-fA-F]{6}$/;
const LOGO_MAX_BASE64 = 400_000;

function logoValido(valor) {
  const m = DATA_URL_LOGO.exec(valor);
  if (!m || valor.length > LOGO_MAX_BASE64) return false;
  const bytes = Buffer.from(m[2], 'base64');
  const png = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return (m[1] === 'png' && png) || (m[1] === 'jpeg' && jpg);
}

// Ligações para imagens externas: só http(s) e só com placeholders de campos.
function modeloUrlValido(valor) {
  if (!/^https?:\/\//i.test(valor)) return false;
  try { new URL(valor.replace(/\{[A-Za-z0-9_]+\}/g, 'x')); return true; } catch { return false; }
}

const int = (padrao, min, max, extra) => ({ tipo: 'int', padrao, min, max, extra });
const texto = (padrao, max) => ({ tipo: 'texto', padrao, max });

// Definição, valores por omissão e limites de cada parâmetro configurável pelo administrador.
const DEFINICAO = {
  sessao_horas: int(Number(process.env.SESSAO_HORAS) || 8, 1, 168),
  password_min: int(8, 8, 64),
  password_complexa: { tipo: 'bool', padrao: true },
  password_validade_dias: int(0, 0, 3650),
  max_tentativas: int(5, 3, 20),
  bloqueio_minutos: int(15, 1, 1440),
  recuperacao_validade_minutos: int(60, 5, 1440),
  backup_ativo: { tipo: 'bool', padrao: true },
  backup_intervalo_horas: int(24, 1, 168),
  backup_retencao: int(14, 1, 365),
  historico_retencao_dias: int(0, 0, 36500, (v) => (v === 0 || v >= 90 ? null : 'Use 0 (guardar sempre) ou pelo menos 90 dias.')),
  auditoria_retencao_dias: int(365, 0, 36500, (v) => (v === 0 || v >= 30 ? null : 'Use 0 (guardar sempre) ou pelo menos 30 dias.')),
  imagens_url_modelo: { ...texto('', 500), validar: (v) => (v === '' || modeloUrlValido(v) ? null : 'Use um URL http(s), com {campo} para valores do registo (ex.: https://servidor/{nrRegisto}.jpg).') },
  pdf_cabecalho1: texto('Câmara Municipal de Lisboa', 120),
  pdf_cabecalho2: texto('Gabinete de Estudos Olisiponenses', 120),
  pdf_rodape: texto('', 200),
  pdf_cor: { ...texto('#1e293b', 7), validar: (v) => (COR_HEX.test(v) ? null : 'Cor inválida (use #RRGGBB).') },
  pdf_logo: { ...texto('', LOGO_MAX_BASE64), validar: (v) => (v === '' || logoValido(v) ? null : 'Logótipo inválido: use PNG ou JPEG até ~300 KB.') },
};

// Campos que qualquer utilizador autenticado pode ler (modelo de impressão e ligações a imagens).
const PUBLICOS = ['pdf_cabecalho1', 'pdf_cabecalho2', 'pdf_rodape', 'pdf_cor', 'pdf_logo', 'imagens_url_modelo'];

function converter(def, bruto) {
  if (def.tipo === 'bool') return bruto === true || bruto === 'true' || bruto === 1 || bruto === '1';
  if (def.tipo === 'int') return typeof bruto === 'number' ? bruto : Number(String(bruto).trim() === '' ? NaN : bruto);
  return String(bruto ?? '').trim();
}

function validar(chave, def, valor) {
  if (def.tipo === 'int') {
    if (!Number.isInteger(valor) || valor < def.min || valor > def.max) return `Valor entre ${def.min} e ${def.max}.`;
    return def.extra ? def.extra(valor) : null;
  }
  if (def.tipo === 'texto') {
    if (valor.length > def.max) return `Máximo de ${def.max} caracteres.`;
    return def.validar ? def.validar(valor) : null;
  }
  return null;
}

function todas() {
  const guardadas = Object.fromEntries(getDb().prepare('SELECT chave, valor FROM configuracoes').all().map((r) => [r.chave, r.valor]));
  const out = {};
  for (const [chave, def] of Object.entries(DEFINICAO)) {
    if (!(chave in guardadas)) { out[chave] = def.padrao; continue; }
    const v = converter(def, guardadas[chave]);
    out[chave] = def.tipo === 'int' && Number.isNaN(v) ? def.padrao : v;
  }
  return out;
}

function publicas() {
  const t = todas();
  return Object.fromEntries(PUBLICOS.map((k) => [k, t[k]]));
}

// Valida e grava só as chaves conhecidas; devolve a configuração completa.
function atualizar(patch) {
  const erros = {};
  const validos = {};
  for (const [chave, bruto] of Object.entries(patch || {})) {
    const def = DEFINICAO[chave];
    if (!def) continue;
    const valor = converter(def, bruto);
    const erro = validar(chave, def, valor);
    if (erro) erros[chave] = erro; else validos[chave] = valor;
  }
  if (Object.keys(erros).length) throw new ErroConfiguracao('Configuração inválida.', erros);
  const gravar = getDb().prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
  getDb().transaction(() => {
    for (const [chave, valor] of Object.entries(validos)) gravar.run(chave, String(valor));
  })();
  return { configuracao: todas(), alteradas: Object.keys(validos) };
}

const limites = () => Object.fromEntries(Object.entries(DEFINICAO).map(([k, d]) => [k, { tipo: d.tipo, padrao: d.padrao, min: d.min, max: d.max }]));

module.exports = { todas, publicas, atualizar, limites, ErroConfiguracao, PUBLICOS };
