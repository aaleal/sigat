<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import DevolucaoModal from './DevolucaoModal.vue';
import ExportarBotao from './ExportarBotao.vue';
import { dataPt } from '../format.js';

const props = defineProps({
  api: { type: Function, required: true },
  token: { type: String, default: '' },
  canEdit: { type: Boolean, default: false },
  resumo: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['changed', 'erro', 'ok', 'abrir']);

const ABAS = [
  { id: 'ativo', rotulo: 'Ativos' },
  { id: 'atraso', rotulo: 'Em atraso' },
  { id: 'sem_prazo', rotulo: 'Sem prazo' },
  { id: 'devolvido', rotulo: 'Histórico' },
];

const aba = ref('ativo');
const filtros = reactive({ colecao: '', requisitante: '', de: '', ate: '' });
const itens = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 25;
const aCarregar = ref(false);
const modal = reactive({ modo: null, item: null });

const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

function params() {
  const p = new URLSearchParams({ estado: aba.value });
  for (const [k, v] of Object.entries(filtros)) if (String(v).trim()) p.set(k, String(v).trim());
  return p;
}

async function carregar() {
  aCarregar.value = true;
  try {
    const p = params();
    p.set('page', String(page.value));
    p.set('pageSize', String(pageSize));
    const r = await props.api(`/api/emprestimos?${p.toString()}`);
    itens.value = r.items || [];
    total.value = r.total || 0;
  } catch (e) {
    emit('erro', e.message);
  } finally {
    aCarregar.value = false;
  }
}

function pesquisar() { page.value = 1; carregar(); }
function limpar() { Object.assign(filtros, { colecao: '', requisitante: '', de: '', ate: '' }); pesquisar(); }
function mudarPagina(delta) { page.value = Math.min(totalPaginas.value, Math.max(1, page.value + delta)); carregar(); }

function aposAlterar() {
  modal.modo = null;
  carregar();
  emit('changed');
}

function situacaoTexto(i) {
  if (i.situacao === 'em_atraso') return `Em atraso ${i.diasAtraso} dia${i.diasAtraso > 1 ? 's' : ''}`;
  if (i.situacao === 'sem_prazo') return 'Sem prazo';
  if (i.situacao === 'devolvido_com_atraso') return `Devolvido com ${i.diasAtraso} dia${i.diasAtraso > 1 ? 's' : ''} de atraso`;
  if (i.situacao === 'devolvido') return 'Devolvido';
  return 'No prazo';
}

watch(aba, pesquisar);
onMounted(carregar);
function abrirAba(estado) { if (ABAS.some((a) => a.id === estado)) aba.value = estado; }
defineExpose({ carregar, abrirAba });
</script>

<template>
  <div class="card">
    <div class="card-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div>
        <h2 class="card-title">Empréstimos</h2>
        <p class="card-subtitle">
          {{ resumo.ativos ?? 0 }} ativo{{ resumo.ativos === 1 ? '' : 's' }} ·
          <strong :style="{ color: resumo.emAtraso ? 'var(--danger, #dc2626)' : 'inherit' }">{{ resumo.emAtraso ?? 0 }} em atraso</strong> ·
          {{ resumo.aVencer7dias ?? 0 }} a vencer em 7 dias
        </p>
      </div>
      <div style="margin-left:auto;">
        <ExportarBotao url="/api/emprestimos/exportar" :get-params="params" :token="token" :disabled="total === 0" @ok="emit('ok', $event)" @erro="emit('erro', $event)" />
      </div>
    </div>

    <div class="card-body" style="padding:12px 16px;border-bottom:1px solid var(--border);">
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
        <button
          v-for="a in ABAS" :key="a.id" type="button" :class="['btn', 'btn-sm', aba === a.id ? 'btn-primary' : 'btn-secondary']" @click="aba = a.id"
        >
          {{ a.rotulo }}
          <span v-if="a.id === 'atraso' && resumo.emAtraso" class="badge" style="margin-left:4px;background:var(--danger, #dc2626);color:#fff;">{{ resumo.emAtraso }}</span>
          <span v-else-if="a.id === 'sem_prazo' && resumo.semPrazo" class="badge" style="margin-left:4px;">{{ resumo.semPrazo }}</span>
        </button>
      </div>
      <form style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;" @submit.prevent="pesquisar">
        <div class="field" style="min-width:150px;">
          <label class="field-label" for="emp-f-col">Coleção</label>
          <select id="emp-f-col" v-model="filtros.colecao"><option value="">Todas</option><option value="cartografia">Cartografia</option><option value="aturb">ATURB</option></select>
        </div>
        <div class="field" style="min-width:200px;"><label class="field-label" for="emp-f-req">Requisitante / entidade</label><input id="emp-f-req" v-model="filtros.requisitante" /></div>
        <div class="field"><label class="field-label" for="emp-f-de">Saída desde</label><input id="emp-f-de" v-model="filtros.de" type="date" /></div>
        <div class="field"><label class="field-label" for="emp-f-ate">Saída até</label><input id="emp-f-ate" v-model="filtros.ate" type="date" /></div>
        <button class="btn btn-primary btn-sm" type="submit">Filtrar</button>
        <button class="btn btn-ghost btn-sm" type="button" @click="limpar">Limpar</button>
      </form>
    </div>

    <div class="table-wrap" style="overflow-x:auto;position:relative;">
      <div v-if="aCarregar" class="table-loading-overlay"><div class="spinner"></div></div>
      <table>
        <thead>
          <tr>
            <th style="min-width:240px">Documento</th>
            <th>Requisitante</th>
            <th>Saída</th>
            <th>Prevista</th>
            <th v-if="aba === 'devolvido'">Devolução</th>
            <th>Situação</th>
            <th v-if="canEdit && aba !== 'devolvido'" style="width:170px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!itens.length && !aCarregar">
            <td :colspan="7"><div class="empty-state" style="padding:32px 0;"><h3>Sem empréstimos</h3><p>Não há empréstimos nesta lista.</p></div></td>
          </tr>
          <tr v-for="i in itens" :key="i.id">
            <td>
              <a href="#" style="font-size:13px;" @click.prevent="emit('abrir', i.documento)">{{ i.documento.titulo || '—' }}</a>
              <div style="font-size:11px;color:var(--muted);">
                {{ i.documento.colecao === 'aturb' ? 'ATURB' : 'Carto.' }} · ID {{ i.documento.numero }}<template v-if="i.documento.cota || i.documento.caixaNr"> · {{ i.documento.cota || `Caixa ${i.documento.caixaNr}` }}</template>
              </div>
            </td>
            <td>
              <strong style="font-size:13px;">{{ i.requisitante }}</strong>
              <div v-if="i.entidade" style="font-size:11px;color:var(--muted);">{{ i.entidade }}</div>
            </td>
            <td class="cell-nowrap">{{ dataPt(i.dataSaida) }}</td>
            <td class="cell-nowrap">{{ i.dataPrevista ? dataPt(i.dataPrevista) : '—' }}</td>
            <td v-if="aba === 'devolvido'" class="cell-nowrap">{{ dataPt(i.dataDevolucao) }}</td>
            <td class="cell-nowrap">
              <span :style="{ color: i.situacao === 'em_atraso' || i.situacao === 'devolvido_com_atraso' ? 'var(--danger, #dc2626)' : 'inherit', fontSize: '12px' }">{{ situacaoTexto(i) }}</span>
            </td>
            <td v-if="canEdit && aba !== 'devolvido'" class="cell-nowrap">
              <div class="td-actions">
                <button class="btn btn-secondary btn-sm" type="button" @click="modal.item = i; modal.modo = 'devolver'">Devolver</button>
                <button class="btn btn-ghost btn-sm" type="button" @click="modal.item = i; modal.modo = 'prolongar'">Prolongar</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pagination" style="display:flex;align-items:center;gap:10px;padding:12px 16px;">
      <button class="btn btn-secondary btn-sm" type="button" :disabled="page <= 1" @click="mudarPagina(-1)">Anterior</button>
      <span style="font-size:12px;color:var(--muted);">Página {{ page }} de {{ totalPaginas }} · {{ total }} registo{{ total === 1 ? '' : 's' }}</span>
      <button class="btn btn-secondary btn-sm" type="button" :disabled="page >= totalPaginas" @click="mudarPagina(1)">Seguinte</button>
    </div>

    <DevolucaoModal
      :open="!!modal.modo"
      :modo="modal.modo || 'devolver'"
      :emprestimo="modal.item"
      :titulo="modal.item?.documento?.titulo"
      :api="api"
      @close="modal.modo = null"
      @saved="aposAlterar"
    />
  </div>
</template>
