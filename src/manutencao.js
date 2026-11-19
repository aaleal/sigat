const { getDb } = require('./db');
const config = require('./config');
const backup = require('./backup');
const auditoria = require('./db/repos/auditoria');

const HORA_MS = 3_600_000;

const antesDe = (dias) => new Date(Date.now() - dias * 86_400_000).toISOString();

// Remove entradas do Histórico (e da auditoria) mais antigas que a retenção configurada (0 = guardar sempre).
function purgarHistorico({ utilizador = 'sistema' } = {}) {
  const cfg = config.todas();
  let historico = 0;
  let auditados = 0;
  if (cfg.historico_retencao_dias > 0) {
    historico = getDb().prepare('DELETE FROM historico WHERE em < ?').run(antesDe(cfg.historico_retencao_dias)).changes;
  }
  if (cfg.auditoria_retencao_dias > 0) auditados = auditoria.purgar(antesDe(cfg.auditoria_retencao_dias));
  if (historico || auditados) auditoria.registar({ utilizador, acao: 'purga', detalhes: { historico, auditoria: auditados } });
  return { historico, auditoria: auditados };
}

// Um ciclo: cópia se a última é mais antiga que o intervalo; depois aplica a retenção.
async function ciclo() {
  const cfg = config.todas();
  if (cfg.backup_ativo) {
    const ultimo = backup.listar()[0];
    if (!ultimo || Date.now() - new Date(ultimo.criadoEm).getTime() >= cfg.backup_intervalo_horas * HORA_MS) {
      await backup.criarBackup({ motivo: 'automatico' });
    }
  }
  purgarHistorico();
}

let temporizador = null;

function iniciar() {
  const executar = () => ciclo().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Manutenção (backup/retenção) falhou:', err.message);
  });
  setTimeout(executar, 30_000).unref();
  temporizador = setInterval(executar, HORA_MS);
  temporizador.unref();
}

function parar() { if (temporizador) clearInterval(temporizador); temporizador = null; }

module.exports = { iniciar, parar, ciclo, purgarHistorico };
