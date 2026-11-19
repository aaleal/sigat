const {
  normalizar, analisarQuery, construirIndice, pontuarEntrada, correspondeNumerico, correspondeTexto,
} = require('./search');
const { CHAVES_ORDENACAO_NUMERO, CHAVES_ORDENACAO_PRIMEIRO_NUMERO } = require('./campos');

const indices = new WeakMap(); // entry -> índice normalizado (válido enquanto o objeto for o mesmo)

function indiceDe(entry, campos) {
  let idx = indices.get(entry);
  if (!idx) {
    idx = construirIndice(entry, campos);
    indices.set(entry, idx);
  }
  return idx;
}

const vazio = (v) => String(v ?? '').trim() === '';
const primeiroNumero = (v) => {
  const m = v == null ? null : String(v).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

function comparar(a, b, specs) {
  for (const { key, dir } of specs) {
    const d = dir === 'asc' ? 1 : -1;
    let cmp;
    if (CHAVES_ORDENACAO_NUMERO.has(key)) {
      cmp = (Number(a[key]) || 0) - (Number(b[key]) || 0);
    } else if (CHAVES_ORDENACAO_PRIMEIRO_NUMERO.has(key)) {
      const na = primeiroNumero(a[key]);
      const nb = primeiroNumero(b[key]);
      cmp = na != null && nb != null
        ? na - nb
        : String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'pt-PT', { numeric: true });
    } else {
      cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'pt-PT', { numeric: true });
    }
    if (cmp !== 0) return cmp * d;
  }
  return 0;
}

/**
 * @param {Array} entries
 * @param {Array} campos definição (src/campos.js)
 * @param {{ q?: string, filtros?: Object, vazios?: string[], ids?: Array, sortKeys?: string }} params
 * @returns {{ items: Array, ordenacao: 'relevancia'|'campos' }}
 */
function queryEntries(entries, campos, params = {}) {
  const { q = '', filtros = {}, vazios = [], ids = null, sortKeys = '' } = params;
  const analise = analisarQuery(q);
  const temQuery = analise.termos.length + analise.frases.length + analise.excluidos.length > 0;
  const idsSet = ids && ids.length ? new Set(ids.map(Number)) : null;
  const porChave = new Map(campos.map((c) => [c.chave, c]));

  const resultados = [];
  for (const entry of entries) {
    if (idsSet && !idsSet.has(Number(entry.sourceEntryNumber))) continue;

    let ok = true;
    for (const [chave, valor] of Object.entries(filtros)) {
      const c = porChave.get(chave);
      if (!c || !String(valor ?? '').trim()) continue;
      const passa = c.numerico ? correspondeNumerico(entry[chave], valor) : correspondeTexto(entry[chave], valor);
      if (!passa) { ok = false; break; }
    }
    if (!ok) continue;
    if (vazios.some((chave) => !vazio(entry[chave]))) continue;

    let score = 1;
    if (temQuery) {
      score = pontuarEntrada(indiceDe(entry, campos), campos, analise);
      if (score === 0) continue;
    }
    resultados.push({ entry, score });
  }

  const specs = String(sortKeys || '').split(',').filter(Boolean).map((s) => {
    const [key, dir] = s.split(':');
    return { key, dir: dir === 'desc' ? 'desc' : 'asc' };
  });

  if (specs.length) {
    resultados.sort((a, b) => comparar(a.entry, b.entry, specs));
    return { items: resultados.map((r) => r.entry), ordenacao: 'campos' };
  }
  if (temQuery) {
    const desempate = [{ key: campos.some((c) => c.chave === 'cabecalho') ? 'cabecalho' : 'titulo', dir: 'asc' }];
    resultados.sort((a, b) => b.score - a.score || comparar(a.entry, b.entry, desempate));
    return { items: resultados.map((r) => r.entry), ordenacao: 'relevancia' };
  }
  return { items: resultados.map((r) => r.entry), ordenacao: 'campos' };
}

// Lê da query string os parâmetros de pesquisa (q, filtros por campo, vazios, ids, sortKeys).
function paramsDePesquisa(query, campos) {
  const filtros = {};
  for (const c of campos) {
    const v = (query[c.chave] || '').toString().trim();
    if (v) filtros[c.chave] = v;
  }
  const lista = (v) => (v || '').toString().split(',').map((s) => s.trim()).filter(Boolean);
  return {
    q: (query.q || '').toString().trim(),
    filtros,
    vazios: lista(query.vazios),
    ids: lista(query.ids),
    sortKeys: (query.sortKeys || '').toString().trim(),
  };
}

module.exports = { queryEntries, paramsDePesquisa, normalizar };
