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
| `nrRegisto` | coluna "Nº Registo" se existir; senão reaproveitado (ver abaixo) |
| `cabecalho` | derivado: `autor` (exceto "S.A."/vazio) senão título em maiúsculas extraído de `descricao` |
| `estado`, `estadoMeta` | coluna Empréstimo = `sim`/`s` → `Empréstimo` + `{dataSaida, requisitante, registadoPor:'importação'}`; senão `-` |
| `sourceEntryNumber` | sequencial (1..n) por dataset; **identificador da entrada** em todas as rotas |

Não importadas: TB 2, MP, CDR 2, Data de Entrada, Restauro.

> **Localização (decisão 2026-11):** a Localização passou a vir da coluna "Local" (C). Antes era extraída de "Outras Descrições" (só trechos com `DMPGU`/`Incorporação`), o que perdia resultados. Esses textos ficam agora em `notas`. Bug relacionado corrigido: o modal e a coluna da tabela "Localização" mostravam `cota`.

### Avisos e erros do parse
- Erro (linha ignorada): sem Título/Descrição.
- Avisos: sem autor, sem cota, sem assuntos, assuntos que parecem cota/CDU (`looksLikeShelfmark`), título só numérico, linha duplicada.
- Upload só falha (400) se houver erros **e** zero entradas. Caso contrário devolve 201 com `errors`/`warnings`, que ficam em `parseErrors`/`parseWarnings` e são consultáveis em Fontes de Dados.

### Nº de Registo (`nrRegisto`)
O xlsx atual **não tem** esta coluna. Quando falta, `attachNrRegisto` copia-o do dataset de cartografia mais recente com entradas (referência), casando por **descrição normalizada + cota normalizada** (remove "Cota:", "CMLEO", espaços); fallback só por descrição; fallback só por cota se único. Cada entrada de referência é usada uma só vez. Entradas sem correspondência geram aviso "Sem Nº de Registo". Se não houver dataset de referência, ficam sem nº.

### Parser TXT legado (`src/parser.js`)
Blocos separados por linha em branco: linha 1 cabeçalho, linha 2 descrição, `Cota:`, CDR, TB, localização (`DMPGU|Incorporação`), assuntos (linha com `/`), notas (resto), nº registo (≥4 dígitos no fim). `parseDescricao` extrai autor/ano/tipo/cor/dimensão da descrição ISBD. Ainda aceite por `POST /api/datasets/upload` (`.txt`) mas a UI não o oferece.

## ATURB (Arquivo Técnico de Urbanismo)
Parser: [src/parserXlsx.js](../src/parserXlsx.js). Folha `PDF Site` (ou a primeira). Layout **posicional**: linha 1 vazia, 2 título, 3 cabeçalhos, dados a partir da linha 4.
Colunas: A `autor`, B `titulo`, C `local`, D `data`, E `caixaNr`, F `estado` (default `-`). Aviso se `titulo` vazio. Ficheiro de origem de referência: `bdarquivotecnico.xlsx` (tem muitas outras folhas/colunas que **não** são importadas).

## Campos comuns adicionados pela app
`estado` (`-`, `Arquivo`, `Em Consulta`, `Empréstimo`), `estadoMeta` (`{dataSaida, registadoPor}` para empréstimo), `estadoChangedAt/By`, `createdAt/By`, `updatedAt/By`, `deletedAt/By`, `restoredAt/By`.

## Histórico, lixo
- `history[]` por dataset: `{ id, action: create|edit|delete|restore|estado, timestamp, user, entryRef:{sourceEntryNumber, cabecalho|titulo}, details }`. `edit` guarda `prev` e `next` completos; `estado` guarda `prevEstado/newEstado/estadoMeta`. Devolvido do mais recente para o mais antigo.
- Eliminar = soft-delete para `deletedEntries[]`; restaurar devolve-a a `entries`. Não há eliminação definitiva de entradas.
- Apagar um dataset remove também o ficheiro (incluindo lixo e histórico).
