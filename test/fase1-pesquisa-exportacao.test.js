const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const xlsx = require('xlsx');
const h = require('./helpers');
const { queryEntries } = require('../src/query');
const { CAMPOS } = require('../src/campos');
const { protegerFormula } = require('../src/export');

const campos = CAMPOS.cartografia;
const entradas = [
  { sourceEntryNumber: 1, cabecalho: 'LISBOA', descricao: 'Planta de Lisboa', notas: 'Câmara Municipal', cota: 'MP 12', autor: 'Silva', estado: '-' },
  { sourceEntryNumber: 2, cabecalho: 'PORTO', descricao: 'Planta do Porto', notas: 'Referência a Lisboa', cota: 'MP 123', autor: '', estado: '-' },
  { sourceEntryNumber: 3, cabecalho: 'SINTRA', descricao: 'Mapa de Sintra', notas: '', cota: '', autor: 'Costa', estado: 'Arquivo' },
];
const q = (params) => queryEntries(entradas, campos, params).items.map((e) => e.sourceEntryNumber);

test('pesquisa ignora acentos e maiúsculas', () => {
  assert.deepEqual(q({ q: 'lisbôa' }), [1, 2]);
  assert.deepEqual(q({ q: 'CAMARA' }), [1]);
  assert.deepEqual(q({ q: 'camara municipal' }), [1]);
});

test('palavras parciais (prefixo e substring)', () => {
  assert.deepEqual(q({ q: 'plan lisb' }), [1, 2]);
  assert.deepEqual(q({ q: 'sint' }), [3]);
  assert.deepEqual(q({ q: 'anta' }).sort(), [1, 2]);
});

test('relevância: cabeçalho acima de notas', () => {
  assert.deepEqual(q({ q: 'lisboa' }), [1, 2]);
});

test('-termo exclui e "frase" exige a frase', () => {
  assert.deepEqual(q({ q: 'planta -porto' }), [1]);
  assert.deepEqual(q({ q: '"de lisboa"' }), [1]);
  assert.deepEqual(q({ q: '"lisboa de"' }), []);
});

test('número em q é exato', () => {
  assert.deepEqual(q({ q: '12' }), [1]);
  assert.deepEqual(q({ q: '123' }), [2]);
});

test('vazios, filtros e ids', () => {
  assert.deepEqual(q({ vazios: ['autor'] }), [2]);
  assert.deepEqual(q({ vazios: ['cota'] }), [3]);
  assert.deepEqual(q({ filtros: { descricao: 'PLANTA' } }), [1, 2]);
  assert.deepEqual(q({ filtros: { cota: '12' } }), [1]);
  assert.deepEqual(q({ ids: ['3', '1'] }), [1, 3]);
});

test('sortKeys sobrepõe-se à relevância', () => {
  const r = queryEntries(entradas, campos, { q: 'lisboa', sortKeys: 'cota:desc' });
  assert.equal(r.ordenacao, 'campos');
  assert.deepEqual(r.items.map((e) => e.sourceEntryNumber), [2, 1]);
});

test('protegerFormula', () => {
  assert.equal(protegerFormula('=SUM(1)'), "'=SUM(1)");
  assert.equal(protegerFormula('-'), '-');
  assert.equal(protegerFormula('normal'), 'normal');
});

let token;
before(async () => {
  await h.iniciar();
  token = await h.login();
  h.semear('cartografia', [
    { descricao: 'Planta de Lisboa', cota: 'MP 12', autor: 'Silva' },
    { descricao: '=SUM(1) perigoso', cota: 'MP 13', autor: 'Silva' },
    { descricao: 'Mapa de Sintra', cota: 'MP 14', autor: 'Costa' },
  ]);
});
after(h.parar);

test('pesquisa tolerante e indica ordenação', async () => {
  const { data } = await h.api('GET', `/api/colecoes/cartografia/documentos?q=${encodeURIComponent('PLANTA')}`, { token });
  assert.equal(data.total, 1);
  assert.equal(data.ordenacao, 'relevancia');
});

test('exportação CSV: BOM, ; e total igual ao da pesquisa', async () => {
  const url = '/api/colecoes/cartografia/exportar?formato=csv&autor=silva';
  const { status, data, headers } = await h.api('GET', url, { token });
  assert.equal(status, 200);
  assert.match(headers.get('content-disposition'), /attachment; filename="sigat-cartografia-\d{8}-\d{4}\.csv"/);
  const texto = data.toString('utf-8');
  assert.equal(texto.charCodeAt(0), 0xFEFF);
  const linhas = texto.split('\r\n').filter(Boolean);
  assert.equal(linhas.length, 3); // cabeçalho + 2
  assert.ok(linhas[0].startsWith('\uFEFFID SIGAT;'));
  assert.ok(linhas.some((l) => l.includes("'=SUM(1) perigoso")));
});

test('exportação xlsx tem folha Critérios e linhas = total', async () => {
  const { data } = await h.api('GET', '/api/colecoes/cartografia/exportar?formato=xlsx&q=sintra', { token });
  const wb = xlsx.read(data, { type: 'buffer' });
  assert.deepEqual(wb.SheetNames, ['SIGAT', 'Critérios']);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets.SIGAT, { header: 1 });
  assert.equal(rows.length, 2);
});

test('exportação por ids e colunas', async () => {
  const { data } = await h.api('GET', '/api/colecoes/cartografia/exportar?formato=csv&ids=1,3&colunas=cota', { token });
  const linhas = data.toString('utf-8').trim().split('\r\n');
  assert.equal(linhas.length, 3);
  assert.ok(linhas[0].includes('ID SIGAT;Cota;Requisitante'));
});

test('exportação exige autenticação', async () => {
  const { status } = await h.api('GET', '/api/colecoes/cartografia/exportar');
  assert.equal(status, 401);
});
