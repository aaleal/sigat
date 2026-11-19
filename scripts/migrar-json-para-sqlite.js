#!/usr/bin/env node
/**
 * Migra os dados JSON antigos (datasets) para SQLite (coleção única por tipo).
 *   node scripts/migrar-json-para-sqlite.js                (simulação, não grava na BD real)
 *   node scripts/migrar-json-para-sqlite.js --aplicar      (grava e move os JSON para data/legacy/)
 * Opções: --dir <pasta> --carto <nome|id> --aturb <nome|id>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');

const db = require('../src/db');
const campos = require('../src/db/repos/campos');
const documentosRepo = require('../src/db/repos/documentos');
const utilizadores = require('../src/db/repos/utilizadores');
const { corresponder } = require('../src/import/corresponder');
const { paraIso } = require('../src/import/transformar');

const CANONICO_PADRAO = { cartografia: 'Cartografia GEO - BD', aturb: 'arquivo2026' };
const IGNORAR_EDICAO = new Set(['sourceEntryNumber', 'updatedAt', 'updatedBy', 'createdAt', 'createdBy', 'estado', 'estadoMeta',
  'estadoChangedAt', 'estadoChangedBy', 'deletedAt', 'deletedBy', 'restoredAt', 'restoredBy']);

const lerJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return fallback; } };

const temTrabalho = (p) => (p.history || []).length > 0
  || (p.entries || []).some((e) => e.updatedAt || e.createdAt || e.estadoChangedAt);

function escolherCanonico(registo, colecao, preferido, ficheiros) {
  const candidatos = registo.datasets
    .filter((d) => (d.type || 'cartografia') === colecao && ficheiros.has(d.id) && (ficheiros.get(d.id).entries || []).length > 0);
  const alvo = preferido || CANONICO_PADRAO[colecao];
  const porNome = candidatos.find((d) => d.id === alvo || d.name === alvo);
  if (porNome) return porNome;
  return candidatos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0] || null;
}

function dadosDe(colecao, entry) {
  const dados = {};
  for (const c of campos.listar(colecao)) {
    if (c.sistema) continue;
    const v = entry[c.chave];
    if (v !== undefined && v !== null && String(v).trim() !== '') dados[c.chave] = String(v).trim();
  }
  return dados;
}

function diffEdicao(prev = {}, next = {}) {
  const alteracoes = {};
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (IGNORAR_EDICAO.has(k)) continue;
    if (String(prev[k] ?? '') !== String(next[k] ?? '')) alteracoes[k] = { de: prev[k] ?? '', para: next[k] ?? '' };
  }
  return alteracoes;
}

function inserirDocumento(colecao, entry, dataset, { eliminado = null } = {}) {
  const d = db.getDb();
  const dados = dadosDe(colecao, entry);
  const id = randomUUID();
  let numero = Number(entry.sourceEntryNumber);
  if (!Number.isInteger(numero) || numero < 1
    || d.prepare('SELECT 1 FROM documentos WHERE colecao = ? AND numero = ?').get(colecao, numero)) {
    numero = documentosRepo.proximoNumero(colecao);
  }
  const editado = !!(entry.updatedAt || entry.createdBy);
  const estado = String(entry.estado ?? '').trim() || '-';
  d.prepare(`INSERT INTO documentos (id, colecao, numero, dados, dados_importados, estado, estado_alterado_em, estado_alterado_por,
                                     criado_em, criado_por, atualizado_em, atualizado_por, eliminado_em, eliminado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, colecao, numero, JSON.stringify(dados), editado ? null : JSON.stringify(dados), estado,
      entry.estadoChangedAt || null, entry.estadoChangedBy || null,
      entry.createdAt || dataset.uploadedAt || new Date().toISOString(), entry.createdBy || dataset.uploadedBy || 'migracao',
      entry.updatedAt || null, entry.updatedBy || null,
      eliminado ? (entry.deletedAt || new Date().toISOString()) : null, eliminado ? (entry.deletedBy || 'migracao') : null);
  return { id, numero, estado };
}

function inserirEmprestimo(documentoId, entry, criadoEm) {
  const meta = entry.estadoMeta || {};
  const saida = paraIso(meta.dataSaida) || paraIso(criadoEm) || new Date().toISOString().slice(0, 10);
  const nota = meta.dataSaida && !paraIso(meta.dataSaida) ? `Data de saída original: ${meta.dataSaida}` : null;
  db.getDb().prepare(`INSERT INTO emprestimos (id, documento_id, requisitante, data_saida, observacoes, origem, registado_por, registado_em)
                      VALUES (?, ?, ?, ?, ?, 'migracao', ?, ?)`)
    .run(randomUUID(), documentoId, String(meta.requisitante || '').trim() || '(não indicado)', saida, nota,
      meta.registadoPor || 'migracao', criadoEm || new Date().toISOString());
}

function converterHistorico(item, colecao, documentoId, nomeDataset) {
  const d = item.details || {};
  const base = { origem: 'migracao', fonte: nomeDataset };
  const acoes = { create: 'criar', edit: 'editar', delete: 'eliminar', restore: 'restaurar', estado: 'estado' };
  const acao = acoes[item.action];
  if (!acao) return null;
  let detalhes = { ...base };
  if (item.action === 'edit') detalhes = { ...base, alteracoes: diffEdicao(d.prev, d.next) };
  else if (item.action === 'estado') detalhes = { ...base, prevEstado: d.prevEstado, newEstado: d.newEstado, estadoMeta: d.estadoMeta || null };
  else detalhes = { ...base, entrada: d.entry?.cabecalho || d.entry?.titulo || item.entryRef?.cabecalho || item.entryRef?.titulo || '' };
  if (!documentoId) detalhes.rotulo = item.entryRef?.cabecalho || item.entryRef?.titulo || '';
  db.getDb().prepare(`INSERT INTO historico (id, colecao, documento_id, acao, utilizador, em, detalhes) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(item.id || randomUUID(), colecao, documentoId, acao, item.user || 'migracao', item.timestamp || new Date().toISOString(), JSON.stringify(detalhes));
  return acao;
}

function migrarColecao(ctx, colecao, canonico, outros) {
  const { ficheiros, relatorio } = ctx;
  const payload = ficheiros.get(canonico.id);
  const rel = { colecao, canonico: canonico.name, documentos: 0, emprestimos: 0, eliminados: 0, historico: 0, recuperado: [] };
  relatorio.colecoes.push(rel);
  const porNumero = new Map(); // sourceEntryNumber (canónico) -> id

  for (const entry of payload.entries || []) {
    const doc = inserirDocumento(colecao, entry, canonico);
    porNumero.set(Number(entry.sourceEntryNumber), doc.id);
    rel.documentos += 1;
    if (doc.estado === 'Empréstimo') { inserirEmprestimo(doc.id, entry, entry.estadoChangedAt); rel.emprestimos += 1; }
  }
  for (const entry of payload.deletedEntries || []) {
    const doc = inserirDocumento(colecao, entry, canonico, { eliminado: true });
    if (!porNumero.has(Number(entry.sourceEntryNumber))) porNumero.set(Number(entry.sourceEntryNumber), doc.id);
    rel.eliminados += 1;
  }
  for (const item of payload.history || []) {
    const idDoc = porNumero.get(Number(item.entryRef?.sourceEntryNumber)) || null;
    if (converterHistorico(item, colecao, idDoc, canonico.name)) rel.historico += 1;
  }

  // Recuperar trabalho manual de outras fontes da mesma coleção (mais antigas primeiro).
  for (const outro of outros.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt))) {
    const p = ficheiros.get(outro.id);
    if (!p || !temTrabalho(p)) continue;
    documentosRepo.invalidar(colecao);
    const existentes = documentosRepo.listar(colecao);
    const linhas = (p.entries || []).map((e) => ({ linha: Number(e.sourceEntryNumber), dados: dadosDe(colecao, e), idSigat: undefined }));
    const resultado = new Map(corresponder(colecao, linhas, existentes).map((r) => [r.linha, r]));
    const rec = { fonte: outro.name, edicoes: 0, estados: 0, criados: 0, historico: 0, conflitos: [], semCorrespondencia: [] };
    const idPorNumeroOutro = new Map();

    for (const entry of p.entries || []) {
      const r = resultado.get(Number(entry.sourceEntryNumber));
      if (r.estado === 'match') idPorNumeroOutro.set(Number(entry.sourceEntryNumber), r.documentoId);
      else if (entry.createdAt || entry.createdBy) {
        const doc = inserirDocumento(colecao, entry, outro);
        idPorNumeroOutro.set(Number(entry.sourceEntryNumber), doc.id);
        rec.criados += 1;
        if (doc.estado === 'Empréstimo') inserirEmprestimo(doc.id, entry, entry.estadoChangedAt);
      }
    }

    // Edições manuais: aplicar só os campos alterados no histórico, se o valor atual ainda for o antigo.
    for (const item of (p.history || []).filter((h) => h.action === 'edit')) {
      const id = idPorNumeroOutro.get(Number(item.entryRef?.sourceEntryNumber));
      if (!id) { rec.semCorrespondencia.push(`edição #${item.entryRef?.sourceEntryNumber}`); continue; }
      const alteracoes = diffEdicao(item.details?.prev, item.details?.next);
      const atual = documentosRepo.obter(id);
      const patch = {};
      for (const [k, v] of Object.entries(alteracoes)) {
        if (!campos.listar(colecao).some((c) => c.chave === k && !c.sistema)) continue;
        if (String(atual[k] ?? '') === String(v.de ?? '') || String(atual[k] ?? '') === String(v.para ?? '')) patch[k] = v.para;
        else rec.conflitos.push(`#${atual.numero} ${k}: SIGAT="${atual[k] ?? ''}" · ${outro.name}="${v.para}" (mantido o do SIGAT)`);
      }
      if (Object.keys(patch).length) {
        documentosRepo.atualizar(id, patch, item.user || 'migracao');
        rec.edicoes += 1;
      }
    }

    // Estados alterados manualmente.
    for (const entry of p.entries || []) {
      const id = idPorNumeroOutro.get(Number(entry.sourceEntryNumber));
      const estado = String(entry.estado ?? '').trim();
      if (!id || !entry.estadoChangedAt || !estado || estado === '-') continue;
      const atual = documentosRepo.obter(id);
      if (atual.estado !== '-') continue;
      db.getDb().prepare('UPDATE documentos SET estado = ?, estado_alterado_em = ?, estado_alterado_por = ? WHERE id = ?')
        .run(estado, entry.estadoChangedAt, entry.estadoChangedBy || 'migracao', id);
      if (estado === 'Empréstimo') inserirEmprestimo(id, entry, entry.estadoChangedAt);
      rec.estados += 1;
    }

    // Histórico de outras fontes (já ligado ao documento quando há correspondência).
    for (const item of p.history || []) {
      const id = idPorNumeroOutro.get(Number(item.entryRef?.sourceEntryNumber)) || null;
      if (converterHistorico(item, colecao, id, outro.name)) rec.historico += 1;
    }
    for (const entry of p.deletedEntries || []) {
      rec.semCorrespondencia.push(`eliminada na fonte "${outro.name}": ${entry.cabecalho || entry.titulo || '#' + entry.sourceEntryNumber} (não aplicado)`);
    }
    documentosRepo.invalidar(colecao);
    rel.recuperado.push(rec);
  }
}

function escreverRelatorio(relatorio) {
  const l = [`# Relatório de migração JSON → SQLite`, '', `Data: ${new Date().toISOString()}`, `Modo: ${relatorio.aplicado ? 'APLICADO' : 'simulação'}`, ''];
  l.push(`Utilizadores migrados: ${relatorio.utilizadores}`, '');
  for (const c of relatorio.colecoes) {
    l.push(`## ${c.colecao}`, `- Fonte canónica: **${c.canonico}**`, `- Documentos: ${c.documentos} (+ ${c.eliminados} no lixo)`,
      `- Empréstimos criados: ${c.emprestimos}`, `- Eventos de histórico migrados: ${c.historico}`);
    for (const r of c.recuperado) {
      l.push(`- Recuperado de **${r.fonte}**: ${r.edicoes} edição(ões), ${r.estados} estado(s), ${r.criados} documento(s) criado(s), ${r.historico} evento(s) de histórico`);
      for (const x of r.conflitos) l.push(`  - Conflito: ${x}`);
      for (const x of r.semCorrespondencia) l.push(`  - Sem correspondência: ${x}`);
    }
    l.push('');
  }
  if (relatorio.avisos.length) l.push('## Avisos', ...relatorio.avisos.map((a) => `- ${a}`), '');
  return l.join('\n');
}

function migrar({ dir, aplicar = false, carto, aturb } = {}) {
  const relatorio = { aplicado: aplicar, utilizadores: 0, colecoes: [], avisos: [] };
  const origem = dir;
  const destino = aplicar ? dir : fs.mkdtempSync(path.join(os.tmpdir(), 'sigat-migracao-'));

  const registo = lerJson(path.join(origem, 'datasets.json'), { datasets: [] });
  registo.datasets = registo.datasets || [];
  const ficheiros = new Map();
  for (const d of registo.datasets) {
    const f = path.join(origem, 'datasets', `${d.id}.json`);
    if (fs.existsSync(f)) ficheiros.set(d.id, lerJson(f, { entries: [] }));
    else relatorio.avisos.push(`Fonte "${d.name}" (${d.id}) sem ficheiro; ignorada.`);
  }
  if (registo.activeDatasetId && !registo.datasets.some((d) => d.id === registo.activeDatasetId)) {
    relatorio.avisos.push(`activeDatasetId (${registo.activeDatasetId}) não existe; ignorado.`);
  }

  db.abrir(destino);
  try {
    db.transaction(() => {
      for (const u of lerJson(path.join(origem, 'users.json'), [])) {
        const existente = utilizadores.obterPorUsername(u.username);
        if (existente) {
          db.getDb().prepare('UPDATE utilizadores SET password_hash = ?, role = ? WHERE id = ?').run(u.passwordHash, u.role, existente.id);
        } else {
          utilizadores.criar({ id: u.id, username: u.username, role: u.role, passwordHash: u.passwordHash, criadoEm: u.createdAt });
        }
        relatorio.utilizadores += 1;
      }

      for (const [colecao, preferido] of [['cartografia', carto], ['aturb', aturb]]) {
        if (db.getDb().prepare('SELECT 1 FROM documentos WHERE colecao = ? LIMIT 1').get(colecao)) {
          relatorio.avisos.push(`Coleção ${colecao} já tem documentos na BD; não foi migrada.`);
          continue;
        }
        const canonico = escolherCanonico(registo, colecao, preferido, ficheiros);
        if (!canonico) { relatorio.avisos.push(`Sem fonte para a coleção ${colecao}.`); continue; }
        const outros = registo.datasets.filter((d) => (d.type || 'cartografia') === colecao && d.id !== canonico.id && ficheiros.has(d.id));
        migrarColecao({ ficheiros, relatorio }, colecao, canonico, outros);
      }
    });
  } finally {
    documentosRepo.invalidar();
    db.fecharBd();
  }

  const texto = escreverRelatorio(relatorio);
  if (aplicar) {
    const hoje = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(dir, `relatorio-migracao-${hoje}.md`), texto);
    const legacy = path.join(dir, 'legacy');
    fs.mkdirSync(legacy, { recursive: true });
    for (const nome of ['datasets.json', 'datasets', 'users.json']) {
      if (fs.existsSync(path.join(dir, nome))) fs.renameSync(path.join(dir, nome), path.join(legacy, nome));
    }
  } else {
    fs.rmSync(destino, { recursive: true, force: true });
  }
  return { relatorio, texto };
}

module.exports = { migrar, paraIso };

if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = (nome) => { const i = args.indexOf(nome); return i === -1 ? undefined : args[i + 1]; };
  const dir = arg('--dir') || process.env.SIGAT_DATA_DIR || path.join(__dirname, '..', 'data');
  const { texto } = migrar({ dir, aplicar: args.includes('--aplicar'), carto: arg('--carto'), aturb: arg('--aturb') });
  // eslint-disable-next-line no-console
  console.log(texto);
  if (!args.includes('--aplicar')) console.log('\n(simulação: nada foi gravado; use --aplicar para migrar)');
}
