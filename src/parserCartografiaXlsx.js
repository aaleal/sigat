/**
 * Parser da Cartografia em xlsx (folha "BD", uma linha por documento).
 * As colunas são identificadas pelo nome do cabeçalho, não pela posição.
 */

const xlsx = require('xlsx');

// Nomes de cabeçalho normalizados (sem acentos, minúsculas, só alfanuméricos).
const COLUMNS = {
  autor: ['autorentidaderesponsavel', 'autor'],
  descricao: ['tituloedescricaododocumento'],
  local: ['local'],
  ano: ['data'],
  fisica: ['outrasinformacoesfisicas'],
  outras: ['outrasdescricoes'],
  assuntos: ['palavraschaveassuntos'],
  tb: ['tb'],
  cota: ['cota'],
  cdr: ['cdr'],
  emprestimo: ['emprestimo'],
  dataSaida: ['datadesaida'],
  requisitante: ['requisitante'],
  nrRegisto: ['noregisto', 'nrregisto', 'nrderegisto', 'numeroregisto'],
};

const SHEET_NAME = 'BD';

function normHeader(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function mapHeaders(headerRow) {
  const normalized = headerRow.map(normHeader);
  const map = {};
  for (const [field, aliases] of Object.entries(COLUMNS)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

function findTable(workbook) {
  const names = workbook.SheetNames.includes(SHEET_NAME)
    ? [SHEET_NAME, ...workbook.SheetNames.filter((n) => n !== SHEET_NAME)]
    : workbook.SheetNames;

  for (const name of names) {
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null, raw: false });
    for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
      const columns = mapHeaders(rows[i] || []);
      if (columns.descricao !== undefined) return { name, rows, headerIndex: i, columns };
    }
  }
  return null;
}

// "1 planta ms. (cartão) : color ; 55 x 71,5 cm" -> tipo / cor / dimensao
function parseFisica(text) {
  const out = { tipo: '', cor: '', dimensao: '' };
  let rest = clean(text);
  if (!rest) return out;

  const lastSemi = rest.lastIndexOf(';');
  if (lastSemi !== -1) {
    const candidate = rest.slice(lastSemi + 1).trim();
    if (/\d\s*x\s*\d|\bcm\b/i.test(candidate)) {
      out.dimensao = candidate;
      rest = rest.slice(0, lastSemi).trim();
    }
  }

  const colon = rest.lastIndexOf(' : ');
  if (colon !== -1) {
    const left = rest.slice(0, colon).trim();
    const right = rest.slice(colon + 3).trim();
    if (!out.dimensao && /\d\s*x\s*\d/.test(right)) {
      out.tipo = left;
      out.dimensao = right;
    } else {
      out.tipo = left;
      out.cor = right;
    }
  } else {
    out.tipo = rest;
  }
  return out;
}

// "Outras Descrições" junta notas e localização, separadas por " ; ".
function splitOutras(text) {
  const notas = [];
  const localizacao = [];
  for (const part of clean(text).split(/\s+;\s+/).filter(Boolean)) {
    (/DMPGU|Incorpora[cç][aã]o/i.test(part) ? localizacao : notas).push(part);
  }
  return { notas: notas.join(' ; '), localizacao: localizacao.join(' ; ') };
}

function deriveCabecalho(autor, descricao) {
  if (autor && !/^s[\s./]*a\.?$/i.test(autor)) return autor;
  const title = descricao.split(/\s*(?:\[|\s:\s|\s\/\s|\.\s-\s)/)[0].trim();
  return title.toLocaleUpperCase('pt-PT');
}

function looksLikeShelfmark(value) {
  return /CMLEO|^CDU\s*:|^[A-Z]{1,3}\/|^\d{3}[\d./]*$/.test(value);
}

/**
 * @param {Buffer} buffer
 * @returns {{ entries: Array, errors: Array, warnings: Array, hasNrRegisto: boolean }}
 */
function parseCartografiaXlsx(buffer) {
  const entries = [];
  const errors = [];
  const warnings = [];

  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: 'buffer' });
  } catch (err) {
    errors.push({ entry: 0, section: 'workbook', message: `Erro ao abrir ficheiro xlsx: ${err.message}` });
    return { entries, errors, warnings, hasNrRegisto: false };
  }

  const table = findTable(workbook);
  if (!table) {
    errors.push({
      entry: 0,
      section: 'workbook',
      message: `Não foi encontrada uma folha com a coluna "Título e Descrição do Documento" (folha esperada: "${SHEET_NAME}").`,
    });
    return { entries, errors, warnings, hasNrRegisto: false };
  }

  const { rows, headerIndex, columns } = table;
  const cell = (row, field) => (columns[field] === undefined ? '' : clean(row[columns[field]]));
  const seen = new Map();

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const rowNum = i + 1; // número da linha no Excel
    if (row.every((c) => c === null || String(c).trim() === '')) continue;

    const descricao = cell(row, 'descricao');
    if (!descricao) {
      errors.push({ entry: rowNum, section: 'descricao', message: `Linha ${rowNum}: Título e Descrição em falta; linha ignorada.` });
      continue;
    }

    const rowKey = JSON.stringify(row);
    if (/^\d+$/.test(descricao)) {
      warnings.push({ entry: rowNum, section: 'descricao', message: `Linha ${rowNum}: Título é apenas um número ("${descricao}"); linha possivelmente incompleta.` });
    }
    if (seen.has(rowKey)) {
      warnings.push({ entry: rowNum, section: 'duplicado', message: `Linha ${rowNum}: igual à linha ${seen.get(rowKey)}.` });
    } else {
      seen.set(rowKey, rowNum);
    }

    const autor = cell(row, 'autor');
    const assuntos = cell(row, 'assuntos');
    const cota = cell(row, 'cota');
    const { notas, localizacao } = splitOutras(cell(row, 'outras'));

    if (!autor) warnings.push({ entry: rowNum, section: 'autor', message: `Linha ${rowNum}: Autor em falta.` });
    if (!cota) warnings.push({ entry: rowNum, section: 'cota', message: `Linha ${rowNum}: Cota em falta.` });
    if (!assuntos) {
      warnings.push({ entry: rowNum, section: 'assuntos', message: `Linha ${rowNum}: Palavras-chave / Assuntos em falta.` });
    } else if (looksLikeShelfmark(assuntos)) {
      warnings.push({ entry: rowNum, section: 'assuntos', message: `Linha ${rowNum}: Assuntos parece conter uma cota/CDU ("${assuntos.slice(0, 40)}").` });
    }

    const emprestimo = /^(sim|s)$/i.test(cell(row, 'emprestimo'));
    const nrRegisto = cell(row, 'nrRegisto');

    entries.push({
      cabecalho: deriveCabecalho(autor, descricao),
      descricao,
      notas,
      localizacao,
      assuntos,
      cota,
      cdr: cell(row, 'cdr'),
      tb: cell(row, 'tb'),
      nrRegisto,
      autor,
      local: cell(row, 'local'),
      ano: cell(row, 'ano'),
      ...parseFisica(cell(row, 'fisica')),
      estado: emprestimo ? 'Empréstimo' : '-',
      ...(emprestimo && {
        estadoMeta: {
          dataSaida: cell(row, 'dataSaida'),
          requisitante: cell(row, 'requisitante'),
          registadoPor: 'importação',
        },
      }),
      sourceEntryNumber: entries.length + 1,
    });
  }

  return { entries, errors, warnings, hasNrRegisto: columns.nrRegisto !== undefined };
}

const normText = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const normCota = (s) => String(s ?? '').replace(/Cota\s*:/i, '').replace(/CMLEO/gi, '').replace(/\s+/g, '').toUpperCase();

/**
 * Preenche nrRegisto a partir de um dataset de referência (casando por descrição + cota).
 * @returns {{ matched: number, missing: Array }} missing = entradas sem nrRegisto
 */
function attachNrRegisto(entries, referenceEntries) {
  const byDesc = new Map();
  const byCota = new Map();
  for (const ref of referenceEntries) {
    if (!ref.nrRegisto) continue;
    const dk = normText(ref.descricao);
    const ck = normCota(ref.cota);
    if (!byDesc.has(dk)) byDesc.set(dk, []);
    byDesc.get(dk).push(ref);
    if (ck) {
      if (!byCota.has(ck)) byCota.set(ck, []);
      byCota.get(ck).push(ref);
    }
  }

  const used = new Set();
  const free = (list) => list.find((r) => !used.has(r));
  let matched = 0;
  const missing = [];

  for (const entry of entries) {
    if (entry.nrRegisto) continue;
    const ck = normCota(entry.cota);
    const candidates = byDesc.get(normText(entry.descricao)) || [];
    let ref = free(candidates.filter((r) => normCota(r.cota) === ck)) || free(candidates);

    if (!ref && ck) {
      const byCotaFree = (byCota.get(ck) || []).filter((r) => !used.has(r));
      if (byCotaFree.length === 1) [ref] = byCotaFree;
    }

    if (ref) {
      used.add(ref);
      entry.nrRegisto = String(ref.nrRegisto);
      matched += 1;
    } else {
      missing.push(entry);
    }
  }

  return { matched, missing };
}

module.exports = { parseCartografiaXlsx, attachNrRegisto };
