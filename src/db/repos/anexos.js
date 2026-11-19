const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb, getDir } = require('../index');

const pasta = () => path.join(getDir(), 'anexos');

const paraApi = (r) => ({
  id: r.id,
  documentoId: r.documento_id,
  tipo: r.tipo,
  nome: r.nome,
  legenda: r.legenda || '',
  url: r.url || '',
  mime: r.mime || '',
  tamanho: r.tamanho || 0,
  temMiniatura: !!r.miniatura,
  criadoEm: r.criado_em,
  criadoPor: r.criado_por,
});

const listar = (documentoId) => getDb().prepare('SELECT * FROM anexos WHERE documento_id = ? ORDER BY criado_em, rowid').all(documentoId).map(paraApi);
const obterBruto = (id) => getDb().prepare('SELECT * FROM anexos WHERE id = ?').get(id) || null;
const contar = (documentoId) => getDb().prepare('SELECT COUNT(*) AS n FROM anexos WHERE documento_id = ?').get(documentoId).n;

// Guarda o ficheiro (e miniatura opcional) em data/anexos e regista-o na BD.
function criarFicheiro({ documentoId, nome, legenda, mime, extensao, buffer, miniatura, utilizador }) {
  const id = randomUUID();
  fs.mkdirSync(pasta(), { recursive: true });
  const ficheiro = `${id}${extensao}`;
  fs.writeFileSync(path.join(pasta(), ficheiro), buffer, { flag: 'wx' });
  let nomeMiniatura = null;
  if (miniatura) {
    nomeMiniatura = `${id}.thumb.jpg`;
    fs.writeFileSync(path.join(pasta(), nomeMiniatura), miniatura, { flag: 'wx' });
  }
  getDb().prepare(`INSERT INTO anexos (id, documento_id, tipo, nome, legenda, ficheiro, miniatura, mime, tamanho, criado_em, criado_por)
                   VALUES (?, ?, 'ficheiro', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, documentoId, nome, legenda || null, ficheiro, nomeMiniatura, mime, buffer.length, new Date().toISOString(), utilizador);
  return paraApi(obterBruto(id));
}

function criarLigacao({ documentoId, nome, legenda, url, utilizador }) {
  const id = randomUUID();
  getDb().prepare(`INSERT INTO anexos (id, documento_id, tipo, nome, legenda, url, criado_em, criado_por)
                   VALUES (?, ?, 'ligacao', ?, ?, ?, ?, ?)`)
    .run(id, documentoId, nome, legenda || null, url, new Date().toISOString(), utilizador);
  return paraApi(obterBruto(id));
}

const definirLegenda = (id, legenda) => getDb().prepare('UPDATE anexos SET legenda = ? WHERE id = ?').run(legenda || null, id).changes > 0;

function remover(id) {
  const a = obterBruto(id);
  if (!a) return null;
  getDb().prepare('DELETE FROM anexos WHERE id = ?').run(id);
  for (const f of [a.ficheiro, a.miniatura]) {
    if (f) fs.rmSync(path.join(pasta(), f), { force: true });
  }
  return paraApi(a);
}

const caminho = (nomeFicheiro) => path.join(pasta(), path.basename(nomeFicheiro));

module.exports = { listar, obterBruto, contar, criarFicheiro, criarLigacao, definirLegenda, remover, caminho, paraApi };
