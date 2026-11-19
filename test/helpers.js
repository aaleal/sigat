const os = require('os');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

// Cada ficheiro de teste corre num processo próprio: um diretório temporário por processo.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigat-test-'));
process.env.SIGAT_DATA_DIR = dataDir;
process.env.JWT_SECRET = 'segredo-de-teste';

const { app, ensureStorage } = require('../server');

const CABECALHOS_CARTOGRAFIA = [
  'Autor / Entidade Responsável', 'Título e Descrição do Documento', 'Local', 'Data',
  'Outras Informações Físicas', 'Outras Descrições', 'Palavras-chave / Assuntos', 'TB', 'TB 2',
  'Cota', 'MP', 'CDR', 'CDR 2', 'Empréstimo', 'Data de Saída', 'Data de Entrada', 'Requisitante', 'Restauro',
];

// linhas: arrays de células pela ordem de CABECALHOS_CARTOGRAFIA (ou objetos {cabecalho: valor}).
function xlsxCartografia(linhas, cabecalhos = CABECALHOS_CARTOGRAFIA) {
  const rows = [cabecalhos, ...linhas.map((l) => (Array.isArray(l) ? l : cabecalhos.map((c) => l[c] ?? '')))];
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), 'BD');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function linhaCartografia(o = {}) {
  return {
    'Autor / Entidade Responsável': o.autor ?? 'Autor Teste',
    'Título e Descrição do Documento': o.descricao ?? 'Planta de Lisboa',
    Local: o.local ?? 'DMPGU',
    Data: o.ano ?? '1950',
    'Palavras-chave / Assuntos': o.assuntos ?? 'Lisboa',
    Cota: o.cota ?? '',
    'Empréstimo': o.emprestimo ?? '',
    ...(o.extra || {}),
  };
}

let server;
let baseUrl;

async function iniciar() {
  await ensureStorage();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  return baseUrl;
}

async function parar() {
  if (server) await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
}

async function api(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(baseUrl + url, { method, headers, body: payload });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, headers: res.headers };
}

async function login(username = 'admin', password = 'admin123') {
  const { data } = await api('POST', '/api/auth/login', { body: { username, password } });
  return data.token;
}

function formComFicheiro(buffer, nome, extra = {}) {
  const form = new FormData();
  form.append('file', new Blob([buffer]), nome);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}

module.exports = {
  iniciar, parar, api, login, formComFicheiro, xlsxCartografia, linhaCartografia, CABECALHOS_CARTOGRAFIA,
};
