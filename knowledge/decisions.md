# Decisões relevantes

Formato: decisão — motivo/contexto.

1. **Persistência em JSON, sem BD** — simplicidade de instalação (um contentor, um volume); volumes pequenos (~3,7 mil entradas Cartografia, ~900 ATURB). Mudar para SQLite/Postgres se crescer ou houver escrita concorrente. *(histórico — ver decisões 16–27)*
2. **Fonte de dados migrou de TXT para xlsx** (commit "replace txt for a xlsx database") — o arquivo mantém a base em Excel (`Cartografia GEO - BD.xlsx`, folha `BD`); o TXT (`Mapa.txt`) exigia heurísticas frágeis. `src/parser.js` mantido por compatibilidade. *(histórico — ver decisões 16–27)*
3. **Colunas do xlsx por nome de cabeçalho, não por posição** (Cartografia) — tolera reordenação de colunas. O ATURB é posicional (layout fixo a partir da linha 4).
4. **Localização = coluna "Local" (C)** — pedido do negócio; a extração por `DMPGU|Incorporação` perdia registos. As restantes "Outras Descrições" ficam em `notas`.
5. **Cota e Localização são campos distintos** — a cota nunca deve ser mostrada como localização (bug corrigido na tabela e no modal).
6. **Nº Registo reaproveitado de um dataset anterior** — o xlsx não o traz; para não perder a identificação, cruza-se por descrição + cota com o dataset de cartografia mais recente. Resultados e falhas surgem como avisos no upload. *(histórico — ver decisões 16–27)*
7. **Filtros numéricos exatos (cota, CDR, TB, nº registo, caixa)** — pesquisar "12" não deve devolver "112"/"123".
8. **Ordenação de cota/CDR/TB pelo 1.º número extraído** — as cotas têm prefixos/sufixos (ex.: `MP 446 CMLEO`); ordenação alfabética dava ordem errada.
9. **Pesquisa/ordenação/paginação no servidor** — o frontend só recebe a página; evita enviar milhares de entradas.
10. **Soft-delete + histórico de auditoria** — rastreabilidade num arquivo; qualquer eliminação é reversível; edição guarda estado anterior e novo.
11. **Estado de empréstimo com data de saída e responsável** — controla onde está o documento físico. Na importação, "Empréstimo = Sim" cria estado Empréstimo com `registadoPor: 'importação'`.
12. **Impressão PDF via `window.print()`** — sem dependência de geração de PDF no servidor; o utilizador "guarda como PDF".
13. **Frontend num único `App.vue` e `public/` versionado** — iteração rápida e deploy sem passo de build no Docker. Custo: ficheiro grande; lembrar de `npm run build:client` antes de commit/deploy.
14. **Vários datasets em simultâneo** — permite comparar/importar versões; o utilizador escolhe a fonte antes de pesquisar. *(histórico — ver decisões 16–27)*
15. **UI e mensagens em pt-PT** — utilizadores finais portugueses.

## Decisões das melhorias 2026-11 (ver [plano-melhorias.md](plano-melhorias.md))
16. **SQLite (`better-sqlite3`) em vez de JSON** — transações (importação tudo-ou-nada), WAL, integridade, agregados para o painel, backup de um ficheiro, mantendo um único contentor. SQL isolado em `src/db/repos/` para poder trocar para PostgreSQL/SQL Server se a DSI o exigir. Substitui as decisões 1 e 14.
17. **Uma coleção por tipo, importações em vez de "fontes"** — `numero` estável e nunca reutilizado; estados, empréstimos, edições e histórico sobrevivem a reimportações. O SIGAT é a fonte de verdade; o Excel serve para cargas e atualizações (D5).
18. **Fusão a 3 vias** (`dados_importados` = base) — só há conflito quando o mesmo campo mudou nos dois lados; por omissão fica o valor do SIGAT; depois de aplicada, a base passa a ser o ficheiro (o conflito não volta a surgir).
19. **Documentos ausentes do ficheiro nunca são eliminados** (D3) — só sinalizados.
20. **Correspondência na importação**: ID SIGAT → Nº Registo → cota+descrição → descrição única → cota única; vários candidatos = ambíguo (decisão manual).
21. **Campos dinâmicos** (tabela `campos`) — colunas novas do Excel viram campos pesquisáveis sem alterar código; os cabeçalhos usados ficam como aliases.
22. **Empréstimos em tabela própria** — vários por documento ao longo do tempo, um ativo (índice único parcial); devolução passa o documento a `Arquivo` (D4); prazo por omissão 30 dias (D7); atraso é calculado, não guardado.
23. **"Consulta" para o painel** = consulta presencial + empréstimo; visualizações na aplicação são opcionais e deduplicadas (30 min) (D2).
24. **Pesquisa**: normalização NFD, AND entre termos, prefixo/substring, números exatos, relevância por pesos de campo; filtros por campo mantêm a regra numérica exata da decisão 7.
25. **Exportação** com proteção contra injeção de fórmulas (`'` antes de `=+-@`), CSV UTF-8 com BOM e `;`.
26. **Auth**: role e existência do utilizador lidos da BD em cada pedido (revogação imediata); password inicial provisória obriga a troca; mínimo 8 caracteres; 5 falhas/15 min por IP+utilizador.
27. **Edição**: só se recusa esvaziar um campo obrigatório já preenchido (documentos antigos sem autor continuam editáveis); `''` limpa campos opcionais.

## Decisões de operação, segurança e utilização (2026-11)
28. **Parâmetros em BD** (`configuracoes`, chave/valor com limites em `src/config.js`) e não em variáveis de ambiente, para o admin os alterar sem reiniciar; segredos e infraestrutura (JWT, TLS, SSO, pasta de cópias) ficam em env.
29. **Recuperação de password sem SMTP**: pedido público (resposta uniforme) + código de uso único emitido pelo admin; evita depender de email e de enumeração de contas. Guardado só o hash SHA-256; 5 tentativas; validade configurável.
30. **Sessões revogáveis**: `sessao_versao` por utilizador no JWT (`sv`); trocar/repor password, recuperar e "terminar sessões" incrementam-na. A troca de password devolve token novo.
31. **Bloqueio de conta na BD** + limitador em memória; mesma mensagem para conta inexistente/bloqueada, hash fictício para igualar tempos.
32. **SSO por proxy** (cabeçalho + segredo partilhado) em vez de OIDC/SAML nativo: serve IIS/Windows, oauth2-proxy e Easy Auth sem dependências novas. Contas SSO (`origem='sso'`) não têm password local.
33. **Cópias**: API de backup do SQLite (consistente com a BD em uso) + `quick_check`; retenção por número de cópias; agendador interno (sem cron) que só corre no processo do servidor. Anexos ficam fora da cópia da BD.
34. **Retenção do Histórico** opcional (0 = para sempre; ≥90 dias); a purga corre depois da cópia do ciclo. Auditoria de acessos separada do Histórico (`auditoria`, 365 dias por omissão).
35. **Anexos**: tipo detetado pelos bytes (não pelo mime/extensão), sem SVG/HTML, servidos com `nosniff` e CSP `sandbox`, atrás de autenticação (o frontend lê-os com `fetch` + blob). Miniaturas geradas no browser para não acrescentar uma dependência nativa (sharp). Ligações externas só http(s).
36. **Carrinho no servidor** (`carrinhos`) em vez de `localStorage`: acompanha o utilizador entre dispositivos e não fica na máquina partilhada.
37. **Ficha PDF com modelo**: cabeçalho/rodapé/cor/logo guardados em configuração (logo como data URL PNG/JPEG ≤ ~300 KB validado pelos bytes) e lidos por qualquer utilizador autenticado.
38. **Cabeçalhos HTTP**: CSP restritiva (`script-src 'self'`), `X-Frame-Options: DENY`, HSTS com `FORCE_HTTPS=1`; CORS fechado em produção.
