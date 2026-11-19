# Limitações, dívida técnica e riscos

Estado: auditoria à leitura do código, não corrigido salvo indicação.

## Segurança
- `JWT_SECRET` obrigatório em produção (o processo recusa arrancar com o valor por omissão); o `docker-compose.yml` traz um valor de exemplo que deve ser trocado.
- A conta `admin` nasce com password provisória (`admin123`) e obriga a troca no 1.º acesso; qualquer conta com essa password fica marcada para troca no arranque.
- Política de passwords configurável (mín. 8, letras+números por omissão, validade opcional, ≤72 bytes, lista curta de comuns). Bloqueio por conta (BD) após 5 falhas por 15 min (configurável) + limitador em memória por IP+utilizador (reinicia com o processo). O bloqueio por conta permite bloquear contas alheias de propósito (aceite; o admin desbloqueia).
- Recuperação de password **sem email**: código de uso único emitido pelo admin (limite de 5 tentativas). Self-service por email exigiria SMTP (não implementado).
- Sessão: duração configurável; trocar/repor password, recuperação e "terminar sessões" invalidam tokens antigos (`sv`). Não há expiração por inatividade nem refresh token.
- HTTPS não é forçado por omissão: configurar `SSL_KEY_FILE`/`SSL_CERT_FILE` ou proxy + `TRUST_PROXY` + `FORCE_HTTPS=1`. Cabeçalhos de segurança (CSP, nosniff, X-Frame-Options) sempre ativos; a CSP permite `style-src 'unsafe-inline'` e Google Fonts. CORS fechado em produção (`CORS_ORIGENS`).
- SSO apenas por **proxy de autenticação** (cabeçalho + segredo partilhado). Não há cliente OIDC/SAML nativo; o proxy tem de remover o cabeçalho de identidade enviado pelo cliente e a app não deve ser acessível sem passar por ele (senão o segredo é a única defesa). Contas SSO não têm password local.
- Token em `localStorage` (exposto a XSS). O HTML de impressão escapa todos os valores (`esc` em `fichaPdf.js`); manter ao alterar templates.
- O utilizador e o role são validados na BD a cada pedido (contas apagadas ou com role alterado têm efeito imediato).
- Quem pode o quê (revisão): importar/gerir contas/configurar = admin; criar/editar/eliminar/anexar/estados/empréstimos = write+admin; ler/exportar/imprimir = todos. Matriz também em Ajuda. Toda a administração fica na auditoria.

## Dados e consistência
- SQLite com WAL e transações; a pesquisa carrega a coleção inteira em cache de memória (ok para milhares de documentos; para centenas de milhares usar FTS5).
- Documentos antigos sem autor/outros obrigatórios continuam editáveis: só é recusado esvaziar um obrigatório já preenchido.
- Histórico de edição guarda só o diff por campo (histórico migrado do JSON também foi convertido). Retenção configurável (0 = guardar sempre; mínimo 90 dias); as entradas apagadas não se recuperam senão por cópia.
- Cópias de segurança: só a BD. Os ficheiros em `data/anexos/` têm de ser copiados à parte. Se a cópia ficar no mesmo disco/volume que a BD não protege contra falha do disco: usar `SIGAT_BACKUP_DIR` noutro volume. Não há restauro pela interface.
- Migrar para PostgreSQL só se houver várias instâncias da app, BD central exigida pela DSI ou carga de escrita concorrente elevada; com ~5 mil documentos e poucos utilizadores o SQLite (WAL) chega. SQL está isolado em `src/db/repos/*`, mas a pesquisa usa cache em memória por processo (várias instâncias exigiriam invalidar a cache).
- Documentos migrados do JSON com edições não têm base de fusão (`dados_importados` nulo): na 1.ª importação qualquer diferença é conflito.
- A importação não elimina documentos ausentes do ficheiro nem funde duplicados (só os sinaliza); não há "reverter importação".
- Datas de empréstimo importadas são convertidas de `dd/mm/aaaa`/ISO; formatos desconhecidos usam a data de hoje.
- Empréstimos importados/migrados podem não ter data prevista ("sem prazo"); os alertas por email não existem.
- ATURB: só as 6 colunas conhecidas vêm mapeadas por omissão; as restantes colunas de `bdarquivotecnico.xlsx` (outras folhas) podem ser importadas como campos novos.

## Funcionais
- Miniaturas criadas no browser (JPEG 320 px): ficheiros TIFF/PDF não têm miniatura; anexos carregados pela API sem miniatura usam o ficheiro original na lista. Não há visualizador de PDF/TIFF integrado (descarregam).
- Carrinho de impressão: máx. 500 itens por utilizador.
- Pesquisa difusa (erros de escrita) não existe; apenas acentos/maiúsculas/parciais/relevância.
- Testes: `npm test` (node:test) cobre pesquisa, exportação, API de documentos e migração; sem lint/CI nem testes de UI.
- `App.vue` monolítico (~3200 linhas) e duplicação de lógica Cartografia/ATURB.
- README da raiz desatualizado (descreve fluxo TXT / ID1..ID9).
- O Dockerfile não faz build do frontend (depende do `public/` commitado); a imagem corre como `node` (uid 1000), pelo que a pasta `data/` montada precisa dessas permissões.
