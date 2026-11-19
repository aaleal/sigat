# Limitações, dívida técnica e riscos

Estado: auditoria à leitura do código, não corrigido salvo indicação.

## Segurança
- `JWT_SECRET` obrigatório em produção (o processo recusa arrancar com o valor por omissão); o `docker-compose.yml` traz um valor de exemplo que deve ser trocado.
- A conta `admin` nasce com password provisória (`admin123`) e obriga a troca no 1.º acesso; qualquer conta com essa password fica marcada para troca no arranque.
- Password mínima de 8 caracteres (criação, reposição e alteração); sem recuperação por self-service.
- `cors()` aberto a todas as origens; limite de tentativas de login em memória (reinicia com o processo); sem HTTPS (assumir proxy externo).
- Token em `localStorage` (exposto a XSS). O HTML de impressão usa `escHtml`; manter ao alterar templates.
- O token vale 8 h, mas o utilizador e o role são validados na BD a cada pedido (contas apagadas ou com role alterado têm efeito imediato).

## Dados e consistência
- SQLite com WAL e transações; a pesquisa carrega a coleção inteira em cache de memória (ok para milhares de documentos; para centenas de milhares usar FTS5).
- Documentos antigos sem autor/outros obrigatórios continuam editáveis: só é recusado esvaziar um obrigatório já preenchido.
- Histórico de edição guarda só o diff por campo (histórico migrado do JSON também foi convertido).
- Documentos migrados do JSON com edições não têm base de fusão (`dados_importados` nulo): na 1.ª importação qualquer diferença é conflito.
- A importação não elimina documentos ausentes do ficheiro nem funde duplicados (só os sinaliza); não há "reverter importação".
- Datas de empréstimo importadas são convertidas de `dd/mm/aaaa`/ISO; formatos desconhecidos usam a data de hoje.
- Empréstimos importados/migrados podem não ter data prevista ("sem prazo"); os alertas por email não existem.
- ATURB: só as 6 colunas conhecidas vêm mapeadas por omissão; as restantes colunas de `bdarquivotecnico.xlsx` (outras folhas) podem ser importadas como campos novos.

## Funcionais
- Carrinho de impressão só em memória.
- Pesquisa difusa (erros de escrita) não existe; apenas acentos/maiúsculas/parciais/relevância.
- Sem recuperação de password por self-service.
- Testes: `npm test` (node:test) cobre pesquisa, exportação, API de documentos e migração; sem lint/CI nem testes de UI.
- `App.vue` monolítico (~3200 linhas) e duplicação de lógica Cartografia/ATURB.
- README da raiz desatualizado (descreve fluxo TXT / ID1..ID9).
- O Dockerfile não faz build do frontend (depende do `public/` commitado); a imagem corre como `node` (uid 1000), pelo que a pasta `data/` montada precisa dessas permissões.
