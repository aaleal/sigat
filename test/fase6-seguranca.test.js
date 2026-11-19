const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let token;

before(async () => {
  await h.iniciar({ manterTrocaDePassword: true });
  token = await h.login();
});
after(h.parar);

test('password inicial obriga a troca: só /auth/me e /auth/password funcionam', async () => {
  const me = await h.api('GET', '/api/auth/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.data.trocarPassword, true);
  const bloqueado = await h.api('GET', '/api/colecoes', { token });
  assert.equal(bloqueado.status, 403);
  assert.equal(bloqueado.data.trocarPassword, true);
});

test('troca de password valida a atual, o tamanho mínimo e a diferença', async () => {
  const body = (atual, nova) => ({ token, body: { atual, nova } });
  assert.equal((await h.api('POST', '/api/auth/password', body('errada', 'nova-password-1'))).status, 400);
  assert.equal((await h.api('POST', '/api/auth/password', body('admin123', 'curta'))).status, 400);
  assert.equal((await h.api('POST', '/api/auth/password', body('admin123', 'admin123'))).status, 400);
  const trocada = await h.api('POST', '/api/auth/password', body('admin123', 'nova-password-1'));
  assert.equal(trocada.status, 200);
  // a troca termina as sessões antigas; o token novo vem na resposta
  assert.equal((await h.api('GET', '/api/colecoes', { token })).status, 401);
  token = trocada.data.token;
  assert.equal((await h.api('GET', '/api/colecoes', { token })).status, 200);
  assert.equal((await h.api('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } })).status, 401);
});

test('criar utilizador exige password com 8+ caracteres; reposição obriga a nova troca', async () => {
  assert.equal((await h.api('POST', '/api/users', { token, body: { username: 'u1', password: '1234567', role: 'read' } })).status, 400);
  const criado = await h.api('POST', '/api/users', { token, body: { username: 'u1', password: 'senha-1234', role: 'read' } });
  assert.equal(criado.status, 201);
  assert.equal((await h.api('PATCH', `/api/users/${criado.data.id}/password`, { token, body: { password: 'abc' } })).status, 400);
  assert.equal((await h.api('PATCH', `/api/users/${criado.data.id}/password`, { token, body: { password: 'repor-123' } })).status, 200);
  const t = await h.login('u1', 'repor-123');
  assert.equal((await h.api('GET', '/api/colecoes', { token: t })).status, 403);
});

test('token de utilizador apagado deixa de funcionar', async () => {
  const criado = await h.api('POST', '/api/users', { token, body: { username: 'u2', password: 'senha-1234', role: 'admin' } });
  await h.api('PATCH', `/api/users/${criado.data.id}/password`, { token, body: { password: 'outra-1234' } });
  let t = await h.login('u2', 'outra-1234');
  const troca = await h.api('POST', '/api/auth/password', { token: t, body: { atual: 'outra-1234', nova: 'definitiva-1' } });
  t = troca.data.token;
  assert.equal((await h.api('GET', '/api/colecoes', { token: t })).status, 200);
  await h.api('DELETE', `/api/users/${criado.data.id}`, { token });
  assert.equal((await h.api('GET', '/api/colecoes', { token: t })).status, 401);
});

test('limite de tentativas falhadas de login', async () => {
  let ultimo;
  for (let i = 0; i < 6; i += 1) {
    ultimo = await h.api('POST', '/api/auth/login', { body: { username: 'alvo', password: 'errada' } });
  }
  assert.equal(ultimo.status, 429);
  // outro utilizador não é afetado
  assert.equal((await h.api('POST', '/api/auth/login', { body: { username: 'outro', password: 'errada' } })).status, 401);
});
