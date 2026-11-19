const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const h = require('./helpers');

let admin;
const api = (m, u, o = {}) => h.api(m, u, { token: admin, ...o });

async function criarUtilizador(username, role = 'read', password = 'senha-1234') {
  const r = await api('POST', '/api/users', { body: { username, password, role } });
  assert.equal(r.status, 201);
  // a reposição por admin obriga a troca; aqui interessa apenas a conta pronta a usar
  require('../src/db').getDb().prepare('UPDATE utilizadores SET trocar_password = 0 WHERE id = ?').run(r.data.id);
  return r.data;
}

before(async () => {
  await h.iniciar();
  admin = await h.login();
});
after(h.parar);

test('configuração: só admin altera; valores são validados; modelo público é legível', async () => {
  const leitor = await criarUtilizador('cfg-leitor');
  const tl = await h.login('cfg-leitor', 'senha-1234');
  assert.equal((await h.api('GET', '/api/admin/configuracao', { token: tl })).status, 403);
  assert.equal((await h.api('PUT', '/api/admin/configuracao', { token: tl, body: { sessao_horas: 2 } })).status, 403);
  assert.equal((await h.api('GET', '/api/configuracao/publica', { token: tl })).status, 200);

  const invalida = await api('PUT', '/api/admin/configuracao', { body: { sessao_horas: 0, historico_retencao_dias: 30, pdf_cor: 'azul' } });
  assert.equal(invalida.status, 400);
  assert.ok(invalida.data.erros.sessao_horas && invalida.data.erros.historico_retencao_dias && invalida.data.erros.pdf_cor);

  const ok = await api('PUT', '/api/admin/configuracao', { body: { sessao_horas: 2 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.valores.sessao_horas, 2);
  assert.ok(leitor.id);
});

test('duração da sessão é configurável e aplica-se aos novos tokens', async () => {
  await api('PUT', '/api/admin/configuracao', { body: { sessao_horas: 3 } });
  const t = await h.login();
  const { exp, iat } = jwt.decode(t);
  assert.equal(exp - iat, 3 * 3600);
  await api('PUT', '/api/admin/configuracao', { body: { sessao_horas: 8 } });
});

test('política de passwords: letras e números, mínimo configurável, sem o username', async () => {
  const tenta = (username, password) => api('POST', '/api/users', { body: { username, password, role: 'read' } });
  assert.equal((await tenta('pol1', 'somenteletras')).status, 400);
  assert.equal((await tenta('pol1', '1234567890')).status, 400);
  assert.equal((await tenta('pol1', 'pol1-segura-9')).status, 400);
  assert.equal((await tenta('pol1', 'admin123')).status, 400);
  assert.equal((await tenta('pol1', 'segura-1234')).status, 201);

  await api('PUT', '/api/admin/configuracao', { body: { password_min: 12 } });
  assert.equal((await tenta('pol2', 'segura-123')).status, 400);
  assert.equal((await tenta('pol2', 'segura-1234567')).status, 201);
  await api('PUT', '/api/admin/configuracao', { body: { password_min: 8, password_complexa: false } });
  assert.equal((await tenta('pol3', 'somenteletras')).status, 201);
  await api('PUT', '/api/admin/configuracao', { body: { password_complexa: true } });
});

test('bloqueio da conta após tentativas falhadas e desbloqueio pelo admin', async () => {
  const u = await criarUtilizador('bloq');
  await api('PUT', '/api/admin/configuracao', { body: { max_tentativas: 3, bloqueio_minutos: 30 } });
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await h.api('POST', '/api/auth/login', { body: { username: 'bloq', password: 'errada-1' } })).status, 401);
  }
  // mesmo com a password certa a conta está bloqueada
  assert.equal((await h.api('POST', '/api/auth/login', { body: { username: 'bloq', password: 'senha-1234' } })).status, 429);
  const lista = await api('GET', '/api/users');
  assert.ok(lista.data.find((x) => x.username === 'bloq').bloqueadoAte);

  assert.equal((await api('POST', `/api/users/${u.id}/desbloquear`)).status, 200);
  assert.equal((await h.api('POST', '/api/auth/login', { body: { username: 'bloq', password: 'senha-1234' } })).status, 200);

  const auditoria = await api('GET', '/api/admin/auditoria?acao=conta_bloqueada');
  assert.ok(auditoria.data.items.some((e) => e.utilizador === 'bloq'));
  await api('PUT', '/api/admin/configuracao', { body: { max_tentativas: 5, bloqueio_minutos: 15 } });
});

test('admin pode terminar as sessões de um utilizador', async () => {
  const u = await criarUtilizador('sessoes');
  const t = await h.login('sessoes', 'senha-1234');
  assert.equal((await h.api('GET', '/api/colecoes', { token: t })).status, 200);
  assert.equal((await api('POST', `/api/users/${u.id}/revogar-sessoes`)).status, 200);
  assert.equal((await h.api('GET', '/api/colecoes', { token: t })).status, 401);
  assert.equal((await h.api('GET', '/api/colecoes', { token: await h.login('sessoes', 'senha-1234') })).status, 200);
});

test('recuperação de password: pedido, código de uso único, expiração e revogação de sessões', async () => {
  const u = await criarUtilizador('recup');
  const antigo = await h.login('recup', 'senha-1234');

  // pedido não revela se a conta existe
  const r1 = await h.api('POST', '/api/auth/recuperar/pedir', { body: { username: 'recup' } });
  const r2 = await h.api('POST', '/api/auth/recuperar/pedir', { body: { username: 'nao-existe' } });
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.data, r2.data);
  const pedidos = await api('GET', '/api/admin/recuperacoes');
  assert.deepEqual(pedidos.data.items.map((p) => p.username), ['recup']);

  const emitido = await api('POST', `/api/users/${u.id}/recuperacao`);
  assert.equal(emitido.status, 201);
  assert.match(emitido.data.codigo, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await api('GET', '/api/admin/recuperacoes')).data.items.length, 0);

  const usar = (codigo, nova) => h.api('POST', '/api/auth/recuperar', { body: { username: 'recup', codigo, nova } });
  assert.equal((await usar('AAAA-BBBB', 'nova-segura-1')).status, 400);
  assert.equal((await usar(emitido.data.codigo, 'fraca')).status, 400); // política validada antes de consumir
  assert.equal((await usar(emitido.data.codigo.toLowerCase(), 'nova-segura-1')).status, 200);
  assert.equal((await usar(emitido.data.codigo, 'outra-segura-1')).status, 400); // uso único

  assert.equal((await h.api('GET', '/api/colecoes', { token: antigo })).status, 401);
  assert.equal((await h.api('POST', '/api/auth/login', { body: { username: 'recup', password: 'senha-1234' } })).status, 401);
  assert.equal((await h.api('POST', '/api/auth/login', { body: { username: 'recup', password: 'nova-segura-1' } })).status, 200);
});

test('código de recuperação expira e é invalidado após tentativas erradas', async () => {
  const u = await criarUtilizador('recup2');
  const db = require('../src/db').getDb();
  const e = await api('POST', `/api/users/${u.id}/recuperacao`);
  db.prepare('UPDATE recuperacoes SET expira_em = ? WHERE utilizador_id = ?').run(new Date(Date.now() - 1000).toISOString(), u.id);
  assert.equal((await h.api('POST', '/api/auth/recuperar', { body: { username: 'recup2', codigo: e.data.codigo, nova: 'nova-segura-2' } })).status, 400);

  const e2 = await api('POST', `/api/users/${u.id}/recuperacao`);
  for (let i = 0; i < 5; i += 1) {
    await h.api('POST', '/api/auth/recuperar', { body: { username: 'recup2', codigo: 'ZZZZ-ZZZZ', nova: 'nova-segura-2' } });
  }
  // 5 tentativas erradas: código invalidado (e limitador ativo)
  const final = await h.api('POST', '/api/auth/recuperar', { body: { username: 'recup2', codigo: e2.data.codigo, nova: 'nova-segura-2' } });
  assert.ok([400, 429].includes(final.status));
});

test('cópias de segurança: criar, listar, descarregar, retenção e acesso restrito', async () => {
  await api('PUT', '/api/admin/configuracao', { body: { backup_retencao: 2 } });
  const b1 = await api('POST', '/api/admin/backups');
  assert.equal(b1.status, 201);
  await api('POST', '/api/admin/backups');
  await api('POST', '/api/admin/backups');
  const lista = await api('GET', '/api/admin/backups');
  assert.equal(lista.data.items.length, 2);

  const download = await api('GET', `/api/admin/backups/${lista.data.items[0].nome}`);
  assert.equal(download.status, 200);
  assert.equal(download.data.subarray(0, 15).toString('latin1'), 'SQLite format 3');

  assert.equal((await api('GET', '/api/admin/backups/..%2F..%2Fetc%2Fpasswd')).status, 404);
  assert.equal((await api('GET', '/api/admin/backups/sigat-20200101-000000.db')).status, 404);

  const t = await h.login('cfg-leitor', 'senha-1234');
  assert.equal((await h.api('POST', '/api/admin/backups', { token: t })).status, 403);
  assert.equal((await h.api('GET', '/api/admin/backups', { token: t })).status, 403);

  const estado = await api('GET', '/api/admin/estado');
  assert.equal(estado.data.backups.total, 2);
  assert.ok(estado.data.baseDados.bytes > 0);
});

test('ciclo automático cria cópia quando não existe nenhuma recente', async () => {
  const backup = require('../src/backup');
  const manutencao = require('../src/manutencao');
  for (const b of backup.listar()) fs.rmSync(`${backup.pasta()}/${b.nome}`);
  await manutencao.ciclo();
  assert.equal(backup.listar().length, 1);
  await manutencao.ciclo(); // intervalo ainda não decorrido
  assert.equal(backup.listar().length, 1);
});

test('retenção do Histórico: remove só entradas antigas, apenas quando configurada', async () => {
  const db = require('../src/db').getDb();
  const antigo = new Date(Date.now() - 400 * 86_400_000).toISOString();
  db.prepare("INSERT INTO historico (id, colecao, acao, utilizador, em) VALUES ('h-antigo', 'cartografia', 'exportar', 'x', ?)").run(antigo);
  db.prepare("INSERT INTO historico (id, colecao, acao, utilizador, em) VALUES ('h-novo', 'cartografia', 'exportar', 'x', ?)").run(new Date().toISOString());

  assert.equal((await api('POST', '/api/admin/manutencao/purgar')).data.historico, 0); // retenção 0 = guardar sempre
  await api('PUT', '/api/admin/configuracao', { body: { historico_retencao_dias: 365 } });
  assert.equal((await api('POST', '/api/admin/manutencao/purgar')).data.historico, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM historico WHERE id = 'h-novo'").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM historico WHERE id = 'h-antigo'").get().n, 0);
  await api('PUT', '/api/admin/configuracao', { body: { historico_retencao_dias: 0 } });
});

test('SSO por proxy: desativado por omissão; exige segredo; só contas autorizadas', async () => {
  assert.equal((await h.api('GET', '/api/auth/sso/estado')).data.ativo, false);
  assert.equal((await h.api('POST', '/api/auth/sso')).status, 404);

  process.env.SSO_HEADER = 'X-Remote-User';
  process.env.SSO_SEGREDO = 'segredo-partilhado-com-proxy';
  try {
    const pedir = (nome, segredo = process.env.SSO_SEGREDO) => h.api('POST', '/api/auth/sso', {
      headers: { 'x-remote-user': nome, 'x-sigat-sso-secret': segredo },
    });
    assert.equal((await h.api('GET', '/api/auth/sso/estado')).data.ativo, true);
    assert.equal((await pedir('recup', 'errado')).status, 401);
    assert.equal((await pedir('desconhecido')).status, 403);
    assert.equal((await pedir('bad name;drop')).status, 401);
    const ok = await pedir('recup');
    assert.equal(ok.status, 200);
    assert.equal(ok.data.user.username, 'recup');

    process.env.SSO_ROLE_POR_OMISSAO = 'read';
    const novo = await pedir('ana.silva');
    assert.equal(novo.status, 200);
    assert.equal(novo.data.user.role, 'read');
    assert.equal(novo.data.user.origem, 'sso');
    // conta SSO não entra com password
    assert.equal((await h.api('POST', '/api/auth/login', { body: { username: 'ana.silva', password: 'qualquer-1' } })).status, 401);
  } finally {
    delete process.env.SSO_HEADER;
    delete process.env.SSO_SEGREDO;
    delete process.env.SSO_ROLE_POR_OMISSAO;
  }
});

test('cabeçalhos de segurança e alteração de role protegida', async () => {
  const res = await h.api('GET', '/api/health');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);

  const eu = (await api('GET', '/api/auth/me')).data;
  assert.equal((await api('PATCH', `/api/users/${eu.id}/role`, { body: { role: 'read' } })).status, 400); // único admin
  const u = await criarUtilizador('promovido');
  assert.equal((await api('PATCH', `/api/users/${u.id}/role`, { body: { role: 'write' } })).data.role, 'write');
  assert.equal((await api('PATCH', `/api/users/${u.id}/role`, { body: { role: 'dono' } })).status, 400);
});
