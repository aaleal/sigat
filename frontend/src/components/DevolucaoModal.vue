<script setup>
import { reactive, ref, watch } from 'vue';
import { hojeIso, somarDias, dataPt, PRAZO_PADRAO_DIAS } from '../format.js';

// modo 'devolver' | 'prolongar'; `emprestimoId` e dados do empréstimo vêm de `emprestimo` (estadoMeta ou item da lista).
const props = defineProps({
  open: { type: Boolean, default: false },
  modo: { type: String, default: 'devolver' },
  emprestimo: { type: Object, default: null },
  titulo: { type: String, default: '' },
  api: { type: Function, required: true },
});
const emit = defineEmits(['close', 'saved']);

const form = reactive({ data: '', observacoes: '' });
const erro = ref('');
const aGuardar = ref(false);

watch(() => props.open, (aberto) => {
  if (!aberto) return;
  erro.value = '';
  form.observacoes = '';
  const hoje = hojeIso();
  form.data = props.modo === 'devolver' ? hoje : somarDias(props.emprestimo?.dataPrevista > hoje ? props.emprestimo.dataPrevista : hoje, PRAZO_PADRAO_DIAS);
});

async function guardar() {
  erro.value = '';
  aGuardar.value = true;
  const id = props.emprestimo?.emprestimoId || props.emprestimo?.id;
  try {
    const r = props.modo === 'devolver'
      ? await props.api(`/api/emprestimos/${id}/devolver`, { method: 'POST', body: JSON.stringify({ dataDevolucao: form.data, observacoes: form.observacoes }) })
      : await props.api(`/api/emprestimos/${id}`, { method: 'PATCH', body: JSON.stringify({ dataPrevista: form.data }) });
    emit('saved', r.entry);
  } catch (e) {
    erro.value = e.message;
  } finally {
    aGuardar.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" role="dialog" aria-modal="true" @click.self="emit('close')" @keydown.esc="emit('close')">
      <div class="modal-box" style="max-width:440px;width:96vw">
        <div class="modal-header">
          <div class="modal-header-info">
            <h2 class="modal-title">{{ modo === 'devolver' ? 'Registar devolução' : 'Prolongar empréstimo' }}</h2>
            <p class="modal-message">{{ titulo }}</p>
          </div>
        </div>
        <form class="modal-body" style="display:grid;gap:12px;" @submit.prevent="guardar">
          <p v-if="emprestimo" style="margin:0;font-size:13px;color:var(--muted);">
            Requisitante: <strong>{{ emprestimo.requisitante }}</strong> · saída {{ dataPt(emprestimo.dataSaida) }}
            <template v-if="emprestimo.dataPrevista"> · previsto {{ dataPt(emprestimo.dataPrevista) }}</template>
          </p>
          <div class="field">
            <label class="field-label required" for="dev-data">{{ modo === 'devolver' ? 'Data de devolução' : 'Nova data prevista' }}</label>
            <input id="dev-data" v-model="form.data" type="date" required :max="modo === 'devolver' ? hojeIso() : undefined" :min="emprestimo?.dataSaida" />
          </div>
          <div v-if="modo === 'devolver'" class="field">
            <label class="field-label" for="dev-obs">Observações (estado de conservação)</label>
            <textarea id="dev-obs" v-model="form.observacoes" rows="2"></textarea>
          </div>
          <p v-if="erro" style="color:var(--danger);font-size:13px;margin:0;">{{ erro }}</p>
          <div class="modal-footer" style="padding:0;border:0;">
            <button class="btn btn-secondary" type="button" @click="emit('close')">Cancelar</button>
            <button class="btn btn-primary" type="submit" :disabled="aGuardar || !form.data">
              <span v-if="aGuardar" class="spinner spinner-sm"></span>
              {{ modo === 'devolver' ? 'Registar devolução' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
