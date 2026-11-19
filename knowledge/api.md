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
| PATCH | `/documentos/:id/estado` | admin,write | `{estado, estadoMeta?}`; ponte temporária: `Empréstimo` cria empréstimo (ver Fase 3 do plano) |
| DELETE | `/documentos/:id` | admin,write | soft-delete; 409 se emprestado |
| POST | `/documentos/:id/restaurar` | admin,write | |

## `GET /colecoes/:colecao/documentos`
Query: `page`, `pageSize` (máx 100), `q`, `sortKeys` (ex.: `cota:asc,autor:desc`), `vazios` (ex.: `cota,autor` → só documentos com esses campos vazios), `ids` (lista de `numero`), filtros por campo (qualquer chave da definição de campos; numéricos = número exato: `cota, cdr, tb, nrRegisto, caixaNr`; restantes: substring sem acentos/maiúsculas).
- `q` (src/search.js): ignora acentos/maiúsculas; todos os termos têm de casar (AND) por palavra, prefixo ou substring; termo só com dígitos = número exato; `"frase exata"`; `-termo` exclui. Sem `sortKeys`, ordena por relevância (pesos por campo) e a resposta traz `ordenacao: 'relevancia'`.
- Resposta: `{ colecao, total, page, pageSize, ordenacao, items }`.

## Notas
- Rotas legadas `/datasets*`, `/entries*`, `/history/*` foram removidas na Fase 2.
- Persistência e validação em `src/db/repos/*`; as rotas em `src/routes/*` não têm SQL.
