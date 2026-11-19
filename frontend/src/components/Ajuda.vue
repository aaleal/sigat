<script setup>
import { computed, ref } from 'vue';

const props = defineProps({ role: { type: String, default: 'read' } });

const perfil = ref(props.role);
const PERFIS = [['read', 'Leitura'], ['write', 'Escrita'], ['admin', 'Administrador']];

// Cada perfil herda o anterior.
const GUIAS = {
  read: {
    resumo: 'Pesquisar, consultar e imprimir. Não altera dados.',
    passos: [
      ['Pesquisar', 'Em Cartografia ou ATURB escreva na caixa de pesquisa: aceita palavras parciais, sem acentos nem maiúsculas, e ordena por relevância. Use “Filtros avançados” para campos específicos e “Campos vazios” para encontrar registos incompletos.'],
      ['Ver o detalhe', 'Clique numa linha para abrir o registo: dados, estado (Arquivo / Em Consulta / Empréstimo) e imagens digitalizadas, com miniaturas e ligações.'],
      ['Exportar', 'O botão Exportar gera Excel ou CSV com os resultados da pesquisa atual (respeita filtros e ordenação).'],
      ['Imprimir fichas', 'Clique no ícone da impressora numa linha para a juntar à lista de Impressão PDF. A lista fica guardada na sua conta, mesmo ao terminar a sessão. Em “Impressão PDF” escolha “Imprimir PDF” e, no diálogo do browser, “Guardar como PDF”.'],
      ['Empréstimos e Painel', 'Veja quem tem cada documento, prazos e atrasos em Empréstimos; o Painel resume estados, qualidade dos dados e os documentos mais consultados.'],
      ['A sua conta', 'Mude a password em “Alterar password”. Se a esquecer, use “Esqueci-me da password” no ecrã de entrada e peça o código ao administrador. Após várias tentativas falhadas a conta fica bloqueada temporariamente.'],
    ],
  },
  write: {
    resumo: 'Tudo o que o perfil Leitura faz, mais criar, editar e gerir estados e empréstimos.',
    passos: [
      ['Criar e editar', 'Use “Nova entrada” e o ícone de lápis. Os campos obrigatórios são validados; só é possível limpar um campo não obrigatório. Cada alteração fica no Histórico com o valor anterior.'],
      ['Estado e empréstimos', 'No detalhe do registo altere o estado. Em Empréstimo indique requisitante, data de saída e prazo; devolva ou prolongue em Empréstimos. Um documento só pode ter um empréstimo ativo.'],
      ['Imagens digitalizadas', 'No detalhe use “Anexar ficheiro” (JPEG, PNG, GIF, WebP, TIFF ou PDF até 25 MB) ou “Adicionar ligação” para uma digitalização noutro servidor. A miniatura é criada automaticamente.'],
      ['Lixo e restauro', 'Eliminar move para o Lixo; pode restaurar a qualquer momento. Nada é apagado definitivamente.'],
      ['Histórico', 'Consulte quem alterou o quê e quando, por coleção ou por documento.'],
    ],
  },
  admin: {
    resumo: 'Tudo o que o perfil Escrita faz, mais importações, contas e administração do sistema.',
    passos: [
      ['Importações', 'Carregue o Excel, confirme o mapeamento das colunas e reveja as diferenças (novos, alterados, conflitos, ambíguos) antes de aplicar. Estados e empréstimos nunca são sobrescritos. Exporte → edite → reimporte funciona porque o Excel exportado traz “ID SIGAT”.'],
      ['Contas', 'Crie contas com o perfil mínimo necessário. Pode repor password, alterar o perfil, terminar sessões e desbloquear contas. Em “Pedidos de recuperação” emita o código de uso único e entregue-o ao utilizador por outro canal (telefone/presencial).'],
      ['Segurança', 'Em Administração → Segurança defina duração da sessão, política de passwords e bloqueio. Em produção use HTTPS e, se possível, SSO da organização.'],
      ['Cópias e retenção', 'As cópias são automáticas (verifique a última em Administração → Estado). Guarde-as fora do servidor. Defina quantos dias de Histórico manter; 0 guarda sempre.'],
      ['Modelo de impressão', 'Carregue o logótipo e defina o cabeçalho e rodapé das fichas PDF.'],
      ['Auditoria', 'Veja logins, falhas, bloqueios, alterações de perfis, configuração e cópias.'],
    ],
  },
};

const passos = computed(() => GUIAS[perfil.value].passos);

const MATRIZ = [
  ['Pesquisar, ver detalhe, exportar, imprimir fichas', true, true, true],
  ['Ver empréstimos, Painel e imagens', true, true, true],
  ['Criar / editar / eliminar / restaurar registos', false, true, true],
  ['Alterar estado, registar empréstimos e devoluções', false, true, true],
  ['Anexar e remover imagens e ligações', false, true, true],
  ['Ver Histórico e Lixo', false, true, true],
  ['Importar ficheiros Excel (carregar dados em massa)', false, false, true],
  ['Gerir contas, perfis e recuperação de passwords', false, false, true],
  ['Configuração, cópias de segurança e auditoria', false, false, true],
];

const FORMACAO = [
  ['Leitura (15 min)', ['Entrar e alterar a password', 'Pesquisar por palavra parcial e por cota', 'Abrir um registo e ver as imagens', 'Exportar uma pesquisa para Excel', 'Juntar 3 fichas e imprimir em PDF']],
  ['Escrita (+30 min)', ['Criar e editar um registo', 'Registar um empréstimo e a devolução', 'Anexar uma imagem e uma ligação', 'Eliminar e restaurar pelo Lixo', 'Consultar o Histórico de um registo']],
  ['Administração (+45 min)', ['Importar um Excel e resolver conflitos', 'Criar conta e emitir código de recuperação', 'Rever cópias, retenção e auditoria', 'Configurar o modelo de impressão']],
];
</script>

<template>
  <div class="ajuda">
    <div class="card">
      <div class="card-header"><div><p class="card-title">Guia rápido por perfil</p><p class="card-subtitle">O seu perfil atual: <strong>{{ PERFIS.find(([r]) => r === role)?.[1] }}</strong></p></div></div>
      <div class="card-body">
        <div class="ajuda-abas" role="tablist">
          <button v-for="[r, rotulo] in PERFIS" :key="r" type="button" role="tab" :class="['btn', 'btn-sm', perfil === r ? 'btn-primary' : 'btn-secondary']" @click="perfil = r">{{ rotulo }}</button>
        </div>
        <p class="ajuda-resumo">{{ GUIAS[perfil].resumo }}</p>
        <ol class="ajuda-passos">
          <li v-for="[titulo, texto] in passos" :key="titulo"><strong>{{ titulo }}.</strong> {{ texto }}</li>
        </ol>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div><p class="card-title">Quem pode fazer o quê</p></div></div>
      <div class="table-wrap" style="overflow-x:auto;">
        <table>
          <thead><tr><th style="min-width:320px">Ação</th><th>Leitura</th><th>Escrita</th><th>Administrador</th></tr></thead>
          <tbody>
            <tr v-for="[acao, ...r] in MATRIZ" :key="acao"><td>{{ acao }}</td><td v-for="(ok, i) in r" :key="i" :style="{ color: ok ? '#16a34a' : '#94a3b8', fontWeight: 700 }">{{ ok ? 'Sim' : '—' }}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div><p class="card-title">Formação curta</p><p class="card-subtitle">Roteiro para sessões de formação — cada perfil pratica as tarefas da lista.</p></div></div>
      <div class="card-body ajuda-formacao">
        <div v-for="[titulo, tarefas] in FORMACAO" :key="titulo">
          <p class="field-label">{{ titulo }}</p>
          <ul><li v-for="t in tarefas" :key="t">{{ t }}</li></ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ajuda { display: grid; gap: 20px; max-width: 980px; }
.ajuda-abas { display: flex; gap: 8px; margin-bottom: 12px; }
.ajuda-resumo { color: var(--muted); font-size: 13px; margin: 0 0 12px; }
.ajuda-passos { margin: 0; padding-left: 20px; display: grid; gap: 10px; font-size: 14px; line-height: 1.5; }
.ajuda-formacao { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; font-size: 13px; }
.ajuda-formacao ul { margin: 4px 0 0; padding-left: 18px; line-height: 1.6; }
</style>
