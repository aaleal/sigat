const express = require('express');
const documentos = require('../db/repos/documentos');
const emprestimos = require('../db/repos/emprestimos');
const { requireRole, comErros } = require('../auth');
const { gerarExportacao, LIMITE_LINHAS } = require('../export');

const router = express.Router();
const escrita = requireRole('admin', 'write');

const ESTADOS_LISTA = ['ativo', 'atraso', 'sem_prazo', 'devolvido', 'todos'];

function filtrosDe(query) {
  const estado = ESTADOS_LISTA.includes(query.estado) ? query.estado : 'ativo';
  return {
    estado,
    colecao: (query.colecao || '').toString() || undefined,
    requisitante: (query.requisitante || '').toString().trim() || undefined,
    de: (query.de || '').toString() || undefined,
    ate: (query.ate || '').toString() || undefined,
  };
}

router.get('/emprestimos/resumo', (req, res) => {
  res.json(emprestimos.resumo({ colecao: (req.query.colecao || '').toString() || undefined }));
});

router.get('/emprestimos/requisitantes', (_req, res) => res.json({ suggestions: emprestimos.requisitantes() }));

router.get('/emprestimos/exportar', (req, res) => {
  const filtros = filtrosDe(req.query);
  const itens = emprestimos.listar(filtros);
  if (itens.length > LIMITE_LINHAS) return res.status(413).json({ message: 'Demasiados resultados para exportar.' });
  const formato = req.query.formato === 'csv' ? 'csv' : 'xlsx';
  const colunas = [
    { rotulo: 'Coleção', valor: (i) => i.documento.colecao },
    { rotulo: 'ID SIGAT', valor: (i) => i.documento.numero },
    { rotulo: 'Documento', valor: (i) => i.documento.titulo },
    { rotulo: 'Cota / Caixa', valor: (i) => i.documento.cota || i.documento.caixaNr },
    { rotulo: 'Requisitante', valor: (i) => i.requisitante },
    { rotulo: 'Entidade', valor: (i) => i.entidade },
    { rotulo: 'Contacto', valor: (i) => i.contacto },
    { rotulo: 'Data de saída', valor: (i) => i.dataSaida },
    { rotulo: 'Data prevista', valor: (i) => i.dataPrevista },
    { rotulo: 'Data de devolução', valor: (i) => i.dataDevolucao },
    { rotulo: 'Situação', valor: (i) => i.situacao },
    { rotulo: 'Dias de atraso', valor: (i) => i.diasAtraso || '' },
    { rotulo: 'Registado por', valor: (i) => i.registadoPor },
  ];
  const criterios = [
    ['Exportado em', new Date().toISOString()], ['Exportado por', req.user.username],
    ...Object.entries(filtros).filter(([, v]) => v).map(([k, v]) => [`Filtro ${k}`, v]), ['Total de linhas', itens.length],
  ];
  const { buffer, contentType, extensao } = gerarExportacao({ formato, colunas, linhas: itens, criterios, nomeFolha: 'Empréstimos' });
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="sigat-emprestimos-${emprestimos.hoje().replace(/-/g, '')}.${extensao}"`);
  return res.send(buffer);
});

router.get('/emprestimos', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
  const itens = emprestimos.listar(filtrosDe(req.query));
  const start = (page - 1) * pageSize;
  res.json({ total: itens.length, page, pageSize, items: itens.slice(start, start + pageSize) });
});

router.get('/documentos/:id/emprestimos', comErros(async (req, res) => {
  if (!documentos.obter(req.params.id)) return res.status(404).json({ message: 'Documento não encontrado.' });
  return res.json({ items: emprestimos.listarDoDocumento(req.params.id) });
}));

router.post('/documentos/:id/emprestimos', escrita, comErros(async (req, res) => {
  const corpo = { ...(req.body || {}) };
  if (!corpo.dataSaida) corpo.dataSaida = emprestimos.hoje();
  if (corpo.dataPrevista === undefined) corpo.dataPrevista = emprestimos.somarDias(corpo.dataSaida, emprestimos.prazoPadraoDias());
  const emp = emprestimos.criar(req.params.id, corpo, req.user.username);
  return res.status(201).json({ message: 'Empréstimo registado.', emprestimo: emp, entry: documentos.obter(req.params.id) });
}));

router.post('/emprestimos/:id/devolver', escrita, comErros(async (req, res) => {
  const { dataDevolucao, observacoes } = req.body || {};
  const emp = emprestimos.devolver(req.params.id, { dataDevolucao, observacoes }, req.user.username);
  return res.json({ message: 'Devolução registada.', emprestimo: emp, entry: documentos.obter(emp.documentoId) });
}));

router.patch('/emprestimos/:id', escrita, comErros(async (req, res) => {
  const emp = emprestimos.atualizar(req.params.id, req.body || {}, req.user.username);
  return res.json({ message: 'Empréstimo atualizado.', emprestimo: emp, entry: documentos.obter(emp.documentoId) });
}));

module.exports = router;
