const express = require('express');
const indicadores = require('../db/repos/indicadores');
const { getDb } = require('../db');

const router = express.Router();

router.get('/indicadores', (req, res) => {
  const colecao = (req.query.colecao || 'todas').toString();
  const periodo = ['30', '90', '365', 'tudo'].includes(req.query.periodo) ? req.query.periodo : '90';
  res.json(indicadores.indicadores({ colecao, periodo, incluirVisualizacoes: req.query.incluir === 'visualizacoes' }));
});

router.get('/colecoes/:colecao/duplicados', (req, res) => {
  if (!getDb().prepare('SELECT 1 FROM colecoes WHERE id = ?').get(req.params.colecao)) return res.status(404).json({ message: 'Coleção não encontrada.' });
  return res.json(indicadores.duplicados(req.params.colecao));
});

module.exports = router;
