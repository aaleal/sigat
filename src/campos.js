// Definição inicial dos campos por coleção (semente da tabela `campos`).
// peso = relevância na pesquisa; numerico = filtro por número exato; aliases = cabeçalhos xlsx normalizados.
const CAMPOS = {
  cartografia: [
    { chave: 'cabecalho', rotulo: 'Cabeçalho', peso: 3, obrigatorio: true, visivelTabela: true },
    { chave: 'descricao', rotulo: 'Descrição', peso: 3, obrigatorio: true, visivelTabela: true, aliases: ['tituloedescricaododocumento'] },
    { chave: 'notas', rotulo: 'Notas', peso: 1, aliases: ['outrasdescricoes'] },
    { chave: 'localizacao', rotulo: 'Localização', peso: 1.5, visivelTabela: true, aliases: ['local'] },
    { chave: 'assuntos', rotulo: 'Assuntos', peso: 2.5, visivelTabela: true, aliases: ['palavraschaveassuntos'] },
    { chave: 'cota', rotulo: 'Cota', peso: 3, numerico: true, obrigatorio: true, visivelTabela: true, aliases: ['cota'] },
    { chave: 'cdr', rotulo: 'CDR', peso: 1, numerico: true, visivelTabela: true, aliases: ['cdr'] },
    { chave: 'tb', rotulo: 'TB', peso: 1, numerico: true, visivelTabela: true, aliases: ['tb'] },
    { chave: 'nrRegisto', rotulo: 'Nº Registo', peso: 3, numerico: true, visivelTabela: true, aliases: ['noregisto', 'nrregisto', 'nrderegisto', 'numeroregisto'] },
    { chave: 'autor', rotulo: 'Autor', peso: 2, obrigatorio: true, aliases: ['autorentidaderesponsavel', 'autor'] },
    { chave: 'ano', rotulo: 'Ano', peso: 1, aliases: ['data'] },
    { chave: 'tipo', rotulo: 'Tipo', peso: 1 },
    { chave: 'cor', rotulo: 'Cor', peso: 1 },
    { chave: 'dimensao', rotulo: 'Dimensão', peso: 1 },
    { chave: 'estado', rotulo: 'Estado', peso: 1, sistema: true, visivelTabela: true },
  ],
  aturb: [
    { chave: 'autor', rotulo: 'Autor', peso: 2, obrigatorio: true, visivelTabela: true, aliases: ['autor'] },
    { chave: 'titulo', rotulo: 'Título', peso: 3, obrigatorio: true, visivelTabela: true, aliases: ['titulo'] },
    { chave: 'local', rotulo: 'Local', peso: 1.5, obrigatorio: true, visivelTabela: true, aliases: ['local'] },
    { chave: 'data', rotulo: 'Data', peso: 1, obrigatorio: true, visivelTabela: true, aliases: ['data'] },
    { chave: 'caixaNr', rotulo: 'Caixa nº', peso: 3, numerico: true, obrigatorio: true, visivelTabela: true, aliases: ['caixanr', 'caixano', 'caixa'] },
    { chave: 'estado', rotulo: 'Estado', peso: 1, sistema: true, visivelTabela: true },
  ],
};

const COLECOES = [
  { id: 'cartografia', nome: 'Cartografia' },
  { id: 'aturb', nome: 'Arquivo Técnico de Urbanismo (ATURB)' },
];

const CHAVES_ORDENACAO_NUMERO = new Set(['nrRegisto', 'caixaNr']);
const CHAVES_ORDENACAO_PRIMEIRO_NUMERO = new Set(['cdr', 'tb', 'cota']);

module.exports = { CAMPOS, COLECOES, CHAVES_ORDENACAO_NUMERO, CHAVES_ORDENACAO_PRIMEIRO_NUMERO };
