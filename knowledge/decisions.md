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
