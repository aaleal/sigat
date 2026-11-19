// Transformações de uma linha de ficheiro para os campos de um documento.
const normHeader = (value) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

// "1 planta ms. (cartão) : color ; 55 x 71,5 cm" -> tipo / cor / dimensao
function parseFisica(text) {
  const out = { tipo: '', cor: '', dimensao: '' };
  let rest = clean(text);
  if (!rest) return out;

  const lastSemi = rest.lastIndexOf(';');
  if (lastSemi !== -1) {
    const candidate = rest.slice(lastSemi + 1).trim();
    if (/\d\s*x\s*\d|\bcm\b/i.test(candidate)) {
      out.dimensao = candidate;
      rest = rest.slice(0, lastSemi).trim();
    }
  }

  const colon = rest.lastIndexOf(' : ');
  if (colon !== -1) {
    const left = rest.slice(0, colon).trim();
    const right = rest.slice(colon + 3).trim();
    if (!out.dimensao && /\d\s*x\s*\d/.test(right)) {
      out.tipo = left;
      out.dimensao = right;
    } else {
      out.tipo = left;
      out.cor = right;
    }
  } else {
    out.tipo = rest;
  }
  return out;
}

function deriveCabecalho(autor, descricao) {
  if (autor && !/^s[\s./]*a\.?$/i.test(autor)) return autor;
  const title = descricao.split(/\s*(?:\[|\s:\s|\s\/\s|\.\s-\s)/)[0].trim();
  return title.toLocaleUpperCase('pt-PT');
}

/**
 * Destinos possíveis de uma coluna: { destino: 'campo', campo } | { destino: 'novo', rotulo } | 'idSigat' | 'fisica'
 * | 'emp_flag' | 'emp_saida' | 'emp_entrada' | 'emp_requisitante' | 'ignorar'.
 * @returns {{ dados: Object, idSigat: string, emprestimo: Object|null, chavesDerivadas: string[] }}
 */
function linhaParaDados(colecao, valores, mapeamento, chaveNovo) {
  const dados = {};
  const emp = { flag: '', saida: '', entrada: '', requisitante: '' };
  let idSigat = '';
  let fisica = '';
  let temEmp = false;

  for (const [indice, m] of Object.entries(mapeamento)) {
    const v = clean(valores[Number(indice)]);
    switch (m.destino) {
      case 'campo': dados[m.campo] = v; break;
      case 'novo': dados[chaveNovo(m, indice)] = v; break;
      case 'idSigat': idSigat = v; break;
      case 'fisica': fisica = v; break;
      case 'emp_flag': emp.flag = v; temEmp = true; break;
      case 'emp_saida': emp.saida = v; temEmp = true; break;
      case 'emp_entrada': emp.entrada = v; temEmp = true; break;
      case 'emp_requisitante': emp.requisitante = v; temEmp = true; break;
      default: break;
    }
  }

  const derivadas = [];
  if (colecao === 'cartografia') {
    if (fisica) {
      const f = parseFisica(fisica);
      for (const k of ['tipo', 'cor', 'dimensao']) {
        if (dados[k] === undefined) { dados[k] = f[k]; derivadas.push(k); }
      }
    }
    if (dados.cabecalho === undefined && dados.descricao) {
      dados.cabecalho = deriveCabecalho(dados.autor || '', dados.descricao);
      derivadas.push('cabecalho');
    }
  }

  const emprestimo = temEmp
    ? {
      emprestado: /^(sim|s)$/i.test(emp.flag),
      requisitante: emp.requisitante,
      dataSaida: emp.saida,
      dataEntrada: emp.entrada,
    }
    : null;
  return { dados, idSigat, emprestimo, chavesDerivadas: derivadas };
}

function paraIso(valor) {
  const s = String(valor ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

module.exports = { normHeader, clean, parseFisica, deriveCabecalho, linhaParaDados, paraIso };
