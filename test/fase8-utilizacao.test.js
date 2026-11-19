const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let admin;
let leitor;
let doc;
const api = (m, u, o = {}) => h.api(m, u, { token: admin, ...o });

// PNG 1x1 válido
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
// Cabeçalho mínimo de JPEG (a validação só verifica os bytes iniciais)
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60)]);

function formFicheiro(buffer, nome, { miniatura, legenda } = {}) {
  const f = new FormData();
  f.append('file', new Blob([buffer]), nome);
  if (miniatura) f.append('miniatura', new Blob([miniatura]), 'm.jpg');
  if (legenda) f.append('legenda', legenda);
  return f;
}

before(async () => {
  await h.iniciar();
  admin = await h.login();
  await api('POST', '/api/users', { body: { username: 'leitor', password: 'senha-1234', role: 'read' } });
  require('../src/db').getDb().prepare('UPDATE utilizadores SET trocar_password = 0').run();
  leitor = await h.login('leitor', 'senha-1234');
  [doc] = h.semear('cartografia', [{ cabecalho: 'Planta A', descricao: 'Planta de Lisboa', cota: '1', autor: 'X', nrRegisto: '10' }]);
});
after(h.parar);

test('carrinho persiste por utilizador e ignora documentos eliminados', async () => {
  const [d2] = h.semear('cartografia', [{ cabecalho: 'Planta B', descricao: 'Outra', cota: '2', autor: 'Y' }]);
  assert.equal((await api('PUT', `/api/carrinho/${doc.id}`)).status, 200);
  assert.equal((await api('PUT', `/api/carrinho/${doc.id}`)).status, 200); // idempotente
  assert.equal((await api('PUT', `/api/carrinho/${d2.id}`)).status, 200);
  assert.equal((await api('PUT', '/api/carrinho/inexistente')).status, 404);

  // "nova sessão": novo token, mesmo carrinho
  const novo = await api('GET', '/api/carrinho', { token: await h.login() });
  assert.deepEqual(novo.data.items.map((e) => e.id), [doc.id, d2.id]);
  assert.equal((await h.api('GET', '/api/carrinho', { token: leitor })).data.items.length, 0);

  assert.equal((await api('DELETE', `/api/carrinho/${doc.id}`)).status, 200);
  await api('DELETE', `/api/documentos/${d2.id}`);
  assert.equal((await api('GET', '/api/carrinho')).data.items.length, 0);

  await api('PUT', `/api/carrinho/${doc.id}`);
  await api('DELETE', '/api/carrinho');
  assert.equal((await api('GET', '/api/carrinho')).data.items.length, 0);
});

test('anexos: carregar imagem com miniatura, listar, servir e remover', async () => {
  const criado = await api('POST', `/api/documentos/${doc.id}/anexos`, { form: formFicheiro(PNG, 'digitalização ção.png', { miniatura: JPEG, legenda: 'Frente' }) });
  assert.equal(criado.status, 201);
  assert.equal(criado.data.mime, 'image/png');
  assert.equal(criado.data.nome, 'digitalização ção.png');
  assert.equal(criado.data.temMiniatura, true);

  const lista = await h.api('GET', `/api/documentos/${doc.id}/anexos`, { token: leitor });
  assert.equal(lista.data.items.length, 1);

  const ficheiro = await h.api('GET', `/api/anexos/${criado.data.id}/ficheiro`, { token: leitor });
  assert.equal(ficheiro.status, 200);
  assert.equal(ficheiro.headers.get('content-type'), 'image/png');
  assert.equal(ficheiro.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(Buffer.compare(ficheiro.data, PNG) === 0);
  const mini = await h.api('GET', `/api/anexos/${criado.data.id}/ficheiro?miniatura=1`, { token: leitor });
  assert.equal(mini.headers.get('content-type'), 'image/jpeg');
  assert.equal((await h.api('GET', `/api/anexos/${criado.data.id}/ficheiro`)).status, 401);

  const hist = await api('GET', `/api/documentos/${doc.id}/historico`);
  assert.ok(hist.data.history.some((e) => e.action === 'anexo'));

  assert.equal((await h.api('DELETE', `/api/anexos/${criado.data.id}`, { token: leitor })).status, 403);
  assert.equal((await api('DELETE', `/api/anexos/${criado.data.id}`)).status, 200);
  assert.equal((await api('GET', `/api/anexos/${criado.data.id}/ficheiro`)).status, 404);
  assert.equal((await api('GET', `/api/documentos/${doc.id}/anexos`)).data.items.length, 0);
});

test('anexos: valida o conteúdo real do ficheiro e as permissões', async () => {
  const html = Buffer.from('<html><script>alert(1)</script></html>');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal((await api('POST', `/api/documentos/${doc.id}/anexos`, { form: formFicheiro(html, 'falso.png') })).status, 400);
  assert.equal((await api('POST', `/api/documentos/${doc.id}/anexos`, { form: formFicheiro(svg, 'x.svg') })).status, 400);
  assert.equal((await h.api('POST', `/api/documentos/${doc.id}/anexos`, { token: leitor, form: formFicheiro(PNG, 'a.png') })).status, 403);
  assert.equal((await api('POST', '/api/documentos/inexistente/anexos', { form: formFicheiro(PNG, 'a.png') })).status, 404);
  // miniatura tem de ser JPEG
  assert.equal((await api('POST', `/api/documentos/${doc.id}/anexos`, { form: formFicheiro(PNG, 'a.png', { miniatura: PNG }) })).status, 400);

  // PDF segue como descarga
  const pdf = await api('POST', `/api/documentos/${doc.id}/anexos`, { form: formFicheiro(Buffer.from('%PDF-1.4\n%%EOF'), 'ficha.pdf') });
  assert.equal(pdf.status, 201);
  const dl = await api('GET', `/api/anexos/${pdf.data.id}/ficheiro`);
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  assert.equal(dl.headers.get('content-type'), 'application/pdf');
  await api('DELETE', `/api/anexos/${pdf.data.id}`);
});

test('anexos: ligações só aceitam http(s)', async () => {
  const post = (body) => api('POST', `/api/documentos/${doc.id}/anexos`, { body });
  assert.equal((await post({ url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await post({ url: 'ftp://servidor/x' })).status, 400);
  assert.equal((await post({ url: 'nao é um url' })).status, 400);
  const ok = await post({ url: 'https://arquivo.exemplo.pt/scan/10.tif', nome: 'Scan 10', legenda: 'Alta resolução' });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.tipo, 'ligacao');
  assert.equal(ok.data.url, 'https://arquivo.exemplo.pt/scan/10.tif');
  assert.equal((await api('GET', `/api/anexos/${ok.data.id}/ficheiro`)).status, 404);
  await api('DELETE', `/api/anexos/${ok.data.id}`);
});

test('modelo de impressão: logótipo e cabeçalhos configuráveis e validados', async () => {
  const logo = `data:image/png;base64,${PNG.toString('base64')}`;
  const put = (body) => api('PUT', '/api/admin/configuracao', { body });
  assert.equal((await put({ pdf_logo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })).status, 400);
  assert.equal((await put({ pdf_logo: `data:image/jpeg;base64,${PNG.toString('base64')}` })).status, 400); // conteúdo não é JPEG
  assert.equal((await put({ imagens_url_modelo: 'javascript:alert({nrRegisto})' })).status, 400);

  const ok = await put({ pdf_logo: logo, pdf_cabecalho1: 'CML', pdf_cabecalho2: 'GEO', pdf_rodape: 'Uso interno', pdf_cor: '#005599', imagens_url_modelo: 'https://scans.exemplo.pt/{nrRegisto}.jpg' });
  assert.equal(ok.status, 200);

  const publica = await h.api('GET', '/api/configuracao/publica', { token: leitor });
  assert.equal(publica.data.pdf_logo, logo);
  assert.equal(publica.data.pdf_cabecalho1, 'CML');
  assert.equal(publica.data.imagens_url_modelo, 'https://scans.exemplo.pt/{nrRegisto}.jpg');
  assert.equal(publica.data.password_min, undefined); // só campos públicos
});
