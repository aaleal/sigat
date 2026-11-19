const express = require('express');
const multer = require('multer');
const { requireRole, comErros } = require('../auth');
const importacoes = require('../db/repos/importacoes');
const documentos = require('../db/repos/documentos');
const campos = require('../db/repos/campos');
const servico = require('../import/servico');
const { getDb } = require('../db');

const router = express.Router();
const admin = requireRole('admin');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(/\.xlsx$/i.test(file.originalname) ? null : new Error('Apenas ficheiros .xlsx são aceites.'), /\.xlsx$/i.test(file.originalname)),
});

const naoEncontrada = (res) => res.status(404).json({ message: 'Importação não encontrada.' });

router.post('/colecoes/:colecao/importacoes', admin, (req, res, next) => {
  upload.single('file')(req, res, (err) => (err ? res.status(400).json({ message: err.message }) : next()));
}, comErros(async (req, res) => {
  if (!getDb().prepare('SELECT 1 FROM colecoes WHERE id = ?').get(req.params.colecao)) return res.status(404).json({ message: 'Coleção não encontrada.' });
  if (!req.file) return res.status(400).json({ message: 'Ficheiro xlsx obrigatório.' });
  return res.status(201).json(servico.criarImportacao(req.params.colecao, req.file.buffer, req.file.originalname, req.user.username));
}));

router.get('/importacoes', admin, (req, res) => {
  res.json({ items: importacoes.listar((req.query.colecao || '').toString() || undefined) });
});

router.get('/importacoes/:id', admin, (req, res) => {
  const imp = importacoes.obter(req.params.id);
  return imp ? res.json({ importacao: imp, contagens: importacoes.contagens(req.params.id) }) : naoEncontrada(res);
});

router.put('/importacoes/:id/mapeamento', admin, comErros(async (req, res) => {
  const mapeamento = req.body?.mapeamento;
  if (!mapeamento || typeof mapeamento !== 'object') return res.status(400).json({ message: 'mapeamento é obrigatório.' });
  return res.json(servico.compararImportacao(req.params.id, mapeamento));
}));

router.get('/importacoes/:id/itens', admin, (req, res) => {
  const imp = importacoes.obter(req.params.id);
  if (!imp) return naoEncontrada(res);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
  const { total, items } = importacoes.listarItens(req.params.id, { acao: (req.query.acao || '').toString() || undefined, page, pageSize });
  const rotulos = Object.fromEntries(campos.listar(imp.colecao).map((c) => [c.chave, c.rotulo]));
  const enriquecidos = items.map((i) => {
    const doc = i.documentoId ? documentos.obter(i.documentoId) : null;
    const cand = i.candidatos.map((id) => documentos.obter(id)).filter(Boolean)
      .map((d) => ({ id: d.id, numero: d.numero, titulo: d.cabecalho || d.titulo, cota: d.cota || d.caixaNr || '' }));
    return {
      ...i,
      documento: doc ? { id: doc.id, numero: doc.numero, titulo: doc.cabecalho || doc.titulo, cota: doc.cota || doc.caixaNr || '' } : null,
      candidatosInfo: cand,
      titulo: i.dadosFicheiro.cabecalho || i.dadosFicheiro.titulo || i.dadosFicheiro.descricao || '',
    };
  });
  return res.json({ total, page, pageSize, rotulos, items: enriquecidos });
});

router.patch('/importacoes/:id/itens/:linha', admin, comErros(async (req, res) => {
  return res.json(servico.decidir(req.params.id, Number(req.params.linha), req.body || {}));
}));

router.post('/importacoes/:id/decisoes', admin, comErros(async (req, res) => {
  return res.json({ atualizados: servico.decidirEmMassa(req.params.id, req.body || {}) });
}));

router.post('/importacoes/:id/aplicar', admin, comErros(async (req, res) => {
  return res.json({ message: 'Importação aplicada.', importacao: servico.aplicarImportacao(req.params.id, req.user.username) });
}));

router.delete('/importacoes/:id', admin, comErros(async (req, res) => {
  servico.cancelarImportacao(req.params.id);
  return res.json({ message: 'Importação cancelada.' });
}));

module.exports = router;
