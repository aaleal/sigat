# SIGAT — Relatório para o negócio

## Para que serve
O SIGAT é uma aplicação web para **consultar e gerir o inventário do arquivo**: a **Cartografia** (plantas, mapas e cartas) e o **Arquivo Técnico de Urbanismo (ATURB)**. Substitui a consulta direta aos ficheiros Excel/TXT: permite encontrar rapidamente um documento, saber onde está, em que estado se encontra e quem o requisitou.

A informação provém dos ficheiros Excel do arquivo (`Cartografia GEO - BD.xlsx`, `bdarquivotecnico.xlsx`) que são carregados para a aplicação.

## Quem usa e o que pode fazer
| Perfil | O que pode fazer |
|---|---|
| **Leitura** | Pesquisar, ver o detalhe de cada documento e imprimir/guardar fichas em PDF |
| **Escrita** | Tudo o anterior, mais criar, editar e eliminar registos, marcar estados (Arquivo / Em Consulta / Empréstimo) e consultar Lixo e Histórico |
| **Administrador** | Tudo o anterior, mais carregar/gerir fontes de dados (Excel) e gerir contas de utilizadores |

## Principais fluxos

### 1. Encontrar um documento
1. Entrar com utilizador e palavra-passe.
2. Escolher **Cartografia** ou **ATURB** e a fonte de dados.
3. Pesquisar por texto livre ou usar os filtros (autor, ano, cota, localização, assuntos, CDR, TB, nº de registo, estado, tipo, cor, dimensão…).
4. Ordenar por uma ou várias colunas e abrir o detalhe de um registo.

### 2. Registar uma saída (empréstimo) ou consulta
No registo, mudar o **estado** para *Em Consulta* ou *Empréstimo*. No empréstimo indica-se a **data de saída**; a aplicação regista quem fez a alteração e quando. Fica tudo no **Histórico**.

### 3. Manter os registos
Criar um novo registo, editar um existente ou eliminá-lo. Um registo eliminado vai para o **Lixo** e pode ser **restaurado**; nada se perde por engano.

### 4. Imprimir fichas
Marcar os documentos pretendidos (ícone da impressora) → ecrã **Impressão PDF** → "Imprimir PDF" (escolher "Guardar como PDF" no navegador). Pode misturar Cartografia e ATURB.

### 5. Atualizar a base de dados (administrador)
Em **Fontes de Dados**, arrastar o ficheiro Excel atualizado. A aplicação valida-o e mostra **avisos** (ex.: documentos sem autor ou sem cota, linhas duplicadas, assuntos que parecem ser uma cota) para o arquivo corrigir na origem.

## Informação mostrada (Cartografia)
Cabeçalho, descrição, assuntos, **cota**, CDR, TB, **localização** (coluna "Local" do Excel), nº de registo, autor, ano, tipo, cor, dimensão, notas e estado.
ATURB: autor, título, local, data, nº de caixa e estado.

## Pontos a ter em conta (hoje)
- **Reimportar um Excel cria uma nova fonte de dados**; as alterações feitas na aplicação (estados, edições) à fonte antiga não passam para a nova. Convém definir qual é a "fonte oficial" e quando se reimporta.
- Os dados são guardados em ficheiros no servidor; **é necessário fazer cópias de segurança** da pasta de dados.
- Duas pessoas a editar **ao mesmo tempo** podem sobrepor alterações.
- O nº de registo não vem no Excel atual; é recuperado automaticamente de uma importação anterior, por correspondência de descrição e cota. Alguns documentos podem ficar sem nº de registo (a aplicação avisa).
- Não é possível limpar o conteúdo de um campo numa edição (apagar o texto e gravar mantém o valor anterior).
- Na pesquisa, acentos e maiúsculas contam de forma simples (por exemplo, "Lisboa" e "Lisbôa" não são equivalentes).
- A conta inicial de administrador deve ter a palavra-passe alterada antes de uso real.

## Sugestões de melhoria (para ponderar)

**Valor imediato para o arquivo**
1. **Exportar resultados para Excel/CSV**, incluindo a pesquisa filtrada, para relatórios e inventários.
2. **Controlo de empréstimos completo**: data de devolução prevista e efetiva, requisitante visível, lista de "em atraso" e alertas.
3. **Painel de indicadores**: total de documentos por estado, empréstimos ativos, documentos mais consultados, qualidade dos dados (sem cota, sem autor, sem nº de registo).
4. **Atualização incremental a partir do Excel** (em vez de criar uma nova fonte): comparar, mostrar o que mudou e preservar estados e edições.
5. **Pesquisa tolerante a acentos e maiúsculas** e com pesquisa por palavras parciais/relevância.

**Qualidade da informação**
6. Corrigir na origem os avisos de importação (assuntos com cota, autores em falta, duplicados) e usar a lista de avisos como **lista de trabalho**.
7. Importar mais campos do Excel hoje ignorados (por exemplo "Restauro", "Data de Entrada", "MP") e **enriquecer o ATURB** com a localização no depósito e a pasta, que existem no ficheiro de origem.
8. Acrescentar o **nº de registo ao Excel de origem** para eliminar a dependência da correspondência automática.
9. Validar os dados também no servidor (campos obrigatórios, formatos de cota/data).

**Operação e segurança**
10. **Cópias de segurança automáticas** e política de retenção do Histórico.
11. Passar a uma **base de dados** (ex.: SQLite/PostgreSQL) se o volume ou o número de utilizadores simultâneos crescer.
12. Reforçar o acesso: alterar a palavra-passe inicial, política de palavras-passe, bloqueio após tentativas falhadas, integração com a autenticação da organização (SSO), HTTPS e revisão de quem pode carregar/apagar fontes de dados.
13. **Recuperação de palavra-passe** e expiração de sessões configurável.

**Utilização**
14. Guardar o carrinho de impressão entre sessões e permitir **ficha PDF com modelo próprio** (logótipo, cabeçalho institucional).
15. Ligação a **imagens digitalizadas** dos documentos (miniaturas/ligações no detalhe do registo).
16. Formação curta e guia rápido por perfil (leitura / escrita / administrador).

## Resumo
A aplicação cobre bem a **consulta, o controlo de estado e a rastreabilidade** do arquivo. As melhorias de maior retorno são: exportação, atualização incremental a partir do Excel, controlo completo de empréstimos e reforço de cópias de segurança e segurança de acessos.
