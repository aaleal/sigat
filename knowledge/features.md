# Funcionalidades e permissões

## Perfis (roles)
| Role | Pode |
|---|---|
| `read` | Login, pesquisar/consultar Cartografia e ATURB, ver detalhe, exportar PDF, ver erros de importação do dataset (via API) |
| `write` | + criar/editar/eliminar entradas, alterar estado, lixo/restauro, histórico, apagar/renomear/carregar datasets (API) |
| `admin` | + gestão de contas (criar, apagar, repor password), menu "Fontes de Dados" |

A UI só mostra "Fontes de Dados" e "Gestão de Contas" a `admin` (`canAccessSources`, `isAdmin`), mas a API deixa `write` carregar/renomear/apagar datasets (ver [limitations.md](limitations.md)). `canManageEntries`/`canEditEstado` = `write` ou `admin`.

## Menu (sidebar, colapsável)
Menu: **Cartografia**, **ATURB**, Fontes de Dados (admin), Gestão de Contas (admin). Ferramentas: **Impressão PDF** (com contador), Lixo (write/admin), Histórico (write/admin).

## Cartografia (pesquisa)
- Selecionar fonte de dados (obrigatório antes de pesquisar).
- Pesquisa livre `q` (concatena todos os campos) + filtros avançados por campo: cabeçalho, descrição, notas, localização, assuntos, cota, CDR, TB, nº registo, autor, ano, tipo, cor, dimensão, estado.
- Filtros **numéricos** (cota, CDR, TB, nº registo): comparam por número exato extraído (ex.: "12" não casa "123"); sem dígitos no filtro → substring.
- Sugestões (datalist) e listas distintas via `/api/entries/distinct`.
- Ordenação multi-coluna (shift/click; badges de ordem). `cota`, `cdr`, `tb` ordenam pelo 1.º número extraído; `nrRegisto` como número; resto `localeCompare('pt-PT', {numeric:true})`.
- Paginação (pageSize 1–100, default 25).
- Tabela: cabeçalho, descrição, assuntos, cota, CDR, TB, localização, nº registo, estado (editável por write/admin), ações. Modal de detalhe com todos os campos.
- Adicionar ao carrinho de impressão (ícone impressora).

## ATURB (pesquisa)
Filtros: autor, título, local, data, caixa nº (numérico exato), estado; ordenação e paginação análogas. Mesmas ações (detalhe, editar, estado, carrinho).

## Estados
`Arquivo`, `Em Consulta`, `Empréstimo`, e `-` (sem estado). Ao escolher `Empréstimo` abre modal que pede **data de saída**; guarda-se `estadoMeta` com o utilizador. Mudanças ficam em `history`.

## Gestão de entradas (write/admin)
- Criar/editar via modal. Obrigatórios — Cartografia: cabeçalho, descrição, cota, autor. ATURB: título, autor, local, data, caixa nº. A validação é **só no frontend**.
- Eliminar → Lixo (restaurável). Lixo e Histórico por dataset/tipo.
- Campos vazios são omitidos ao gravar (um campo apagado no formulário **não** apaga o valor antigo no PUT — ver limitações).

## Fontes de Dados (admin)
Dois cartões de upload (drag & drop, só `.xlsx`, máx. 20 MB): Cartografia e ATURB. Lista com nome, data, utilizador, nº entradas, tamanho; renomear, apagar, ver erros/avisos do parse, ativar.

## Impressão PDF
Carrinho em memória (perde-se ao recarregar a página) com entradas de Cartografia e ATURB misturadas. "Imprimir PDF" abre nova janela com cartões formatados e chama `window.print()` (o utilizador escolhe "Guardar como PDF"). Requer pop-ups permitidos.

## Autenticação (UX)
Login por username/password; token de 8h em `localStorage`. Sem recuperação de password; admin repõe passwords. Admin não pode apagar a própria conta.
