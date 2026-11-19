# Modelo de dados e importação

> **Desde a Fase 2** os dados vivem em SQLite (ver [architecture.md](architecture.md)): uma coleção por tipo (`cartografia`, `aturb`), sem "fontes de dados" múltiplas. Os campos de cada coleção estão na tabela `campos` (semente em [src/campos.js](../src/campos.js)) e podem crescer via importação. Um documento = linha em `documentos` com os campos em JSON (`dados`), `estado`, `numero` (ID SIGAT) e `dados_importados` (valores da última importação aplicada, base da fusão a 3 vias). O mapeamento xlsx → campo abaixo continua válido como proposta automática ([src/import/ler.js](../src/import/ler.js), [src/import/transformar.js](../src/import/transformar.js)). As partes sobre "datasets", parsers antigos e `attachNrRegisto` são históricas.

## Coleções
`cartografia` e `aturb`. Tudo o que for "dataset" abaixo refere o modelo antigo (JSON), migrado por `scripts/migrar-json-para-sqlite.js`.

## Cartografia

### Origem: xlsx, folha `BD`
Leitura: [src/import/ler.js](../src/import/ler.js). As colunas são **identificadas pelo nome do cabeçalho** (normalizado: sem acentos, minúsculas, só alfanuméricos; ex.: "Caixa nº" → `caixano`), não pela posição. Procura o cabeçalho nas primeiras 12 linhas da folha `BD` (Cartografia) ou `PDF Site` (ATURB), ou nas outras folhas.

Cabeçalhos do ficheiro real (`Cartografia GEO - BD.xlsx`, folha BD), por ordem:
A Autor / Entidade Responsável · B Título e Descrição do Documento · **C Local** · D Data · E Outras Informações Físicas · F Outras Descrições · G Palavras-chave / Assuntos · H TB · I TB 2 · J Cota · K MP · L CDR · M CDR 2 · N Empréstimo · O Data de Saída · P Data de Entrada · Q Requisitante · R Restauro.

### Mapeamento coluna → campo da entrada
| Campo | Origem |
|---|---|
| `autor` | Autor / Entidade Responsável |
| `descricao` | Título e Descrição do Documento |
| `localizacao` | **Local (coluna C)** — ver nota abaixo |
| `local` | Local (guardado também, mas sem UI na Cartografia) |
| `ano` | Data |
| `tipo`, `cor`, `dimensao` | derivados de "Outras Informações Físicas" (`parseFisica`: dimensão após o último `;` se tiver `NxN`/`cm`; `tipo : cor` pelo último ` : `) |
| `notas` | Outras Descrições (texto integral) |
| `assuntos` | Palavras-chave / Assuntos |
| `tb`, `cota`, `cdr` | TB, Cota, CDR |
| `nrRegisto` | coluna "Nº Registo" se existir (o ficheiro exportado pelo SIGAT inclui-a); senão fica vazio e a correspondência usa cota+descrição |
| `cabecalho` | derivado: `autor` (exceto "S.A."/vazio) senão título em maiúsculas extraído de `descricao` |
| `estado`, empréstimo | coluna Empréstimo = `sim`/`s` (+ Data de Saída, Requisitante) → proposta de empréstimo `origem=importacao`; o estado é gerido no SIGAT |
| `numero` (= `sourceEntryNumber` na API) | "ID SIGAT", por coleção, monotónico; as mutações usam o `id` (UUID) |

Colunas sem campo (TB 2, MP, CDR 2, Restauro…) propostas como **campos novos** no assistente (ou ignoradas).

> **Localização (decisão 2026-11):** a Localização vem da coluna "Local" (C). As restantes "Outras Descrições" ficam em `notas`.

### Avisos e erros da importação
Erro (linha ignorada): campo obrigatório de descrição/título em falta. Duplicados no ficheiro, ambíguos e ausentes são categorias da pré-visualização (ver [features.md](features.md)); a qualidade dos dados (sem cota, sem autor…) é vista no Painel.

### Nº de Registo (`nrRegisto`)
Usado como 2.º critério de correspondência ([src/import/corresponder.js](../src/import/corresponder.js)): ID SIGAT → `nrRegisto` → cota+descrição normalizadas (remove "Cota:", "CMLEO", espaços) → descrição única → cota única. Cada documento só casa com uma linha.

## ATURB (Arquivo Técnico de Urbanismo)
Folha `PDF Site` (ou a primeira com cabeçalhos reconhecidos); agora também **por nome de cabeçalho**. Campos: `autor`, `titulo`, `local`, `data`, `caixaNr` (cabeçalho "Caixa nº" normaliza para `caixano`); a coluna Estado do ficheiro é ignorada. Outras colunas/folhas de `bdarquivotecnico.xlsx` podem ser importadas como campos novos.

## Campos de sistema do documento
`estado` (`-`, `Arquivo`, `Em Consulta`, `Empréstimo`), `estadoMeta` (empréstimo ativo), `estadoChangedAt/By`, `createdAt/By`, `updatedAt/By`, `deletedAt/By`.

## Histórico, lixo
- Tabela `historico`: ações `criar|editar|eliminar|restaurar|estado|emprestimo|devolucao|prolongar|importar|exportar` (a API devolve `create|edit|delete|restore|estado|export` em inglês para as primeiras e as restantes tal qual). `editar` guarda só `alteracoes:{campo:{de,para}}`. Mais recente primeiro.
- Eliminar = soft-delete (`eliminado_em`); restaurar limpa-o. Não há eliminação definitiva.
- Ação `anexo` (detalhes `{operacao, nome}`) regista anexos adicionados/removidos. Entradas mais antigas que `historico_retencao_dias` são removidas (se > 0).

## Anexos, carrinho, configuração e auditoria
- `anexos`: por documento; `tipo` `ficheiro` (em `data/anexos/`, com `miniatura` opcional) ou `ligacao` (URL http/https).
- `carrinhos`: (utilizador, documento) pessoal; cascata ao apagar utilizador.
- `configuracoes`: chave/valor; valores por omissão e limites em `src/config.js`.
- `auditoria`: eventos de segurança/administração (login, falhas, bloqueios, recuperações, config, cópias, SSO), independentes do Histórico.
- `recuperacoes`: pedidos/códigos (só hash) de recuperação de password. `utilizadores` ganhou `tentativas_falhadas`, `bloqueado_ate`, `password_alterada_em`, `origem` (`local`/`sso`), `sessao_versao`.
