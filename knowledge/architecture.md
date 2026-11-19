# Arquitetura

## Stack
- Backend: Node.js 20, Express 5, `multer` (upload em memória, limite 20 MB), `bcryptjs`, `jsonwebtoken`, `cors`, `xlsx` (SheetJS 0.18.5).
- Frontend: Vue 3 (Composition API, `<script setup>`), Vite 5, CSS próprio em `frontend/src/style.css` + estilos inline no `App.vue`. Sem UI lib, sem router, sem Pinia.
- Testes: `npm test` (`node --test`, ficheiros em `test/`; usa `SIGAT_DATA_DIR` temporário). `xlsx` = SheetJS 0.20.3 instalado do CDN oficial (`npm install --allow-remote=all <url>`; o npm 12 bloqueia tarballs remotos por omissão).

## Estrutura
```
server.js                 API + estáticos + bootstrap do armazenamento
src/parserCartografiaXlsx.js  Parser xlsx Cartografia (folha BD) + attachNrRegisto
src/parserXlsx.js         Parser xlsx ATURB (folha "PDF Site")
src/parser.js             Parser TXT legado (blocos separados por linha em branco)
frontend/                 Fonte Vue (index.html, vite.config.js, src/App.vue, main.js, style.css)
public/                   Build do frontend (versionado) servido por express.static
data/                     Armazenamento JSON (gitignored)
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
Docker: `docker compose up --build` (porta 3000, volume `./data:/app/data`, `restart: unless-stopped`). O Dockerfile **não** executa o build do frontend: usa o `public/` já commitado. Não há testes automáticos nem lint.

## Variáveis de ambiente
- `PORT` (default 3000)
- `JWT_SECRET` (default inseguro `sigat-dev-secret-change-me`; o `docker-compose.yml` define outro valor fixo, também a trocar)

## Armazenamento (`data/`)
- `users.json`: `[{ id, username, role, passwordHash, createdAt }]`. Criado no arranque com `admin`/`admin123` se não existir.
- `datasets.json`: `{ activeDatasetId, datasets: [{ id, name, type, uploadedAt, uploadedBy, entryCount, parseErrorCount, sizeBytes }] }`.
- `datasets/<id>.json`: `{ id, name, type?, entries[], parseErrors[], parseWarnings[], deletedEntries[], history[] }`.
- Cada pedido lê/escreve o JSON inteiro (`readJson`/`writeJson`). Escrita **não é atómica** nem há locking.

## Fluxo de um pedido
`Browser (App.vue, apiFetch com Bearer)` → `authMiddleware` (JWT) → `requireRole` (quando aplicável) → leitura do JSON → filtro/sort/paginação em memória → resposta JSON.
Qualquer rota não-API devolve `public/index.html` (SPA fallback); `/api/*` desconhecido devolve 404 JSON.
