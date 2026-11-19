# SIGAT — Base de conhecimento (para agentes)

Ler este ficheiro primeiro. Mantê-lo atualizado ao alterar o projeto (ver "Manutenção" no fim).

## O que é o SIGAT
Aplicação web interna para **pesquisar, consultar e gerir o inventário de um arquivo** (Banco/CML: cartografia e arquivo técnico de urbanismo). Os dados são mantidos numa base SQLite e atualizados a partir de ficheiros Excel (`.xlsx`) através de um fluxo de importação incremental.

Idioma da UI, mensagens de erro da API e dados: **português (pt-PT)**. Manter.

## Índice
| Ficheiro | Conteúdo |
|---|---|
| [architecture.md](architecture.md) | Stack, estrutura de pastas, build, deploy, base de dados |
| [data-model.md](data-model.md) | Campos, mapeamento xlsx → campos, histórico do modelo antigo |
| [features.md](features.md) | Funcionalidades por ecrã, perfis/permissões, estados, empréstimos, importações, painel |
| [api.md](api.md) | Endpoints REST |
| [decisions.md](decisions.md) | Decisões de design e o porquê |
| [limitations.md](limitations.md) | Limitações conhecidas e dívida técnica |
| [human_report.md](human_report.md) | Relatório para o negócio (utilizadores finais) |
| [plano-melhorias.md](plano-melhorias.md) | Plano de implementação das melhorias (concluído; contém o desenho e as decisões D1–D8) |

## Resumo em 10 linhas
1. Backend: `server.js` (Node 22 + Express 5) monta routers de `src/routes/*`; SQL só em `src/db/repos/*`; regras de pesquisa em `src/search.js`/`src/query.js`; importação em `src/import/*`.
2. Frontend: Vue 3 + Vite; `frontend/src/App.vue` (monolítico, ~3000 linhas) + componentes novos em `frontend/src/components/` (Painel, Emprestimos, Importacoes, EstadoControlo, modais, ExportarBotao).
3. `public/` (build) **está versionado**; depois de alterar `frontend/`, correr `npm run build:client`.
4. Persistência: SQLite `data/sigat.db` (gitignored). Duas coleções fixas: `cartografia` e `aturb`; documentos com campos em JSON e campos definidos na tabela `campos` (extensíveis na importação).
5. Identificador visível: `numero` ("ID SIGAT"), por coleção, nunca reutilizado; identificador interno `id` (UUID) usado nas rotas de mutação.
6. Auth: JWT (duração configurável, 8h) + role lido da BD em cada pedido (`admin`, `write`, `read`); password inicial provisória obriga a troca; política de passwords, bloqueio de conta, recuperação por código do admin, SSO opcional por proxy; parâmetros em `configuracoes` (página Administração), cópias automáticas em `data/backups`, anexos (imagens) em `data/anexos`, carrinho de impressão por utilizador no servidor.
7. Empréstimos têm tabela própria (prazo, devolução, atraso, alertas); estado `Empréstimo` só se muda por essas rotas.
8. Importação a partir do Excel: mapear colunas → comparar (fusão a 3 vias) → decidir → aplicar numa transação; preserva estados, empréstimos e edições.
9. Painel (página inicial): indicadores, mais consultados, qualidade dos dados, duplicados.
10. Testes: `npm test` (node:test, BD temporária via `SIGAT_DATA_DIR`).

## Armadilhas frequentes
- `public/` é artefacto de build commitado: não editar à mão.
- Nos testes, passwords novas têm de cumprir a política (letras+números, ≥8); trocar a password invalida o token antigo (usar o `token` devolvido).
- `sourceEntryNumber` nas respostas é um alias de `numero`; as mutações usam `id`.
- Documentos migrados do JSON com edições têm `dados_importados` nulo: diferenças na 1.ª importação são conflitos.
- `better-sqlite3` 13 exige Node ≥ 22; `xlsx` (SheetJS 0.20.3) instala-se do CDN oficial (`npm install --allow-remote=all <url>` com npm 12).
- Ao editar `App.vue` com substituições de texto, evitar `oldString` com linhas de traços (`───`): a contagem de caracteres falha.

## Manutenção
Ao mudar comportamento, atualizar o ficheiro relevante aqui e a secção "Decisões" quando houver um "porquê" novo.
