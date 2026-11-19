const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let token;
let leitor;
let ids;

before(async () => {
  await h.iniciar();
  token = await h.login();
  const docs = h.semear('cartografia', [
    { cabecalho: 'LISBOA', descricao: 'Planta de Lisboa', cota: 'MP 12 CMLEO', autor: 'Silva', localizacao: 'DMPGU' },
    { cabecalho: 'PORTO', descricao: 'Planta do Porto', cota: 'MP 123 CMLEO', autor: 'Costa' },
    { cabecalho: 'SINTRA', descricao: 'Mapa de Sintra', cota: 'MP 5 CMLEO', autor: 'Silva' },
  ]);
  ids = docs.map((d) => d.id);
  await h.api('POST', '/api/users', { token, body: { username: 'leitor', password: 'abcd1234', role: 'read' } });
  leitor = await h.login('leitor', 'abcd1234');
});
after(h.parar);

test('login inválido devolve 401 e rotas exigem token', async () => {
  assert.equal((await h.api('POST', '/api/auth/login', { body: { username: 'admin', password: 'x' } })).status, 401);
  assert.equal((await h.api('GET', '/api/colecoes')).status, 401);
});

test('coleções e campos', async () => {
  const { data } = await h.api('GET', '/api/colecoes', { token });
  assert.deepEqual(data.map((c) => [c.id, c.total]), [['cartografia', 3], ['aturb', 0]]);
  const campos = await h.api('GET', '/api/colecoes/cartografia/campos', { token });
  assert.ok(campos.data.some((c) => c.chave === 'cota' && c.numerico));
  assert.equal((await h.api('GET', '/api/colecoes/inexistente/campos', { token })).status, 404);
});

test('filtro numérico exato e ordenação por cota', async () => {
  const f = await h.api('GET', '/api/colecoes/cartografia/documentos?cota=12', { token });
  assert.equal(f.data.total, 1);
  const s = await h.api('GET', '/api/colecoes/cartografia/documentos?sortKeys=cota:asc', { token });
  assert.deepEqual(s.data.items.map((i) => i.cota), ['MP 5 CMLEO', 'MP 12 CMLEO', 'MP 123 CMLEO']);
});

test('leitor não pode escrever', async () => {
  assert.equal((await h.api('POST', '/api/colecoes/cartografia/documentos', { token: leitor, body: { cabecalho: 'x' } })).status, 403);
  assert.equal((await h.api('PUT', `/api/documentos/${ids[0]}`, { token: leitor, body: { autor: 'x' } })).status, 403);
  assert.equal((await h.api('GET', '/api/colecoes/cartografia/eliminados', { token: leitor })).status, 403);
});

test('criar valida obrigatórios e ignora campos desconhecidos', async () => {
  const mau = await h.api('POST', '/api/colecoes/cartografia/documentos', { token, body: { cabecalho: 'X' } });
  assert.equal(mau.status, 400);
  assert.ok(mau.data.erros.descricao);
  const ok = await h.api('POST', '/api/colecoes/cartografia/documentos', {
    token, body: { cabecalho: 'NOVO', descricao: 'Planta nova', cota: 'MP 900', autor: 'Ana', campoInventado: 'lixo' },
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.entry.campoInventado, undefined);
  assert.equal(ok.data.entry.numero, 4);
});

test('editar permite limpar campos opcionais e regista diff no histórico', async () => {
  const r = await h.api('PUT', `/api/documentos/${ids[0]}`, { token, body: { localizacao: '', notas: 'nova nota' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.entry.localizacao, undefined);
  assert.equal(r.data.entry.notas, 'nova nota');
  const hist = await h.api('GET', `/api/documentos/${ids[0]}/historico`, { token });
  const edicao = hist.data.history.find((x) => x.action === 'edit');
  assert.deepEqual(Object.keys(edicao.details.alteracoes).sort(), ['localizacao', 'notas']);
  assert.equal(edicao.details.alteracoes.localizacao.de, 'DMPGU');
});

test('não permite esvaziar um campo obrigatório já preenchido', async () => {
  const r = await h.api('PUT', `/api/documentos/${ids[1]}`, { token, body: { descricao: '' } });
  assert.equal(r.status, 400);
});

test('eliminar → lixo → restaurar; numero nunca é reutilizado', async () => {
  assert.equal((await h.api('DELETE', `/api/documentos/${ids[2]}`, { token })).status, 200);
  const lixo = await h.api('GET', '/api/colecoes/cartografia/eliminados', { token });
  assert.equal(lixo.data.deletedEntries.length, 1);
  const novo = await h.api('POST', '/api/colecoes/cartografia/documentos', {
    token, body: { cabecalho: 'N2', descricao: 'Outra planta', cota: 'MP 901', autor: 'Rui' },
  });
  assert.equal(novo.data.entry.numero, 5);
  const rest = await h.api('POST', `/api/documentos/${ids[2]}/restaurar`, { token });
  assert.equal(rest.status, 200);
  assert.equal(rest.data.entry.numero, 3);
});

test('estado Empréstimo cria empréstimo e a devolução repõe Arquivo', async () => {
  const r = await h.api('PATCH', `/api/documentos/${ids[1]}/estado`, {
    token, body: { estado: 'Empréstimo', estadoMeta: { requisitante: 'AML' } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.estadoMeta.requisitante, 'AML');
  const lista = await h.api('GET', '/api/colecoes/cartografia/documentos?estado=' + encodeURIComponent('Empréstimo'), { token });
  assert.equal(lista.data.total, 1);
  const back = await h.api('PATCH', `/api/documentos/${ids[1]}/estado`, { token, body: { estado: 'Arquivo' } });
  assert.equal(back.data.estado, 'Arquivo');
  assert.equal(back.data.estadoMeta, null);
});

test('não se elimina um documento emprestado', async () => {
  await h.api('PATCH', `/api/documentos/${ids[0]}/estado`, { token, body: { estado: 'Empréstimo', estadoMeta: { requisitante: 'X' } } });
  assert.equal((await h.api('DELETE', `/api/documentos/${ids[0]}`, { token })).status, 409);
});
