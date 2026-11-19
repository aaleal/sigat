const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { getDb } = require('../src/db');

let token;
let leitor;
let ids;

before(async () => {
  await h.iniciar();
  token = await h.login();
  ids = h.semear('cartografia', [
    { cabecalho: 'A', descricao: 'Planta A', cota: 'MP 1', autor: 'x', nrRegisto: '1', assuntos: 'a', localizacao: 'l' },
    { cabecalho: 'B', descricao: 'Planta B', cota: '', autor: '', nrRegisto: '2', assuntos: '', localizacao: 'l' },
    { cabecalho: 'C', descricao: 'Planta B', cota: '', autor: 'y', assuntos: 'c' },
  ]).map((d) => d.id);
  h.semear('aturb', [{ titulo: 'T', autor: 'a', local: 'l', data: '1990', caixaNr: '7' }, { titulo: 'U', autor: '', local: '', data: '', caixaNr: '8' }]);
  await h.api('POST', '/api/users', { token, body: { username: 'leitor', password: 'abcd1234', role: 'read' } });
  leitor = await h.login('leitor', 'abcd1234');
});
after(h.parar);

test('visualizações: 1 por utilizador/documento em 30 min; registar=0 não conta', async () => {
  await h.api('GET', `/api/documentos/${ids[0]}`, { token: leitor });
  await h.api('GET', `/api/documentos/${ids[0]}`, { token: leitor });
  await h.api('GET', `/api/documentos/${ids[0]}?registar=0`, { token: leitor });
  await h.api('GET', `/api/documentos/${ids[0]}`, { token });
  const n = getDb().prepare("SELECT COUNT(*) AS n FROM consultas WHERE documento_id = ? AND tipo = 'visualizacao'").get(ids[0]).n;
  assert.equal(n, 2);
});

test('indicadores por coleção: totais, estados e qualidade (coerentes com o filtro vazios)', async () => {
  await h.api('PATCH', `/api/documentos/${ids[1]}/estado`, { token, body: { estado: 'Em Consulta' } });
  await h.api('POST', `/api/documentos/${ids[2]}/emprestimos`, { token, body: { requisitante: 'AML', dataSaida: '2026-01-01', dataPrevista: '2026-01-10' } });

  const r = await h.api('GET', '/api/indicadores?colecao=cartografia', { token: leitor });
  assert.equal(r.status, 200);
  const c = r.data.colecoes[0];
  assert.equal(c.total, 3);
  assert.equal(c.porEstado['Em Consulta'], 1);
  assert.equal(c.porEstado['Empréstimo'], 1);
  const semCota = c.qualidade.find((q) => q.chave === 'cota');
  assert.equal(semCota.total, 2);
  const lista = await h.api('GET', `/api/colecoes/cartografia/documentos?vazios=${semCota.filtro.vazios}`, { token });
  assert.equal(lista.data.total, semCota.total);
  assert.equal(c.qualidade.find((q) => q.chave === 'autor').total, 1);
  assert.equal(c.duplicados.grupos, 1);
  assert.equal(c.duplicados.documentos, 2);
  assert.equal(r.data.emprestimos.ativos, 1);
  assert.equal(r.data.emprestimos.emAtraso, 1);
});

test('mais consultados: presencial + empréstimo por omissão; visualizações opcionais', async () => {
  const base = await h.api('GET', '/api/indicadores?colecao=cartografia&periodo=tudo', { token });
  const tipos = base.data.maisConsultados.map((m) => [m.titulo, m.total]);
  assert.deepEqual(tipos.sort(), [['B', 1], ['C', 1]]);
  const com = await h.api('GET', '/api/indicadores?colecao=cartografia&periodo=tudo&incluir=visualizacoes', { token });
  assert.equal(com.data.maisConsultados[0].titulo, 'A');
  assert.equal(com.data.maisConsultados[0].visualizacao, 2);
});

test('todas as coleções e duplicados', async () => {
  const r = await h.api('GET', '/api/indicadores', { token });
  assert.deepEqual(r.data.colecoes.map((c) => c.id), ['cartografia', 'aturb']);
  const aturb = r.data.colecoes[1];
  assert.equal(aturb.qualidade.find((q) => q.chave === 'autor').total, 1);
  const dup = await h.api('GET', '/api/colecoes/cartografia/duplicados', { token });
  assert.equal(dup.data.itens[0].documentos.length, 2);
  assert.equal((await h.api('GET', '/api/colecoes/x/duplicados', { token })).status, 404);
});
