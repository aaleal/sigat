const express = require('express');
const { getDb } = require('../db');
const campos = require('../db/repos/campos');
const documentos = require('../db/repos/documentos');
const historico = require('../db/repos/historico');
const { requireRole, comErros } = require('../auth');
const { queryEntries, paramsDePesquisa } = require('../query');
const { normalizar } = require('../search');
const { gerarExportacao, LIMITE_LINHAS } = require('../export');

const router = express.Router();

const escrita = requireRole('admin', 'write');
const gestao = requireRole('admin', 'write');

function colecaoValida(req, res, next) {
  const c = getDb().prepare('SELECT id, nome FROM colecoes WHERE id = ?').get(req.params.colecao);
  if (!c) return res.status(404).json({ message: 'Coleção não encontrada.' });
  req.colecao = c;
  return next();
}

function documentoOu404(req, res) {
  const doc = documentos.obter(req.params.id);
  if (!doc) res.status(404).json({ message: 'Documento não encontrado.' });
  return doc;
}

router.get('/colecoes', (_req, res) => {
  const lista = getDb().prepare('SELECT id, nome FROM colecoes ORDER BY rowid').all();
  res.json(lista.map((c) => ({ ...c, total: documentos.contar(c.id) })));
});

router.get('/colecoes/:colecao/campos', colecaoValida, (req, res) => res.json(campos.listar(req.colecao.id)));

router.post('/colecoes/:colecao/campos', colecaoValida, requireRole('admin'), comErros(async (req, res) => {
  const { rotulo } = req.body || {};
  if (!String(rotulo || '').trim()) return res.status(400).json({ message: 'Rótulo é obrigatório.' });
  const chave = campos.chaveDeRotulo(rotulo);
  if (campos.listar(req.colecao.id).some((c) => c.chave === chave)) return res.status(409).json({ message: 'Já existe um campo com essa chave.' });
  return res.status(201).json(campos.criar(req.colecao.id, { ...req.body, chave, rotulo: String(rotulo).trim() }));
}));

router.patch('/colecoes/:colecao/campos/:chave', colecaoValida, requireRole('admin'), (req, res) => {
  const patch = {};
  for (const k of ['rotulo', 'visivelTabela', 'pesquisavel', 'numerico', 'peso', 'aliases']) {
    if (req.body && req.body[k] !== undefined) patch[k] = req.body[k];
  }
  const campo = campos.atualizar(req.colecao.id, req.params.chave, patch);
  return campo ? res.json(campo) : res.status(404).json({ message: 'Campo não encontrado.' });
});

router.get('/colecoes/:colecao/documentos', colecaoValida, (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
  const def = campos.listar(req.colecao.id);
  const { items, ordenacao } = queryEntries(documentos.listar(req.colecao.id), def, paramsDePesquisa(req.query, def));
  const start = (page - 1) * pageSize;
  res.json({ colecao: req.colecao.id, total: items.length, page, pageSize, ordenacao, items: items.slice(start, start + pageSize) });
});

router.get('/colecoes/:colecao/documentos/distinct', colecaoValida, (req, res) => {
  const field = (req.query.field || '').toString();
  const def = campos.listar(req.colecao.id);
  if (!def.some((c) => c.chave === field)) return res.status(400).json({ message: 'field válido é obrigatório.' });
  const q = normalizar(req.query.q || '');

  const vistos = new Set();
  const suggestions = [];
  for (const e of documentos.listar(req.colecao.id)) {
    const val = String(e[field] ?? '').trim();
    if (!val || vistos.has(val)) continue;
    if (q && !normalizar(val).includes(q)) continue;
    vistos.add(val);
    suggestions.push(val);
  }
  suggestions.sort((a, b) => {
    const na = parseInt(String(a).match(/\d+/)?.[0], 10);
    const nb = parseInt(String(b).match(/\d+/)?.[0], 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b), 'pt-PT', { numeric: true });
  });
  res.json({ suggestions });
});

router.get('/colecoes/:colecao/exportar', colecaoValida, (req, res) => {
  const formato = req.query.formato === 'csv' ? 'csv' : 'xlsx';
  const def = campos.listar(req.colecao.id);
  const params = paramsDePesquisa(req.query, def);
  const { items } = queryEntries(documentos.listar(req.colecao.id), def, params);
  if (items.length > LIMITE_LINHAS) {
    return res.status(413).json({ message: `Demasiados resultados para exportar (máximo ${LIMITE_LINHAS}). Refine a pesquisa.` });
  }

  const pedidas = String(req.query.colunas || '').split(',').map((s) => s.trim()).filter(Boolean);
  const escolhidos = pedidas.length ? def.filter((c) => pedidas.includes(c.chave)) : def;
  const colunas = [
    { rotulo: 'ID SIGAT', valor: (e) => e.numero },
    ...escolhidos.map((c) => ({ rotulo: c.rotulo, valor: (e) => (c.chave === 'estado' && e.estado === '-' ? '' : e[c.chave]) })),
    { rotulo: 'Requisitante', valor: (e) => e.estadoMeta?.requisitante || '' },
    { rotulo: 'Data de saída', valor: (e) => e.estadoMeta?.dataSaida || '' },
  ];
  const criterios = [
    ['Coleção', req.colecao.nome],
    ['Exportado em', new Date().toISOString()],
    ['Exportado por', req.user.username],
    ['Pesquisa', params.q || ''],
    ...Object.entries(params.filtros).map(([k, v]) => [`Filtro ${k}`, v]),
    ['Campos vazios', params.vazios.join(', ')],
    ['Ordenação', params.sortKeys || '(relevância ou ordem original)'],
    ['Total de linhas', items.length],
  ];
  const { buffer, contentType, extensao } = gerarExportacao({ formato, colunas, linhas: items, criterios });

  const agora = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const carimbo = `${agora.getFullYear()}${p2(agora.getMonth() + 1)}${p2(agora.getDate())}-${p2(agora.getHours())}${p2(agora.getMinutes())}`;
  historico.registar({
    colecao: req.colecao.id, acao: 'exportar', utilizador: req.user.username,
    detalhes: { rotulo: `Exportação ${extensao.toUpperCase()}`, total: items.length, q: params.q, filtros: params.filtros, vazios: params.vazios },
  });

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="sigat-${req.colecao.id}-${carimbo}.${extensao}"`);
  return res.send(buffer);
});

router.post('/colecoes/:colecao/documentos', colecaoValida, escrita, comErros(async (req, res) => {
  const doc = documentos.criar(req.colecao.id, req.body, req.user.username);
  return res.status(201).json({ message: 'Entrada criada com sucesso.', entry: doc });
}));

router.get('/colecoes/:colecao/eliminados', colecaoValida, gestao, (req, res) => {
  res.json({ deletedEntries: documentos.listarEliminados(req.colecao.id) });
});

router.get('/colecoes/:colecao/historico', colecaoValida, gestao, (req, res) => {
  res.json({ history: historico.listarColecao(req.colecao.id) });
});

router.get('/documentos/:id', comErros(async (req, res) => {
  const doc = documentoOu404(req, res);
  if (doc) res.json(doc);
}));

router.get('/documentos/:id/historico', gestao, comErros(async (req, res) => {
  const doc = documentoOu404(req, res);
  if (doc) res.json({ history: historico.listarDocumento(doc.id) });
}));

router.put('/documentos/:id', escrita, comErros(async (req, res) => {
  const doc = documentos.atualizar(req.params.id, req.body, req.user.username);
  if (!doc) return res.status(404).json({ message: 'Documento não encontrado.' });
  return res.json({ message: 'Entrada atualizada com sucesso.', entry: doc });
}));

router.patch('/documentos/:id/estado', escrita, comErros(async (req, res) => {
  const { estado, estadoMeta } = req.body || {};
  if (estado === undefined) return res.status(400).json({ message: 'estado é obrigatório.' });
  const doc = documentos.definirEstado(req.params.id, String(estado), req.user.username, estadoMeta || {});
  if (!doc) return res.status(404).json({ message: 'Documento não encontrado.' });
  return res.json({
    message: 'Estado atualizado com sucesso.',
    estado: doc.estado,
    estadoMeta: doc.estadoMeta,
    estadoChangedAt: doc.estadoChangedAt,
    estadoChangedBy: doc.estadoChangedBy,
  });
}));

router.delete('/documentos/:id', escrita, comErros(async (req, res) => {
  if (!documentos.eliminar(req.params.id, req.user.username)) return res.status(404).json({ message: 'Documento não encontrado.' });
  return res.json({ message: 'Entrada movida para o lixo.' });
}));

router.post('/documentos/:id/restaurar', escrita, comErros(async (req, res) => {
  const doc = documentos.restaurar(req.params.id, req.user.username);
  if (!doc) return res.status(404).json({ message: 'Documento não encontrado no lixo.' });
  return res.json({ message: 'Entrada restaurada com sucesso.', entry: doc });
}));

module.exports = router;
