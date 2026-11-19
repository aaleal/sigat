<script setup>
import { computed, ref } from 'vue';
import EmprestimoModal from './EmprestimoModal.vue';
import DevolucaoModal from './DevolucaoModal.vue';
import { dataPt, diasDeAtraso } from '../format.js';

const props = defineProps({
  entry: { type: Object, required: true },
  canEdit: { type: Boolean, default: false },
  api: { type: Function, required: true },
});
const emit = defineEmits(['changed', 'erro']);

const OPCOES = ['Arquivo', 'Em Consulta', 'Empréstimo'];
const SUFIXOS = { Arquivo: 'arquivo', 'Em Consulta': 'em-consulta', Empréstimo: 'emprestimo' };

const emprestado = computed(() => props.entry.estado === 'Empréstimo');
const meta = computed(() => props.entry.estadoMeta || null);
const atraso = computed(() => diasDeAtraso(meta.value?.dataPrevista));
const classe = computed(() => `estado-${SUFIXOS[props.entry.estado] || 'default'}`);

const modalEmprestimo = ref(false);
const modalDevolucao = ref(null); // 'devolver' | 'prolongar' | null

function aplicar(fresco) {
  if (fresco) Object.assign(props.entry, fresco);
  modalEmprestimo.value = false;
  modalDevolucao.value = null;
  emit('changed', props.entry);
}

async function mudarEstado(evento) {
  const novo = evento.target.value || '-';
  if (novo === 'Empréstimo') {
    evento.target.value = props.entry.estado; // só muda depois de registar
    modalEmprestimo.value = true;
    return;
  }
  try {
    await props.api(`/api/documentos/${props.entry.id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado: novo }) });
    aplicar(await props.api(`/api/documentos/${props.entry.id}`));
  } catch (e) {
    evento.target.value = props.entry.estado;
    emit('erro', `Erro ao atualizar estado: ${e.message}`);
  }
}
</script>

<template>
  <div class="estado-controlo" @click.stop>
    <template v-if="emprestado">
      <span :class="['estado-badge', classe]">Empréstimo</span>
      <div v-if="meta" style="font-size:11px;margin-top:3px;line-height:1.35;">
        <strong>{{ meta.requisitante }}</strong>
        <div v-if="meta.dataPrevista" :style="{ color: atraso ? 'var(--danger, #dc2626)' : 'var(--muted)' }">
          {{ atraso ? `Em atraso ${atraso} dia${atraso > 1 ? 's' : ''} · era ` : 'até ' }}{{ dataPt(meta.dataPrevista) }}
        </div>
        <div v-else style="color:var(--muted)">Saída {{ dataPt(meta.dataSaida) }} · sem prazo</div>
      </div>
      <div v-if="canEdit" style="display:flex;gap:4px;margin-top:4px;">
        <button class="btn btn-secondary btn-sm" type="button" @click="modalDevolucao = 'devolver'">Devolver</button>
        <button class="btn btn-ghost btn-sm" type="button" @click="modalDevolucao = 'prolongar'">Prolongar</button>
      </div>
    </template>
    <template v-else>
      <select v-if="canEdit" :value="entry.estado === '-' ? '' : entry.estado" :class="['estado-select', classe]" @change="mudarEstado">
        <option value="">— —</option>
        <option v-for="opt in OPCOES" :key="opt" :value="opt">{{ opt === 'Empréstimo' ? 'Registar empréstimo…' : opt }}</option>
      </select>
      <span v-else :class="['estado-badge', classe]">{{ entry.estado && entry.estado !== '-' ? entry.estado : '—' }}</span>
      <div v-if="entry.estadoChangedAt" style="font-size:10px;color:var(--muted);margin-top:2px;">
        {{ new Date(entry.estadoChangedAt).toLocaleString('pt-PT') }} · {{ entry.estadoChangedBy }}
      </div>
    </template>

    <EmprestimoModal :open="modalEmprestimo" :entry="entry" :api="api" @close="modalEmprestimo = false" @saved="aplicar" />
    <DevolucaoModal
      :open="!!modalDevolucao"
      :modo="modalDevolucao || 'devolver'"
      :emprestimo="meta"
      :titulo="entry.cabecalho || entry.titulo"
      :api="api"
      @close="modalDevolucao = null"
      @saved="aplicar"
    />
  </div>
</template>
