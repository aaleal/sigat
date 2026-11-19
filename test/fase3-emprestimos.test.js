const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const emprestimos = require('../src/db/repos/emprestimos');
const { getDb } = require('../src/db');

let token;
let leitor;
let ids;

const dias = (n) => emprestimos.somarDias(emprestimos.hoje(), n);
const post = (url, body, t = token) => h.api('POST', url, { token: t, body });

before(async () => {
  await h.iniciar();
  token = await h.login();
  ids = h.semear('cartografia', [
    { cabecalho: 'A', descricao: 'Planta A', cota: 'MP 1', autor: 'x' },
    { cabecalho: 'B', descricao: 'Planta B', cota: 'MP 2', autor: 'x' },
    { cabecalho: 'C', descricao: 'Planta C', cota: 'MP 3', autor: 'x' },
  ]).map((d) => d.id);
  h.semear('aturb', [{ titulo: 'T', autor: 'a', local: 'l', data: '1990', caixaNr: '7' }]);
  await post('/api/users', { username: 'leitor', password: 'abcd1234', role: 'read' });
  leitor = await h.login('leitor', 'abcd1234');
});
after(h.parar);

test('registar empréstimo: requisitante obrigatório, prazo por omissão e estado', async () => {
  assert.equal((await post(`/api/documentos/${ids[0]}/emprestimos`, {})).status, 400);
  const r = await post(`/api/documentos/${ids[0]}/emprestimos`, { requisitante: 'AML', entidade: 'DMPGU' });
  assert.equal(r.status, 201);
  assert.equal(r.data.emprestimo.dataSaida, emprestimos.hoje());
  assert.equal(r.data.emprestimo.dataPrevista, dias(30));
  assert.equal(r.data.emprestimo.situacao, 'ativo');
  assert.equal(r.data.entry.estado, 'Empréstimo');
  assert.equal(r.data.entry.estadoMeta.requisitante, 'AML');
});

test('409 se já houver empréstimo ativo; leitor não regista', async () => {
  assert.equal((await post(`/api/documentos/${ids[0]}/emprestimos`, { requisitante: 'Outro' })).status, 409);
  assert.equal((await post(`/api/documentos/${ids[1]}/emprestimos`, { requisitante: 'X' }, leitor)).status, 403);
});

test('validação de datas', async () => {
  const futura = await post(`/api/documentos/${ids[1]}/emprestimos`, { requisitante: 'X', dataSaida: dias(2) });
  assert.equal(futura.status, 400);
  const antes = await post(`/api/documentos/${ids[1]}/emprestimos`, { requisitante: 'X', dataSaida: dias(-5), dataPrevista: dias(-10) });
  assert.equal(antes.status, 400);
});

test('estado: Empréstimo não aceite, e não se sai de Empréstimo sem devolver', async () => {
  assert.equal((await h.api('PATCH', `/api/documentos/${ids[0]}/estado`, { token, body: { estado: 'Empréstimo' } })).status, 400);
  assert.equal((await h.api('PATCH', `/api/documentos/${ids[0]}/estado`, { token, body: { estado: 'Arquivo' } })).status, 409);
});

test('atraso calculado, resumo e filtros', async () => {
  const atrasado = await post(`/api/documentos/${ids[1]}/emprestimos`, { requisitante: 'Ana', dataSaida: dias(-20), dataPrevista: dias(-3) });
  assert.equal(atrasado.data.emprestimo.situacao, 'em_atraso');
  assert.equal(atrasado.data.emprestimo.diasAtraso, 3);
  await post(`/api/documentos/${ids[2]}/emprestimos`, { requisitante: 'Rui', dataSaida: dias(-1), dataPrevista: dias(5) });

  const resumo = await h.api('GET', '/api/emprestimos/resumo', { token: leitor });
  assert.deepEqual(resumo.data, { ativos: 3, emAtraso: 1, aVencer7dias: 1, semPrazo: 0 });

  const lista = await h.api('GET', '/api/emprestimos?estado=atraso', { token });
  assert.deepEqual(lista.data.items.map((i) => i.requisitante), ['Ana']);
  assert.equal(lista.data.items[0].documento.titulo, 'B');

  const porReq = await h.api('GET', '/api/emprestimos?estado=ativo&requisitante=' + encodeURIComponent('RUI'), { token });
  assert.equal(porReq.data.total, 1);

  const docs = await h.api('GET', '/api/colecoes/cartografia/documentos?emprestimo=atraso', { token });
  assert.deepEqual(docs.data.items.map((i) => i.cabecalho), ['B']);
  const todos = await h.api('GET', '/api/colecoes/cartografia/documentos?emprestimo=ativo', { token });
  assert.equal(todos.data.total, 3);
});

test('prolongar altera a data prevista e regista no histórico', async () => {
  const lista = await h.api('GET', '/api/emprestimos?estado=atraso', { token });
  const id = lista.data.items[0].id;
  const r = await h.api('PATCH', `/api/emprestimos/${id}`, { token, body: { dataPrevista: dias(10) } });
  assert.equal(r.status, 200);
  assert.equal(r.data.emprestimo.situacao, 'ativo');
  const hist = await h.api('GET', `/api/documentos/${ids[1]}/historico`, { token });
  const ev = hist.data.history.find((x) => x.action === 'prolongar');
  assert.equal(ev.details.alteracoes.dataPrevista.para, dias(10));
  assert.equal((await h.api('PATCH', `/api/emprestimos/${id}`, { token, body: { dataPrevista: dias(-30) } })).status, 400);
});

test('devolver: data, estado Arquivo e novo empréstimo possível', async () => {
  const lista = await h.api('GET', '/api/emprestimos?estado=ativo', { token });
  const emp = lista.data.items.find((i) => i.requisitante === 'AML');
  assert.equal((await post(`/api/emprestimos/${emp.id}/devolver`, { dataDevolucao: dias(-100) })).status, 400);
  const r = await post(`/api/emprestimos/${emp.id}/devolver`, { observacoes: 'Bom estado' });
  assert.equal(r.status, 200);
  assert.equal(r.data.emprestimo.dataDevolucao, emprestimos.hoje());
  assert.equal(r.data.entry.estado, 'Arquivo');
  assert.equal(r.data.entry.estadoMeta, null);
  assert.equal((await post(`/api/emprestimos/${emp.id}/devolver`, {})).status, 409);

  const hist = await h.api('GET', `/api/documentos/${ids[0]}/emprestimos`, { token });
  assert.equal(hist.data.items.length, 1);
  assert.equal((await post(`/api/documentos/${ids[0]}/emprestimos`, { requisitante: 'Nova', dataPrevista: '' })).status, 201);
  const sem = await h.api('GET', '/api/emprestimos?estado=sem_prazo', { token });
  assert.equal(sem.data.total, 1);
});

test('exportação de empréstimos', async () => {
  const r = await h.api('GET', '/api/emprestimos/exportar?formato=csv&estado=todos', { token });
  assert.equal(r.status, 200);
  const linhas = r.data.toString('utf-8').split('\r\n').filter(Boolean);
  assert.equal(linhas.length, 1 + 4);
  assert.ok(linhas[0].includes('Data prevista'));
});

test('índice único impede dois empréstimos ativos no mesmo documento', () => {
  assert.throws(() => getDb().prepare(`INSERT INTO emprestimos (id, documento_id, requisitante, data_saida, registado_por, registado_em)
    VALUES ('dup', ?, 'x', '2026-01-01', 'x', 'x')`).run(ids[0]));
});
