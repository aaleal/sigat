<script setup>
import { ref } from 'vue';
import { downloadFile } from '../api.js';

const props = defineProps({
  url: { type: String, required: true },
  // Devolve os parâmetros (URLSearchParams) da pesquisa atual, sem paginação.
  getParams: { type: Function, required: true },
  token: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  rotulo: { type: String, default: 'Exportar' },
});
const emit = defineEmits(['ok', 'erro']);

const aberto = ref(false);
const aExportar = ref(false);

async function exportar(formato) {
  aberto.value = false;
  aExportar.value = true;
  try {
    const params = props.getParams();
    params.set('formato', formato);
    params.delete('page');
    params.delete('pageSize');
    const nome = await downloadFile(`${props.url}?${params.toString()}`, props.token);
    emit('ok', `Exportado: ${nome}`);
  } catch (error) {
    emit('erro', `Erro ao exportar: ${error.message}`);
  } finally {
    aExportar.value = false;
  }
}
</script>

<template>
  <div class="exportar-btn" @keydown.esc="aberto = false">
    <button class="btn btn-secondary btn-sm" type="button" :disabled="disabled || aExportar" @click="aberto = !aberto">
      <span v-if="aExportar" class="spinner spinner-sm"></span>
      <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      {{ rotulo }}
    </button>
    <div v-if="aberto" class="exportar-menu" role="menu">
      <button type="button" role="menuitem" @click="exportar('xlsx')">Excel (.xlsx)</button>
      <button type="button" role="menuitem" @click="exportar('csv')">CSV (.csv)</button>
    </div>
    <div v-if="aberto" class="exportar-fundo" @click="aberto = false"></div>
  </div>
</template>

<style scoped>
.exportar-btn { position: relative; display: inline-block; }
.exportar-menu {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 30; min-width: 150px;
  background: var(--surface, #fff); border: 1px solid var(--border, #ddd); border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12); display: flex; flex-direction: column; padding: 4px;
}
.exportar-menu button {
  text-align: left; background: none; border: none; padding: 8px 10px; border-radius: 6px; cursor: pointer; font: inherit;
}
.exportar-menu button:hover { background: var(--bg-hover, rgba(0, 0, 0, 0.06)); }
.exportar-fundo { position: fixed; inset: 0; z-index: 20; }
</style>
