# Funcionalidades e permissões

## Perfis (roles)
| Role | Pode |
|---|---|
| `read` | Login, pesquisar/consultar Cartografia e ATURB, ver detalhe, exportar (Excel/CSV/PDF), ver Painel e Empréstimos |
| `write` | + criar/editar/eliminar entradas, alterar estado, registar empréstimos/devoluções, anexar/remover imagens e ligações, lixo/restauração, histórico |
| `admin` | + importações de Excel, gestão de contas (criar, apagar, repor password, perfis, desbloquear, terminar sessões, códigos de recuperação), Administração (configuração, cópias, auditoria) |

A API aplica as mesmas regras (importações e contas só `admin`; escrita `admin`/`write`; lixo e histórico `admin`/`write`). `canManageEntries`/`canEditEstado` = `write` ou `admin`.

## Menu (sidebar, colapsável)
Menu: **Painel** (página inicial), **Cartografia**, **ATURB**, Importações (admin), **Empréstimos** (badge de atrasos), Gestão de Contas (admin; badge com pedidos de recuperação), Administração (admin). Ferramentas: **Impressão PDF** (com contador), Lixo (write/admin), Histórico (write/admin), **Ajuda**. No rodapé: Alterar password e Terminar sessão.

## Cartografia (pesquisa)
- Coleção fixa (sem seletor de fonte).
- Pesquisa livre `q` (tolerante a acentos/maiúsculas, palavras parciais, ordenada por relevância; aspas e `-termo`) + filtros avançados por campo: cabeçalho, descrição, notas, localização, assuntos, cota, CDR, TB, nº registo, autor, ano, tipo, cor, dimensão, estado.
- Filtros **numéricos** (cota, CDR, TB, nº registo): comparam por número exato extraído (ex.: "12" não casa "123"); sem dígitos no filtro → substring.
- Sugestões (datalist) e listas distintas via `/api/colecoes/:colecao/documentos/distinct`.
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
- Criar/editar via modal. Obrigatórios — Cartografia: cabeçalho, descrição, cota, autor. ATURB: título, autor, local, data, caixa nº. Validados também no servidor (campos `obrigatorio`); ao editar só se recusa esvaziar um obrigatório já preenchido.
- Eliminar → Lixo (restaurável; não se elimina um documento emprestado). Lixo e Histórico por coleção.
- Um campo apagado no formulário limpa o valor (`''`); o histórico guarda só o diff por campo.

## Importações (admin)
Menu **Importações**: atualiza uma coleção (Cartografia ou ATURB) a partir de um `.xlsx` sem criar "fontes" novas.
1. **Carregar** o ficheiro (máx. 20 MB); avisa se o mesmo ficheiro já foi importado.
2. **Mapear colunas**: proposta automática por cabeçalho (aliases, rótulo ou chave do campo); cada coluna pode ir para um campo existente, "ID SIGAT", informações físicas (tipo/cor/dimensão), colunas de empréstimo, **campo novo** ou ser ignorada. Os cabeçalhos usados ficam como aliases para a próxima vez.
3. **Comparar** com a coleção (nada é gravado): correspondência por ID SIGAT → Nº Registo → cota+descrição → descrição única → cota única. Resultado por linha: **novo**, **alterado**, **conflito**, **igual**, **ambíguo** (vários candidatos), **duplicado no ficheiro**, **erro**; e documentos **ausentes do ficheiro** (nunca são eliminados).
4. **Decidir**: por campo, manter o valor do SIGAT ou usar o do ficheiro; ações em massa para conflitos; novos/duplicados podem ser ignorados; ambíguos exigem escolha.
5. **Aplicar** numa única transação (se um documento foi alterado entre a comparação e a aplicação, devolve 409 e pede nova comparação).
Fusão a 3 vias por campo: valor atual = valor da última importação → aplica o do ficheiro; ficheiro = última importação → mantém o do SIGAT (só foi editado lá); ambos mudaram e diferem → **conflito** (por omissão fica o SIGAT; depois de aplicada a importação o conflito não volta a surgir). Estados e empréstimos criados no SIGAT nunca são alterados; as colunas de empréstimo do Excel só criam/fecham empréstimos de origem `importacao`/`migracao`. Documentos sem base conhecida (criados ou editados antes da migração) tratam qualquer diferença como conflito.
Tabela de histórico de importações na mesma página. Round-trip: exportar (inclui `ID SIGAT`), editar no Excel e importar casa 100 %.

## Painel (página inicial)
Indicadores (todos os perfis) por coleção e período (30/90/365 dias/tudo): documentos por estado (barras clicáveis → pesquisa filtrada), empréstimos (ativos, em atraso, a vencer em 7 dias, sem prazo, devolvidos no período, duração média), **mais consultados** (top 10; por omissão consultas presenciais + empréstimos; opção para contar visualizações na aplicação — 1 por utilizador/documento em 30 min), **qualidade dos dados** (sem cota/autor/nº registo/assuntos/localização em Cartografia; sem caixa/autor/local/data em ATURB; cada linha tem "Ver lista" que abre a pesquisa com `vazios=campo`, que depois se exporta) e possíveis duplicados (mesma cota+descrição normalizadas; lista de grupos). Mostra a última importação.

## Exportação (Excel/CSV)
Botão "Exportar" nas barras de resultados de Cartografia e ATURB: exporta **todos** os resultados da pesquisa/filtros atuais (sem paginação) em `.xlsx` (folha SIGAT + folha Critérios) ou `.csv` (UTF-8 com BOM, `;`). Inclui coluna `ID SIGAT`, Estado, Requisitante e Data de saída. Valores que começam por `=+-@` são protegidos contra injeção de fórmulas. No carrinho de impressão há um botão por fonte para exportar só os selecionados.

## Impressão PDF
O carrinho é guardado no servidor, por utilizador (sobrevive ao fim da sessão e muda de dispositivo; documentos eliminados desaparecem). Contém entradas de Cartografia e ATURB misturadas. "Imprimir PDF" (e "Imprimir ficha" no detalhe de um registo) abre nova janela com cartões e chama `window.print()` (o utilizador escolhe "Guardar como PDF"); requer pop-ups permitidos. O cabeçalho (2 linhas), logótipo PNG/JPEG, cor e rodapé vêm da configuração (Administração → Modelo de impressão); opção "Incluir miniaturas" junta até 4 miniaturas por ficha. Gerado em `frontend/src/fichaPdf.js` (todo o conteúdo escapado).

## Imagens digitalizadas (anexos)
No detalhe de cada registo (`Anexos.vue`): carregar ficheiros (JPEG/PNG/GIF/WebP/TIFF/PDF, ≤25 MB) — a miniatura JPEG de 320 px é criada no browser (canvas) — e adicionar ligações http(s). Clique na miniatura abre a imagem; PDF/TIFF descarregam. Se `imagens_url_modelo` estiver configurado (ex.: `https://servidor/{nrRegisto}.jpg`) aparece o botão "Abrir digitalização no repositório" (só se todos os campos do modelo estiverem preenchidos). Ler: todos; anexar/remover: write/admin.

## Administração (admin)
Página com abas: Estado (BD, contagens, HTTPS/SSO), Segurança e sessões (duração da sessão, tamanho/complexidade/validade das passwords, bloqueio), Cópias e retenção (cópias automáticas e manuais, download, retenção do Histórico e da auditoria), Modelo de impressão, Imagens (modelo de URL) e Auditoria (logins, falhas, bloqueios, recuperações, alterações de perfis/configuração, cópias).

## Ajuda
Página "Ajuda" (todos os perfis, `Ajuda.vue`): guia rápido por perfil (Leitura/Escrita/Administrador), matriz "quem pode fazer o quê" e roteiro de formação curta. O texto está no próprio componente: atualizar ao mudar permissões.

## Autenticação (UX)
Login por username/password; token em `localStorage` com duração configurável (8h por omissão); ao receber 401 a app termina a sessão e avisa. Conta bloqueada após N tentativas falhadas (admin pode desbloquear). "Esqueci-me da password": o utilizador pede, o admin vê o pedido em Gestão de Contas (badge) e gera um código de uso único (válido 60 min por omissão) que entrega por outro canal; o utilizador define a nova password no ecrã de entrada. Com SSO por proxy ativo, a app tenta entrar automaticamente e mostra "Entrar com a conta da organização". Admin não pode apagar a própria conta nem retirar-se do perfil de único admin.
