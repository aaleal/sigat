const express = require('express');
const fs = require('fs');
const config = require('../config');
const backup = require('../backup');
const manutencao = require('../manutencao');
const auditoria = require('../db/repos/auditoria');
const { getDb, getDir } = require('../db');
const { requireRole, comErros } = require('../auth');
const path = require('path');

const router = express.Router();
const admin = requireRole('admin');

// Modelo de impressão e ligações a imagens: legível por qualquer utilizador autenticado.
router.get('/configuracao/publica', (_req, res) => res.json(config.publicas()));

router.get('/admin/configuracao', admin, (_req, res) => res.json({ valores: config.todas(), limites: config.limites() }));

router.put('/admin/configuracao', admin, comErros(async (req, res) => {
  const { configuracao, alteradas } = config.atualizar(req.body);
  if (alteradas.length) {
    // O logótipo não vai para a auditoria (é grande); regista-se apenas que foi alterado.
    auditoria.registar({ utilizador: req.user.username, acao: 'configuracao_alterada', ip: req.ip, detalhes: { chaves: alteradas } });
  }
  return res.json({ valores: configuracao, limites: config.limites() });
}));

router.get('/admin/estado', admin, (req, res) => {
  const db = getDb();
  const contar = (sql) => db.prepare(sql).get().n;
  const ficheiroBd = path.join(getDir(), 'sigat.db');
  const backups = backup.listar();
  const anexosDir = path.join(getDir(), 'anexos');
  res.json({
    baseDados: { motor: 'SQLite (WAL)', bytes: fs.existsSync(ficheiroBd) ? fs.statSync(ficheiroBd).size : 0 },
    documentos: contar('SELECT COUNT(*) AS n FROM documentos WHERE eliminado_em IS NULL'),
    utilizadores: contar('SELECT COUNT(*) AS n FROM utilizadores'),
    historico: contar('SELECT COUNT(*) AS n FROM historico'),
    anexos: contar('SELECT COUNT(*) AS n FROM anexos'),
    ficheirosAnexos: fs.existsSync(anexosDir) ? fs.readdirSync(anexosDir).length : 0,
    backups: { total: backups.length, ultimo: backups[0] || null, pasta: backup.pasta() },
    ligacaoSegura: req.secure,
    sso: process.env.SSO_HEADER && String(process.env.SSO_SEGREDO || '').length >= 16 ? 'ativo' : 'inativo',
  });
});

router.get('/admin/backups', admin, (_req, res) => res.json({ items: backup.listar(), pasta: backup.pasta() }));

router.post('/admin/backups', admin, comErros(async (req, res) => {
  const criado = await backup.criarBackup({ utilizador: req.user.username, motivo: 'manual' });
  return res.status(201).json(criado);
}));

router.get('/admin/backups/:nome', admin, (req, res) => {
  const ficheiro = backup.caminho(req.params.nome);
  if (!ficheiro) return res.status(404).json({ message: 'Cópia não encontrada.' });
  auditoria.registar({ utilizador: req.user.username, acao: 'backup_descarregado', ip: req.ip, detalhes: { nome: req.params.nome } });
  return res.download(ficheiro, req.params.nome);
});

router.post('/admin/manutencao/purgar', admin, comErros(async (req, res) => {
  return res.json(manutencao.purgarHistorico({ utilizador: req.user.username }));
}));

router.get('/admin/auditoria', admin, (req, res) => {
  const limite = Math.min(1000, Math.max(1, Number.parseInt(req.query.limite, 10) || 200));
  res.json({ items: auditoria.listar({ limite, acao: String(req.query.acao || '') || undefined }) });
});

module.exports = router;
