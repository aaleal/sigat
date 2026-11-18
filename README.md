# SIGAT

Sistema de informação web para gestão e pesquisa de entradas cartográficas a partir de ficheiros TXT.

## Funcionalidades

- Login obrigatório para acesso ao sistema.
- Gestão de utilizadores (apenas role `admin`): criar e apagar utilizadores (`read`, `write`, `admin`).
- Upload de ficheiros `.txt` com validação do formato por entrada (ID1..ID9).
- Indicação das secções com erro quando o formato está incorreto.
- Gestão de múltiplas fontes de dados carregadas:
  - listar metadata (data upload, nome, volume de dados),
  - editar nome da fonte,
  - apagar fonte.
- Consulta/Pesquisa com seleção obrigatória da fonte de dados antes de pesquisar.
- Gestão de contas (apenas role `admin`): criar utilizadores, apagar utilizadores e alterar password.

## Stack

- Backend/API: Node.js + Express
- Frontend: Vue 3 + Vite (build estático servido pelo backend)
- Armazenamento: ficheiros JSON em `data/` (sem base de dados relacional)

## Arranque local (sem Docker)

```bash
npm install
npm run build:client
npm start
```

Para desenvolvimento do frontend (Vite dev server):

```bash
npm run dev:client
```

Aplicação disponível em: `http://localhost:3000`

## Arranque com Docker

```bash
docker compose up --build
```

Aplicação disponível em: `http://localhost:3000`

## Utilizador inicial

- username: `admin`
- password: `admin123`

> Recomenda-se alterar palavra-passe em ambiente real.

## Estrutura de dados

Os dados são persistidos em ficheiros JSON:

- `data/users.json` (utilizadores)
- `data/datasets.json` (metadata e base ativa)
- `data/datasets/<datasetId>.json` (entradas parseadas)

Cada entrada contém campos:

- `id1` cabeçalho
- `id2` descrição
- `id3` continuação da descrição (quando aplicável)
- `id4` referência DMPGU/incorporação
- `id5` descrição resumo
- `id6` cota
- `id7` CDR
- `id8` TB
- `id9` nº registo