# Arquitetura

## Stack
- Backend: Node.js 22, Express 5, `better-sqlite3`, `multer` (upload em memória, limite 20 MB), `bcryptjs`, `jsonwebtoken`, `cors`, `xlsx` (SheetJS 0.20.3).
- Frontend: Vue 3 (Composition API, `<script setup>`), Vite 5, CSS próprio em `frontend/src/style.css` + estilos inline no `App.vue`. Sem UI lib, sem router, sem Pinia.
- Testes: `npm test` (`node --test`, ficheiros em `test/`; usa `SIGAT_DATA_DIR` temporário). `xlsx` = SheetJS 0.20.3 instalado do CDN oficial (`npm install --allow-remote=all <url>`; o npm 12 bloqueia tarballs remotos por omissão).

## Estrutura
```
server.js                 API + estáticos + bootstrap do armazenamento
src/parserCartografiaXlsx.js  Parser xlsx Cartografia (folha BD) — será generalizado na Fase 4
src/parserXlsx.js         Parser xlsx ATURB (folha "PDF Site")
src/parser.js             Parser TXT legado (sem uso desde a Fase 2)
frontend/                 Fonte Vue (index.html, vite.config.js, src/App.vue, main.js, style.css, components/, api.js)
public/                   Build do frontend (versionado) servido por express.static
data/                     sigat.db (gitignored)
Mapa.txt                  Fonte TXT antiga da cartografia (referência/histórico)
Dockerfile, docker-compose.yml
```
Na raiz podem existir ficheiros xlsx de trabalho (`Cartografia GEO - BD.xlsx`, `bdarquivotecnico.xlsx`, `relatorio_problemas_BD.xlsx`) e `sigat.7z`: são material de trabalho, não código.

## Build e execução
```bash
npm install
npm run build:client   # vite build --config frontend/vite.config.js -> public/
npm start              # node server.js, porta 3000 (env PORT)
npm run dev:client     # vite dev server (frontend)
```
Docker: `docker compose up --build` (porta 3000, volume `./data:/app/data`, `restart: unless-stopped`). O Dockerfile **não** executa o build do frontend: usa o `public/` já commitado. Não há lint.

## Variáveis de ambiente
- `PORT` (default 3000)
- `JWT_SECRET` (default inseguro `sigat-dev-secret-change-me`; o `docker-compose.yml` define outro valor fixo, também a trocar)

## Armazenamento (`data/`)
SQLite (`better-sqlite3` 13, requer Node ≥ 22; a imagem Docker usa `node:22-alpine`, os binários pré-compilados incluem musl). Ficheiro `data/sigat.db` (WAL, `foreign_keys=ON`), criado e migrado no arranque (`src/db/index.js` aplica `src/db/migrations/*.sql` por ordem). Variável `SIGAT_DATA_DIR` muda a pasta.
- Tabelas: `utilizadores`, `colecoes` (`cartografia`, `aturb`), `campos` (definição por coleção), `documentos` (campos em JSON `dados`; `dados_importados` = base da fusão a 3 vias), `emprestimos`, `consultas`, `historico` (só diffs), `importacoes`, `importacao_itens`.
- Uma coleção por tipo (não há "fontes de dados" múltiplas). `numero` por coleção é monotónico (inclui eliminados) e é o "ID SIGAT".
- SQL isolado em `src/db/repos/*` (para poder trocar de motor); rotas em `src/routes/*`.
- Dados antigos (JSON): `node scripts/migrar-json-para-sqlite.js` (simula) e `--aplicar` (grava e move os JSON para `data/legacy/`; escreve `data/relatorio-migracao-AAAA-MM-DD.md`). Canonical por omissão: Cartografia = "Cartografia GEO - BD", ATURB = "arquivo2026"; recupera edições, estados e histórico das outras fontes.
- Backup a quente: `sqlite3 data/sigat.db ".backup 'copia.db'"` ou copiar a pasta `data/` com o servidor parado.

## Estrutura de código
```
server.js            bootstrap Express (exporta app + ensureStorage)
src/auth.js          JWT, authMiddleware, requireRole, comErros
src/routes/          users.js (auth+utilizadores), documentos.js (coleções, campos, documentos, exportação, histórico)
src/db/              index.js, migrations/, repos/{campos,documentos,emprestimos,historico,utilizadores}.js
src/search.js        normalização, relevância (puro)
src/query.js         filtro+ordenação de entradas (puro)
src/export.js        xlsx/csv
src/import/corresponder.js  correspondência ficheiro ↔ documentos
src/campos.js        definição inicial dos campos (semente)
scripts/             migrar-json-para-sqlite.js
test/                node:test
```
- Utilizador `admin`/`admin123` criado no arranque se não existirem utilizadores.

## Fluxo de um pedido
`Browser (App.vue, apiFetch com Bearer)` → `authMiddleware` (JWT) → `requireRole` (quando aplicável) → repositório (SQLite + cache em memória por coleção) → filtro/sort/paginação em memória (`src/query.js`) → resposta JSON.
Qualquer rota não-API devolve `public/index.html` (SPA fallback); `/api/*` desconhecido devolve 404 JSON.
