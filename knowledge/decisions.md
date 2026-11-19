# Decisões relevantes

Formato: decisão — motivo/contexto.

1. **Persistência em JSON, sem BD** — simplicidade de instalação (um contentor, um volume); volumes pequenos (~3,7 mil entradas Cartografia, ~900 ATURB). Mudar para SQLite/Postgres se crescer ou houver escrita concorrente.
2. **Fonte de dados migrou de TXT para xlsx** (commit "replace txt for a xlsx database") — o arquivo mantém a base em Excel (`Cartografia GEO - BD.xlsx`, folha `BD`); o TXT (`Mapa.txt`) exigia heurísticas frágeis. `src/parser.js` mantido por compatibilidade.
3. **Colunas do xlsx por nome de cabeçalho, não por posição** (Cartografia) — tolera reordenação de colunas. O ATURB é posicional (layout fixo a partir da linha 4).
4. **Localização = coluna "Local" (C)** — pedido do negócio; a extração por `DMPGU|Incorporação` perdia registos. As restantes "Outras Descrições" ficam em `notas`.
5. **Cota e Localização são campos distintos** — a cota nunca deve ser mostrada como localização (bug corrigido na tabela e no modal).
6. **Nº Registo reaproveitado de um dataset anterior** — o xlsx não o traz; para não perder a identificação, cruza-se por descrição + cota com o dataset de cartografia mais recente. Resultados e falhas surgem como avisos no upload.
7. **Filtros numéricos exatos (cota, CDR, TB, nº registo, caixa)** — pesquisar "12" não deve devolver "112"/"123".
8. **Ordenação de cota/CDR/TB pelo 1.º número extraído** — as cotas têm prefixos/sufixos (ex.: `MP 446 CMLEO`); ordenação alfabética dava ordem errada.
9. **Pesquisa/ordenação/paginação no servidor** — o frontend só recebe a página; evita enviar milhares de entradas.
10. **Soft-delete + histórico de auditoria** — rastreabilidade num arquivo; qualquer eliminação é reversível; edição guarda estado anterior e novo.
11. **Estado de empréstimo com data de saída e responsável** — controla onde está o documento físico. Na importação, "Empréstimo = Sim" cria estado Empréstimo com `registadoPor: 'importação'`.
12. **Impressão PDF via `window.print()`** — sem dependência de geração de PDF no servidor; o utilizador "guarda como PDF".
13. **Frontend num único `App.vue` e `public/` versionado** — iteração rápida e deploy sem passo de build no Docker. Custo: ficheiro grande; lembrar de `npm run build:client` antes de commit/deploy.
14. **Vários datasets em simultâneo** — permite comparar/importar versões; o utilizador escolhe a fonte antes de pesquisar.
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
