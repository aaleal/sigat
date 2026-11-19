// Pesquisa tolerante a acentos/maiúsculas, com palavras parciais e relevância. Módulo puro (sem I/O).

function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const palavras = (textoNormalizado) => textoNormalizado.split(/[^a-z0-9]+/).filter(Boolean);
const semZeros = (s) => s.replace(/^0+(?=\d)/, '');

/**
 * "plan lisb" -> dois termos; "frase exata" entre aspas; -termo exclui.
 * @returns {{ termos: string[], frases: string[], excluidos: string[], completa: string }}
 */
function analisarQuery(q) {
  const termos = [];
  const frases = [];
  const excluidos = [];
  const texto = String(q ?? '');

  const semFrases = texto.replace(/"([^"]*)"/g, (_m, frase) => {
    const n = normalizar(frase);
    if (n) frases.push(n);
    return ' ';
  });

  for (const bruto of semFrases.split(/\s+/)) {
    if (!bruto) continue;
    const exclui = bruto.length > 1 && bruto.startsWith('-');
    const subtermos = palavras(normalizar(exclui ? bruto.slice(1) : bruto));
    for (const t of subtermos) (exclui ? excluidos : termos).push(t);
  }
  return { termos, frases, excluidos, completa: normalizar(texto.replace(/["]/g, '')) };
}

/** Índice normalizado de uma entrada (campo -> texto normalizado + palavras). */
function construirIndice(entry, campos) {
  const indice = {};
  for (const c of campos) {
    const texto = normalizar(entry[c.chave]);
    indice[c.chave] = { texto, palavras: palavras(texto) };
  }
  return indice;
}

function pontuarTermo(termo, campo) {
  if (!campo.texto) return 0;
  const soDigitos = /^\d+$/.test(termo);
  if (soDigitos) {
    const t = semZeros(termo);
    return campo.palavras.some((p) => /^\d+$/.test(p) && semZeros(p) === t) ? 3 : 0;
  }
  if (campo.palavras.includes(termo)) return 3;
  if (campo.palavras.some((p) => p.startsWith(termo))) return 2;
  return campo.texto.includes(termo) ? 1 : 0;
}

/**
 * Devolve a pontuação (> 0) se a entrada satisfaz a query, ou 0 se não satisfaz.
 * Sem termos/frases: 1 (entrada aceite, sem relevância).
 */
function pontuarEntrada(indice, campos, analise) {
  const { termos, frases, excluidos, completa } = analise;
  const pesquisaveis = campos.filter((c) => c.pesquisavel !== false);

  for (const ex of excluidos) {
    if (pesquisaveis.some((c) => pontuarTermo(ex, indice[c.chave]) > 0)) return 0;
  }

  let total = 0;
  for (const termo of termos) {
    let melhor = 0;
    for (const c of pesquisaveis) {
      const s = pontuarTermo(termo, indice[c.chave]);
      if (s > 0) melhor += s * (c.peso ?? 1);
    }
    if (melhor === 0) return 0;
    total += melhor;
  }

  for (const frase of frases) {
    let melhor = 0;
    for (const c of pesquisaveis) {
      if (indice[c.chave].texto.includes(frase)) melhor += (3 + 5) * (c.peso ?? 1);
    }
    if (melhor === 0) return 0;
    total += melhor;
  }

  if (termos.length > 1 && completa) {
    for (const c of pesquisaveis) {
      if (indice[c.chave].texto.includes(completa)) total += 5 * (c.peso ?? 1);
    }
  }
  return total > 0 ? total : 1;
}

// Filtro numérico: compara o número (não substring): "12" não casa "123".
function correspondeNumerico(valorCampo, filtro) {
  const filt = String(filtro ?? '').trim();
  if (!filt) return true;
  const m = filt.match(/\d+/);
  if (!m) return normalizar(valorCampo).includes(normalizar(filt));
  const alvo = parseInt(m[0], 10);
  const nums = String(valorCampo ?? '').match(/\d+/g);
  return !!nums && nums.some((n) => parseInt(n, 10) === alvo);
}

function correspondeTexto(valorCampo, filtro) {
  const f = normalizar(filtro);
  return !f || normalizar(valorCampo).includes(f);
}

module.exports = {
  normalizar, analisarQuery, construirIndice, pontuarEntrada, correspondeNumerico, correspondeTexto,
};
