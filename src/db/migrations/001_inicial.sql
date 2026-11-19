PRAGMA foreign_keys = ON;

CREATE TABLE utilizadores (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('admin','write','read')),
  password_hash TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  trocar_password INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE colecoes (id TEXT PRIMARY KEY, nome TEXT NOT NULL);

CREATE TABLE campos (
  colecao TEXT NOT NULL REFERENCES colecoes(id),
  chave TEXT NOT NULL,
  rotulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'texto',
  ordem INTEGER NOT NULL DEFAULT 0,
  aliases TEXT NOT NULL DEFAULT '[]',
  visivel_tabela INTEGER NOT NULL DEFAULT 0,
  pesquisavel INTEGER NOT NULL DEFAULT 1,
  filtro_numerico INTEGER NOT NULL DEFAULT 0,
  obrigatorio INTEGER NOT NULL DEFAULT 0,
  peso_pesquisa REAL NOT NULL DEFAULT 1,
  sistema INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (colecao, chave)
);

CREATE TABLE documentos (
  id TEXT PRIMARY KEY,
  colecao TEXT NOT NULL REFERENCES colecoes(id),
  numero INTEGER NOT NULL,
  dados TEXT NOT NULL,
  dados_importados TEXT,
  estado TEXT NOT NULL DEFAULT '-',
  estado_alterado_em TEXT,
  estado_alterado_por TEXT,
  importacao_id TEXT,
  criado_em TEXT NOT NULL,
  criado_por TEXT NOT NULL,
  atualizado_em TEXT,
  atualizado_por TEXT,
  eliminado_em TEXT,
  eliminado_por TEXT,
  UNIQUE (colecao, numero)
);
CREATE INDEX idx_doc_colecao ON documentos(colecao, eliminado_em);

CREATE TABLE emprestimos (
  id TEXT PRIMARY KEY,
  documento_id TEXT NOT NULL REFERENCES documentos(id),
  requisitante TEXT NOT NULL,
  entidade TEXT,
  contacto TEXT,
  data_saida TEXT NOT NULL,
  data_prevista TEXT,
  data_devolucao TEXT,
  observacoes TEXT,
  observacoes_devolucao TEXT,
  origem TEXT NOT NULL DEFAULT 'sigat',
  registado_por TEXT NOT NULL,
  registado_em TEXT NOT NULL,
  devolucao_registada_por TEXT,
  devolucao_registada_em TEXT
);
CREATE UNIQUE INDEX ux_emprestimo_ativo ON emprestimos(documento_id) WHERE data_devolucao IS NULL;
CREATE INDEX idx_emprestimo_datas ON emprestimos(data_devolucao, data_prevista);

CREATE TABLE consultas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id TEXT NOT NULL REFERENCES documentos(id),
  tipo TEXT NOT NULL,
  utilizador TEXT NOT NULL,
  em TEXT NOT NULL
);
CREATE INDEX idx_consultas_doc ON consultas(documento_id, em);

CREATE TABLE historico (
  id TEXT PRIMARY KEY,
  colecao TEXT NOT NULL,
  documento_id TEXT,
  acao TEXT NOT NULL,
  utilizador TEXT NOT NULL,
  em TEXT NOT NULL,
  importacao_id TEXT,
  detalhes TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_hist_doc ON historico(documento_id, em);
CREATE INDEX idx_hist_colecao ON historico(colecao, em);

CREATE TABLE importacoes (
  id TEXT PRIMARY KEY,
  colecao TEXT NOT NULL,
  ficheiro_nome TEXT NOT NULL,
  ficheiro_sha256 TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  estado TEXT NOT NULL,
  mapeamento TEXT NOT NULL DEFAULT '{}',
  resumo TEXT,
  erros TEXT,
  avisos TEXT,
  criada_em TEXT NOT NULL,
  criada_por TEXT NOT NULL,
  aplicada_em TEXT,
  aplicada_por TEXT
);

CREATE TABLE importacao_itens (
  importacao_id TEXT NOT NULL REFERENCES importacoes(id) ON DELETE CASCADE,
  linha INTEGER NOT NULL,
  acao TEXT NOT NULL,
  documento_id TEXT,
  candidatos TEXT,
  criterio TEXT,
  dados_ficheiro TEXT NOT NULL,
  diff TEXT,
  decisao TEXT,
  PRIMARY KEY (importacao_id, linha)
);
