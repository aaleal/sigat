const xlsx = require('xlsx');
const { normHeader, clean } = require('./transformar');

// Nomes de cabeçalho com tratamento especial (não são campos do documento).
const ESPECIAIS = {
  cartografia: {
    outrasinformacoesfisicas: 'fisica',
    emprestimo: 'emp_flag',
    datadesaida: 'emp_saida',
    datadeentrada: 'emp_entrada',
    requisitante: 'emp_requisitante',
  },
  aturb: {},
};
const ID_SIGAT = ['idsigat', 'id'];
// Colunas de preenchimento automático do SIGAT que não devem ser importadas.
const IGNORAR_POR_OMISSAO = new Set(['estado', 'dataprevista', 'diasdeatraso']);

function procurarCabecalho(rows, aliasesConhecidos, minimo) {
  let melhor = null;
  for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
    const normalizados = (rows[i] || []).map(normHeader);
    const acertos = normalizados.filter((h) => h && aliasesConhecidos.has(h)).length;
    if (acertos >= minimo && (!melhor || acertos > melhor.acertos)) melhor = { indice: i, acertos };
  }
  return melhor;
}

/**
 * Lê o primeiro livro com uma tabela reconhecível para a coleção.
 * @returns {{ folha: string, cabecalhoLinha: number, cabecalhos: Array<{indice:number, rotulo:string, normalizado:string}>, linhas: Array<{linha:number, valores:any[]}> }}
 */
function lerFicheiro(buffer, colecao, campos) {
  let wb;
  try {
    wb = xlsx.read(buffer, { type: 'buffer' });
  } catch (err) {
    const e = new Error(`Não foi possível abrir o ficheiro xlsx: ${err.message}`);
    e.status = 400;
    throw e;
  }
  const conhecidos = new Set([
    ...campos.flatMap((c) => [...(c.aliases || []), normHeader(c.rotulo)]),
    ...Object.keys(ESPECIAIS[colecao] || {}),
    ...ID_SIGAT,
  ]);
  const preferida = colecao === 'cartografia' ? 'BD' : 'PDF Site';
  const folhas = wb.SheetNames.includes(preferida) ? [preferida, ...wb.SheetNames.filter((n) => n !== preferida)] : wb.SheetNames;
  const minimo = colecao === 'cartografia' ? 3 : 2;

  for (const nome of folhas) {
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null, raw: false });
    const cab = procurarCabecalho(rows, conhecidos, minimo);
    if (!cab) continue;
    const cabecalhos = (rows[cab.indice] || [])
      .map((v, indice) => ({ indice, rotulo: clean(v), normalizado: normHeader(v) }))
      .filter((c) => c.rotulo);
    const linhas = [];
    for (let i = cab.indice + 1; i < rows.length; i += 1) {
      const valores = rows[i] || [];
      if (valores.every((c) => c === null || String(c).trim() === '')) continue;
      linhas.push({ linha: i + 1, valores });
    }
    return { folha: nome, cabecalhoLinha: cab.indice + 1, cabecalhos, linhas };
  }
  const e = new Error('Não foi encontrada uma folha com uma tabela reconhecível para esta coleção (verifique os cabeçalhos).');
  e.status = 400;
  throw e;
}

/** Proposta automática de mapeamento (coluna -> destino) a partir dos aliases dos campos. */
function propostaMapeamento(cabecalhos, colecao, campos) {
  const mapeamento = {};
  const usados = new Set();
  const especiais = ESPECIAIS[colecao] || {};
  for (const c of cabecalhos) {
    let m;
    if (ID_SIGAT.includes(c.normalizado)) m = { destino: 'idSigat' };
    else if (especiais[c.normalizado]) m = { destino: especiais[c.normalizado] };
    else if (IGNORAR_POR_OMISSAO.has(c.normalizado)) m = { destino: 'ignorar' };
    else {
      const campo = campos.find((f) => !f.sistema && !usados.has(f.chave)
        && [...(f.aliases || []), normHeader(f.rotulo), normHeader(f.chave)].includes(c.normalizado));
      if (campo) { m = { destino: 'campo', campo: campo.chave }; usados.add(campo.chave); }
      else m = { destino: 'novo', rotulo: c.rotulo };
    }
    mapeamento[c.indice] = m;
  }
  return mapeamento;
}

module.exports = { lerFicheiro, propostaMapeamento, ESPECIAIS };
