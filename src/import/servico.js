const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { transaction, getDir } = require('../db');
const campos = require('../db/repos/campos');
const documentos = require('../db/repos/documentos');
const emprestimos = require('../db/repos/emprestimos');
const historico = require('../db/repos/historico');
const importacoes = require('../db/repos/importacoes');
const { lerFicheiro, propostaMapeamento } = require('./ler');
const { linhaParaDados, normHeader, clean, paraIso } = require('./transformar');
const { compararLinhas, itemCorrespondido } = require('./comparar');

const { ErroValidacao } = documentos;
const OBRIGATORIO = { cartografia: 'descricao', aturb: 'titulo' };

const pastaFicheiros = () => path.join(getDir(), 'importacoes');
const caminhoFicheiro = (id) => path.join(pastaFicheiros(), `${id}.xlsx`);
const apagarFicheiro = (id) => fs.rmSync(caminhoFicheiro(id), { force: true });

function limparPendentes(colecao) {
  for (const id of importacoes.cancelarPendentes(colecao)) apagarFicheiro(id);
}

/** Passo 1: guarda o ficheiro e propõe o mapeamento de colunas. */
function criarImportacao(colecao, buffer, nomeFicheiro, utilizador) {
  const def = campos.listar(colecao);
  const tabela = lerFicheiro(buffer, colecao, def);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const avisos = [];
  const anterior = importacoes.porSha(colecao, sha256);
  if (anterior) avisos.push(`Este ficheiro já foi importado em ${anterior.aplicadaEm?.slice(0, 10)} por ${anterior.aplicadaPor}.`);
  if (!tabela.linhas.length) throw new ErroValidacao('O ficheiro não tem linhas de dados.', {});

  limparPendentes(colecao);
  const mapeamento = propostaMapeamento(tabela.cabecalhos, colecao, def);
  const id = importacoes.criar({ colecao, ficheiro: nomeFicheiro, sha256, tamanho: buffer.length, utilizador, mapeamento, avisos });
  fs.mkdirSync(pastaFicheiros(), { recursive: true });
  fs.writeFileSync(caminhoFicheiro(id), buffer);

  return {
    importacao: importacoes.obter(id),
    folha: tabela.folha,
    totalLinhas: tabela.linhas.length,
    cabecalhos: tabela.cabecalhos.map((c) => ({
      ...c,
      amostra: tabela.linhas.slice(0, 3).map((l) => clean(l.valores[c.indice])).filter(Boolean),
    })),
    mapeamento,
    campos: def.filter((c) => !c.sistema).map((c) => ({ chave: c.chave, rotulo: c.rotulo })),
  };
}

function validarMapeamento(colecao, mapeamento, def) {
  const conhecidos = new Set(def.filter((c) => !c.sistema).map((c) => c.chave));
  const usados = new Set();
  const destinosUnicos = new Set();
  for (const m of Object.values(mapeamento)) {
    if (m.destino === 'campo') {
      if (!conhecidos.has(m.campo)) throw new ErroValidacao(`Campo desconhecido: ${m.campo}.`, {});
      if (usados.has(m.campo)) throw new ErroValidacao(`Mais do que uma coluna mapeada para "${m.campo}".`, {});
      usados.add(m.campo);
    } else if (m.destino === 'novo') {
      if (!clean(m.rotulo)) throw new ErroValidacao('Indique o nome do novo campo.', {});
    } else if (['idSigat', 'fisica', 'emp_flag', 'emp_saida', 'emp_entrada', 'emp_requisitante'].includes(m.destino)) {
      if (destinosUnicos.has(m.destino)) throw new ErroValidacao(`Mais do que uma coluna com o destino "${m.destino}".`, {});
      destinosUnicos.add(m.destino);
    } else if (m.destino !== 'ignorar') {
      throw new ErroValidacao(`Destino inválido: ${m.destino}.`, {});
    }
  }
  if (!usados.has(OBRIGATORIO[colecao])) {
    const rot = def.find((c) => c.chave === OBRIGATORIO[colecao])?.rotulo;
    throw new ErroValidacao(`É obrigatório mapear uma coluna para "${rot}".`, {});
  }
}

/** Atribui chaves únicas aos campos novos (sem criar ainda). */
function resolverNovos(mapeamento, def) {
  const existentes = new Set(def.map((c) => c.chave));
  const resolvido = {};
  for (const [indice, m] of Object.entries(mapeamento)) {
    if (m.destino !== 'novo') { resolvido[indice] = m; continue; }
    let chave = m.chave && !existentes.has(m.chave) ? m.chave : campos.chaveDeRotulo(m.rotulo);
    if (existentes.has(chave)) { let n = 2; while (existentes.has(`${chave}${n}`)) n += 1; chave = `${chave}${n}`; }
    existentes.add(chave);
    resolvido[indice] = { ...m, chave };
  }
  return resolvido;
}

function resumir(itens) {
  const r = { novo: 0, alterado: 0, igual: 0, conflito: 0, ambiguo: 0, duplicado_ficheiro: 0, erro: 0, ausente: 0, emprestimosCriar: 0, emprestimosDevolver: 0 };
  for (const i of itens) {
    r[i.acao] = (r[i.acao] || 0) + 1;
    const e = i.diff?.emprestimo;
    if (e?.acao === 'criar') r.emprestimosCriar += 1;
    if (e?.acao === 'devolver') r.emprestimosDevolver += 1;
  }
  return r;
}

/** Passo 2: aplica o mapeamento e compara com a coleção (não altera documentos). */
function compararImportacao(id, mapeamentoRecebido) {
  const imp = importacoes.obter(id);
  if (!imp || !['mapeamento', 'previsualizacao'].includes(imp.estado)) throw new ErroValidacao('Importação não encontrada ou já concluída.', {}, 404);
  const def = campos.listar(imp.colecao);
  validarMapeamento(imp.colecao, mapeamentoRecebido, def);
  const mapeamento = resolverNovos(mapeamentoRecebido, def);
  const tabela = lerFicheiro(fs.readFileSync(caminhoFicheiro(id)), imp.colecao, def);

  const obrig = OBRIGATORIO[imp.colecao];
  const chaveNovo = (m) => m.chave;
  const linhas = tabela.linhas.map((l) => {
    const t = linhaParaDados(imp.colecao, l.valores, mapeamento, chaveNovo);
    const erro = clean(t.dados[obrig]) ? undefined : `Linha ${l.linha}: campo "${obrig}" em falta; linha ignorada.`;
    return { linha: l.linha, dados: t.dados, idSigat: t.idSigat, emprestimo: t.emprestimo, erro };
  });
  const chaves = [...new Set(linhas.flatMap((l) => Object.keys(l.dados)))];

  const itens = compararLinhas({
    colecao: imp.colecao,
    linhas,
    existentes: documentos.listar(imp.colecao),
    bases: documentos.bases(imp.colecao),
    emprestimos: emprestimos.porColecao(imp.colecao),
    chaves,
  });
  importacoes.substituirItens(id, itens);

  const resumo = { ...resumir(itens), totalLinhas: linhas.length, novosCampos: Object.values(mapeamento).filter((m) => m.destino === 'novo').map((m) => m.rotulo) };
  importacoes.atualizar(id, {
    estado: 'previsualizacao',
    mapeamento,
    resumo,
    erros: linhas.filter((l) => l.erro).map((l) => ({ linha: l.linha, mensagem: l.erro })),
  });
  return { importacao: importacoes.obter(id), resumo };
}

/** Decisão do utilizador sobre um item (campos a aceitar, desambiguação, ignorar…). */
function decidir(id, linha, decisao) {
  const imp = importacoes.obter(id);
  if (!imp || imp.estado !== 'previsualizacao') throw new ErroValidacao('A importação não está em pré-visualização.', {}, 409);
  const item = importacoes.obterItem(id, linha);
  if (!item) throw new ErroValidacao('Item não encontrado.', {}, 404);

  if (item.acao === 'ambiguo' && decisao.documentoId) {
    if (!item.candidatos.includes(decisao.documentoId)) throw new ErroValidacao('Documento não é um dos candidatos.', {});
    const doc = documentos.obter(decisao.documentoId);
    const base = documentos.bases(imp.colecao).get(doc.id) ?? null;
    const chaves = Object.keys(item.dadosFicheiro);
    const novo = itemCorrespondido(
      { linha, dados: item.dadosFicheiro, emprestimo: item.diff?.emprestimoFicheiro || null }, doc, 'manual',
      new Map([[doc.id, base]]), emprestimos.porColecao(imp.colecao), chaves,
    );
    importacoes.atualizarItem(id, linha, { acao: novo.acao, documentoId: doc.id, diff: novo.diff, decisao: null });
    return importacoes.obterItem(id, linha);
  }
  if (item.acao === 'ambiguo' && decisao.criar) {
    importacoes.atualizarItem(id, linha, { acao: 'novo', documentoId: null, diff: { emprestimo: null }, decisao: null });
    return importacoes.obterItem(id, linha);
  }
  importacoes.atualizarItem(id, linha, { decisao: { ...(item.decisao || {}), ...decisao } });
  return importacoes.obterItem(id, linha);
}

function decidirEmMassa(id, { escolha, ambito }) {
  if (!['ficheiro', 'sigat'].includes(escolha)) throw new ErroValidacao('Escolha inválida.', {});
  const alvos = importacoes.todosItens(id).filter((i) => (ambito === 'conflitos' ? i.acao === 'conflito' : ['alterado', 'conflito'].includes(i.acao)));
  transaction(() => {
    for (const item of alvos) {
      const escolhas = Object.fromEntries(Object.entries(item.diff?.campos || {})
        .filter(([, d]) => ambito !== 'conflitos' || d.conflito).map(([k]) => [k, escolha]));
      importacoes.atualizarItem(id, item.linha, { decisao: { ...(item.decisao || {}), escolhas: { ...(item.decisao?.escolhas || {}), ...escolhas } } });
    }
  });
  return alvos.length;
}

function aplicarEmprestimo(prop, documentoId, utilizador, avisos, linha) {
  if (!prop) return 0;
  try {
    if (prop.acao === 'criar') {
      emprestimos.criar(documentoId, {
        requisitante: prop.requisitante || '(não indicado)',
        dataSaida: paraIso(prop.dataSaida) || emprestimos.hoje(),
        dataPrevista: '',
      }, utilizador, { origem: 'importacao', validarDatas: false });
    } else {
      emprestimos.devolver(prop.emprestimoId, { dataDevolucao: paraIso(prop.dataEntrada) || emprestimos.hoje() }, utilizador);
    }
    return 1;
  } catch (e) {
    avisos.push(`Linha ${linha}: empréstimo não aplicado (${e.message}).`);
    return 0;
  }
}

/** Passo 3: aplica tudo numa única transação (ou nada). */
function aplicarImportacao(id, utilizador) {
  const imp = importacoes.obter(id);
  if (!imp || imp.estado !== 'previsualizacao') throw new ErroValidacao('A importação não está em pré-visualização.', {}, 409);
  const itens = importacoes.todosItens(id);
  const porResolver = itens.filter((i) => i.acao === 'ambiguo' && !i.decisao?.ignorar);
  if (porResolver.length) throw new ErroValidacao(`Existem ${porResolver.length} linha(s) ambígua(s) por resolver (escolha o documento, crie novo ou ignore).`, {}, 409);

  const res = { novos: 0, atualizados: 0, semAlteracoes: 0, camposAlterados: 0, conflitosMantidos: 0, ignorados: 0, emprestimos: 0 };
  const avisos = [];

  transaction(() => {
    const def = campos.listar(imp.colecao);
    for (const m of Object.values(imp.mapeamento)) {
      if (m.destino === 'novo' && !def.some((c) => c.chave === m.chave)) {
        campos.criar(imp.colecao, { chave: m.chave, rotulo: m.rotulo, aliases: [normHeader(m.rotulo)] });
      }
    }
    // Aprende os cabeçalhos usados como aliases para as próximas importações.
    const cab = lerFicheiro(fs.readFileSync(caminhoFicheiro(id)), imp.colecao, def).cabecalhos;
    for (const m of Object.entries(imp.mapeamento)) {
      const [indice, dest] = m;
      if (dest.destino !== 'campo') continue;
      const campo = campos.listar(imp.colecao).find((c) => c.chave === dest.campo);
      const h = cab.find((c) => c.indice === Number(indice))?.normalizado;
      if (h && campo && !campo.aliases.includes(h)) campos.atualizar(imp.colecao, campo.chave, { aliases: [...campo.aliases, h] });
    }

    for (const item of itens) {
      const dec = item.decisao || {};
      if (item.acao === 'ambiguo' || item.acao === 'erro' || item.acao === 'ausente') { if (item.acao !== 'ausente') res.ignorados += 1; continue; }

      if (item.acao === 'novo' || (item.acao === 'duplicado_ficheiro' && dec.criar)) {
        if (dec.ignorar) { res.ignorados += 1; continue; }
        const doc = documentos.criar(imp.colecao, item.dadosFicheiro, utilizador, { importacaoId: id, validar: false, historicoDetalhes: { entrada: item.dadosFicheiro.cabecalho || item.dadosFicheiro.titulo || '', linha: item.linha } });
        res.novos += 1;
        if (!dec.ignorarEmprestimo) res.emprestimos += aplicarEmprestimo(item.diff?.emprestimo, doc.id, utilizador, avisos, item.linha);
        continue;
      }
      if (item.acao === 'duplicado_ficheiro') { res.ignorados += 1; continue; }

      const doc = documentos.bruto(item.documentoId);
      if (!doc) { avisos.push(`Linha ${item.linha}: documento já não existe; ignorada.`); continue; }
      if (Object.keys(item.diff?.campos || {}).length && doc.atualizadoEm && doc.atualizadoEm > imp.criadaEm) {
        throw new ErroValidacao(`O documento da linha ${item.linha} foi alterado depois da comparação. Volte a comparar o ficheiro.`, {}, 409);
      }
      const novosDados = { ...doc.dados };
      const alteracoes = {};
      for (const [k, d] of Object.entries(item.diff?.campos || {})) {
        const escolha = dec.escolhas?.[k] || d.escolha;
        if (escolha === 'ficheiro') { novosDados[k] = d.ficheiro; alteracoes[k] = { de: d.atual, para: d.ficheiro }; }
        else if (d.conflito) res.conflitosMantidos += 1;
      }
      documentos.aplicarImportacao(item.documentoId, novosDados, { ...(doc.dadosImportados || {}), ...item.dadosFicheiro }, id, utilizador, alteracoes);
      if (Object.keys(alteracoes).length) { res.atualizados += 1; res.camposAlterados += Object.keys(alteracoes).length; } else res.semAlteracoes += 1;
      if (!dec.ignorarEmprestimo) res.emprestimos += aplicarEmprestimo(item.diff?.emprestimo, item.documentoId, utilizador, avisos, item.linha);
    }

    res.ausentes = itens.filter((i) => i.acao === 'ausente').length;
    importacoes.atualizar(id, { estado: 'aplicada', resumo: { ...imp.resumo, aplicado: res }, avisos: [...imp.avisos, ...avisos], aplicadaEm: new Date().toISOString(), aplicadaPor: utilizador });
    historico.registar({ colecao: imp.colecao, acao: 'importar', utilizador, importacaoId: id, detalhes: { rotulo: `Importação ${imp.ficheiro}`, ...res } });
  });

  documentos.invalidar(imp.colecao);
  apagarFicheiro(id);
  return importacoes.obter(id);
}

function cancelarImportacao(id) {
  const imp = importacoes.obter(id);
  if (!imp) throw new ErroValidacao('Importação não encontrada.', {}, 404);
  if (!['mapeamento', 'previsualizacao'].includes(imp.estado)) throw new ErroValidacao('Só é possível cancelar importações pendentes.', {}, 409);
  importacoes.atualizar(id, { estado: 'cancelada' });
  importacoes.substituirItens(id, []);
  apagarFicheiro(id);
}

module.exports = { criarImportacao, compararImportacao, decidir, decidirEmMassa, aplicarImportacao, cancelarImportacao };
