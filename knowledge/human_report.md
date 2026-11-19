# SIGAT — Relatório para o negócio

Documento para quem utiliza e gere o arquivo. Resume o que a aplicação faz hoje, como se trabalha com ela e o que convém ter em atenção.

## Para que serve
Consultar e gerir o inventário do arquivo — **Cartografia** e **Arquivo Técnico de Urbanismo (ATURB)** —, saber onde está cada documento, controlar empréstimos e manter a informação atualizada a partir dos ficheiros Excel do arquivo.

## Perfis
| Perfil | Pode |
|---|---|
| Leitura | Pesquisar, ver detalhe, exportar resultados, imprimir fichas em PDF, ver o painel e os empréstimos |
| Escrita | + criar/editar/eliminar documentos, alterar estados, registar empréstimos e devoluções, anexar imagens digitalizadas, ver Lixo e Histórico |
| Administrador | + importar ficheiros Excel, gerir contas, configuração de segurança, cópias de segurança e auditoria |

## O que há de novo
1. **Pesquisa mais tolerante**: ignora acentos e maiúsculas, aceita partes de palavras, ordena por relevância; `"aspas"` para frase exata e `-palavra` para excluir.
2. **Exportar para Excel/CSV** os resultados de qualquer pesquisa (inclui o *ID SIGAT*), para relatórios e inventários.
3. **Empréstimos completos**: requisitante, data de saída, devolução prevista e efetiva, prorrogações, página própria, avisos de atraso no menu e no topo.
4. **Painel de indicadores** (página inicial): documentos por estado, empréstimos ativos e em atraso, mais consultados e qualidade dos dados (sem cota, sem autor, sem nº de registo…), com acesso direto às listas.
5. **Atualização a partir do Excel sem perder trabalho**: o ficheiro é comparado com o que já existe; vê-se o que é novo, o que mudou e o que está em conflito; escolhe-se campo a campo; estados, empréstimos e edições feitas na aplicação ficam preservados. Colunas novas do Excel podem passar a campos novos.
6. **Base de dados SQLite** em vez de ficheiros soltos: escritas seguras, histórico mais leve e um só ficheiro para cópia de segurança.
7. **Contas mais seguras**: password inicial provisória obriga a troca; política de passwords (tamanho, letras e números, validade opcional); bloqueio da conta após tentativas falhadas; recuperação de password com código do administrador; duração da sessão configurável; HTTPS e SSO da organização suportados por configuração.
8. **Cópias de segurança automáticas** da base de dados (com verificação) e retenção configurável do Histórico, geridas na página Administração, que inclui também a auditoria de acessos.
9. **Imagens digitalizadas** no detalhe de cada registo (miniaturas, PDF, ligações) e ligação automática a um repositório externo.
10. **Impressão PDF com o modelo institucional** (logótipo, cabeçalho, rodapé) e lista de impressão guardada na conta de cada utilizador.
11. **Ajuda** na própria aplicação: guia rápido por perfil, quem pode fazer o quê e roteiro de formação.

## Fluxos do dia a dia
1. **Encontrar um documento** — Cartografia/ATURB: texto livre e/ou filtros avançados. Exportar ou adicionar à lista de impressão.
2. **Emprestar** — no estado do documento, escolher "Registar empréstimo…", indicar o requisitante e o prazo. Ao regressar, "Devolver". Se o prazo mudar, "Prolongar".
3. **Manter registos** — editar, eliminar para o Lixo (recuperável), consultar o Histórico (mostra só o que mudou).
4. **Atualizar a partir de um Excel** (admin) — menu Importações: carregar → confirmar o mapeamento das colunas → comparar → decidir conflitos → aplicar. Dica: exportar da aplicação, editar no Excel e voltar a importar garante a correspondência exata (coluna *ID SIGAT*).
5. **Acompanhar** — o painel mostra o estado geral; clicar num indicador abre a lista correspondente.

## Pontos a ter em conta
- Os documentos que desaparecem do Excel **não são eliminados** (ficam assinalados como "ausentes do ficheiro").
- Se o mesmo campo for alterado no Excel e na aplicação, aparece como **conflito**; por omissão fica o valor da aplicação.
- Fazer cópias de segurança regulares da pasta `data/` (a aplicação faz cópias da base de dados, mas as imagens anexadas ficam em `data/anexos`); guardar as cópias fora do servidor.
- A primeira vez que se usa uma conta com a password provisória é preciso definir uma nova.
- Alertas de atraso são mostrados na aplicação; não há envio de email.
- Para produção: ativar HTTPS (e SSO, se a organização o disponibilizar) — ver `docker-compose.yml`.

## Sugestões para a fase seguinte
- Alertas por email/Teams para empréstimos em atraso.
- Pesquisa que tolera erros de escrita.
- Fusão assistida de duplicados e reverter uma importação.
- Recuperação de password por email (exige servidor SMTP) e SSO nativo (OIDC/SAML).
- Visualizador integrado de PDF/TIFF e importação em massa de digitalizações.
