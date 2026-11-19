const xlsx = require('xlsx');

const LIMITE_LINHAS = 100000;

// Evita injeção de fórmulas ao abrir em Excel/LibreOffice.
function protegerFormula(valor) {
  const s = valor == null ? '' : String(valor);
  return s.length > 1 && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function celulaCsv(valor) {
  const s = protegerFormula(valor);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {{ formato: 'xlsx'|'csv', colunas: Array<{rotulo: string, valor: (linha: any) => any}>,
 *           linhas: Array, criterios?: Array<[string, string]>, nomeFolha?: string }} opcoes
 * @returns {{ buffer: Buffer, contentType: string, extensao: string }}
 */
function gerarExportacao({ formato, colunas, linhas, criterios = [], nomeFolha = 'SIGAT' }) {
  const cabecalho = colunas.map((c) => c.rotulo);
  const dados = linhas.map((l) => colunas.map((c) => protegerFormula(c.valor(l))));

  if (formato === 'csv') {
    const texto = [cabecalho, ...dados].map((r) => r.map(celulaCsv).join(';')).join('\r\n');
    return {
      buffer: Buffer.from(`\uFEFF${texto}\r\n`, 'utf-8'),
      contentType: 'text/csv; charset=utf-8',
      extensao: 'csv',
    };
  }

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet([cabecalho, ...dados]);
  ws['!cols'] = cabecalho.map((rotulo, i) => {
    const maior = dados.slice(0, 200).reduce((m, r) => Math.max(m, String(r[i] ?? '').length), rotulo.length);
    return { wch: Math.min(60, Math.max(10, maior + 2)) };
  });
  ws['!autofilter'] = { ref: ws['!ref'] };
  xlsx.utils.book_append_sheet(wb, ws, nomeFolha);

  if (criterios.length) {
    const wc = xlsx.utils.aoa_to_sheet([['Critério', 'Valor'], ...criterios.map(([k, v]) => [k, String(v ?? '')])]);
    wc['!cols'] = [{ wch: 24 }, { wch: 80 }];
    xlsx.utils.book_append_sheet(wb, wc, 'Critérios');
  }

  return {
    buffer: xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensao: 'xlsx',
  };
}

module.exports = { gerarExportacao, protegerFormula, LIMITE_LINHAS };
