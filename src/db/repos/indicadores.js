const { getDb } = require('../index');
const documentos = require('./documentos');
const emprestimos = require('./emprestimos');
const { normalizar } = require('../../search');
const { normCota } = require('../../import/corresponder');

const ESTADOS = ['-', 'Arquivo', 'Em Consulta', 'Empréstimo'];

// Indicadores de qualidade por coleção: campos que não devem estar vazios.
const QUALIDADE = {
  cartografia: [
    ['cota', 'Sem cota'], ['autor', 'Sem autor'], ['nrRegisto', 'Sem nº de registo'], ['assuntos', 'Sem assuntos'], ['localizacao', 'Sem localização'],
  ],
  aturb: [['caixaNr', 'Sem caixa'], ['autor', 'Sem autor'], ['local', 'Sem local'], ['data', 'Sem data']],
};

const vazio = (v) => String(v ?? '').trim() === '';

function desde(periodo) {
  const dias = Number.parseInt(periodo, 10);
  if (!dias) return null;
  return new Date(Date.now() - dias * 86400000).toISOString();
}

/** Regista uma visualização (no máximo 1 por utilizador e documento em 30 minutos). */
function registarVisualizacao(documentoId, utilizador) {
  const db = getDb();
  const limite = new Date(Date.now() - 30 * 60000).toISOString();
  const recente = db.prepare(`SELECT 1 FROM consultas WHERE documento_id = ? AND utilizador = ? AND tipo = 'visualizacao' AND em > ? LIMIT 1`)
    .get(documentoId, utilizador, limite);
  if (!recente) {
    db.prepare('INSERT INTO consultas (documento_id, tipo, utilizador, em) VALUES (?, ?, ?, ?)').run(documentoId, 'visualizacao', utilizador, new Date().toISOString());
  }
}

function chaveDuplicado(colecao, e) {
  const desc = normalizar(colecao === 'aturb' ? e.titulo : e.descricao);
  const cota = normCota(colecao === 'aturb' ? e.caixaNr : e.cota);
  return desc ? `${cota}|${desc}` : '';
}

/** Grupos de documentos com a mesma cota+descrição normalizadas. */
function duplicados(colecao, limite = 200) {
  const grupos = new Map();
  for (const e of documentos.listar(colecao)) {
    const k = chaveDuplicado(colecao, e);
    if (!k) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(e);
  }
  const lista = [...grupos.entries()].filter(([, docs]) => docs.length > 1);
  return {
    grupos: lista.length,
    documentos: lista.reduce((n, [, d]) => n + d.length, 0),
    itens: lista.slice(0, limite).map(([chave, docs]) => ({
      chave,
      documentos: docs.map((d) => ({ id: d.id, numero: d.numero, titulo: d.cabecalho || d.titulo || '', cota: d.cota || d.caixaNr || '', estado: d.estado })),
    })),
  };
}

function indicadoresColecao(id, nome) {
  const entradas = documentos.listar(id);
  const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
  for (const e of entradas) porEstado[e.estado] = (porEstado[e.estado] || 0) + 1;
  const eliminados = getDb().prepare('SELECT COUNT(*) AS n FROM documentos WHERE colecao = ? AND eliminado_em IS NOT NULL').get(id).n;
  const qualidade = (QUALIDADE[id] || []).map(([chave, rotulo]) => ({
    chave, rotulo, total: entradas.filter((e) => vazio(e[chave])).length, filtro: { vazios: chave },
  }));
  const dup = duplicados(id, 0);
  return { id, nome, total: entradas.length, eliminados, porEstado, qualidade, duplicados: { grupos: dup.grupos, documentos: dup.documentos } };
}

function maisConsultados({ colecao, periodo, incluirVisualizacoes }) {
  const tipos = incluirVisualizacoes ? ['presencial', 'emprestimo', 'visualizacao'] : ['presencial', 'emprestimo'];
  const args = [...tipos];
  let sql = `SELECT d.id, d.colecao, d.numero, d.dados, COUNT(*) AS n,
                    SUM(CASE WHEN c.tipo = 'presencial' THEN 1 ELSE 0 END) AS presencial,
                    SUM(CASE WHEN c.tipo = 'emprestimo' THEN 1 ELSE 0 END) AS emprestimo,
                    SUM(CASE WHEN c.tipo = 'visualizacao' THEN 1 ELSE 0 END) AS visualizacao
             FROM consultas c JOIN documentos d ON d.id = c.documento_id
             WHERE c.tipo IN (${tipos.map(() => '?').join(',')})`;
  const desdeIso = desde(periodo);
  if (desdeIso) { sql += ' AND c.em >= ?'; args.push(desdeIso); }
  if (colecao) { sql += ' AND d.colecao = ?'; args.push(colecao); }
  sql += ' GROUP BY d.id ORDER BY n DESC, d.numero LIMIT 10';
  return getDb().prepare(sql).all(...args).map((r) => {
    let dados = {};
    try { dados = JSON.parse(r.dados); } catch { /* ignora */ }
    return {
      id: r.id, colecao: r.colecao, numero: r.numero, titulo: dados.cabecalho || dados.titulo || '', cota: dados.cota || dados.caixaNr || '',
      total: r.n, presencial: r.presencial, emprestimo: r.emprestimo, visualizacao: r.visualizacao,
    };
  });
}

function estatisticasEmprestimos({ colecao, periodo }) {
  const args = [];
  let filtro = 'WHERE e.data_devolucao IS NOT NULL';
  const desdeIso = desde(periodo);
  if (desdeIso) { filtro += ' AND e.data_devolucao >= ?'; args.push(desdeIso.slice(0, 10)); }
  if (colecao) { filtro += ' AND d.colecao = ?'; args.push(colecao); }
  const r = getDb().prepare(`SELECT COUNT(*) AS n, AVG(julianday(e.data_devolucao) - julianday(e.data_saida)) AS media
                             FROM emprestimos e JOIN documentos d ON d.id = e.documento_id ${filtro}`).get(...args);
  return { devolvidosNoPeriodo: r.n || 0, duracaoMediaDias: r.media == null ? null : Math.round(r.media * 10) / 10 };
}

function indicadores({ colecao, periodo = '90', incluirVisualizacoes = false } = {}) {
  const colecoes = getDb().prepare('SELECT id, nome FROM colecoes ORDER BY rowid').all()
    .filter((c) => !colecao || colecao === 'todas' || c.id === colecao);
  const alvo = colecao && colecao !== 'todas' ? colecao : undefined;
  const ultima = getDb().prepare(`SELECT colecao, ficheiro_nome, aplicada_em, aplicada_por, resumo FROM importacoes WHERE estado = 'aplicada'
                                  ${alvo ? 'AND colecao = ?' : ''} ORDER BY aplicada_em DESC LIMIT 1`).get(...(alvo ? [alvo] : []));
  return {
    periodo,
    colecoes: colecoes.map((c) => indicadoresColecao(c.id, c.nome)),
    emprestimos: { ...emprestimos.resumo({ colecao: alvo }), ...estatisticasEmprestimos({ colecao: alvo, periodo }) },
    maisConsultados: maisConsultados({ colecao: alvo, periodo, incluirVisualizacoes }),
    ultimaImportacao: ultima
      ? { colecao: ultima.colecao, ficheiro: ultima.ficheiro_nome, em: ultima.aplicada_em, por: ultima.aplicada_por, aplicado: (() => { try { return JSON.parse(ultima.resumo)?.aplicado || null; } catch { return null; } })() }
      : null,
  };
}

module.exports = { registarVisualizacao, duplicados, indicadores };
