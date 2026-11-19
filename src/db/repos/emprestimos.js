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

module.exports = { hoje, somarDias, prazoPadraoDias, paraApi, ativoDe, criar, devolver, diasEntre };
