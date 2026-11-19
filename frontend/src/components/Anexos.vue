<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { downloadFile } from '../api.js';

const props = defineProps({
  documento: { type: Object, required: true },
  canEdit: { type: Boolean, default: false },
  api: { type: Function, required: true },
  token: { type: String, required: true },
  modeloUrl: { type: String, default: '' },
});
const emit = defineEmits(['ok', 'erro']);

const itens = ref([]);
const miniaturas = ref({}); // id -> object URL
const aEnviar = ref(false);
const legenda = ref('');
const ligacao = ref({ url: '', nome: '' });
const ver = ref(null); // { nome, src }

const IMAGEM_EXIBIVEL = /^image\/(jpeg|png|gif|webp)$/;
const cabecalhos = () => ({ Authorization: `Bearer ${props.token}` });

async function blobUrl(url) {
  const r = await fetch(url, { headers: cabecalhos() });
  if (!r.ok) throw new Error('Não foi possível carregar a imagem.');
  return URL.createObjectURL(await r.blob());
}

function libertar() {
  Object.values(miniaturas.value).forEach((u) => URL.revokeObjectURL(u));
  miniaturas.value = {};
  if (ver.value) { URL.revokeObjectURL(ver.value.src); ver.value = null; }
}

async function carregar() {
  libertar();
  try {
    itens.value = (await props.api(`/api/documentos/${props.documento.id}/anexos`)).items;
    for (const a of itens.value) {
      if (a.tipo !== 'ficheiro' || !IMAGEM_EXIBIVEL.test(a.mime)) continue;
      // sem miniatura própria usa-se o ficheiro (pode ser pesado, mas só para anexos antigos/sem canvas)
      blobUrl(`/api/anexos/${a.id}/ficheiro${a.temMiniatura ? '?miniatura=1' : ''}`)
        .then((u) => { miniaturas.value = { ...miniaturas.value, [a.id]: u }; })
        .catch(() => {});
    }
  } catch (e) { emit('erro', e.message); }
}

async function abrir(a) {
  try {
    if (ver.value) URL.revokeObjectURL(ver.value.src);
    ver.value = { nome: a.legenda || a.nome, src: await blobUrl(`/api/anexos/${a.id}/ficheiro`) };
  } catch (e) { emit('erro', e.message); }
}
function fechar() { if (ver.value) URL.revokeObjectURL(ver.value.src); ver.value = null; }

async function transferir(a) {
  try { await downloadFile(`/api/anexos/${a.id}/ficheiro`, props.token); } catch (e) { emit('erro', e.message); }
}

// Miniatura JPEG (máx. 320 px) criada no browser: evita carregar digitalizações grandes nas listas.
async function criarMiniatura(file) {
  if (!IMAGEM_EXIBIVEL.test(file.type)) return null;
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * escala));
    canvas.height = Math.max(1, Math.round(bmp.height * escala));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  } catch { return null; }
}

async function enviar(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  aEnviar.value = true;
  try {
    const body = new FormData();
    body.append('file', file);
    const mini = await criarMiniatura(file);
    if (mini) body.append('miniatura', mini, 'miniatura.jpg');
    if (legenda.value.trim()) body.append('legenda', legenda.value.trim());
    await props.api(`/api/documentos/${props.documento.id}/anexos`, { method: 'POST', body, skipJson: true });
    legenda.value = '';
    emit('ok', 'Ficheiro anexado.');
    await carregar();
  } catch (e) { emit('erro', e.message); } finally { aEnviar.value = false; }
}

async function adicionarLigacao() {
  try {
    await props.api(`/api/documentos/${props.documento.id}/anexos`, {
      method: 'POST',
      body: JSON.stringify({ url: ligacao.value.url, nome: ligacao.value.nome, legenda: legenda.value }),
    });
    ligacao.value = { url: '', nome: '' };
    legenda.value = '';
    emit('ok', 'Ligação adicionada.');
    await carregar();
  } catch (e) { emit('erro', e.message); }
}

async function remover(a) {
  if (!window.confirm(`Remover "${a.legenda || a.nome}"?`)) return;
  try {
    await props.api(`/api/anexos/${a.id}`, { method: 'DELETE' });
    await carregar();
  } catch (e) { emit('erro', e.message); }
}

// Ligação automática a partir do modelo configurado (ex.: https://servidor/{nrRegisto}.jpg).
const ligacaoModelo = computed(() => {
  if (!props.modeloUrl) return '';
  let falta = false;
  const url = props.modeloUrl.replace(/\{([A-Za-z0-9_]+)\}/g, (_m, chave) => {
    const v = String(props.documento[chave] ?? '').trim();
    if (!v) falta = true;
    return encodeURIComponent(v);
  });
  return falta ? '' : url;
});

const tamanho = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

watch(() => props.documento.id, carregar, { immediate: true });
onBeforeUnmount(libertar);
</script>

<template>
  <div class="anexos">
    <div class="anexos-cab">
      <span class="entry-field-label">Imagens digitalizadas e ligações</span>
      <a v-if="ligacaoModelo" :href="ligacaoModelo" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">Abrir digitalização no repositório</a>
    </div>

    <p v-if="!itens.length" class="anexos-vazio">Sem imagens ou ligações associadas.</p>
    <div v-else class="anexos-grelha">
      <div v-for="a in itens" :key="a.id" class="anexo">
        <button v-if="a.tipo === 'ficheiro' && miniaturas[a.id]" type="button" class="anexo-img" :title="a.nome" @click="abrir(a)">
          <img :src="miniaturas[a.id]" :alt="a.legenda || a.nome" />
        </button>
        <button v-else-if="a.tipo === 'ficheiro'" type="button" class="anexo-img anexo-ficheiro" :title="a.nome" @click="IMAGEM_EXIBIVEL.test(a.mime) ? abrir(a) : transferir(a)">
          <span>{{ a.mime === 'application/pdf' ? 'PDF' : a.mime === 'image/tiff' ? 'TIFF' : 'IMG' }}</span>
        </button>
        <a v-else :href="a.url" target="_blank" rel="noopener noreferrer" class="anexo-img anexo-ficheiro" :title="a.url"><span>Ligação</span></a>
        <div class="anexo-info">
          <strong>{{ a.legenda || a.nome }}</strong>
          <small v-if="a.tipo === 'ficheiro'">{{ a.nome }} · {{ tamanho(a.tamanho) }}</small>
          <small v-else>{{ a.nome }}</small>
        </div>
        <div class="anexo-acoes">
          <button v-if="a.tipo === 'ficheiro'" class="btn btn-ghost btn-sm" type="button" @click="transferir(a)">Descarregar</button>
          <button v-if="canEdit" class="btn btn-danger btn-sm" type="button" @click="remover(a)">Remover</button>
        </div>
      </div>
    </div>

    <div v-if="canEdit" class="anexos-form">
      <input v-model="legenda" placeholder="Legenda (opcional)" maxlength="300" aria-label="Legenda" />
      <label class="btn btn-secondary btn-sm" :class="{ disabled: aEnviar }">
        {{ aEnviar ? 'A enviar...' : 'Anexar ficheiro' }}
        <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/tiff,application/pdf" style="display:none" :disabled="aEnviar" @change="enviar" />
      </label>
      <form class="anexos-ligacao" @submit.prevent="adicionarLigacao">
        <input v-model="ligacao.url" type="url" placeholder="https://… (ligação para imagem/digitalização)" required aria-label="URL" />
        <input v-model="ligacao.nome" placeholder="Nome (opcional)" aria-label="Nome da ligação" />
        <button class="btn btn-secondary btn-sm" type="submit">Adicionar ligação</button>
      </form>
    </div>

    <Teleport to="body">
      <div v-if="ver" class="modal-backdrop" role="dialog" aria-modal="true" @click.self="fechar">
        <div class="modal-box" style="max-width:96vw;width:auto;max-height:94vh;display:flex;flex-direction:column;">
          <div class="modal-header"><div class="modal-header-info"><h2 class="modal-title">{{ ver.nome }}</h2></div></div>
          <div class="modal-body" style="overflow:auto;text-align:center;"><img :src="ver.src" :alt="ver.nome" style="max-width:100%;max-height:75vh;" /></div>
          <div class="modal-footer"><button class="btn btn-primary" type="button" @click="fechar">Fechar</button></div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.anexos { margin-top: 16px; border-top: 1px solid var(--border); padding-top: 12px; }
.anexos-cab { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.anexos-vazio { font-size: 13px; color: var(--muted); margin: 4px 0 8px; }
.anexos-grelha { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-bottom: 12px; }
.anexo { border: 1px solid var(--border); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.anexo-img { display: grid; place-items: center; height: 110px; border: 0; background: #f1f5f9; border-radius: 6px; cursor: pointer; overflow: hidden; text-decoration: none; color: inherit; }
.anexo-img img { max-width: 100%; max-height: 100%; object-fit: contain; }
.anexo-ficheiro span { font-weight: 700; color: #64748b; letter-spacing: 0.05em; }
.anexo-info { display: flex; flex-direction: column; min-width: 0; }
.anexo-info strong, .anexo-info small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.anexo-info small { color: var(--muted); }
.anexo-acoes { display: flex; gap: 4px; flex-wrap: wrap; }
.anexos-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.anexos-form input:not([type='file']) { flex: 1 1 200px; min-width: 0; }
.anexos-ligacao { display: flex; flex-wrap: wrap; gap: 8px; flex: 1 1 100%; }
.disabled { opacity: 0.6; pointer-events: none; }
</style>
