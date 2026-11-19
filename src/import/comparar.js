// Comparação ficheiro × documentos existentes (fusão a 3 vias). Módulo puro.
const { corresponder } = require('./corresponder');

const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Diferenças por campo entre o ficheiro e um documento.
 * base = valores da última importação aplicada (ou null se desconhecida).
 * Só devolve campos que exigem ação: alteração aplicável (escolha 'ficheiro') ou conflito (escolha 'sigat').
 */
function diffCampos(doc, base, dadosFicheiro, chaves) {
  const campos = {};
  for (const k of chaves) {
    const f = norm(dadosFicheiro[k]);
    const a = norm(doc[k]);
    if (f === a) continue;
    const b = base ? norm(base[k]) : null;
    if (b !== null && f === b) continue; // só o SIGAT alterou
    const conflito = b === null || a !== b;
    campos[k] = { atual: a, ficheiro: f, base: b, conflito, escolha: conflito ? 'sigat' : 'ficheiro' };
  }
  return campos;
}

/** Empréstimo a propor a partir das colunas do ficheiro (nunca altera empréstimos criados no SIGAT). */
function propostaEmprestimo(emp, doc, emprestimosDoDoc) {
  if (!emp) return null;
  const ativo = emprestimosDoDoc.find((e) => !e.dataDevolucao);
  if (emp.dataEntrada && ativo && ativo.origem !== 'sigat') {
    return { acao: 'devolver', emprestimoId: ativo.id, dataEntrada: emp.dataEntrada, requisitante: ativo.requisitante };
  }
  if (emp.emprestado && !emp.dataEntrada && !ativo && emprestimosDoDoc.length === 0 && (!doc || doc.estado !== 'Empréstimo')) {
    return { acao: 'criar', requisitante: emp.requisitante, dataSaida: emp.dataSaida };
  }
  return null;
}

/**
 * @param {Object} args
 * @param {string} args.colecao
 * @param {Array<{linha:number, dados:Object, idSigat:string, emprestimo:Object|null, erro?:string}>} args.linhas
 * @param {Array<Object>} args.existentes entradas planas (documentos.listar)
 * @param {Map<string,Object|null>} args.bases id -> dados_importados
 * @param {Map<string,Array>} args.emprestimos documento_id -> empréstimos (paraApi)
 * @param {string[]} args.chaves campos mapeados (+derivados) a comparar
 */
function compararLinhas({ colecao, linhas, existentes, bases, emprestimos, chaves }) {
  const validas = linhas.filter((l) => !l.erro);
  const correspondencias = new Map(corresponder(colecao, validas.map((l) => ({ linha: l.linha, dados: l.dados, idSigat: l.idSigat })), existentes)
    .map((c) => [c.linha, c]));
  const porId = new Map(existentes.map((d) => [d.id, d]));
  const itens = [];
  const usados = new Set();

  for (const l of linhas) {
    if (l.erro) {
      itens.push({ linha: l.linha, acao: 'erro', dadosFicheiro: l.dados, diff: { erro: l.erro } });
      continue;
    }
    const c = correspondencias.get(l.linha);
    if (c.estado === 'match') {
      usados.add(c.documentoId);
      itens.push(itemCorrespondido(l, porId.get(c.documentoId), c.criterio, bases, emprestimos, chaves));
    } else if (c.estado === 'ambiguo') {
      itens.push({ linha: l.linha, acao: 'ambiguo', candidatos: c.candidatos, criterio: c.criterio, dadosFicheiro: l.dados, diff: { emprestimoFicheiro: l.emprestimo } });
    } else if (c.estado === 'duplicado_ficheiro') {
      itens.push({ linha: l.linha, acao: 'duplicado_ficheiro', dadosFicheiro: l.dados, diff: { emprestimoFicheiro: l.emprestimo } });
    } else {
      itens.push({
        linha: l.linha, acao: 'novo', dadosFicheiro: l.dados,
        diff: { emprestimo: propostaEmprestimo(l.emprestimo, null, []) },
      });
    }
  }

  // Documentos da coleção que não aparecem no ficheiro (nunca são eliminados automaticamente).
  let n = 0;
  for (const d of existentes) {
    if (!usados.has(d.id) && !itens.some((i) => i.acao === 'ambiguo' && i.candidatos.includes(d.id))) {
      n += 1;
      itens.push({ linha: -n, acao: 'ausente', documentoId: d.id, dadosFicheiro: {}, diff: null });
    }
  }
  return itens;
}

function itemCorrespondido(l, doc, criterio, bases, emprestimos, chaves) {
  const campos = diffCampos(doc, bases.get(doc.id) ?? null, l.dados, chaves);
  const emprestimo = propostaEmprestimo(l.emprestimo, doc, emprestimos.get(doc.id) || []);
  const haConflito = Object.values(campos).some((c) => c.conflito);
  let acao = 'igual';
  if (haConflito) acao = 'conflito';
  else if (Object.keys(campos).length || emprestimo) acao = 'alterado';
  return { linha: l.linha, acao, documentoId: doc.id, criterio, dadosFicheiro: l.dados, diff: { campos, emprestimo } };
}

module.exports = { compararLinhas, itemCorrespondido, diffCampos, norm };
