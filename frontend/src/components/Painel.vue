<script setup>
import { onMounted, ref, watch } from 'vue';
import { dataPt } from '../format.js';

const props = defineProps({ api: { type: Function, required: true } });
const emit = defineEmits(['pesquisar', 'emprestimos', 'erro']);

const colecao = ref('todas');
const periodo = ref('90');
const incluirVisualizacoes = ref(false);
const dados = ref(null);
const aCarregar = ref(false);
const duplicados = ref(null);

const ESTADOS = [['-', 'Sem estado'], ['Arquivo', 'Arquivo'], ['Em Consulta', 'Em consulta'], ['Empréstimo', 'Emprestado']];
const COR_ESTADO = { '-': '#94a3b8', Arquivo: '#16a34a', 'Em Consulta': '#2563eb', Empréstimo: '#d97706' };

async function carregar() {
  aCarregar.value = true;
  try {
    const p = new URLSearchParams({ colecao: colecao.value, periodo: periodo.value });
    if (incluirVisualizacoes.value) p.set('incluir', 'visualizacoes');
    dados.value = await props.api(`/api/indicadores?${p.toString()}`);
  } catch (e) { emit('erro', e.message); } finally { aCarregar.value = false; }
}

const largura = (n, total) => `${total ? Math.max(2, Math.round((n / total) * 100)) : 0}%`;
const pesquisar = (c, filtro) => emit('pesquisar', { colecao: c.id, filtro });

async function verDuplicados(c) {
  try { duplicados.value = { colecao: c, ...(await props.api(`/api/colecoes/${c.id}/duplicados`)) }; } catch (e) { emit('erro', e.message); }
}

watch([colecao, periodo, incluirVisualizacoes], carregar);
onMounted(carregar);
defineExpose({ carregar });
</script>

<template>
  <div class="painel">
    <div class="card" style="margin-bottom:20px;">
      <div class="card-body" style="display:flex;gap:16px;flex-wrap:wrap;align-items:end;">
        <div class="field"><label class="field-label" for="p-col">Coleção</label>
          <select id="p-col" v-model="colecao"><option value="todas">Todas</option><option value="cartografia">Cartografia</option><option value="aturb">ATURB</option></select></div>
        <div class="field"><label class="field-label" for="p-per">Período (consultas e devoluções)</label>
          <select id="p-per" v-model="periodo"><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Último ano</option><option value="tudo">Tudo</option></select></div>
        <label style="font-size:13px;display:flex;gap:6px;align-items:center;"><input v-model="incluirVisualizacoes" type="checkbox" style="width:auto;" /> Contar também visualizações na aplicação</label>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="aCarregar" @click="carregar">Atualizar</button>
      </div>
    </div>

    <div v-if="dados" style="display:grid;gap:20px;">
      <div class="card">
        <div class="card-header"><div><p class="card-title">Empréstimos</p></div></div>
        <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
          <button type="button" class="painel-cartao" @click="emit('emprestimos', 'ativo')"><span class="painel-num">{{ dados.emprestimos.ativos }}</span><span>ativos</span></button>
          <button type="button" class="painel-cartao" :class="{ 'painel-alerta': dados.emprestimos.emAtraso }" @click="emit('emprestimos', 'atraso')"><span class="painel-num">{{ dados.emprestimos.emAtraso }}</span><span>em atraso</span></button>
          <div class="painel-cartao"><span class="painel-num">{{ dados.emprestimos.aVencer7dias }}</span><span>a vencer em 7 dias</span></div>
          <button type="button" class="painel-cartao" @click="emit('emprestimos', 'sem_prazo')"><span class="painel-num">{{ dados.emprestimos.semPrazo }}</span><span>sem prazo</span></button>
          <div class="painel-cartao"><span class="painel-num">{{ dados.emprestimos.devolvidosNoPeriodo }}</span><span>devolvidos no período</span></div>
          <div class="painel-cartao"><span class="painel-num">{{ dados.emprestimos.duracaoMediaDias ?? '—' }}</span><span>dias de empréstimo (média)</span></div>
        </div>
      </div>

      <div v-for="c in dados.colecoes" :key="c.id" class="card">
        <div class="card-header"><div>
          <p class="card-title">{{ c.nome }}</p>
          <p class="card-subtitle">{{ c.total.toLocaleString('pt-PT') }} documentos · {{ c.eliminados }} no lixo</p>
        </div></div>
        <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;">
          <div>
            <p class="field-label">Documentos por estado</p>
            <button v-for="[chave, rotulo] in ESTADOS" :key="chave" type="button" class="painel-barra" @click="pesquisar(c, { estado: chave === '-' ? '' : chave, vazios: '', emprestimo: '' })" :disabled="chave === '-'" :title="chave === '-' ? '' : 'Ver documentos'">
              <span class="painel-barra-rotulo">{{ rotulo }}</span>
              <span class="painel-barra-fundo"><span class="painel-barra-valor" :style="{ width: largura(c.porEstado[chave] || 0, c.total), background: COR_ESTADO[chave] }"></span></span>
              <span class="painel-barra-num">{{ (c.porEstado[chave] || 0).toLocaleString('pt-PT') }}</span>
            </button>
          </div>
          <div>
            <p class="field-label">Qualidade dos dados</p>
            <div v-for="q in c.qualidade" :key="q.chave" style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:13px;">
              <span style="flex:1;">{{ q.rotulo }}</span>
              <strong :style="{ color: q.total ? 'var(--danger, #dc2626)' : 'inherit' }">{{ q.total.toLocaleString('pt-PT') }}</strong>
              <button class="btn btn-ghost btn-sm" type="button" :disabled="!q.total" @click="pesquisar(c, { vazios: q.filtro.vazios, estado: '', emprestimo: '' })">Ver lista</button>
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:6px;">
              <span style="flex:1;">Possíveis duplicados (mesma cota e descrição)</span>
              <strong>{{ c.duplicados.documentos }}</strong>
              <button class="btn btn-ghost btn-sm" type="button" :disabled="!c.duplicados.grupos" @click="verDuplicados(c)">Ver {{ c.duplicados.grupos }} grupo(s)</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div>
          <p class="card-title">Documentos mais consultados</p>
          <p class="card-subtitle">Consultas presenciais e empréstimos{{ incluirVisualizacoes ? ' e visualizações' : '' }} no período</p>
        </div></div>
        <div class="table-wrap" style="overflow-x:auto;">
          <table>
            <thead><tr><th>#</th><th style="min-width:240px">Documento</th><th>Coleção</th><th>Consultas</th><th>Empréstimos</th><th v-if="incluirVisualizacoes">Visualizações</th><th>Total</th></tr></thead>
            <tbody>
              <tr v-if="!dados.maisConsultados.length"><td colspan="7"><div class="empty-state" style="padding:20px 0;"><p>Ainda não há consultas registadas neste período.</p></div></td></tr>
              <tr v-for="(m, i) in dados.maisConsultados" :key="m.id">
                <td>{{ i + 1 }}</td>
                <td><strong style="font-size:13px;">{{ m.titulo }}</strong><div style="font-size:11px;color:var(--muted);">ID {{ m.numero }} · {{ m.cota }}</div></td>
                <td>{{ m.colecao === 'aturb' ? 'ATURB' : 'Carto.' }}</td>
                <td>{{ m.presencial }}</td><td>{{ m.emprestimo }}</td><td v-if="incluirVisualizacoes">{{ m.visualizacao }}</td><td><strong>{{ m.total }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p v-if="dados.ultimaImportacao" style="font-size:12px;color:var(--muted);">
        Última importação: {{ dados.ultimaImportacao.ficheiro }} ({{ dados.ultimaImportacao.colecao }}) em {{ dataPt(dados.ultimaImportacao.em) }} por {{ dados.ultimaImportacao.por }}
        <template v-if="dados.ultimaImportacao.aplicado"> · {{ dados.ultimaImportacao.aplicado.novos }} novos, {{ dados.ultimaImportacao.aplicado.atualizados }} atualizados</template>
      </p>
    </div>

    <Teleport to="body">
      <div v-if="duplicados" class="modal-backdrop" role="dialog" aria-modal="true" @click.self="duplicados = null">
        <div class="modal-box" style="max-width:820px;width:96vw;max-height:88vh;display:flex;flex-direction:column;">
          <div class="modal-header"><div class="modal-header-info"><h2 class="modal-title">Possíveis duplicados — {{ duplicados.colecao.nome }}</h2><p class="modal-message">{{ duplicados.grupos }} grupo(s), {{ duplicados.documentos }} documentos (mostrados até 200 grupos)</p></div></div>
          <div class="modal-body" style="overflow-y:auto;">
            <div v-for="g in duplicados.itens" :key="g.chave" style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:13px;">
              <div v-for="d in g.documentos" :key="d.id">ID {{ d.numero }} · {{ d.titulo }} · {{ d.cota }} <span style="color:var(--muted)">({{ d.estado === '-' ? 'sem estado' : d.estado }})</span></div>
            </div>
          </div>
          <div class="modal-footer"><button class="btn btn-primary" type="button" @click="duplicados = null">Fechar</button></div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.painel-cartao { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface, #fff); text-align: left; font: inherit; }
button.painel-cartao { cursor: pointer; }
.painel-num { font-size: 26px; font-weight: 700; }
.painel-alerta { border-color: #fca5a5; background: #fef2f2; color: #991b1b; }
.painel-barra { display: grid; grid-template-columns: 110px 1fr 70px; gap: 8px; align-items: center; width: 100%; background: none; border: 0; padding: 4px 0; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.painel-barra:disabled { cursor: default; }
.painel-barra-fundo { height: 10px; background: var(--border, #e2e8f0); border-radius: 6px; overflow: hidden; }
.painel-barra-valor { display: block; height: 100%; border-radius: 6px; }
.painel-barra-num { text-align: right; font-weight: 600; }
</style>
