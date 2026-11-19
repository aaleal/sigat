# SIGAT — Base de conhecimento (para agentes)

Ler este ficheiro primeiro. Mantê-lo atualizado ao alterar o projeto (ver "Manutenção" no fim).

## O que é o SIGAT
Aplicação web interna para **pesquisar, consultar e gerir o inventário de um arquivo** (Banco/CML: cartografia e arquivo técnico de urbanismo). Os dados vêm de ficheiros Excel (`.xlsx`) carregados na aplicação; não há base de dados relacional.

Idioma da UI, mensagens de erro da API e dados: **português (pt-PT)**. Manter.

## Índice
| Ficheiro | Conteúdo |
|---|---|
| [architecture.md](architecture.md) | Stack, estrutura de pastas, build, deploy, armazenamento |
| [data-model.md](data-model.md) | Tipos de dataset, campos, mapeamento xlsx → campos, importação, Nº Registo |
| [features.md](features.md) | Funcionalidades por ecrã, perfis/permissões, estados |
| [api.md](api.md) | Endpoints REST, autenticação, filtros, ordenação |
| [decisions.md](decisions.md) | Decisões de design e o porquê |
| [limitations.md](limitations.md) | Limitações conhecidas, dívida técnica, riscos de segurança |
| [human_report.md](human_report.md) | Relatório para o negócio (utilizadores finais) |

## Resumo em 10 linhas
1. Backend: `server.js` (Node 20 + Express 5), único ficheiro; API REST em `/api/*`, serve também o frontend estático de `public/`.
2. Frontend: Vue 3 + Vite, **um único componente** `frontend/src/App.vue` (~3500 linhas), sem router nem store (navegação por `currentPage`).
3. Build do frontend gera `public/` (que **está versionado no git**). Depois de alterar `frontend/`, correr `npm run build:client`.
4. Persistência: ficheiros JSON em `data/` (gitignored; volume Docker).
5. Dois tipos de dataset: `cartografia` (xlsx folha `BD`) e `aturb` (xlsx folha `PDF Site`).
6. Auth: JWT (8h) em `Authorization: Bearer`, token guardado em `localStorage` (`sigat_token`). Roles: `admin`, `write`, `read`.
7. Pesquisa/filtros/ordenação/paginação são feitos **no servidor**, em memória, sobre o JSON completo do dataset.
8. Edição: criar/editar/eliminar (lixo com restauro) entradas, alterar **estado** (Arquivo / Em Consulta / Empréstimo), histórico de auditoria por dataset.
9. "Impressão PDF": carrinho de entradas → janela de impressão do browser.
10. Credencial inicial `admin` / `admin123` (criada se `data/users.json` não existir).

## Armadilhas frequentes
- O `README.md` da raiz está **desatualizado** (descreve o fluxo antigo por TXT/ID1..ID9). A fonte de verdade é esta pasta e o código.
- `src/parser.js` (TXT) é **legado**: ainda importado por `server.js` mas a UI só aceita xlsx.
- Cartografia: campo **Localização = coluna "Local" (C)** do xlsx; **Cota** = coluna "Cota". Já houve bug em que ambos mostravam a cota (modal e tabela). Ver [data-model.md](data-model.md).
- Datasets já importados guardam os campos já processados: alterar um parser **não** altera dados existentes; é preciso reimportar.
- `public/` é artefacto de build commitado: não editar à mão.

## Manutenção
Ao mudar comportamento, atualizar o ficheiro relevante aqui e a secção "Decisões" quando houver um "porquê" novo.
