<script setup>
import { computed, onMounted, reactive, ref } from 'vue';

const props = defineProps({ api: { type: Function, required: true } });
const emit = defineEmits(['ok', 'erro', 'aplicada']);

const colecao = ref('cartografia');
const etapa = ref('inicio'); // inicio | mapeamento | previa | concluida
const aCarregar = ref(false);
const ficheiro = ref(null);
const prep = ref(null);
const mapa = reactive({});
const importacao = ref(null);
const resumo = ref(null);
const aba = ref('alterado');
const page = ref(1);
const itens = ref({ total: 0, items: [], rotulos: {} });
const historico = ref([]);
const resultado = ref(null);

const ESPECIAIS = [
  { v: 'fisica', r: 'Informações físicas (tipo/cor/dimensão)', so: 'cartografia' },
  { v: 'emp_flag', r: 'Empréstimo (Sim/Não)', so: 'cartografia' },
  { v: 'emp_saida', r: 'Empréstimo: data de saída', so: 'cartografia' },
  { v: 'emp_entrada', r: 'Empréstimo: data de entrada', so: 'cartografia' },
  { v: 'emp_requisitante', r: 'Empréstimo: requisitante', so: 'cartografia' },
];
const ABAS = [
  ['novo', 'Novos'], ['alterado', 'Alterados'], ['conflito', 'Conflitos'], ['ambiguo', 'Ambíguos'],
  ['duplicado_ficheiro', 'Duplicados no ficheiro'], ['igual', 'Iguais'], ['ausente', 'Ausentes do ficheiro'], ['erro', 'Erros'],
];
const nomeAcao = Object.fromEntries(ABAS);

const totalPaginas = computed(() => Math.max(1, Math.ceil(itens.value.total / 25)));
const porResolver = computed(() => (resumo.value?.ambiguo || 0));

function destinoDe(valor) { // 'campo:cota' -> {destino, campo}
  if (valor.startsWith('campo:')) return { destino: 'campo', campo: valor.slice(6) };
  return { destino: valor };
}
function valorDe(m) { return m.destino === 'campo' ? `campo:${m.campo}` : m.destino; }

async function carregarHistorico() {
  try { historico.value = (await props.api('/api/importacoes')).items || []; } catch { historico.value = []; }
}

async function enviar() {
  if (!ficheiro.value) return;
  aCarregar.value = true;
  try {
    const body = new FormData();
    body.append('file', ficheiro.value);
    prep.value = await props.api(`/api/colecoes/${colecao.value}/importacoes`, { method: 'POST', body, skipJson: true });
    for (const k of Object.keys(mapa)) delete mapa[k];
    for (const c of prep.value.cabecalhos) {
      const m = prep.value.mapeamento[c.indice];
      mapa[c.indice] = { valor: valorDe(m), rotulo: m.rotulo || c.rotulo };
    }
    importacao.value = prep.value.importacao;
    etapa.value = 'mapeamento';
  } catch (e) { emit('erro', e.message); } finally { aCarregar.value = false; }
}

function mapeamentoAtual() {
  const out = {};
  for (const c of prep.value.cabecalhos) {
    const m = mapa[c.indice];
    out[c.indice] = { ...destinoDe(m.valor), ...(m.valor === 'novo' ? { rotulo: m.rotulo } : {}) };
  }
  return out;
}

async function comparar() {
  aCarregar.value = true;
  try {
    const r = await props.api(`/api/importacoes/${importacao.value.id}/mapeamento`, { method: 'PUT', body: JSON.stringify({ mapeamento: mapeamentoAtual() }) });
    importacao.value = r.importacao;
    resumo.value = r.resumo;
    aba.value = ['conflito', 'ambiguo', 'alterado', 'novo'].find((a) => r.resumo[a] > 0) || 'igual';
    page.value = 1;
    etapa.value = 'previa';
    await carregarItens();
  } catch (e) { emit('erro', e.message); } finally { aCarregar.value = false; }
}

async function carregarItens() {
  itens.value = await props.api(`/api/importacoes/${importacao.value.id}/itens?acao=${aba.value}&page=${page.value}&pageSize=25`);
}
async function mudarAba(a) { aba.value = a; page.value = 1; await carregarItens(); }
async function pagina(d) { page.value = Math.min(totalPaginas.value, Math.max(1, page.value + d)); await carregarItens(); }

async function decidir(item, corpo) {
  try {
    const r = await props.api(`/api/importacoes/${importacao.value.id}/itens/${item.linha}`, { method: 'PATCH', body: JSON.stringify(corpo) });
    if (item.acao === 'ambiguo') { await atualizarResumo(); await carregarItens(); return; }
    item.decisao = r.decisao;
  } catch (e) { emit('erro', e.message); }
}
async function atualizarResumo() {
  const r = await props.api(`/api/importacoes/${importacao.value.id}`);
  resumo.value = { ...resumo.value, ...Object.fromEntries(ABAS.map(([a]) => [a, r.contagens[a] || 0])) };
}

function escolhaDe(item, campo) { return item.decisao?.escolhas?.[campo] || item.diff.campos[campo].escolha; }
function escolher(item, campo, valor) {
  const escolhas = { ...(item.decisao?.escolhas || {}), [campo]: valor };
  decidir(item, { escolhas });
}
async function emMassa(escolha) {
  try {
    await props.api(`/api/importacoes/${importacao.value.id}/decisoes`, { method: 'POST', body: JSON.stringify({ escolha, ambito: 'conflitos' }) });
    await carregarItens();
    emit('ok', escolha === 'sigat' ? 'Mantido o valor do SIGAT em todos os conflitos.' : 'Usado o valor do ficheiro em todos os conflitos.');
  } catch (e) { emit('erro', e.message); }
}

async function aplicar() {
  aCarregar.value = true;
  try {
    const r = await props.api(`/api/importacoes/${importacao.value.id}/aplicar`, { method: 'POST' });
    resultado.value = r.importacao;
    etapa.value = 'concluida';
    emit('ok', 'Importação aplicada com sucesso.');
    emit('aplicada');
    carregarHistorico();
  } catch (e) { emit('erro', e.message); } finally { aCarregar.value = false; }
}

async function cancelar() {
  try { await props.api(`/api/importacoes/${importacao.value.id}`, { method: 'DELETE' }); } catch { /* já cancelada */ }
  reiniciar();
}
function reiniciar() { etapa.value = 'inicio'; ficheiro.value = null; prep.value = null; resumo.value = null; resultado.value = null; carregarHistorico(); }

onMounted(carregarHistorico);
</script>

<template>
  <div class="importacoes">
    <div v-if="etapa === 'inicio'" class="card" style="margin-bottom:20px;">
      <div class="card-header"><div>
        <p class="card-title">Atualizar a partir de Excel</p>
        <p class="card-subtitle">O ficheiro é comparado com os documentos existentes. Nada é alterado até confirmar; estados, empréstimos e edições feitas no SIGAT são preservados.</p>
      </div></div>
      <div class="card-body" style="display:grid;gap:12px;max-width:560px;">
        <div class="field">
          <label class="field-label" for="imp-col">Coleção</label>
          <select id="imp-col" v-model="colecao"><option value="cartografia">Cartografia</option><option value="aturb">Arquivo Técnico de Urbanismo (ATURB)</option></select>
        </div>
        <div class="field">
          <label class="field-label" for="imp-file">Ficheiro .xlsx (máx. 20 MB)</label>
          <input id="imp-file" type="file" accept=".xlsx" @change="ficheiro = $event.target.files?.[0] || null" />
          <span style="font-size:12px;color:var(--muted);">Dica: um ficheiro exportado pelo SIGAT (coluna "ID SIGAT") é associado a 100 % aos documentos.</span>
        </div>
        <div><button class="btn btn-primary" type="button" :disabled="!ficheiro || aCarregar" @click="enviar"><span v-if="aCarregar" class="spinner spinner-sm"></span> Carregar e propor mapeamento</button></div>
      </div>
    </div>

    <div v-if="etapa === 'mapeamento'" class="card" style="margin-bottom:20px;">
      <div class="card-header"><div>
        <p class="card-title">1. Mapear colunas — {{ prep.importacao.ficheiro }}</p>
        <p class="card-subtitle">Folha "{{ prep.folha }}" · {{ prep.totalLinhas }} linhas. Colunas novas podem tornar-se campos novos.</p>
      </div></div>
      <div v-for="a in prep.importacao.avisos" :key="a" class="parse-error-item parse-error-item--warn" style="margin:8px 16px;">{{ a }}</div>
      <div class="table-wrap" style="overflow-x:auto;">
        <table>
          <thead><tr><th>Coluna no ficheiro</th><th>Exemplos</th><th style="min-width:300px">Destino no SIGAT</th></tr></thead>
          <tbody>
            <tr v-for="c in prep.cabecalhos" :key="c.indice">
              <td><strong>{{ c.rotulo }}</strong></td>
              <td style="font-size:12px;color:var(--muted);max-width:320px;"><span class="cell-clamp">{{ c.amostra.join(' · ') }}</span></td>
              <td>
                <select v-model="mapa[c.indice].valor">
                  <option value="ignorar">Ignorar</option>
                  <optgroup label="Campos existentes"><option v-for="f in prep.campos" :key="f.chave" :value="`campo:${f.chave}`">{{ f.rotulo }}</option></optgroup>
                  <optgroup label="Outros">
                    <option value="idSigat">ID SIGAT (identifica o documento)</option>
                    <option v-for="e in ESPECIAIS.filter((x) => x.so === colecao)" :key="e.v" :value="e.v">{{ e.r }}</option>
                    <option value="novo">Novo campo…</option>
                  </optgroup>
                </select>
                <input v-if="mapa[c.indice].valor === 'novo'" v-model="mapa[c.indice].rotulo" placeholder="Nome do novo campo" style="margin-top:4px;" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="padding:12px 16px;display:flex;gap:8px;">
        <button class="btn btn-primary" type="button" :disabled="aCarregar" @click="comparar"><span v-if="aCarregar" class="spinner spinner-sm"></span> Comparar com a coleção</button>
        <button class="btn btn-secondary" type="button" @click="cancelar">Cancelar</button>
      </div>
    </div>

    <div v-if="etapa === 'previa'" class="card" style="margin-bottom:20px;">
      <div class="card-header" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        <div>
          <p class="card-title">2. Pré-visualizar e decidir — {{ importacao.ficheiro }}</p>
          <p class="card-subtitle">
            {{ resumo.totalLinhas }} linhas · {{ resumo.emprestimosCriar }} empréstimo(s) a registar · {{ resumo.emprestimosDevolver }} devolução(ões)
            <template v-if="resumo.novosCampos.length"> · campos novos: {{ resumo.novosCampos.join(', ') }}</template>
          </p>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;">
          <button class="btn btn-primary" type="button" :disabled="aCarregar || porResolver > 0" :title="porResolver ? 'Resolva as linhas ambíguas' : ''" @click="aplicar"><span v-if="aCarregar" class="spinner spinner-sm"></span> Aplicar importação</button>
          <button class="btn btn-secondary" type="button" @click="cancelar">Cancelar</button>
        </div>
      </div>
      <div style="padding:10px 16px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border);">
        <button v-for="[a, rot] in ABAS" :key="a" type="button" :class="['btn', 'btn-sm', aba === a ? 'btn-primary' : 'btn-secondary']" @click="mudarAba(a)">
          {{ rot }} <span class="badge" style="margin-left:4px;">{{ resumo[a] || 0 }}</span>
        </button>
      </div>
      <div v-if="aba === 'conflito' && itens.total" style="padding:8px 16px;display:flex;gap:8px;align-items:center;">
        <span style="font-size:12px;color:var(--muted);">Em todos os conflitos:</span>
        <button class="btn btn-secondary btn-sm" type="button" @click="emMassa('sigat')">Manter SIGAT</button>
        <button class="btn btn-secondary btn-sm" type="button" @click="emMassa('ficheiro')">Usar ficheiro</button>
      </div>

      <div class="table-wrap" style="overflow-x:auto;">
        <table>
          <thead><tr><th style="width:70px">Linha</th><th style="min-width:220px">Documento</th><th style="min-width:380px">{{ nomeAcao[aba] }}</th></tr></thead>
          <tbody>
            <tr v-if="!itens.items.length"><td colspan="3"><div class="empty-state" style="padding:24px 0;"><p>Sem itens nesta categoria.</p></div></td></tr>
            <tr v-for="i in itens.items" :key="i.linha">
              <td>{{ i.linha > 0 ? i.linha : '—' }}</td>
              <td>
                <template v-if="i.documento"><strong style="font-size:13px;">{{ i.documento.titulo }}</strong><div style="font-size:11px;color:var(--muted);">ID {{ i.documento.numero }} · {{ i.documento.cota }}<template v-if="i.criterio"> · por {{ i.criterio }}</template></div></template>
                <template v-else><strong style="font-size:13px;">{{ i.titulo || '—' }}</strong></template>
              </td>
              <td>
                <template v-if="i.acao === 'alterado' || i.acao === 'conflito'">
                  <div v-for="(d, campo) in i.diff.campos" :key="campo" style="font-size:12px;margin-bottom:6px;">
                    <strong>{{ itens.rotulos[campo] || campo }}</strong>
                    <span v-if="d.conflito" class="badge" style="margin-left:6px;background:#fef3c7;color:#92400e;">conflito</span>
                    <div style="display:grid;gap:2px;margin-top:2px;">
                      <label style="display:flex;gap:6px;align-items:flex-start;"><input type="radio" :name="`e-${i.linha}-${campo}`" :checked="escolhaDe(i, campo) === 'sigat'" style="width:auto;" @change="escolher(i, campo, 'sigat')" /><span>SIGAT: {{ d.atual || '(vazio)' }}</span></label>
                      <label style="display:flex;gap:6px;align-items:flex-start;"><input type="radio" :name="`e-${i.linha}-${campo}`" :checked="escolhaDe(i, campo) === 'ficheiro'" style="width:auto;" @change="escolher(i, campo, 'ficheiro')" /><span>Ficheiro: {{ d.ficheiro || '(vazio)' }}</span></label>
                    </div>
                  </div>
                  <div v-if="i.diff.emprestimo" style="font-size:12px;">Empréstimo: {{ i.diff.emprestimo.acao === 'criar' ? `registar (${i.diff.emprestimo.requisitante || 'sem requisitante'})` : 'registar devolução' }}</div>
                </template>
                <template v-else-if="i.acao === 'novo'">
                  <label style="display:flex;gap:6px;align-items:center;font-size:12px;"><input type="checkbox" :checked="!i.decisao?.ignorar" style="width:auto;" @change="decidir(i, { ignorar: !$event.target.checked })" /> Importar como novo documento</label>
                </template>
                <template v-else-if="i.acao === 'duplicado_ficheiro'">
                  <label style="display:flex;gap:6px;align-items:center;font-size:12px;"><input type="checkbox" :checked="!!i.decisao?.criar" style="width:auto;" @change="decidir(i, { criar: $event.target.checked })" /> Importar mesmo assim (repetido no ficheiro)</label>
                </template>
                <template v-else-if="i.acao === 'ambiguo'">
                  <div style="font-size:12px;margin-bottom:4px;">Vários documentos podem corresponder:</div>
                  <div v-for="c in i.candidatosInfo" :key="c.id" style="display:flex;gap:8px;align-items:center;font-size:12px;margin-bottom:2px;">
                    <span>ID {{ c.numero }} · {{ c.titulo }} · {{ c.cota }}</span>
                    <button class="btn btn-secondary btn-sm" type="button" @click="decidir(i, { documentoId: c.id })">É este</button>
                  </div>
                  <button class="btn btn-ghost btn-sm" type="button" @click="decidir(i, { criar: true })">Criar documento novo</button>
                  <button class="btn btn-ghost btn-sm" type="button" @click="decidir(i, { ignorar: true })">Ignorar</button>
                </template>
                <template v-else-if="i.acao === 'ausente'"><span style="font-size:12px;color:var(--muted);">Não consta do ficheiro (mantém-se na coleção).</span></template>
                <template v-else-if="i.acao === 'erro'"><span style="font-size:12px;color:var(--danger, #dc2626);">{{ i.diff?.erro }}</span></template>
                <template v-else><span style="font-size:12px;color:var(--muted);">Sem diferenças.</span></template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination" style="display:flex;align-items:center;gap:10px;padding:12px 16px;">
        <button class="btn btn-secondary btn-sm" type="button" :disabled="page <= 1" @click="pagina(-1)">Anterior</button>
        <span style="font-size:12px;color:var(--muted);">Página {{ page }} de {{ totalPaginas }} · {{ itens.total }} item(ns)</span>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="page >= totalPaginas" @click="pagina(1)">Seguinte</button>
      </div>
    </div>

    <div v-if="etapa === 'concluida'" class="card" style="margin-bottom:20px;">
      <div class="card-header"><div><p class="card-title">Importação concluída</p><p class="card-subtitle">{{ resultado.ficheiro }}</p></div></div>
      <div class="card-body">
        <ul style="margin:0 0 12px 18px;">
          <li>{{ resultado.resumo.aplicado.novos }} documento(s) novo(s)</li>
          <li>{{ resultado.resumo.aplicado.atualizados }} documento(s) atualizado(s) ({{ resultado.resumo.aplicado.camposAlterados }} campo(s))</li>
          <li>{{ resultado.resumo.aplicado.semAlteracoes }} sem alterações · {{ resultado.resumo.aplicado.conflitosMantidos }} conflito(s) mantido(s) como no SIGAT</li>
          <li>{{ resultado.resumo.aplicado.emprestimos }} movimento(s) de empréstimo · {{ resultado.resumo.aplicado.ausentes }} documento(s) ausentes do ficheiro (mantidos)</li>
        </ul>
        <div v-for="a in resultado.avisos" :key="a" class="parse-error-item parse-error-item--warn">{{ a }}</div>
        <button class="btn btn-primary" type="button" style="margin-top:12px;" @click="reiniciar">Nova importação</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div><p class="card-title">Importações anteriores</p></div></div>
      <div class="table-wrap" style="overflow-x:auto;">
        <table>
          <thead><tr><th>Data</th><th>Coleção</th><th>Ficheiro</th><th>Utilizador</th><th>Estado</th><th>Resultado</th></tr></thead>
          <tbody>
            <tr v-if="!historico.length"><td colspan="6"><div class="empty-state" style="padding:20px 0;"><p>Ainda não há importações.</p></div></td></tr>
            <tr v-for="h in historico" :key="h.id">
              <td class="cell-nowrap">{{ new Date(h.aplicadaEm || h.criadaEm).toLocaleString('pt-PT') }}</td>
              <td>{{ h.colecao === 'aturb' ? 'ATURB' : 'Cartografia' }}</td>
              <td>{{ h.ficheiro }}</td>
              <td>{{ h.aplicadaPor || h.criadaPor }}</td>
              <td>{{ h.estado }}</td>
              <td style="font-size:12px;">
                <template v-if="h.resumo?.aplicado">{{ h.resumo.aplicado.novos }} novos · {{ h.resumo.aplicado.atualizados }} atualizados</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
