// Definição dos campos por tipo de coleção. Passa a vir da BD na Fase 2.
const CAMPOS = {
  cartografia: [
    { chave: 'cabecalho', rotulo: 'Cabeçalho', peso: 3 },
    { chave: 'descricao', rotulo: 'Descrição', peso: 3 },
    { chave: 'notas', rotulo: 'Notas', peso: 1 },
    { chave: 'localizacao', rotulo: 'Localização', peso: 1.5 },
    { chave: 'assuntos', rotulo: 'Assuntos', peso: 2.5 },
    { chave: 'cota', rotulo: 'Cota', peso: 3, numerico: true },
    { chave: 'cdr', rotulo: 'CDR', peso: 1, numerico: true },
    { chave: 'tb', rotulo: 'TB', peso: 1, numerico: true },
    { chave: 'nrRegisto', rotulo: 'Nº Registo', peso: 3, numerico: true },
    { chave: 'autor', rotulo: 'Autor', peso: 2 },
    { chave: 'ano', rotulo: 'Ano', peso: 1 },
    { chave: 'tipo', rotulo: 'Tipo', peso: 1 },
    { chave: 'cor', rotulo: 'Cor', peso: 1 },
    { chave: 'dimensao', rotulo: 'Dimensão', peso: 1 },
    { chave: 'estado', rotulo: 'Estado', peso: 1 },
  ],
  aturb: [
    { chave: 'autor', rotulo: 'Autor', peso: 2 },
    { chave: 'titulo', rotulo: 'Título', peso: 3 },
    { chave: 'local', rotulo: 'Local', peso: 1.5 },
    { chave: 'data', rotulo: 'Data', peso: 1 },
    { chave: 'caixaNr', rotulo: 'Caixa nº', peso: 3, numerico: true },
    { chave: 'estado', rotulo: 'Estado', peso: 1 },
  ],
};

const CHAVES_ORDENACAO_NUMERO = new Set(['nrRegisto', 'caixaNr']);
const CHAVES_ORDENACAO_PRIMEIRO_NUMERO = new Set(['cdr', 'tb', 'cota']);

module.exports = { CAMPOS, CHAVES_ORDENACAO_NUMERO, CHAVES_ORDENACAO_PRIMEIRO_NUMERO };
