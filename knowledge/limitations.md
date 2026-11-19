# Limitações, dívida técnica e riscos

Estado: auditoria à leitura do código, não corrigido salvo indicação.

## Segurança
- `JWT_SECRET` com default público e valor fixo no `docker-compose.yml`. Trocar em produção.
- Utilizador `admin`/`admin123` criado automaticamente; sem forçar troca de password.
- Password mínima de 4 caracteres (só validada ao repor; a criação de utilizador não valida tamanho).
- `cors()` aberto a todas as origens; sem rate limiting no login; sem HTTPS (assumir proxy externo).
- Token em `localStorage` (exposto a XSS). O HTML de impressão usa `escHtml`; manter ao alterar templates.
- Roles `read` leem tudo exceto lixo e histórico (restritos a admin/write na API desde a Fase 2).
- Tokens não são revogados ao apagar um utilizador/alterar role (valem até expirar, 8h; `/auth/me` devolve 404 se apagado).

## Dados e consistência
- SQLite com WAL e transações; a pesquisa carrega a coleção inteira em cache de memória (ok para milhares de documentos; para centenas de milhares usar FTS5).
- Documentos antigos sem autor/outros obrigatórios continuam editáveis: só é recusado esvaziar um obrigatório já preenchido.
- Histórico de edição guarda só o diff por campo (histórico migrado do JSON também foi convertido).
- A importação a partir do Excel está em reformulação (Fase 4 do plano): até lá a página "Fontes de Dados" não permite carregar ficheiros.
- Colunas não importadas do xlsx de Cartografia: TB 2, MP, CDR 2, Data de Entrada, Restauro (passarão a campos dinâmicos na Fase 4).
- Empréstimos importados/migrados podem não ter data prevista ("sem prazo"); os alertas por email não existem.
- ATURB importa só 6 colunas de um livro com muito mais informação (`bdarquivotecnico.xlsx`).

## Funcionais
- Carrinho de impressão só em memória.
- Pesquisa difusa (erros de escrita) não existe; apenas acentos/maiúsculas/parciais/relevância.
- Sem recuperação de password por self-service.
- Testes: `npm test` (node:test) cobre pesquisa, exportação, API de documentos e migração; sem lint/CI nem testes de UI.
- `App.vue` monolítico (~3200 linhas) e duplicação de lógica Cartografia/ATURB.
- README da raiz desatualizado (descreve fluxo TXT / ID1..ID9).
- O Dockerfile não faz build do frontend (depende do `public/` commitado) e corre como root.
