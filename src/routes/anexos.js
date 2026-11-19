const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { requireRole, comErros } = require('../auth');
const anexos = require('../db/repos/anexos');
const documentos = require('../db/repos/documentos');
const historico = require('../db/repos/historico');

const router = express.Router();
const escrita = requireRole('admin', 'write');

const LIMITE_FICHEIRO = 25 * 1024 * 1024;
const LIMITE_MINIATURA = 300 * 1024;
const MAX_POR_DOCUMENTO = 50;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_FICHEIRO, files: 2, fields: 5 },
}).fields([{ name: 'file', maxCount: 1 }, { name: 'miniatura', maxCount: 1 }]);

const comecaCom = (b, ...bytes) => b.length >= bytes.length && bytes.every((v, i) => b[i] === v);

// Tipo real pelo conteúdo (não confia no mime/extensão enviados). SVG/HTML não são aceites.
function detetarTipo(b) {
  if (comecaCom(b, 0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', ext: '.jpg', imagem: true };
  if (comecaCom(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: 'image/png', ext: '.png', imagem: true };
  if (comecaCom(b, 0x47, 0x49, 0x46, 0x38)) return { mime: 'image/gif', ext: '.gif', imagem: true };
  if (comecaCom(b, 0x52, 0x49, 0x46, 0x46) && b.length > 12 && b.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: '.webp', imagem: true };
  if (comecaCom(b, 0x25, 0x50, 0x44, 0x46, 0x2d)) return { mime: 'application/pdf', ext: '.pdf', imagem: false };
  if (comecaCom(b, 0x49, 0x49, 0x2a, 0x00) || comecaCom(b, 0x4d, 0x4d, 0x00, 0x2a)) return { mime: 'image/tiff', ext: '.tif', imagem: false };
  return null;
}

function limparNome(nome) {
  // O multer entrega o nome em latin1: reconverte para UTF-8.
  const utf8 = Buffer.from(String(nome || ''), 'latin1').toString('utf8');
  return utf8.replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 150) || 'ficheiro';
}

const limparTexto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function documentoOu404(req, res) {
  const doc = documentos.obter(req.params.id, { incluirEliminados: false });
  if (!doc) res.status(404).json({ message: 'Documento não encontrado.' });
  return doc;
}

function registarHistorico(doc, utilizador, operacao, nome) {
  historico.registar({ colecao: doc.colecao, documentoId: doc.id, acao: 'anexo', utilizador, detalhes: { operacao, nome } });
}

router.get('/documentos/:id/anexos', comErros(async (req, res) => {
  const doc = documentoOu404(req, res);
  if (doc) res.json({ items: anexos.listar(doc.id) });
}));

router.post('/documentos/:id/anexos', escrita, (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  return upload(req, res, (err) => {
    if (!err) return next();
    const grande = err.code === 'LIMIT_FILE_SIZE';
    return res.status(grande ? 413 : 400).json({ message: grande ? 'Ficheiro demasiado grande (máximo 25 MB).' : 'Pedido inválido.' });
  });
}, comErros(async (req, res) => {
  const doc = documentoOu404(req, res);
  if (!doc) return undefined;
  if (anexos.contar(doc.id) >= MAX_POR_DOCUMENTO) return res.status(400).json({ message: `Limite de ${MAX_POR_DOCUMENTO} anexos por documento.` });

  // Ligação externa (JSON)
  if (!req.is('multipart/form-data')) {
    let url;
    try { url = new URL(String(req.body?.url || '').trim()); } catch { url = null; }
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.href.length > 1000) {
      return res.status(400).json({ message: 'Indique um URL http(s) válido.' });
    }
    const nome = limparTexto(req.body?.nome, 150) || url.hostname;
    const criado = anexos.criarLigacao({ documentoId: doc.id, nome, legenda: limparTexto(req.body?.legenda, 300), url: url.href, utilizador: req.user.username });
    registarHistorico(doc, req.user.username, 'ligação adicionada', nome);
    return res.status(201).json(criado);
  }

  // Ficheiro digitalizado (multipart)
  const ficheiro = req.files?.file?.[0];
  if (!ficheiro) return res.status(400).json({ message: 'Ficheiro obrigatório.' });
  const tipo = detetarTipo(ficheiro.buffer);
  if (!tipo) return res.status(400).json({ message: 'Formato não suportado. Use JPEG, PNG, GIF, WebP, TIFF ou PDF.' });

  let miniatura = null;
  const m = req.files?.miniatura?.[0];
  if (m && tipo.imagem) {
    if (m.size > LIMITE_MINIATURA || detetarTipo(m.buffer)?.mime !== 'image/jpeg') {
      return res.status(400).json({ message: 'Miniatura inválida (JPEG até 300 KB).' });
    }
    miniatura = m.buffer;
  }
  const nome = limparNome(ficheiro.originalname);
  const criado = anexos.criarFicheiro({
    documentoId: doc.id, nome, legenda: limparTexto(req.body?.legenda, 300), mime: tipo.mime, extensao: tipo.ext,
    buffer: ficheiro.buffer, miniatura, utilizador: req.user.username,
  });
  registarHistorico(doc, req.user.username, 'ficheiro adicionado', nome);
  return res.status(201).json(criado);
}));

router.get('/anexos/:id/ficheiro', comErros(async (req, res) => {
  const a = anexos.obterBruto(req.params.id);
  if (!a || a.tipo !== 'ficheiro') return res.status(404).json({ message: 'Anexo não encontrado.' });
  const miniatura = req.query.miniatura === '1';
  const nomeFicheiro = miniatura ? a.miniatura : a.ficheiro;
  if (!nomeFicheiro) return res.status(404).json({ message: 'Miniatura não disponível.' });
  const caminho = anexos.caminho(nomeFicheiro);
  if (!fs.existsSync(caminho)) return res.status(404).json({ message: 'Ficheiro não encontrado.' });

  const mime = miniatura ? 'image/jpeg' : a.mime;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=300');
  // Só imagens que o browser mostra são servidas inline; PDF/TIFF seguem como descarga.
  if (!miniatura && !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime)) res.attachment(a.nome);
  return res.sendFile(caminho, { headers: { 'Content-Type': mime } });
}));

router.patch('/anexos/:id', escrita, comErros(async (req, res) => {
  const a = anexos.obterBruto(req.params.id);
  if (!a) return res.status(404).json({ message: 'Anexo não encontrado.' });
  anexos.definirLegenda(a.id, limparTexto(req.body?.legenda, 300));
  return res.json(anexos.paraApi(anexos.obterBruto(a.id)));
}));

router.delete('/anexos/:id', escrita, comErros(async (req, res) => {
  const a = anexos.obterBruto(req.params.id);
  if (!a) return res.status(404).json({ message: 'Anexo não encontrado.' });
  const doc = documentos.obter(a.documento_id);
  anexos.remover(a.id);
  if (doc) registarHistorico(doc, req.user.username, 'anexo removido', a.nome);
  return res.json({ message: 'Anexo removido.' });
}));

module.exports = router;
