# SIGAT — Sistema de Informação do Arquivo

Aplicação web interna para pesquisar, consultar e gerir o inventário de um arquivo (Cartografia e Arquivo Técnico de Urbanismo — ATURB): estados, empréstimos com prazos e alertas, exportação para Excel/CSV, painel de indicadores e atualização incremental a partir de ficheiros Excel.

## Stack
- Backend: Node.js 22 + Express 5, SQLite (`better-sqlite3`), JWT.
- Frontend: Vue 3 + Vite (build estático em `public/`, servido pelo backend).
- Documentação técnica e de negócio: [knowledge/](knowledge/README.md).

## Arranque local (sem Docker)
Requisitos: Node.js 22+. A base de dados é um ficheiro SQLite embebido (`data/sigat.db`), criado e migrado automaticamente no arranque — não é preciso instalar nem iniciar nenhum serviço de BD.
```bash
npm install
npm start              # http://localhost:3000 (o frontend já vem compilado em public/)
npm test               # testes (node:test)
```
O `public/` está versionado, por isso só é preciso `npm run build:client` depois de alterar o frontend.

Desenvolvimento do frontend (com hot reload): em dois terminais, `npm start` (API em :3000) e `npm run dev:client` (http://localhost:5173, com proxy de `/api` para :3000).

Variáveis: `PORT` (3000), `JWT_SECRET` (obrigatório em produção), `SIGAT_DATA_DIR` (pasta da base de dados, por omissão `./data`), `SIGAT_PRAZO_EMPRESTIMO_DIAS` (30).

## Docker (opcional)
```bash
docker compose up --build
```
Porta 3000, dados em `./data` (volume). A imagem corre como utilizador `node` (uid 1000): a pasta `data/` do anfitrião tem de ser gravável por esse utilizador (`chown -R 1000:1000 data`). Definir um `JWT_SECRET` próprio no `docker-compose.yml`.

Com Podman rootless: `podman-compose up --build -d` (o `docker-compose.yml` inclui `x-podman.uidmaps`/`gidmaps` para que o `node` do contentor seja o dono de `./data` no anfitrião).

## Primeiro acesso
Utilizador `admin` / `admin123`: a aplicação obriga a definir uma nova password (mínimo 8 caracteres) no primeiro login.

## Dados antigos (versão com ficheiros JSON)
```bash
node scripts/migrar-json-para-sqlite.js            # simulação + relatório
node scripts/migrar-json-para-sqlite.js --aplicar  # grava em data/sigat.db e move os JSON para data/legacy/
```
Faça uma cópia de `data/` antes. Ver [knowledge/architecture.md](knowledge/architecture.md).

## Atualizar a partir de Excel
Menu **Importações** (admin): carregar o `.xlsx`, mapear colunas, comparar, decidir diferenças/conflitos e aplicar. Estados, empréstimos e edições feitas na aplicação são preservados. Detalhes em [knowledge/features.md](knowledge/features.md).

## Backup
Com o servidor parado, copiar a pasta `data/`; a quente: `sqlite3 data/sigat.db ".backup 'copia.db'"`.
