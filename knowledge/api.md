# API REST

Base: `/api`. JSON, erros no formato `{ message }`. Auth: `Authorization: Bearer <jwt>` (payload `{sub, username, role}`, expira 8h). Todas as rotas exigem token exceto `health` e `login`.

| Método | Rota | Role | Notas |
|---|---|---|---|
| GET | `/health` | — | |
| POST | `/auth/login` | — | `{username,password}` → `{token,user}`; username case-insensitive |
| GET | `/auth/me` | any | |
| GET | `/bootstrap` | any | user + lista de datasets |
| GET | `/users` | admin | |
| POST | `/users` | admin | `{username,password,role}`; 409 se existir |
| PATCH | `/users/:id/password` | admin | mínimo 4 caracteres |
| DELETE | `/users/:id` | admin | não pode apagar-se a si próprio |
| GET | `/datasets` | any | ordenados por upload desc; `active` marcado |
| POST | `/datasets/upload` | admin,write | multipart `file` (+`name`); xlsx Cartografia (ou txt legado) |
| POST | `/datasets/upload-aturb` | admin,write | multipart `file` xlsx |
| POST | `/datasets/:id/activate` | any | define `activeDatasetId` |
| PATCH | `/datasets/:id` | admin,write | renomear |
| DELETE | `/datasets/:id` | admin,write | apaga registo e ficheiro; ativo passa ao primeiro restante |
| GET | `/datasets/:id/errors` | any | `{parseErrors, parseWarnings}` |
| GET | `/entries` | any | ver abaixo; `datasetId` obrigatório |
| GET | `/entries/distinct` | any | `datasetId`, `field`, `q?` → `{suggestions}` |
| POST | `/entries/:datasetId` | admin,write | cria; `sourceEntryNumber = max+1`, `estado '-'` |
| PUT | `/entries/:datasetId/:sourceEntryNumber` | admin,write | merge de campos não vazios |
| PATCH | `/entries/:datasetId/estado` | admin,write | `{sourceEntryNumber, estado, estadoMeta?}` |
| DELETE | `/entries/:datasetId/:sourceEntryNumber` | admin,write | soft-delete |
| POST | `/entries/:datasetId/:sourceEntryNumber/restore` | admin,write | |
| GET | `/entries/:datasetId/deleted` | any | lixo |
| GET | `/history/:datasetId` | any | mais recente primeiro |

## `GET /entries`
Query: `datasetId`, `page`, `pageSize` (máx 100), `q`, `sortKeys` (ex.: `cota:asc,autor:desc`), mais filtros por campo.
- Cartografia: `cabecalho, descricao, notas, localizacao, assuntos, cota, cdr, tb, nrRegisto, autor, ano, tipo, cor, dimensao, estado`. Numéricos (match exato do número): `cota, cdr, tb, nrRegisto`. Restantes: substring, case-insensitive.
- ATURB: `autor, titulo, local, data, caixaNr, estado` (`caixaNr` numérico).
- O tipo de filtros é decidido por `dataset.type`.
- Resposta: `{ activeDataset, total, page, pageSize, items }`.

## Notas de implementação
- `sourceEntryNumber` é a chave da entrada (única por dataset). Cuidado: ao criar usa `max+1` sobre `entries` apenas (não considera o lixo) → pode colidir com uma entrada eliminada e depois restaurada.
- Rotas definidas em `server.js` por ordem; `/entries/distinct` e `/entries/:datasetId/deleted` são GET e não colidem com as rotas com parâmetros de escrita.
