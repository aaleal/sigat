// Correspondência entre linhas de um ficheiro e documentos existentes (importação e migração).
const { normalizar } = require('../search');

const CONFIG = {
  cartografia: { nr: 'nrRegisto', descricao: 'descricao', cota: 'cota', cotaUnica: true },
  aturb: { nr: null, descricao: 'titulo', cota: 'caixaNr', cotaUnica: false },
};

const normCota = (s) => String(s ?? '').replace(/Cota\s*:/i, '').replace(/CMLEO/gi, '').replace(/\s+/g, '').toUpperCase();
const normNr = (s) => String(s ?? '').trim().replace(/^0+(?=\d)/, '').toLowerCase();

function chaves(cfg, dados) {
  const descricao = normalizar(dados[cfg.descricao]);
  const cota = normCota(dados[cfg.cota]);
  return {
    nr: cfg.nr ? normNr(dados[cfg.nr]) : '',
    descricao,
    cota,
    cd: `${cota}|${descricao}`,
  };
}

function agrupar(lista, chaveFn) {
  const m = new Map();
  for (const item of lista) {
    const k = chaveFn(item);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

/**
 * @param {'cartografia'|'aturb'} colecao
 * @param {Array<{ linha: number, dados: Object, idSigat?: string|number }>} linhas
 * @param {Array<Object>} existentes documentos (entradas planas com id, numero e campos)
 * @returns {Array<{ linha: number, estado: 'match'|'novo'|'ambiguo'|'duplicado_ficheiro', documentoId: string|null, criterio: string|null, candidatos: string[] }>}
 */
function corresponder(colecao, linhas, existentes) {
  const cfg = CONFIG[colecao] || CONFIG.cartografia;
  const usados = new Set();
  const out = new Map(linhas.map((l) => [l.linha, { linha: l.linha, estado: 'novo', documentoId: null, criterio: null, candidatos: [] }]));
  const chavesLinha = new Map(linhas.map((l) => [l.linha, chaves(cfg, l.dados)]));
  const chavesDoc = new Map(existentes.map((d) => [d.id, chaves(cfg, d)]));
  const livres = () => existentes.filter((d) => !usados.has(d.id));
  const pendentes = () => linhas.filter((l) => !out.get(l.linha).documentoId);

  const atribuir = (l, doc, criterio) => {
    usados.add(doc.id);
    Object.assign(out.get(l.linha), { estado: 'match', documentoId: doc.id, criterio, candidatos: [] });
  };

  // 1. ID SIGAT
  const porNumero = new Map(existentes.map((d) => [Number(d.numero), d]));
  for (const l of pendentes()) {
    const n = Number(l.idSigat);
    if (l.idSigat === undefined || l.idSigat === '' || !Number.isFinite(n)) continue;
    const doc = porNumero.get(n);
    if (doc && !usados.has(doc.id)) atribuir(l, doc, 'id_sigat');
  }

  // 2. Nº de registo
  if (cfg.nr) {
    const porNr = agrupar(livres(), (d) => chavesDoc.get(d.id).nr);
    for (const l of pendentes()) {
      const nr = chavesLinha.get(l.linha).nr;
      if (!nr) continue;
      const cand = (porNr.get(nr) || []).filter((d) => !usados.has(d.id));
      if (cand.length === 0) continue;
      const refinado = cand.find((d) => chavesDoc.get(d.id).cd === chavesLinha.get(l.linha).cd);
      if (cand.length === 1) atribuir(l, cand[0], 'nr_registo');
      else if (refinado) atribuir(l, refinado, 'nr_registo');
      else Object.assign(out.get(l.linha), { estado: 'ambiguo', candidatos: cand.map((d) => d.id), criterio: 'nr_registo' });
    }
  }

  // 3. Cota + descrição (emparelha por ordem)
  const porCd = agrupar(livres(), (d) => (chavesDoc.get(d.id).descricao ? chavesDoc.get(d.id).cd : ''));
  for (const l of pendentes()) {
    const k = chavesLinha.get(l.linha);
    if (!k.descricao) continue;
    const doc = (porCd.get(k.cd) || []).find((d) => !usados.has(d.id));
    if (doc) atribuir(l, doc, 'cota_descricao');
  }

  // 4. Descrição com candidato único
  const porDesc = agrupar(livres(), (d) => chavesDoc.get(d.id).descricao);
  for (const l of pendentes()) {
    const k = chavesLinha.get(l.linha);
    if (!k.descricao) continue;
    const cand = (porDesc.get(k.descricao) || []).filter((d) => !usados.has(d.id));
    if (cand.length === 1) atribuir(l, cand[0], 'descricao');
    else if (cand.length > 1) Object.assign(out.get(l.linha), { estado: 'ambiguo', candidatos: cand.map((d) => d.id), criterio: 'descricao' });
  }

  // 5. Cota com candidato único
  if (cfg.cotaUnica) {
    const porCota = agrupar(livres(), (d) => chavesDoc.get(d.id).cota);
    for (const l of pendentes()) {
      const k = chavesLinha.get(l.linha);
      if (!k.cota) continue;
      const cand = (porCota.get(k.cota) || []).filter((d) => !usados.has(d.id));
      if (cand.length === 1) atribuir(l, cand[0], 'cota');
    }
  }

  // Resto: ambíguos cujos candidatos entretanto foram usados voltam a "novo"; repetidos no ficheiro são sinalizados.
  const vistas = new Set();
  for (const l of linhas) {
    const r = out.get(l.linha);
    if (r.estado === 'ambiguo') {
      r.candidatos = r.candidatos.filter((id) => !usados.has(id));
      if (r.candidatos.length === 0) { r.estado = 'novo'; r.criterio = null; }
    }
    if (r.estado === 'novo') {
      const k = chavesLinha.get(l.linha);
      if (k.descricao && vistas.has(k.cd)) r.estado = 'duplicado_ficheiro';
    }
    const k = chavesLinha.get(l.linha);
    if (k.descricao) vistas.add(k.cd);
  }
  return linhas.map((l) => out.get(l.linha));
}

module.exports = { corresponder, normCota };
