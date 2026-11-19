const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let token;
let datasetId;

before(async () => {
  await h.iniciar();
  token = await h.login();
  const buf = h.xlsxCartografia([
    h.linhaCartografia({ descricao: 'Planta de Lisboa', cota: 'MP 12 CMLEO' }),
    h.linhaCartografia({ descricao: 'Planta do Porto', cota: 'MP 123 CMLEO' }),
    h.linhaCartografia({ descricao: 'Mapa de Sintra', cota: 'MP 5 CMLEO', emprestimo: 'Sim' }),
  ]);
  const { status, data } = await h.api('POST', '/api/datasets/upload', {
    token, form: h.formComFicheiro(buf, 'teste.xlsx', { name: 'teste' }),
  });
  assert.equal(status, 201);
  datasetId = data.metadata.id;
});

after(h.parar);

test('login inválido devolve 401', async () => {
  const { status } = await h.api('POST', '/api/auth/login', { body: { username: 'admin', password: 'x' } });
  assert.equal(status, 401);
});

test('rotas exigem token', async () => {
  const { status } = await h.api('GET', '/api/bootstrap');
  assert.equal(status, 401);
});

test('upload da cartografia importa Localização da coluna Local', async () => {
  const { data } = await h.api('GET', `/api/entries?datasetId=${datasetId}`, { token });
  assert.equal(data.total, 3);
  assert.equal(data.items[0].localizacao, 'DMPGU');
});

test('filtro numérico de cota é exato (12 não casa 123)', async () => {
  const { data } = await h.api('GET', `/api/entries?datasetId=${datasetId}&cota=12`, { token });
  assert.equal(data.total, 1);
  assert.equal(data.items[0].cota, 'MP 12 CMLEO');
});

test('ordenação por cota usa o primeiro número', async () => {
  const { data } = await h.api('GET', `/api/entries?datasetId=${datasetId}&sortKeys=cota:asc`, { token });
  assert.deepEqual(data.items.map((i) => i.cota), ['MP 5 CMLEO', 'MP 12 CMLEO', 'MP 123 CMLEO']);
});

test('Empréstimo=Sim na importação cria estado Empréstimo', async () => {
  const { data } = await h.api('GET', `/api/entries?datasetId=${datasetId}&estado=${encodeURIComponent('Empréstimo')}`, { token });
  assert.equal(data.total, 1);
});

test('activate exige role write/admin', async () => {
  const created = await h.api('POST', '/api/users', { token, body: { username: 'leitor', password: 'abcd1234', role: 'read' } });
  assert.equal(created.status, 201);
  const readToken = await h.login('leitor', 'abcd1234');
  const { status } = await h.api('POST', `/api/datasets/${datasetId}/activate`, { token: readToken });
  assert.equal(status, 403);
});
