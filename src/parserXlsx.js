/**
 * Parser for Arquivo Técnico de Urbanismo (ATURB) xlsx files.
 * Reads the "PDF Site" sheet (or the first sheet) from an xlsx buffer.
 * Expected layout:
 *   Row 1: empty
 *   Row 2: title row
 *   Row 3: headers → Autor | Título | Local | Data | Caixa nº | Estado
 *   Row 4+: data rows
 */

const xlsx = require('xlsx');

/**
 * @param {Buffer} buffer - Raw xlsx file buffer
 * @returns {{ entries: Array, errors: Array, warnings: Array }}
 */
function parseAturbXlsx(buffer) {
  const errors = [];
  const warnings = [];
  const entries = [];

  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: 'buffer' });
  } catch (err) {
    errors.push({ entry: 0, section: 'workbook', message: `Erro ao abrir ficheiro xlsx: ${err.message}` });
    return { entries, errors, warnings };
  }

  // Use the "PDF Site" sheet, fallback to the first sheet
  const sheetName = workbook.SheetNames.includes('PDF Site')
    ? 'PDF Site'
    : workbook.SheetNames[0];

  if (!sheetName) {
    errors.push({ entry: 0, section: 'workbook', message: 'O ficheiro xlsx não contém folhas.' });
    return { entries, errors, warnings };
  }

  const ws = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });

  // Row 0 (index 0) = empty
  // Row 1 (index 1) = title
  // Row 2 (index 2) = headers: Autor, Título, Local, Data, Caixa nº, Estado
  // Row 3+ (index 3+) = data
  const DATA_START_ROW = 3;

  for (let i = DATA_START_ROW; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1; // 1-based for error messages

    // Skip completely blank rows
    const isBlank = row.every((cell) => cell === null || String(cell).trim() === '');
    if (isBlank) continue;

    const autor   = clean(row[0]);
    const titulo  = clean(row[1]);
    const local   = clean(row[2]);
    const data    = row[3] != null ? String(row[3]).trim() : '';
    const caixaNr = row[4] != null ? String(row[4]).trim() : '';
    const estado  = clean(row[5]) || '-';

    if (!titulo) {
      warnings.push({ entry: rowNum, section: 'Título', message: `Linha ${rowNum}: campo Título vazio.` });
    }

    entries.push({
      sourceEntryNumber: entries.length + 1,
      autor,
      titulo,
      local,
      data,
      caixaNr,
      estado,
    });
  }

  return { entries, errors, warnings };
}

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim();
}

module.exports = { parseAturbXlsx };
