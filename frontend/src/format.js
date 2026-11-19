export function dataPt(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
}

export function dataHoraPt(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? (iso || '') : d.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
}

export function hojeIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function somarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(a, m - 1, d + dias);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function diasDeAtraso(dataPrevista) {
  if (!dataPrevista) return 0;
  const hoje = hojeIso();
  if (dataPrevista >= hoje) return 0;
  const [a1, m1, d1] = dataPrevista.split('-').map(Number);
  const [a2, m2, d2] = hoje.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

export const PRAZO_PADRAO_DIAS = 30;
