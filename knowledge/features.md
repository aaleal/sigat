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
- Pesquisa livre `q` (tolerante a acentos/maiúsculas, palavras parciais, ordenada por relevância; aspas e `-termo`) + filtros avançados por campo: cabeçalho, descrição, notas, localização, assuntos, cota, CDR, TB, nº registo, autor, ano, tipo, cor, dimensão, estado.
- Filtros **numéricos** (cota, CDR, TB, nº registo): comparam por número exato extraído (ex.: "12" não casa "123"); sem dígitos no filtro → substring.
- Sugestões (datalist) e listas distintas via `/api/entries/distinct`.
- Ordenação multi-coluna (shift/click; badges de ordem). `cota`, `cdr`, `tb` ordenam pelo 1.º número extraído; `nrRegisto` como número; resto `localeCompare('pt-PT', {numeric:true})`.
- Paginação (pageSize 1–100, default 25).
- Tabela: cabeçalho, descrição, assuntos, cota, CDR, TB, localização, nº registo, estado (editável por write/admin), ações. Modal de detalhe com todos os campos.
- Adicionar ao carrinho de impressão (ícone impressora).

## ATURB (pesquisa)
Filtros: autor, título, local, data, caixa nº (numérico exato), estado; ordenação e paginação análogas. Mesmas ações (detalhe, editar, estado, carrinho).

## Estados e empréstimos
Estados: `Arquivo`, `Em Consulta`, `Empréstimo` e `-` (sem estado, mostrado como "—"). Passar a `Em Consulta` regista uma consulta presencial.

**Empréstimos** (tabela própria, vários por documento ao longo do tempo, só um ativo):
- "Registar empréstimo…" (seletor de estado) pede requisitante (obrigatório, com sugestões), entidade, contacto, data de saída (≤ hoje), devolução prevista (por omissão +30 dias, `SIGAT_PRAZO_EMPRESTIMO_DIAS`; pode ficar "sem prazo") e observações.
- Documento emprestado mostra requisitante e "até dd/mm/aaaa" (vermelho "Em atraso N dias" se vencido) e oferece **Devolver** (data efetiva + observações; estado passa a `Arquivo`) e **Prolongar** (nova data prevista). Não se muda o estado nem se elimina um documento emprestado sem devolver.
- Página **Empréstimos**: separadores Ativos / Em atraso / Sem prazo / Histórico; filtros por coleção, requisitante/entidade e período; exportação Excel/CSV.
- **Alertas**: badge vermelho no menu com o n.º em atraso e faixa no topo "N em atraso · M vencem nos próximos 7 dias" (atualiza de 5 em 5 minutos). Sem email.
- Pesquisa: parâmetro `emprestimo=ativo|atraso` na API.

## Gestão de entradas (write/admin)
- Criar/editar via modal. Obrigatórios — Cartografia: cabeçalho, descrição, cota, autor. ATURB: título, autor, local, data, caixa nº. A validação é **só no frontend**.
- Eliminar → Lixo (restaurável). Lixo e Histórico por dataset/tipo.
- Campos vazios são omitidos ao gravar (um campo apagado no formulário **não** apaga o valor antigo no PUT — ver limitações).

## Importações (admin)
Menu **Importações**: atualiza uma coleção (Cartografia ou ATURB) a partir de um `.xlsx` sem criar "fontes" novas.
1. **Carregar** o ficheiro (máx. 20 MB); avisa se o mesmo ficheiro já foi importado.
2. **Mapear colunas**: proposta automática por cabeçalho (aliases, rótulo ou chave do campo); cada coluna pode ir para um campo existente, "ID SIGAT", informações físicas (tipo/cor/dimensão), colunas de empréstimo, **campo novo** ou ser ignorada. Os cabeçalhos usados ficam como aliases para a próxima vez.
3. **Comparar** com a coleção (nada é gravado): correspondência por ID SIGAT → Nº Registo → cota+descrição → descrição única → cota única. Resultado por linha: **novo**, **alterado**, **conflito**, **igual**, **ambíguo** (vários candidatos), **duplicado no ficheiro**, **erro**; e documentos **ausentes do ficheiro** (nunca são eliminados).
4. **Decidir**: por campo, manter o valor do SIGAT ou usar o do ficheiro; ações em massa para conflitos; novos/duplicados podem ser ignorados; ambíguos exigem escolha.
5. **Aplicar** numa única transação (se um documento foi alterado entre a comparação e a aplicação, devolve 409 e pede nova comparação).
Fusão a 3 vias por campo: valor atual = valor da última importação → aplica o do ficheiro; ficheiro = última importação → mantém o do SIGAT (só foi editado lá); ambos mudaram e diferem → **conflito** (por omissão fica o SIGAT; depois de aplicada a importação o conflito não volta a surgir). Estados e empréstimos criados no SIGAT nunca são alterados; as colunas de empréstimo do Excel só criam/fecham empréstimos de origem `importacao`/`migracao`. Documentos sem base conhecida (criados ou editados antes da migração) tratam qualquer diferença como conflito.
Tabela de histórico de importações na mesma página. Round-trip: exportar (inclui `ID SIGAT`), editar no Excel e importar casa 100 %.

## Exportação (Excel/CSV)
Botão "Exportar" nas barras de resultados de Cartografia e ATURB: exporta **todos** os resultados da pesquisa/filtros atuais (sem paginação) em `.xlsx` (folha SIGAT + folha Critérios) ou `.csv` (UTF-8 com BOM, `;`). Inclui coluna `ID SIGAT`, Estado, Requisitante e Data de saída. Valores que começam por `=+-@` são protegidos contra injeção de fórmulas. No carrinho de impressão há um botão por fonte para exportar só os selecionados.

## Impressão PDF
Carrinho em memória (perde-se ao recarregar a página) com entradas de Cartografia e ATURB misturadas. "Imprimir PDF" abre nova janela com cartões formatados e chama `window.print()` (o utilizador escolhe "Guardar como PDF"). Requer pop-ups permitidos.

## Autenticação (UX)
Login por username/password; token de 8h em `localStorage`. Sem recuperação de password; admin repõe passwords. Admin não pode apagar a própria conta.
