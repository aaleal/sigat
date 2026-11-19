<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { downloadFile } from '../api.js';
import { dataHoraPt } from '../format.js';

const props = defineProps({
  api: { type: Function, required: true },
  token: { type: String, required: true },
});
const emit = defineEmits(['ok', 'erro', 'modelo']);

const aba = ref('estado');
const cfg = reactive({});
const limites = ref({});
const erros = ref({});
const estado = ref(null);
const backups = ref([]);
const pastaBackups = ref('');
const auditoria = ref([]);
const filtroAuditoria = ref('');
const aCarregar = ref(false);

const ABAS = [['estado', 'Estado'], ['seguranca', 'Segurança e sessões'], ['copias', 'Cópias e retenção'], ['pdf', 'Modelo de impressão'], ['imagens', 'Imagens'], ['auditoria', 'Auditoria']];
const CHAVES = {
  seguranca: ['sessao_horas', 'password_min', 'password_complexa', 'password_validade_dias', 'max_tentativas', 'bloqueio_minutos', 'recuperacao_validade_minutos'],
  copias: ['backup_ativo', 'backup_intervalo_horas', 'backup_retencao', 'historico_retencao_dias', 'auditoria_retencao_dias'],
  pdf: ['pdf_cabecalho1', 'pdf_cabecalho2', 'pdf_rodape', 'pdf_cor', 'pdf_logo'],
  imagens: ['imagens_url_modelo'],
};
const ACOES_AUDITORIA = {
  login_ok: 'Login', login_falhou: 'Login falhado', login_bloqueado: 'Login (conta bloqueada)', conta_bloqueada: 'Conta bloqueada', conta_desbloqueada: 'Conta desbloqueada',
  password_alterada: 'Password alterada', password_reposta: 'Password reposta (admin)', recuperacao_pedida: 'Recuperação pedida', recuperacao_emitida: 'Código emitido',
  recuperacao_usada: 'Recuperação concluída', recuperacao_falhou: 'Recuperação falhada', sessoes_revogadas: 'Sessões terminadas', utilizador_criado: 'Utilizador criado',
  utilizador_apagado: 'Utilizador apagado', role_alterada: 'Role alterada', configuracao_alterada: 'Configuração alterada', backup: 'Cópia de segurança',
  backup_descarregado: 'Cópia descarregada', purga: 'Retenção aplicada', login_sso: 'Login SSO', sso_recusado: 'SSO recusado', sso_conta_criada: 'Conta SSO criada',
};

const bytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);

async function carregarConfig() {
  const r = await props.api('/api/admin/configuracao');
  Object.assign(cfg, r.valores);
  limites.value = r.limites;
}
async function carregarEstado() { estado.value = await props.api('/api/admin/estado'); }
async function carregarBackups() { const r = await props.api('/api/admin/backups'); backups.value = r.items; pastaBackups.value = r.pasta; }
async function carregarAuditoria() {
  const p = new URLSearchParams({ limite: '300' });
  if (filtroAuditoria.value) p.set('acao', filtroAuditoria.value);
  auditoria.value = (await props.api(`/api/admin/auditoria?${p}`)).items;
}

async function carregarAba() {
  aCarregar.value = true;
  try {
    if (!limites.value.sessao_horas) await carregarConfig();
    if (aba.value === 'estado') await carregarEstado();
    if (aba.value === 'copias') await Promise.all([carregarBackups(), carregarEstado()]);
    if (aba.value === 'auditoria') await carregarAuditoria();
  } catch (e) { emit('erro', e.message); } finally { aCarregar.value = false; }
}

async function guardar(chaves) {
  erros.value = {};
  try {
    const r = await props.api('/api/admin/configuracao', { method: 'PUT', body: JSON.stringify(Object.fromEntries(chaves.map((k) => [k, cfg[k]]))) });
    Object.assign(cfg, r.valores);
    emit('ok', 'Configuração guardada.');
    emit('modelo');
  } catch (e) {
    erros.value = e.details?.erros || {};
    emit('erro', e.message);
  }
}

async function criarBackup() {
  aCarregar.value = true;
  try {
    const r = await props.api('/api/admin/backups', { method: 'POST' });
    emit('ok', `Cópia criada: ${r.nome}`);
    await carregarBackups();
  } catch (e) { emit('erro', e.message); } finally { aCarregar.value = false; }
}

async function descarregar(b) {
  try { await downloadFile(`/api/admin/backups/${b.nome}`, props.token); } catch (e) { emit('erro', e.message); }
}

async function aplicarRetencao() {
  if (!window.confirm('Apagar já do Histórico/Auditoria as entradas mais antigas que a retenção configurada? Esta ação não pode ser revertida.')) return;
  try {
    const r = await props.api('/api/admin/manutencao/purgar', { method: 'POST' });
    emit('ok', `Removidas ${r.historico} entradas do Histórico e ${r.auditoria} da auditoria.`);
  } catch (e) { emit('erro', e.message); }
}

function escolherLogo(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!/^image\/(png|jpeg)$/.test(file.type) || file.size > 280 * 1024) { emit('erro', 'Use um PNG ou JPEG até 280 KB.'); return; }
  const leitor = new FileReader();
  leitor.onload = () => { cfg.pdf_logo = String(leitor.result); };
  leitor.readAsDataURL(file);
}

watch(aba, carregarAba);
watch(filtroAuditoria, carregarAuditoria);
onMounted(carregarAba);
</script>

<template>
  <div class="admin">
    <div class="admin-abas" role="tablist">
      <button v-for="[chave, rotulo] in ABAS" :key="chave" type="button" role="tab" :class="['btn', 'btn-sm', aba === chave ? 'btn-primary' : 'btn-secondary']" @click="aba = chave">{{ rotulo }}</button>
    </div>

    <!-- Estado -->
    <div v-if="aba === 'estado' && estado" class="card">
      <div class="card-header"><div><p class="card-title">Estado do sistema</p><p class="card-subtitle">{{ estado.baseDados.motor }} · {{ bytes(estado.baseDados.bytes) }}</p></div></div>
      <div class="card-body admin-grelha">
        <div class="painel-cartao"><span class="painel-num">{{ estado.documentos.toLocaleString('pt-PT') }}</span><span>documentos</span></div>
        <div class="painel-cartao"><span class="painel-num">{{ estado.utilizadores }}</span><span>utilizadores</span></div>
        <div class="painel-cartao"><span class="painel-num">{{ estado.historico.toLocaleString('pt-PT') }}</span><span>entradas no Histórico</span></div>
        <div class="painel-cartao"><span class="painel-num">{{ estado.anexos }}</span><span>anexos</span></div>
        <div class="painel-cartao"><span class="painel-num">{{ estado.backups.total }}</span><span>cópias de segurança</span></div>
      </div>
      <div class="card-body" style="font-size:13px;display:grid;gap:6px;">
        <div>Última cópia: <strong>{{ estado.backups.ultimo ? dataHoraPt(estado.backups.ultimo.criadoEm) : 'nunca' }}</strong></div>
        <div>Ligação atual: <strong>{{ estado.ligacaoSegura ? 'HTTPS' : 'HTTP (sem cifra)' }}</strong>
          <span v-if="!estado.ligacaoSegura" class="admin-aviso"> — em produção ative HTTPS (SSL_KEY_FILE/SSL_CERT_FILE, ou proxy com TRUST_PROXY e FORCE_HTTPS=1).</span></div>
        <div>SSO (autenticação da organização): <strong>{{ estado.sso }}</strong></div>
        <div class="admin-aviso">Os ficheiros anexados ficam em <code>data/anexos</code> e não fazem parte das cópias da base de dados: inclua essa pasta na cópia do volume.</div>
      </div>
    </div>

    <!-- Segurança -->
    <div v-if="aba === 'seguranca'" class="card">
      <div class="card-header"><div><p class="card-title">Palavras-passe, bloqueio e sessões</p><p class="card-subtitle">Aplica-se de imediato a novos logins e alterações de password.</p></div></div>
      <div class="card-body admin-form">
        <div class="field"><label class="field-label" for="c-sessao">Duração da sessão (horas)</label><input id="c-sessao" v-model.number="cfg.sessao_horas" type="number" :min="limites.sessao_horas?.min" :max="limites.sessao_horas?.max" /><small class="erro">{{ erros.sessao_horas }}</small></div>
        <div class="field"><label class="field-label" for="c-pmin">Tamanho mínimo da password</label><input id="c-pmin" v-model.number="cfg.password_min" type="number" min="8" max="64" /><small class="erro">{{ erros.password_min }}</small></div>
        <div class="field"><label class="field-label" for="c-pval">Validade da password (dias; 0 = não expira)</label><input id="c-pval" v-model.number="cfg.password_validade_dias" type="number" min="0" /><small class="erro">{{ erros.password_validade_dias }}</small></div>
        <div class="field"><label class="field-label" for="c-max">Tentativas falhadas até bloquear</label><input id="c-max" v-model.number="cfg.max_tentativas" type="number" min="3" max="20" /><small class="erro">{{ erros.max_tentativas }}</small></div>
        <div class="field"><label class="field-label" for="c-bloq">Duração do bloqueio (minutos)</label><input id="c-bloq" v-model.number="cfg.bloqueio_minutos" type="number" min="1" /><small class="erro">{{ erros.bloqueio_minutos }}</small></div>
        <div class="field"><label class="field-label" for="c-rec">Validade do código de recuperação (minutos)</label><input id="c-rec" v-model.number="cfg.recuperacao_validade_minutos" type="number" min="5" /><small class="erro">{{ erros.recuperacao_validade_minutos }}</small></div>
        <label class="admin-check"><input v-model="cfg.password_complexa" type="checkbox" /> Exigir letras e números</label>
      </div>
      <div class="card-body"><button class="btn btn-primary" type="button" @click="guardar(CHAVES.seguranca)">Guardar</button></div>
    </div>

    <!-- Cópias e retenção -->
    <div v-if="aba === 'copias'" style="display:grid;gap:20px;">
      <div class="card">
        <div class="card-header"><div><p class="card-title">Cópias de segurança automáticas</p><p class="card-subtitle">Pasta: <code>{{ pastaBackups }}</code> — idealmente um volume/servidor diferente (SIGAT_BACKUP_DIR).</p></div></div>
        <div class="card-body admin-form">
          <label class="admin-check"><input v-model="cfg.backup_ativo" type="checkbox" /> Cópias automáticas ativas</label>
          <div class="field"><label class="field-label" for="c-bint">Intervalo (horas)</label><input id="c-bint" v-model.number="cfg.backup_intervalo_horas" type="number" min="1" /><small class="erro">{{ erros.backup_intervalo_horas }}</small></div>
          <div class="field"><label class="field-label" for="c-bret">Cópias a manter</label><input id="c-bret" v-model.number="cfg.backup_retencao" type="number" min="1" /><small class="erro">{{ erros.backup_retencao }}</small></div>
        </div>
        <div class="card-body" style="display:flex;gap:8px;">
          <button class="btn btn-primary" type="button" @click="guardar(CHAVES.copias.slice(0, 3))">Guardar</button>
          <button class="btn btn-secondary" type="button" :disabled="aCarregar" @click="criarBackup">Criar cópia agora</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Cópia</th><th>Criada em</th><th>Tamanho</th><th></th></tr></thead>
            <tbody>
              <tr v-if="!backups.length"><td colspan="4"><div class="empty-state" style="padding:16px 0;"><p>Ainda não existem cópias.</p></div></td></tr>
              <tr v-for="b in backups" :key="b.nome"><td><code>{{ b.nome }}</code></td><td>{{ dataHoraPt(b.criadoEm) }}</td><td>{{ bytes(b.tamanho) }}</td><td><button class="btn btn-secondary btn-sm" type="button" @click="descarregar(b)">Descarregar</button></td></tr>
            </tbody>
          </table>
        </div>
        <p class="card-body admin-aviso">Para restaurar: pare a aplicação, substitua <code>data/sigat.db</code> (e apague <code>sigat.db-wal</code>/<code>-shm</code>) por uma cópia e arranque de novo.</p>
      </div>

      <div class="card">
        <div class="card-header"><div><p class="card-title">Retenção do Histórico</p><p class="card-subtitle">Entradas mais antigas são removidas automaticamente (uma cópia é feita antes). 0 = guardar sempre; mínimo 90 dias.</p></div></div>
        <div class="card-body admin-form">
          <div class="field"><label class="field-label" for="c-hret">Histórico de alterações (dias)</label><input id="c-hret" v-model.number="cfg.historico_retencao_dias" type="number" min="0" /><small class="erro">{{ erros.historico_retencao_dias }}</small></div>
          <div class="field"><label class="field-label" for="c-aret">Auditoria de acessos (dias; mínimo 30)</label><input id="c-aret" v-model.number="cfg.auditoria_retencao_dias" type="number" min="0" /><small class="erro">{{ erros.auditoria_retencao_dias }}</small></div>
        </div>
        <div class="card-body" style="display:flex;gap:8px;">
          <button class="btn btn-primary" type="button" @click="guardar(['historico_retencao_dias', 'auditoria_retencao_dias'])">Guardar</button>
          <button class="btn btn-danger" type="button" @click="aplicarRetencao">Aplicar agora</button>
        </div>
      </div>
    </div>

    <!-- Modelo PDF -->
    <div v-if="aba === 'pdf'" class="card">
      <div class="card-header"><div><p class="card-title">Modelo da ficha / impressão PDF</p><p class="card-subtitle">Logótipo e cabeçalho institucional usados em todas as impressões.</p></div></div>
      <div class="card-body admin-form">
        <div class="field"><label class="field-label" for="c-h1">Cabeçalho (linha 1)</label><input id="c-h1" v-model="cfg.pdf_cabecalho1" maxlength="120" /></div>
        <div class="field"><label class="field-label" for="c-h2">Cabeçalho (linha 2)</label><input id="c-h2" v-model="cfg.pdf_cabecalho2" maxlength="120" /></div>
        <div class="field"><label class="field-label" for="c-rod">Rodapé</label><input id="c-rod" v-model="cfg.pdf_rodape" maxlength="200" /></div>
        <div class="field"><label class="field-label" for="c-cor">Cor de destaque</label><input id="c-cor" v-model="cfg.pdf_cor" type="color" style="width:80px;padding:2px;" /><small class="erro">{{ erros.pdf_cor }}</small></div>
        <div class="field">
          <label class="field-label">Logótipo (PNG/JPEG, até 280 KB)</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <img v-if="cfg.pdf_logo" :src="cfg.pdf_logo" alt="Logótipo" style="max-height:56px;max-width:160px;border:1px solid var(--border);padding:4px;" />
            <label class="btn btn-secondary btn-sm">Escolher…<input type="file" accept="image/png,image/jpeg" style="display:none" @change="escolherLogo" /></label>
            <button v-if="cfg.pdf_logo" class="btn btn-ghost btn-sm" type="button" @click="cfg.pdf_logo = ''">Remover</button>
          </div>
          <small class="erro">{{ erros.pdf_logo }}</small>
        </div>
      </div>
      <div class="card-body"><button class="btn btn-primary" type="button" @click="guardar(CHAVES.pdf)">Guardar</button></div>
    </div>

    <!-- Imagens -->
    <div v-if="aba === 'imagens'" class="card">
      <div class="card-header"><div><p class="card-title">Ligação automática a digitalizações</p><p class="card-subtitle">Se as imagens estão num repositório externo, indique o padrão do endereço. Use <code>{campo}</code> para valores do registo, por exemplo <code>https://servidor/scans/{nrRegisto}.jpg</code> (cartografia) ou <code>{caixaNr}</code> (ATURB).</p></div></div>
      <div class="card-body admin-form">
        <div class="field" style="grid-column:1/-1;"><label class="field-label" for="c-img">Modelo de URL (vazio = desativado)</label><input id="c-img" v-model="cfg.imagens_url_modelo" placeholder="https://…/{nrRegisto}" /><small class="erro">{{ erros.imagens_url_modelo }}</small></div>
      </div>
      <div class="card-body"><button class="btn btn-primary" type="button" @click="guardar(CHAVES.imagens)">Guardar</button></div>
    </div>

    <!-- Auditoria -->
    <div v-if="aba === 'auditoria'" class="card">
      <div class="card-header"><div><p class="card-title">Auditoria de acessos e administração</p><p class="card-subtitle">Últimos 300 eventos.</p></div>
        <select v-model="filtroAuditoria" style="margin-left:auto;max-width:240px;" aria-label="Filtrar por ação">
          <option value="">Todos</option>
          <option v-for="(rotulo, chave) in ACOES_AUDITORIA" :key="chave" :value="chave">{{ rotulo }}</option>
        </select>
      </div>
      <div class="table-wrap" style="overflow-x:auto;">
        <table>
          <thead><tr><th>Quando</th><th>Utilizador</th><th>Evento</th><th>IP</th><th>Detalhes</th></tr></thead>
          <tbody>
            <tr v-if="!auditoria.length"><td colspan="5"><div class="empty-state" style="padding:16px 0;"><p>Sem eventos.</p></div></td></tr>
            <tr v-for="e in auditoria" :key="e.id"><td class="cell-nowrap">{{ dataHoraPt(e.em) }}</td><td>{{ e.utilizador || '—' }}</td><td>{{ ACOES_AUDITORIA[e.acao] || e.acao }}</td><td>{{ e.ip || '' }}</td><td style="font-size:12px;color:var(--muted);">{{ Object.keys(e.detalhes).length ? JSON.stringify(e.detalhes) : '' }}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin { display: grid; gap: 20px; }
.admin-abas { display: flex; flex-wrap: wrap; gap: 8px; }
.admin-grelha { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.admin-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; align-items: end; }
.admin-check { display: flex; gap: 8px; align-items: center; font-size: 13px; }
.admin-check input { width: auto; }
.admin-aviso { font-size: 12px; color: var(--muted); }
.erro { color: var(--danger, #dc2626); min-height: 14px; }
.painel-cartao { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; }
.painel-num { font-size: 22px; font-weight: 700; }
</style>
