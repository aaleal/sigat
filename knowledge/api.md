# API REST

Base: `/api`. JSON, erros no formato `{ message, erros? }` (`erros` = mensagens por campo em validações). Auth: `Authorization: Bearer <jwt>` (payload `{sub, username, role}`, expira 8h). Todas as rotas exigem token exceto `health` e `login`.

## Modelo de resposta de um documento ("entrada")
Objeto plano: campos da coleção (`cabecalho`, `descricao`, `cota`…) + `id` (UUID, usar nas mutações), `numero` (= `sourceEntryNumber`, "ID SIGAT" visível, nunca reutilizado), `colecao`, `estado`, `estadoMeta` (empréstimo ativo: `{emprestimoId, requisitante, entidade, dataSaida, dataPrevista, registadoPor}` ou `null`), `createdAt/By`, `updatedAt/By`, `estadoChangedAt/By`, `deletedAt/By`. As respostas de listas vêm de uma cache em memória por coleção (invalidada em cada escrita): não alterar os objetos.

## Rotas
| Método | Rota | Role | Notas |
|---|---|---|---|
| GET | `/health` | — | |
| POST | `/auth/login` | — | `{username,password}` → `{token,user}`; username case-insensitive |
| GET | `/auth/me` | any | |
| GET/POST | `/users` | admin | criar: `{username,password,role}`; 409 se existir |
| PATCH | `/users/:id/password` | admin | mínimo 4 caracteres |
| DELETE | `/users/:id` | admin | não pode apagar-se a si próprio |
| GET | `/colecoes` | any | `[{id, nome, total}]` (`cartografia`, `aturb`) |
| GET | `/colecoes/:colecao/campos` | any | definição dos campos (rótulo, peso, numérico, obrigatório, aliases…) |
| POST | `/colecoes/:colecao/campos` | admin | `{rotulo,…}` cria campo novo (chave derivada do rótulo) |
| PATCH | `/colecoes/:colecao/campos/:chave` | admin | rótulo, visivelTabela, pesquisavel, numerico, peso, aliases |
| GET | `/colecoes/:colecao/documentos` | any | pesquisa paginada (ver abaixo) |
| GET | `/colecoes/:colecao/documentos/distinct` | any | `field`, `q?` → `{suggestions}` |
| GET | `/colecoes/:colecao/exportar` | any | mesmos parâmetros da pesquisa (sem paginação) + `formato=xlsx|csv`, `colunas=a,b`, `ids=1,2` (números); regista `exportar` no histórico |
| POST | `/colecoes/:colecao/documentos` | admin,write | cria; valida obrigatórios; ignora campos desconhecidos |
| GET | `/colecoes/:colecao/eliminados` | admin,write | lixo |
| GET | `/colecoes/:colecao/historico` | admin,write | mais recente primeiro |
| GET | `/documentos/:id` | any | detalhe |
| GET | `/documentos/:id/historico` | admin,write | |
| PUT | `/documentos/:id` | admin,write | merge; `''` limpa um campo; não permite esvaziar um obrigatório já preenchido |
| PATCH | `/documentos/:id/estado` | admin,write | `{estado}` = `-`, `Arquivo` ou `Em Consulta`; `Empréstimo` → 400 e sair de `Empréstimo` → 409 (usar as rotas de empréstimos) |
| GET | `/emprestimos` | any | `estado=ativo|atraso|sem_prazo|devolvido|todos`, `colecao`, `requisitante`, `de`, `ate` (data de saída), `page`, `pageSize`; itens com `situacao` (`ativo`, `em_atraso`, `sem_prazo`, `devolvido`, `devolvido_com_atraso`), `diasAtraso`, `documento` |
| GET | `/emprestimos/resumo` | any | `{ativos, emAtraso, aVencer7dias, semPrazo}` (opcional `colecao`) |
| GET | `/emprestimos/requisitantes` | any | sugestões |
| GET | `/emprestimos/exportar` | any | mesmos filtros + `formato=xlsx|csv` |
| GET | `/documentos/:id/emprestimos` | any | histórico de empréstimos do documento |
| POST | `/documentos/:id/emprestimos` | admin,write | `{requisitante, entidade?, contacto?, dataSaida?, dataPrevista?, observacoes?}`; `dataPrevista` omitida = +prazo por omissão, `''` = sem prazo; 409 se já houver ativo |
| POST | `/emprestimos/:id/devolver` | admin,write | `{dataDevolucao?, observacoes?}`; documento passa a `Arquivo` |
| PATCH | `/emprestimos/:id` | admin,write | prolongar/corrigir (`dataPrevista`, `requisitante`, `entidade`, `contacto`, `observacoes`); só emprestimos ativos |
| DELETE | `/documentos/:id` | admin,write | soft-delete; 409 se emprestado |
| POST | `/documentos/:id/restaurar` | admin,write | |
| POST | `/colecoes/:colecao/importacoes` | admin | multipart `file` (.xlsx); guarda o ficheiro em `data/importacoes/` e devolve `{importacao, folha, totalLinhas, cabecalhos[{indice,rotulo,amostra}], mapeamento (proposta), campos}`; cancela pré-visualizações pendentes |
| PUT | `/importacoes/:id/mapeamento` | admin | `{mapeamento:{indiceColuna:{destino, campo?, rotulo?}}}` → compara e devolve `{importacao, resumo}`; destinos: `campo`, `novo`, `idSigat`, `fisica`, `emp_flag`, `emp_saida`, `emp_entrada`, `emp_requisitante`, `ignorar` |
| GET | `/importacoes`, `/importacoes/:id` | admin | histórico; detalhe + contagens por ação |
| GET | `/importacoes/:id/itens` | admin | `acao=novo|alterado|conflito|igual|ambiguo|duplicado_ficheiro|erro|ausente`, `page`, `pageSize` |
| PATCH | `/importacoes/:id/itens/:linha` | admin | decisão: `{escolhas:{campo:'sigat'|'ficheiro'}}`, `{ignorar}`, `{criar}`, `{ignorarEmprestimo}`; em ambíguos `{documentoId}` ou `{criar:true}` |
| POST | `/importacoes/:id/decisoes` | admin | `{escolha:'sigat'|'ficheiro', ambito:'conflitos'}` |
| POST | `/importacoes/:id/aplicar` | admin | transação única; 409 se houver ambíguos por resolver ou documentos alterados entretanto |
| DELETE | `/importacoes/:id` | admin | cancela |

## `GET /colecoes/:colecao/documentos`
Query: `page`, `pageSize` (máx 100), `q`, `sortKeys` (ex.: `cota:asc,autor:desc`), `vazios` (ex.: `cota,autor` → só documentos com esses campos vazios), `ids` (lista de `numero`), filtros por campo (qualquer chave da definição de campos; numéricos = número exato: `cota, cdr, tb, nrRegisto, caixaNr`; restantes: substring sem acentos/maiúsculas).
- `q` (src/search.js): ignora acentos/maiúsculas; todos os termos têm de casar (AND) por palavra, prefixo ou substring; termo só com dígitos = número exato; `"frase exata"`; `-termo` exclui. Sem `sortKeys`, ordena por relevância (pesos por campo) e a resposta traz `ordenacao: 'relevancia'`.
- Resposta: `{ colecao, total, page, pageSize, ordenacao, items }`.

## Notas
- Rotas legadas `/datasets*`, `/entries*`, `/history/*` foram removidas na Fase 2.
- Persistência e validação em `src/db/repos/*`; as rotas em `src/routes/*` não têm SQL.
