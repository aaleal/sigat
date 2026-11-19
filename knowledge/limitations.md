# Limitações, dívida técnica e riscos

Estado: auditoria à leitura do código, não corrigido salvo indicação.

## Segurança
- `JWT_SECRET` com default público e valor fixo no `docker-compose.yml`. Trocar em produção.
- Utilizador `admin`/`admin123` criado automaticamente; sem forçar troca de password.
- Password mínima de 4 caracteres (só validada ao repor; a criação de utilizador não valida tamanho).
- `cors()` aberto a todas as origens; sem rate limiting no login; sem HTTPS (assumir proxy externo).
- Token em `localStorage` (exposto a XSS). O HTML de impressão usa `escHtml`; manter ao alterar templates.
- Autorização inconsistente: `POST /datasets/:id/activate` não exige role (qualquer utilizador autenticado); `write` pode carregar/apagar datasets via API apesar de a UI só mostrar o menu a admin.
- Roles `read` leem tudo, incluindo lixo e histórico via API (a UI esconde-os).
- Tokens não são revogados ao apagar um utilizador/alterar role (valem até expirar, 8h; `/auth/me` devolve 404 se apagado).

## Dados e consistência
- Leitura/escrita do JSON inteiro por pedido, **sem locking** → perda de escritas com edições concorrentes; escrita não atómica (falha a meio pode corromper o ficheiro). `readJson` devolve o fallback em caso de erro, o que pode mascarar corrupção e levar a sobrescrever com dados vazios.
- Cada pedido de pesquisa carrega todo o dataset; ok para milhares de entradas, não para centenas de milhares.
- `sourceEntryNumber` ao criar = `max(entries)+1`; ignora o lixo → possível colisão após restauro.
- `PUT` ignora campos vazios: não é possível limpar um campo existente pela UI.
- Validação de campos obrigatórios só no frontend; a API aceita qualquer corpo (campos arbitrários são gravados em `entries`).
- Datasets existentes não são recalculados quando os parsers mudam (ex.: mudança de Localização) → reimportar.
- Reimportar cria um **novo** dataset; edições manuais, estados e histórico do anterior **não** são migrados. Não há merge/atualização incremental nem reimportação sobre o mesmo dataset.
- Histórico guarda entradas completas (`prev`/`next`) → ficheiros crescem; sem rotação.
- Colunas não importadas do xlsx de Cartografia: TB 2, MP, CDR 2, Data de Entrada, Restauro. `Requisitante` e `Data de Saída` só são lidos para entradas em empréstimo na importação.
- Empréstimo: não há data de devolução nem fluxo de devolução; mudar o estado para outro valor limpa efetivamente a meta (envia `estadoMeta: null`).
- Estado `-` não é uma opção do seletor.
- ATURB importa só 6 colunas de um livro com muito mais informação (`bdarquivotecnico.xlsx`: localização no depósito, pasta, cota, notas…).

## Funcionais
- Carrinho de impressão só em memória.
- Pesquisa difusa (erros de escrita) não existe; apenas acentos/maiúsculas/parciais/relevância.
- Sem recuperação de password por self-service.
- Sem testes automáticos, lint ou CI.
- `App.vue` monolítico (~3500 linhas) e duplicação de lógica Cartografia/ATURB.
- README da raiz desatualizado (descreve fluxo TXT / ID1..ID9).
- Mensagem de erro em `/datasets/upload` diz "apenas .xlsx" mas aceita também `.txt`.
- O Dockerfile não faz build do frontend (depende do `public/` commitado) e corre como root.
