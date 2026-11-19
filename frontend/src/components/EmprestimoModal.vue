<script setup>
import { reactive, ref, watch } from 'vue';
import { hojeIso, somarDias, PRAZO_PADRAO_DIAS } from '../format.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  entry: { type: Object, default: null },
  api: { type: Function, required: true },
});
const emit = defineEmits(['close', 'saved']);

const form = reactive({ requisitante: '', entidade: '', contacto: '', dataSaida: '', dataPrevista: '', semPrazo: false, observacoes: '' });
const erros = ref({});
const aGuardar = ref(false);
const erroGeral = ref('');
const sugestoes = ref([]);

watch(() => props.open, async (aberto) => {
  if (!aberto) return;
  const hoje = hojeIso();
  Object.assign(form, { requisitante: '', entidade: '', contacto: '', dataSaida: hoje, dataPrevista: somarDias(hoje, PRAZO_PADRAO_DIAS), semPrazo: false, observacoes: '' });
  erros.value = {};
  erroGeral.value = '';
  try { sugestoes.value = (await props.api('/api/emprestimos/requisitantes')).suggestions || []; } catch { sugestoes.value = []; }
});

async function guardar() {
  erros.value = {};
  erroGeral.value = '';
  if (!form.requisitante.trim()) { erros.value.requisitante = 'Requisitante é obrigatório.'; return; }
  aGuardar.value = true;
  try {
    const r = await props.api(`/api/documentos/${props.entry.id}/emprestimos`, {
      method: 'POST',
      body: JSON.stringify({
        requisitante: form.requisitante,
        entidade: form.entidade,
        contacto: form.contacto,
        dataSaida: form.dataSaida,
        dataPrevista: form.semPrazo ? '' : form.dataPrevista,
        observacoes: form.observacoes,
      }),
    });
    emit('saved', r.entry);
  } catch (e) {
    erros.value = e.details?.erros || {};
    erroGeral.value = e.message;
  } finally {
    aGuardar.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" role="dialog" aria-modal="true" @click.self="emit('close')" @keydown.esc="emit('close')">
      <div class="modal-box" style="max-width:520px;width:96vw">
        <div class="modal-header">
          <div class="modal-header-info">
            <h2 class="modal-title">Registar empréstimo</h2>
            <p class="modal-message">{{ entry?.cabecalho || entry?.titulo }}</p>
          </div>
          <button class="btn btn-ghost btn-icon" type="button" aria-label="Fechar" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form class="modal-body" style="display:grid;gap:12px;" @submit.prevent="guardar">
          <div class="field">
            <label class="field-label required" for="emp-req">Requisitante</label>
            <input id="emp-req" v-model="form.requisitante" list="emp-req-lista" autocomplete="off" />
            <datalist id="emp-req-lista"><option v-for="s in sugestoes" :key="s" :value="s" /></datalist>
            <span v-if="erros.requisitante" style="color:var(--danger);font-size:12px;">{{ erros.requisitante }}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="field"><label class="field-label" for="emp-ent">Entidade / serviço</label><input id="emp-ent" v-model="form.entidade" /></div>
            <div class="field"><label class="field-label" for="emp-cont">Contacto</label><input id="emp-cont" v-model="form.contacto" /></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="field">
              <label class="field-label required" for="emp-saida">Data de saída</label>
              <input id="emp-saida" v-model="form.dataSaida" type="date" :max="hojeIso()" required />
              <span v-if="erros.dataSaida" style="color:var(--danger);font-size:12px;">{{ erros.dataSaida }}</span>
            </div>
            <div class="field">
              <label class="field-label" for="emp-prev">Devolução prevista</label>
              <input id="emp-prev" v-model="form.dataPrevista" type="date" :min="form.dataSaida" :disabled="form.semPrazo" />
              <label style="font-size:12px;display:flex;gap:6px;align-items:center;margin-top:4px;"><input v-model="form.semPrazo" type="checkbox" style="width:auto;" /> Sem prazo definido</label>
              <span v-if="erros.dataPrevista" style="color:var(--danger);font-size:12px;">{{ erros.dataPrevista }}</span>
            </div>
          </div>
          <div class="field"><label class="field-label" for="emp-obs">Observações</label><textarea id="emp-obs" v-model="form.observacoes" rows="2"></textarea></div>
          <p v-if="erroGeral && !Object.keys(erros).length" style="color:var(--danger);font-size:13px;margin:0;">{{ erroGeral }}</p>
          <div class="modal-footer" style="padding:0;border:0;">
            <button class="btn btn-secondary" type="button" @click="emit('close')">Cancelar</button>
            <button class="btn btn-primary" type="submit" :disabled="aGuardar">
              <span v-if="aGuardar" class="spinner spinner-sm"></span>
              Registar empréstimo
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
