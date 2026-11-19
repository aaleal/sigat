const express = require('express');
const { comErros } = require('../auth');
const carrinho = require('../db/repos/carrinho');
const documentos = require('../db/repos/documentos');

const router = express.Router();

// O carrinho de impressão é pessoal e persiste entre sessões e dispositivos.
router.get('/carrinho', (req, res) => res.json({ items: carrinho.listar(req.user.sub) }));

router.put('/carrinho/:documentoId', comErros(async (req, res) => {
  if (!documentos.obter(req.params.documentoId, { incluirEliminados: false })) return res.status(404).json({ message: 'Documento não encontrado.' });
  if (!carrinho.adicionar(req.user.sub, req.params.documentoId)) return res.status(400).json({ message: `O carrinho está cheio (máximo ${carrinho.LIMITE}).` });
  return res.json({ message: 'Adicionado.' });
}));

router.delete('/carrinho/:documentoId', (req, res) => {
  carrinho.remover(req.user.sub, req.params.documentoId);
  res.json({ message: 'Removido.' });
});

router.delete('/carrinho', (req, res) => {
  carrinho.limpar(req.user.sub);
  res.json({ message: 'Carrinho limpo.' });
});

module.exports = router;
