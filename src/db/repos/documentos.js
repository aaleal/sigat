const { randomUUID } = require('crypto');
const { getDb, transaction } = require('../index');
const campos = require('./campos');
const historico = require('./historico');

const deJson = (s, fallback = {}) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
const ESTADOS = ['-', 'Arquivo', 'Em Consulta', 'Empréstimo'];

class ErroValidacao extends Error {
  constructor(message, erros = {}, status = 400) {
    super(message);
    this.status = status;
    this.erros = erros;
  }
}

// ── Cache de entradas (por coleção), invalidada em cada escrita ─────────────
const cache = new Map(); // colecao -> { entradas, porId }
function invalidar(colecao) {
  if (colecao) cache.delete(colecao); else cache.clear();
}

function paraEntrada(row, emprestimo) {
  const dados = deJson(row.dados);
  return {
    ...dados,
    id: row.id,
    colecao: row.colecao,
    numero: row.numero,
    sourceEntryNumber: row.numero,
    estado: row.estado,
    estadoMeta: emprestimo
      ? {
        emprestimoId: emprestimo.id,
        requisitante: emprestimo.requisitante,
        entidade: emprestimo.entidade || '',
        dataSaida: emprestimo.data_saida,
        dataPrevista: emprestimo.data_prevista || '',
        registadoPor: emprestimo.registado_por,
      }
      : null,
    estadoChangedAt: row.estado_alterado_em || undefined,
    estadoChangedBy: row.estado_alterado_por || undefined,
    createdAt: row.criado_em,
    createdBy: row.criado_por,
    updatedAt: row.atualizado_em || undefined,
    updatedBy: row.atualizado_por || undefined,
    deletedAt: row.eliminado_em || undefined,
    deletedBy: row.eliminado_por || undefined,
  };
}

function carregar(colecao) {
  if (cache.has(colecao)) return cache.get(colecao);
  const db = getDb();
  const ativos = new Map(db.prepare(`SELECT e.* FROM emprestimos e JOIN documentos d ON d.id = e.documento_id
                                     WHERE d.colecao = ? AND e.data_devolucao IS NULL`).all(colecao).map((e) => [e.documento_id, e]));
  const rows = db.prepare('SELECT * FROM documentos WHERE colecao = ? AND eliminado_em IS NULL ORDER BY numero').all(colecao);
  const entradas = rows.map((r) => paraEntrada(r, ativos.get(r.id)));
  const resultado = { entradas, porId: new Map(entradas.map((e) => [e.id, e])) };
  cache.set(colecao, resultado);
  return resultado;
}

// Devolve o array em cache: não alterar os objetos.
function listar(colecao) {
  return carregar(colecao).entradas;
}

function contar(colecao) {
  return carregar(colecao).entradas.length;
}

function obter(id, { incluirEliminados = true } = {}) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
  if (!row || (!incluirEliminados && row.eliminado_em)) return null;
  const emp = db.prepare('SELECT * FROM emprestimos WHERE documento_id = ? AND data_devolucao IS NULL').get(id);
  return paraEntrada(row, emp);
}

function listarEliminados(colecao) {
  const db = getDb();
  return db.prepare('SELECT * FROM documentos WHERE colecao = ? AND eliminado_em IS NOT NULL ORDER BY eliminado_em DESC')
    .all(colecao).map((r) => paraEntrada(r, null));
}

// ── Validação / normalização ──────────────────────────────────────────────
const limpar = (v) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Normaliza um corpo de pedido contra os campos da coleção.
 * Devolve apenas os campos conhecidos e não-sistema; '' significa "limpar".
 */
function normalizarDados(colecao, corpo) {
  const definicao = campos.listar(colecao).filter((c) => !c.sistema);
  const conhecidos = new Set(definicao.map((c) => c.chave));
  const out = {};
  for (const [k, v] of Object.entries(corpo || {})) {
    if (conhecidos.has(k)) out[k] = limpar(v);
  }
  return out;
}

function validarObrigatorios(colecao, dados) {
  const erros = {};
  for (const c of campos.listar(colecao)) {
    if (c.obrigatorio && !limpar(dados[c.chave])) erros[c.chave] = `${c.rotulo} é obrigatório.`;
  }
  if (Object.keys(erros).length) throw new ErroValidacao('Preencha os campos obrigatórios.', erros);
}

function proximoNumero(colecao) {
  return getDb().prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM documentos WHERE colecao = ?').get(colecao).n;
}

function semVazios(dados) {
  return Object.fromEntries(Object.entries(dados).filter(([, v]) => limpar(v) !== ''));
}

// ── Escrita ───────────────────────────────────────────────────────────────
function criar(colecao, corpo, utilizador, { importacaoId = null, validar = true, estado = '-', historicoDetalhes = null } = {}) {
  const dados = semVazios(normalizarDados(colecao, corpo));
  if (validar) validarObrigatorios(colecao, dados);
  const id = randomUUID();
  const agora = new Date().toISOString();
  transaction(() => {
    const numero = proximoNumero(colecao);
    getDb().prepare(`INSERT INTO documentos (id, colecao, numero, dados, dados_importados, estado, importacao_id, criado_em, criado_por)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, colecao, numero, JSON.stringify(dados), importacaoId ? JSON.stringify(dados) : null, estado, importacaoId, agora, utilizador);
    historico.registar({
      colecao, documentoId: id, acao: importacaoId ? 'importar' : 'criar', utilizador, importacaoId,
      detalhes: historicoDetalhes || { entrada: dados.cabecalho || dados.titulo || '' },
    });
  });
  invalidar(colecao);
  return obter(id);
}

function atualizar(id, corpo, utilizador) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
  if (!row || row.eliminado_em) return null;
  const antes = deJson(row.dados);
  const patch = normalizarDados(row.colecao, corpo);
  const depois = semVazios({ ...antes, ...patch });
  // Só impede esvaziar um campo obrigatório; documentos antigos sem (p.ex.) autor continuam editáveis.
  const erros = {};
  for (const c of campos.listar(row.colecao)) {
    if (c.obrigatorio && limpar(antes[c.chave]) && !limpar(depois[c.chave])) erros[c.chave] = `${c.rotulo} é obrigatório.`;
  }
  if (Object.keys(erros).length) throw new ErroValidacao('Preencha os campos obrigatórios.', erros);

  const alteracoes = {};
  for (const k of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
    if ((antes[k] ?? '') !== (depois[k] ?? '')) alteracoes[k] = { de: antes[k] ?? '', para: depois[k] ?? '' };
  }
  if (Object.keys(alteracoes).length) {
    transaction(() => {
      db.prepare('UPDATE documentos SET dados = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?')
        .run(JSON.stringify(depois), new Date().toISOString(), utilizador, id);
      historico.registar({ colecao: row.colecao, documentoId: id, acao: 'editar', utilizador, detalhes: { alteracoes } });
    });
    invalidar(row.colecao);
  }
  return obter(id);
}

function eliminar(id, utilizador) {
  const db = getDb();
  const row = db.prepare('SELECT colecao, eliminado_em, estado FROM documentos WHERE id = ?').get(id);
  if (!row || row.eliminado_em) return null;
  if (row.estado === 'Empréstimo') {
    throw new ErroValidacao('Não é possível eliminar um documento emprestado. Registe primeiro a devolução.', {}, 409);
  }
  transaction(() => {
    db.prepare('UPDATE documentos SET eliminado_em = ?, eliminado_por = ? WHERE id = ?').run(new Date().toISOString(), utilizador, id);
    historico.registar({ colecao: row.colecao, documentoId: id, acao: 'eliminar', utilizador });
  });
  invalidar(row.colecao);
  return true;
}

function restaurar(id, utilizador) {
  const db = getDb();
  const row = db.prepare('SELECT colecao, eliminado_em FROM documentos WHERE id = ?').get(id);
  if (!row || !row.eliminado_em) return null;
  transaction(() => {
    db.prepare('UPDATE documentos SET eliminado_em = NULL, eliminado_por = NULL WHERE id = ?').run(id);
    historico.registar({ colecao: row.colecao, documentoId: id, acao: 'restaurar', utilizador });
  });
  invalidar(row.colecao);
  return obter(id);
}

// "Empréstimo" só se cria/termina pelas rotas de empréstimos (requisitante, prazo, devolução).
function definirEstado(id, estado, utilizador) {
  if (!ESTADOS.includes(estado)) throw new ErroValidacao('Estado inválido.', {});
  if (estado === 'Empréstimo') {
    throw new ErroValidacao('Use "Registar empréstimo" para emprestar um documento.', {}, 400);
  }
  const db = getDb();
  const row = db.prepare('SELECT colecao, estado, eliminado_em FROM documentos WHERE id = ?').get(id);
  if (!row || row.eliminado_em) return null;
  if (row.estado === estado) return obter(id);
  if (row.estado === 'Empréstimo') {
    throw new ErroValidacao('Documento emprestado: registe a devolução para alterar o estado.', {}, 409);
  }
  const agora = new Date().toISOString();
  transaction(() => {
    db.prepare('UPDATE documentos SET estado = ?, estado_alterado_em = ?, estado_alterado_por = ? WHERE id = ?').run(estado, agora, utilizador, id);
    if (estado === 'Em Consulta') {
      db.prepare('INSERT INTO consultas (documento_id, tipo, utilizador, em) VALUES (?, ?, ?, ?)').run(id, 'presencial', utilizador, agora);
    }
    historico.registar({ colecao: row.colecao, documentoId: id, acao: 'estado', utilizador, detalhes: { prevEstado: row.estado, newEstado: estado } });
  });
  invalidar(row.colecao);
  return obter(id);
}

/** Linha crua (sem os campos de sistema planos) para a fusão de importações. */
function bruto(id) {
  const r = getDb().prepare('SELECT * FROM documentos WHERE id = ?').get(id);
  return r ? { colecao: r.colecao, dados: deJson(r.dados), dadosImportados: r.dados_importados ? deJson(r.dados_importados, null) : null, atualizadoEm: r.atualizado_em } : null;
}

// ── Importação ──
function bases(colecao) {
  const rows = getDb().prepare('SELECT id, dados_importados FROM documentos WHERE colecao = ? AND eliminado_em IS NULL').all(colecao);
  return new Map(rows.map((r) => [r.id, r.dados_importados ? deJson(r.dados_importados, null) : null]));
}

/** Atualiza `dados` e a base da próxima fusão; `alteracoes` só serve para o histórico. */
function aplicarImportacao(id, dados, dadosImportados, importacaoId, utilizador, alteracoes) {
  const row = getDb().prepare('SELECT colecao FROM documentos WHERE id = ?').get(id);
  getDb().prepare(`UPDATE documentos SET dados = ?, dados_importados = ?, importacao_id = ?,
                   atualizado_em = CASE WHEN ? THEN ? ELSE atualizado_em END, atualizado_por = CASE WHEN ? THEN ? ELSE atualizado_por END WHERE id = ?`)
    .run(JSON.stringify(semVazios(dados)), JSON.stringify(semVazios(dadosImportados)), importacaoId,
      Object.keys(alteracoes).length ? 1 : 0, new Date().toISOString(), Object.keys(alteracoes).length ? 1 : 0, utilizador, id);
  if (Object.keys(alteracoes).length) {
    historico.registar({ colecao: row.colecao, documentoId: id, acao: 'importar', utilizador, importacaoId, detalhes: { alteracoes } });
  }
  invalidar(row.colecao);
}

module.exports = {
  ESTADOS, ErroValidacao, invalidar, listar, contar, obter, listarEliminados, criar, atualizar, eliminar, restaurar, definirEstado,
  normalizarDados, semVazios, proximoNumero, bases, aplicarImportacao, bruto,
};
