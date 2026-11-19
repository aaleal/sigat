-- Operação e segurança: configuração, bloqueio de contas, recuperação de password, auditoria.
-- Utilização: anexos (imagens digitalizadas) e carrinho de impressão persistente.

CREATE TABLE configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

ALTER TABLE utilizadores ADD COLUMN tentativas_falhadas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE utilizadores ADD COLUMN bloqueado_ate TEXT;
ALTER TABLE utilizadores ADD COLUMN password_alterada_em TEXT;
ALTER TABLE utilizadores ADD COLUMN origem TEXT NOT NULL DEFAULT 'local';
ALTER TABLE utilizadores ADD COLUMN sessao_versao INTEGER NOT NULL DEFAULT 0;

CREATE TABLE recuperacoes (
  id TEXT PRIMARY KEY,
  utilizador_id TEXT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
  pedido_em TEXT NOT NULL,
  codigo_hash TEXT,
  emitido_por TEXT,
  emitido_em TEXT,
  expira_em TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  usado_em TEXT
);
CREATE INDEX idx_recuperacoes_utilizador ON recuperacoes(utilizador_id, usado_em);

CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  em TEXT NOT NULL,
  utilizador TEXT,
  acao TEXT NOT NULL,
  ip TEXT,
  detalhes TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_auditoria_em ON auditoria(em);
CREATE INDEX idx_historico_em ON historico(em);

CREATE TABLE anexos (
  id TEXT PRIMARY KEY,
  documento_id TEXT NOT NULL REFERENCES documentos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('ficheiro', 'ligacao')),
  nome TEXT NOT NULL,
  legenda TEXT,
  url TEXT,
  ficheiro TEXT,
  miniatura TEXT,
  mime TEXT,
  tamanho INTEGER,
  criado_em TEXT NOT NULL,
  criado_por TEXT NOT NULL
);
CREATE INDEX idx_anexos_documento ON anexos(documento_id, criado_em);

CREATE TABLE carrinhos (
  utilizador_id TEXT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
  documento_id TEXT NOT NULL REFERENCES documentos(id),
  adicionado_em TEXT NOT NULL,
  PRIMARY KEY (utilizador_id, documento_id)
);
