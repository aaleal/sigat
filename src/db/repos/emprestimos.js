const { randomUUID } = require('crypto');
const { getDb, transaction } = require('../index');
const documentos = require('./documentos');
const historico = require('./historico');

const { ErroValidacao } = documentos;
const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/;

function hoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function somarDias(dataIso, dias) {
  const [a, m, d] = dataIso.split('-').map(Number);
  const dt = new Date(a, m - 1, d + dias);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

const prazoPadraoDias = () => Number.parseInt(process.env.SIGAT_PRAZO_EMPRESTIMO_DIAS, 10) || 30;
const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());

function validarData(valor, rotulo) {
  if (!ISO_DATA.test(valor) || Number.isNaN(Date.parse(valor))) {
    throw new ErroValidacao(`${rotulo} inválida (use AAAA-MM-DD).`, {});
  }
}

function paraApi(row) {
  if (!row) return null;
  const hojeIso = hoje();
  let situacao = 'devolvido';
  let diasAtraso = 0;
  if (!row.data_devolucao) {
    if (!row.data_prevista) situacao = 'sem_prazo';
    else if (row.data_prevista < hojeIso) situacao = 'em_atraso';
    else situacao = 'ativo';
    if (situacao === 'em_atraso') diasAtraso = diasEntre(row.data_prevista, hojeIso);
  } else if (row.data_prevista && row.data_devolucao > row.data_prevista) {
    situacao = 'devolvido_com_atraso';
    diasAtraso = diasEntre(row.data_prevista, row.data_devolucao);
  }
  return {
    id: row.id,
    documentoId: row.documento_id,
    requisitante: row.requisitante,
    entidade: row.entidade || '',
    contacto: row.contacto || '',
    dataSaida: row.data_saida,
    dataPrevista: row.data_prevista || '',
    dataDevolucao: row.data_devolucao || '',
    observacoes: row.observacoes || '',
    observacoesDevolucao: row.observacoes_devolucao || '',
    origem: row.origem,
    registadoPor: row.registado_por,
    registadoEm: row.registado_em,
    devolucaoRegistadaPor: row.devolucao_registada_por || '',
    devolucaoRegistadaEm: row.devolucao_registada_em || '',
    situacao,
    diasAtraso,
  };
}

function diasEntre(deIso, ateIso) {
  const [a1, m1, d1] = deIso.split('-').map(Number);
  const [a2, m2, d2] = ateIso.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

function ativoDe(documentoId) {
  return getDb().prepare('SELECT * FROM emprestimos WHERE documento_id = ? AND data_devolucao IS NULL').get(documentoId) || null;
}

/** Regista um empréstimo e põe o documento em "Empréstimo". Lança ErroValidacao. */
function criar(documentoId, dados, utilizador, { origem = 'sigat', validarDatas = true } = {}) {
  const db = getDb();
  const doc = db.prepare('SELECT id, colecao, estado, eliminado_em FROM documentos WHERE id = ?').get(documentoId);
  if (!doc || doc.eliminado_em) throw new ErroValidacao('Documento não encontrado.', {}, 404);
  if (ativoDe(documentoId)) throw new ErroValidacao('Este documento já tem um empréstimo ativo.', {}, 409);

  const requisitante = texto(dados.requisitante);
  const dataSaida = texto(dados.dataSaida) || hoje();
  const dataPrevista = texto(dados.dataPrevista);
  const erros = {};
  if (!requisitante) erros.requisitante = 'Requisitante é obrigatório.';
  if (Object.keys(erros).length) throw new ErroValidacao('Preencha os campos obrigatórios.', erros);

  if (validarDatas) {
    validarData(dataSaida, 'Data de saída');
    if (dataSaida > hoje()) throw new ErroValidacao('A data de saída não pode ser futura.', { dataSaida: 'Data futura.' });
    if (dataPrevista) {
      validarData(dataPrevista, 'Data prevista');
      if (dataPrevista < dataSaida) throw new ErroValidacao('A data prevista não pode ser anterior à data de saída.', { dataPrevista: 'Anterior à saída.' });
    }
  }

  const id = randomUUID();
  const agora = new Date().toISOString();
  transaction(() => {
    db.prepare(`INSERT INTO emprestimos (id, documento_id, requisitante, entidade, contacto, data_saida, data_prevista, observacoes, origem, registado_por, registado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, documentoId, requisitante, texto(dados.entidade) || null, texto(dados.contacto) || null, dataSaida,
        dataPrevista || null, texto(dados.observacoes) || null, origem, utilizador, agora);
    db.prepare('UPDATE documentos SET estado = ?, estado_alterado_em = ?, estado_alterado_por = ? WHERE id = ?')
      .run('Empréstimo', agora, utilizador, documentoId);
    db.prepare('INSERT INTO consultas (documento_id, tipo, utilizador, em) VALUES (?, ?, ?, ?)').run(documentoId, 'emprestimo', utilizador, agora);
    historico.registar({
      colecao: doc.colecao, documentoId, acao: 'emprestimo', utilizador,
      detalhes: { emprestimoId: id, requisitante, dataSaida, dataPrevista, origem, prevEstado: doc.estado, newEstado: 'Empréstimo' },
    });
  });
  documentos.invalidar(doc.colecao);
  return paraApi(db.prepare('SELECT * FROM emprestimos WHERE id = ?').get(id));
}

/** Regista a devolução; o documento passa a `novoEstado` (por omissão "Arquivo"). */
function devolver(emprestimoId, { dataDevolucao, observacoes, novoEstado = 'Arquivo' } = {}, utilizador) {
  const db = getDb();
  const emp = db.prepare('SELECT * FROM emprestimos WHERE id = ?').get(emprestimoId);
  if (!emp) throw new ErroValidacao('Empréstimo não encontrado.', {}, 404);
  if (emp.data_devolucao) throw new ErroValidacao('Este empréstimo já foi devolvido.', {}, 409);

  const data = texto(dataDevolucao) || hoje();
  validarData(data, 'Data de devolução');
  if (data < emp.data_saida) throw new ErroValidacao('A data de devolução não pode ser anterior à data de saída.', { dataDevolucao: 'Anterior à saída.' });
  if (data > hoje()) throw new ErroValidacao('A data de devolução não pode ser futura.', { dataDevolucao: 'Data futura.' });

  const doc = db.prepare('SELECT colecao FROM documentos WHERE id = ?').get(emp.documento_id);
  const agora = new Date().toISOString();
  transaction(() => {
    db.prepare(`UPDATE emprestimos SET data_devolucao = ?, observacoes_devolucao = ?, devolucao_registada_por = ?, devolucao_registada_em = ? WHERE id = ?`)
      .run(data, texto(observacoes) || null, utilizador, agora, emprestimoId);
    db.prepare('UPDATE documentos SET estado = ?, estado_alterado_em = ?, estado_alterado_por = ? WHERE id = ?')
      .run(novoEstado, agora, utilizador, emp.documento_id);
    historico.registar({
      colecao: doc.colecao, documentoId: emp.documento_id, acao: 'devolucao', utilizador,
      detalhes: { emprestimoId, requisitante: emp.requisitante, dataDevolucao: data, prevEstado: 'Empréstimo', newEstado: novoEstado },
    });
  });
  documentos.invalidar(doc.colecao);
  return paraApi(db.prepare('SELECT * FROM emprestimos WHERE id = ?').get(emprestimoId));
}

const COLUNAS_DOC = `d.colecao AS colecao, d.numero AS numero, d.dados AS dados`;

function comDocumento(row) {
  const base = paraApi(row);
  let dados = {};
  try { dados = JSON.parse(row.dados || '{}'); } catch { /* ignora */ }
  base.documento = {
    id: row.documento_id,
    colecao: row.colecao,
    numero: row.numero,
    titulo: dados.cabecalho || dados.titulo || '',
    cota: dados.cota || '',
    caixaNr: dados.caixaNr || '',
  };
  return base;
}

/** Lista empréstimos com filtros; `estado`: ativo|atraso|sem_prazo|devolvido|todos. */
function listar({ estado = 'ativo', colecao, requisitante, de, ate } = {}) {
  const { normalizar } = require('../../search');
  const hojeIso = hoje();
  const where = [];
  const args = [];
  if (estado === 'ativo') where.push('e.data_devolucao IS NULL');
  else if (estado === 'atraso') { where.push('e.data_devolucao IS NULL AND e.data_prevista < ?'); args.push(hojeIso); }
  else if (estado === 'sem_prazo') where.push('e.data_devolucao IS NULL AND e.data_prevista IS NULL');
  else if (estado === 'devolvido') where.push('e.data_devolucao IS NOT NULL');
  if (colecao) { where.push('d.colecao = ?'); args.push(colecao); }
  if (de) { where.push('e.data_saida >= ?'); args.push(de); }
  if (ate) { where.push('e.data_saida <= ?'); args.push(ate); }

  const sql = `SELECT e.*, ${COLUNAS_DOC} FROM emprestimos e JOIN documentos d ON d.id = e.documento_id
               ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  let itens = getDb().prepare(sql).all(...args).map(comDocumento);
  if (requisitante) {
    const q = normalizar(requisitante);
    itens = itens.filter((i) => normalizar(`${i.requisitante} ${i.entidade}`).includes(q));
  }
  const ordemData = (a, b) => (a || '9999-99-99').localeCompare(b || '9999-99-99');
  if (estado === 'devolvido') itens.sort((a, b) => b.dataDevolucao.localeCompare(a.dataDevolucao));
  else itens.sort((a, b) => ordemData(a.dataDevolucao ? '' : a.dataPrevista, b.dataDevolucao ? '' : b.dataPrevista) || a.dataSaida.localeCompare(b.dataSaida));
  return itens;
}

function resumo({ colecao } = {}) {
  const hojeIso = hoje();
  const limite = somarDias(hojeIso, 7);
  const filtro = colecao ? 'AND d.colecao = ?' : '';
  const args = colecao ? [colecao] : [];
  const linha = getDb().prepare(`
    SELECT COUNT(*) AS ativos,
           SUM(CASE WHEN e.data_prevista IS NOT NULL AND e.data_prevista < ? THEN 1 ELSE 0 END) AS emAtraso,
           SUM(CASE WHEN e.data_prevista IS NOT NULL AND e.data_prevista >= ? AND e.data_prevista <= ? THEN 1 ELSE 0 END) AS aVencer7dias,
           SUM(CASE WHEN e.data_prevista IS NULL THEN 1 ELSE 0 END) AS semPrazo
    FROM emprestimos e JOIN documentos d ON d.id = e.documento_id
    WHERE e.data_devolucao IS NULL ${filtro}`).get(hojeIso, hojeIso, limite, ...args);
  return { ativos: linha.ativos || 0, emAtraso: linha.emAtraso || 0, aVencer7dias: linha.aVencer7dias || 0, semPrazo: linha.semPrazo || 0 };
}

function requisitantes() {
  return getDb().prepare('SELECT DISTINCT requisitante FROM emprestimos ORDER BY requisitante COLLATE NOCASE').all().map((r) => r.requisitante);
}

function listarDoDocumento(documentoId) {
  return getDb().prepare('SELECT * FROM emprestimos WHERE documento_id = ? ORDER BY data_saida DESC, registado_em DESC').all(documentoId).map(paraApi);
}

/** Corrige/prolonga um empréstimo ativo. */
function atualizar(emprestimoId, patch, utilizador) {
  const db = getDb();
  const emp = db.prepare('SELECT * FROM emprestimos WHERE id = ?').get(emprestimoId);
  if (!emp) throw new ErroValidacao('Empréstimo não encontrado.', {}, 404);
  if (emp.data_devolucao) throw new ErroValidacao('Não é possível alterar um empréstimo já devolvido.', {}, 409);

  const novo = {
    requisitante: patch.requisitante !== undefined ? texto(patch.requisitante) : emp.requisitante,
    entidade: patch.entidade !== undefined ? texto(patch.entidade) : emp.entidade || '',
    contacto: patch.contacto !== undefined ? texto(patch.contacto) : emp.contacto || '',
    observacoes: patch.observacoes !== undefined ? texto(patch.observacoes) : emp.observacoes || '',
    data_prevista: patch.dataPrevista !== undefined ? texto(patch.dataPrevista) : emp.data_prevista || '',
  };
  if (!novo.requisitante) throw new ErroValidacao('Requisitante é obrigatório.', { requisitante: 'Obrigatório.' });
  if (novo.data_prevista) {
    validarData(novo.data_prevista, 'Data prevista');
    if (novo.data_prevista < emp.data_saida) throw new ErroValidacao('A data prevista não pode ser anterior à data de saída.', { dataPrevista: 'Anterior à saída.' });
  }

  const alteracoes = {};
  const comparar = [['requisitante', emp.requisitante || '', novo.requisitante], ['entidade', emp.entidade || '', novo.entidade],
    ['contacto', emp.contacto || '', novo.contacto], ['observacoes', emp.observacoes || '', novo.observacoes],
    ['dataPrevista', emp.data_prevista || '', novo.data_prevista]];
  for (const [k, de, para] of comparar) if (de !== para) alteracoes[k] = { de, para };
  if (!Object.keys(alteracoes).length) return paraApi(emp);

  const doc = db.prepare('SELECT colecao FROM documentos WHERE id = ?').get(emp.documento_id);
  transaction(() => {
    db.prepare('UPDATE emprestimos SET requisitante = ?, entidade = ?, contacto = ?, observacoes = ?, data_prevista = ? WHERE id = ?')
      .run(novo.requisitante, novo.entidade || null, novo.contacto || null, novo.observacoes || null, novo.data_prevista || null, emprestimoId);
    historico.registar({
      colecao: doc.colecao, documentoId: emp.documento_id, acao: alteracoes.dataPrevista ? 'prolongar' : 'emprestimo',
      utilizador, detalhes: { emprestimoId, alteracoes },
    });
  });
  documentos.invalidar(doc.colecao);
  return paraApi(db.prepare('SELECT * FROM emprestimos WHERE id = ?').get(emprestimoId));
}

module.exports = {
  hoje, somarDias, prazoPadraoDias, paraApi, ativoDe, criar, devolver, diasEntre, listar, resumo, requisitantes, listarDoDocumento, atualizar,
};
