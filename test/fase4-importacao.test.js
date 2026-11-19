const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let token;
let leitor;

const linha = (o) => h.linhaCartografia(o);
const buf = (linhas, cabecalhos) => h.xlsxCartografia(linhas, cabecalhos);

async function preparar(buffer, nome = 'carga.xlsx') {
  const r = await h.api('POST', '/api/colecoes/cartografia/importacoes', { token, form: h.formComFicheiro(buffer, nome) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}

// Cria a importação com o mapeamento proposto, compara e devolve { id, resumo }.
async function comparar(buffer, ajustarMapeamento) {
  const prep = await preparar(buffer);
  const mapeamento = JSON.parse(JSON.stringify(prep.mapeamento));
  if (ajustarMapeamento) ajustarMapeamento(mapeamento, prep.cabecalhos);
  const r = await h.api('PUT', `/api/importacoes/${prep.importacao.id}/mapeamento`, { token, body: { mapeamento } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { id: prep.importacao.id, resumo: r.data.resumo, prep };
}

const aplicar = (id) => h.api('POST', `/api/importacoes/${id}/aplicar`, { token });
const docs = async (q = '') => (await h.api('GET', `/api/colecoes/cartografia/documentos?pageSize=100${q}`, { token })).data.items;

before(async () => {
  await h.iniciar();
  token = await h.login();
  await h.api('POST', '/api/users', { token, body: { username: 'leitor', password: 'abcd1234', role: 'read' } });
  leitor = await h.login('leitor', 'abcd1234');
});
after(h.parar);

const base = () => [
  linha({ descricao: 'Planta de Lisboa', cota: 'MP 1', autor: 'Silva' }),
  linha({ descricao: 'Planta do Porto', cota: 'MP 2', autor: 'Costa', extra: { 'Outras Informações Físicas': '1 planta ms. : color ; 55 x 71,5 cm' } }),
  linha({ descricao: 'Mapa de Sintra', cota: 'MP 3', autor: 'Silva', emprestimo: 'Sim', extra: { Requisitante: 'AML', 'Data de Saída': '05/03/2026' } }),
];

test('só admin importa', async () => {
  const r = await h.api('POST', '/api/colecoes/cartografia/importacoes', { token: leitor, form: h.formComFicheiro(base.length ? buf(base()) : null, 'x.xlsx') });
  assert.equal(r.status, 403);
});

test('primeira importação: cria documentos, campos derivados e empréstimo importado', async () => {
  const prep = await preparar(buf(base()));
  assert.equal(prep.totalLinhas, 3);
  assert.equal(prep.mapeamento[1].destino, 'campo');
  assert.equal(prep.mapeamento[1].campo, 'descricao');
  const { id, resumo } = await comparar(buf(base()));
  assert.equal(resumo.novo, 3);
  assert.equal(resumo.emprestimosCriar, 1);
  assert.equal((await aplicar(id)).status, 200);

  const lista = await docs();
  assert.equal(lista.length, 3);
  const porto = lista.find((d) => d.descricao === 'Planta do Porto');
  assert.equal(porto.tipo, '1 planta ms.');
  assert.equal(porto.cor, 'color');
  assert.equal(porto.dimensao, '55 x 71,5 cm');
  assert.equal(porto.cabecalho, 'Costa');
  assert.equal(porto.localizacao, 'DMPGU');
  const sintra = lista.find((d) => d.descricao === 'Mapa de Sintra');
  assert.equal(sintra.estado, 'Empréstimo');
  assert.equal(sintra.estadoMeta.requisitante, 'AML');
  assert.equal(sintra.estadoMeta.dataSaida, '2026-03-05');
});

test('reimportar o mesmo ficheiro: tudo igual e aviso de ficheiro repetido', async () => {
  const { id, resumo, prep } = await comparar(buf(base()));
  assert.equal(resumo.igual, 3);
  assert.equal(resumo.alterado + resumo.novo + resumo.conflito + resumo.ausente, 0);
  assert.ok(prep.importacao.avisos.some((a) => a.includes('já foi importado')));
  await aplicar(id);
  assert.equal((await docs()).length, 3);
});

test('uma célula alterada no ficheiro → alterado; aplicar atualiza só esse campo', async () => {
  const linhas = base();
  linhas[0]['Palavras-chave / Assuntos'] = 'Lisboa; Baixa';
  const { id, resumo } = await comparar(buf(linhas));
  assert.equal(resumo.alterado, 1);
  assert.equal(resumo.igual, 2);
  await aplicar(id);
  assert.equal((await docs('&q=Baixa')).length, 1);
});

test('edição só no SIGAT é preservada; conflito mantém SIGAT por omissão e permite escolher o ficheiro', async () => {
  const lisboa = (await docs()).find((d) => d.descricao === 'Planta de Lisboa');
  await h.api('PUT', `/api/documentos/${lisboa.id}`, { token, body: { notas: 'nota do arquivo', autor: 'Silva (rev.)' } });

  // Ficheiro igual → nada a fazer e edições preservadas
  const a = await comparar(buf((() => { const l = base(); l[0]['Palavras-chave / Assuntos'] = 'Lisboa; Baixa'; return l; })()));
  assert.equal(a.resumo.igual, 3);
  await aplicar(a.id);
  assert.equal((await docs()).find((d) => d.id === lisboa.id).autor, 'Silva (rev.)');

  // Ficheiro altera o autor que também foi editado no SIGAT → conflito
  const linhas = base();
  linhas[0]['Palavras-chave / Assuntos'] = 'Lisboa; Baixa';
  linhas[0]['Autor / Entidade Responsável'] = 'Silva, J.';
  const b = await comparar(buf(linhas));
  assert.equal(b.resumo.conflito, 1);
  const itens = (await h.api('GET', `/api/importacoes/${b.id}/itens?acao=conflito`, { token })).data.items;
  assert.equal(itens[0].diff.campos.autor.conflito, true);
  assert.equal(itens[0].diff.campos.autor.escolha, 'sigat');

  await aplicar(b.id);
  assert.equal((await docs()).find((d) => d.id === lisboa.id).autor, 'Silva (rev.)');

  // Novo conflito (SIGAT e ficheiro mudam de novo o autor) e escolha explícita do ficheiro
  await h.api('PUT', `/api/documentos/${lisboa.id}`, { token, body: { autor: 'Silva X' } });
  linhas[0]['Autor / Entidade Responsável'] = 'Silva, K.';
  const c = await comparar(buf(linhas));
  const conf = (await h.api('GET', `/api/importacoes/${c.id}/itens?acao=conflito`, { token })).data.items;
  assert.equal(conf.length, 1);
  await h.api('PATCH', `/api/importacoes/${c.id}/itens/${conf[0].linha}`, { token, body: { escolhas: { autor: 'ficheiro' } } });
  await aplicar(c.id);
  assert.equal((await docs()).find((d) => d.id === lisboa.id).autor, 'Silva, K.');
});

test('linhas novas, duplicadas no ficheiro e documentos ausentes (nunca eliminados)', async () => {
  const linhas = [
    base()[0], // só um dos 3 documentos
    linha({ descricao: 'Planta nova de Cascais', cota: 'MP 9', autor: 'Rui' }),
    linha({ descricao: 'Planta nova de Cascais', cota: 'MP 9', autor: 'Rui' }),
  ];
  linhas[0]['Palavras-chave / Assuntos'] = 'Lisboa; Baixa';
  linhas[0]['Autor / Entidade Responsável'] = 'Silva, J.';
  const { id, resumo } = await comparar(buf(linhas));
  assert.equal(resumo.novo, 1);
  assert.equal(resumo.duplicado_ficheiro, 1);
  assert.equal(resumo.ausente, 2);
  await aplicar(id);
  const lista = await docs();
  assert.equal(lista.length, 4);
  assert.equal(lista.filter((d) => d.descricao === 'Planta nova de Cascais').length, 1);
});

test('ambíguo: escolher o documento ou criar novo', async () => {
  await h.api('POST', '/api/colecoes/cartografia/documentos', { token, body: { cabecalho: 'X1', descricao: 'Planta repetida', cota: 'MP 50', autor: 'A' } });
  await h.api('POST', '/api/colecoes/cartografia/documentos', { token, body: { cabecalho: 'X2', descricao: 'Planta repetida', cota: 'MP 51', autor: 'B' } });
  const { id, resumo } = await comparar(buf([linha({ descricao: 'Planta repetida', cota: 'MP 99', autor: 'C' })]));
  assert.equal(resumo.ambiguo, 1);
  assert.equal((await aplicar(id)).status, 409);
  const item = (await h.api('GET', `/api/importacoes/${id}/itens?acao=ambiguo`, { token })).data.items[0];
  assert.equal(item.candidatosInfo.length, 2);
  const r = await h.api('PATCH', `/api/importacoes/${id}/itens/${item.linha}`, { token, body: { documentoId: item.candidatos[0] } });
  assert.ok(['alterado', 'conflito', 'igual'].includes(r.data.acao));
  await h.api('DELETE', `/api/importacoes/${id}`, { token });
});

test('coluna nova vira campo novo, pesquisável e preservada na exportação', async () => {
  const cab = [...h.CABECALHOS_CARTOGRAFIA, 'Pasta'];
  const linhas = base().map((l, i) => ({ ...l, Pasta: `P${i + 1}` }));
  const { id, resumo } = await comparar(buf(linhas, cab));
  assert.deepEqual(resumo.novosCampos, ['Pasta']);
  assert.equal(resumo.alterado + resumo.conflito, 3);
  await aplicar(id);
  const campo = (await h.api('GET', '/api/colecoes/cartografia/campos', { token })).data.find((c) => c.chave === 'pasta');
  assert.ok(campo);
  assert.deepEqual(campo.aliases, ['pasta']);
  const r = await h.api('GET', '/api/colecoes/cartografia/documentos?q=P2', { token });
  assert.equal(r.data.total, 1);
  assert.equal(r.data.items[0].pasta, 'P2');
});

test('estados e empréstimos do SIGAT não são tocados pela importação', async () => {
  const [d] = (await docs()).filter((x) => x.descricao === 'Planta do Porto');
  await h.api('POST', `/api/documentos/${d.id}/emprestimos`, { token, body: { requisitante: 'DSI' } });
  const linhas = base();
  linhas[1]['Empréstimo'] = 'Não';
  const { id, resumo } = await comparar(buf(linhas, [...h.CABECALHOS_CARTOGRAFIA]));
  assert.equal(resumo.emprestimosCriar + resumo.emprestimosDevolver, 0);
  await aplicar(id);
  const depois = (await docs()).find((x) => x.id === d.id);
  assert.equal(depois.estado, 'Empréstimo');
  assert.equal(depois.estadoMeta.requisitante, 'DSI');
});

test('ciclo exportar → reimportar com ID SIGAT casa todas as linhas', async () => {
  const exp = await h.api('GET', '/api/colecoes/cartografia/exportar?formato=xlsx', { token });
  const total = (await docs()).length;
  const { id, resumo } = await comparar(exp.data);
  assert.equal(resumo.novo, 0);
  assert.equal(resumo.alterado + resumo.igual + resumo.conflito, total);
  assert.equal(resumo.ausente, 0);
  await h.api('DELETE', `/api/importacoes/${id}`, { token });
});

test('mapeamento inválido é recusado e importação cancelada deixa de aceitar aplicar', async () => {
  const prep = await preparar(buf(base()));
  const mau = JSON.parse(JSON.stringify(prep.mapeamento));
  for (const m of Object.values(mau)) if (m.destino === 'campo' && m.campo === 'descricao') m.destino = 'ignorar';
  assert.equal((await h.api('PUT', `/api/importacoes/${prep.importacao.id}/mapeamento`, { token, body: { mapeamento: mau } })).status, 400);
  await h.api('DELETE', `/api/importacoes/${prep.importacao.id}`, { token });
  assert.equal((await aplicar(prep.importacao.id)).status, 409);
});
