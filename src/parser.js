function normalizeLine(rawLine) {
  return rawLine.replace(/\uFEFF/g, '').replace(/\u00A0/g, ' ').replace(/\r/g, '').trimEnd();
}

function isBlank(line) {
  return line.trim().length === 0;
}

function isLikelyNrRegisto(line) {
  const compact = line.replace(/\s+/g, '');
  return /^\d{4,}$/.test(compact) || /\b\d{4,}\b/.test(compact);
}

function takeAndRemove(lines, matcher) {
  const index = lines.findIndex(matcher);
  if (index === -1) return '';
  const [value] = lines.splice(index, 1);
  return value.trim();
}

// ── Descricao metadata extractor ──────────────────────────────────────────
// descricao follows the pattern:
//   Título [...] : subtítulo. - [escala. -] [S.l.] : autor, ano. - tipo : cor ; dimensão
function cleanSnPattern(str) {
  return str
    .replace(/\[s[\s.]*n[\s.]*\]/gi, '')
    .replace(/(?<![a-zA-Z\u00C0-\u024F])s[\s.]*n[\s.]*\]/gi, '')
    .replace(/(?<![a-zA-Z\u00C0-\u024F])s\.n\.(?![a-zA-Z\u00C0-\u024F])/gi, '')
    .replace(/[\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSdPattern(str) {
  return str
    .replace(/\[s[\s.]*d[\s.]*\]/gi, '')
    .replace(/(?<![a-zA-Z\u00C0-\u024F])s[\s.]*d[\s.]*\]?/gi, '')
    .replace(/[\[\]]/g, '')
    .replace(/\s*\.\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDescricao(descricao) {
  const empty = { autor: '', ano: '', tipo: '', cor: '', dimensao: '' };
  if (!descricao) return empty;

  let text = descricao;
  let dimensao = '', cor = '', tipo = '', autor = '', ano = '';

  // ── 1. DIMENSAO — after the last ";" ──────────────────────────────────
  const lastSemi = text.lastIndexOf(';');
  if (lastSemi !== -1) {
    const candidate = text.slice(lastSemi + 1).trim();
    if (/\d/.test(candidate)) {
      dimensao = candidate;
      text = text.slice(0, lastSemi).trimEnd();
    }
  }

  // ── 2. TIPO and COR — last ". - tipo : cor" block ─────────────────────
  const lastDotDash = text.lastIndexOf('. - ');
  if (lastDotDash !== -1) {
    const tipoCorStr = text.slice(lastDotDash + 4).trim();
    const colonIdx = tipoCorStr.lastIndexOf(' : ');
    if (colonIdx !== -1) {
      tipo = tipoCorStr.slice(0, colonIdx).trim();
      cor  = tipoCorStr.slice(colonIdx + 3).trim();
    } else {
      tipo = tipoCorStr.trim();
    }
    text = text.slice(0, lastDotDash).trimEnd();
  }

  // ── 3. AUTOR and ANO — last ". - local : autor, ano" block ───────────
  const lastDotDash2 = text.lastIndexOf('. - ');
  let locBlock = lastDotDash2 !== -1 ? text.slice(lastDotDash2 + 4).trim() : '';

  if (!locBlock) {
    const m = text.match(/[–\-]\s*(.+)$/);
    if (m) locBlock = m[1].trim();
  }

  if (locBlock) {
    const colonIdx = locBlock.indexOf(' : ');
    if (colonIdx !== -1) {
      const autorAnoRaw = locBlock.slice(colonIdx + 3).trim();
      const commaIdx = autorAnoRaw.indexOf(',');
      if (commaIdx !== -1) {
        const rawAutor = autorAnoRaw.slice(0, commaIdx).trim();
        const rawAno   = autorAnoRaw.slice(commaIdx + 1).trim();
        autor = cleanSnPattern(rawAutor);
        ano   = cleanSdPattern(rawAno);
      } else {
        const cleaned = cleanSnPattern(autorAnoRaw);
        if (/\d{4}/.test(cleaned)) {
          ano = cleanSdPattern(autorAnoRaw);
        } else {
          autor = cleaned;
        }
      }
    }
  }

  if (/^[\s,\.;:\-]+$/.test(autor)) autor = '';
  if (/^[\s,\.;:\-]+$/.test(ano))   ano   = '';

  return { autor, ano, tipo, cor, dimensao };
}
// ─────────────────────────────────────────────────────────────────────────

function parseEntry(blockLines, blockNumber) {
  const errors = [];
  const warnings = [];
  const lines = blockLines.map((line) => line.trim()).filter((line) => line.length > 0);

  if (lines.length < 3) {
    errors.push({
      entry: blockNumber,
      section: 'cabecalho',
      message: 'Entrada com linhas insuficientes para mapear os campos.',
    });
    return { entry: null, errors, warnings };
  }

  const cabecalho = lines[0] || '';
  const descricao = lines[1] || '';

  let nrRegistoIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (isLikelyNrRegisto(lines[index])) {
      nrRegistoIndex = index;
      break;
    }
  }

  if (nrRegistoIndex === -1) {
    errors.push({
      entry: blockNumber,
      section: 'nrRegisto',
      message: 'Não foi encontrado Nº de Registo numérico no fim da entrada.',
    });
  }

  let nrRegisto = '';
  if (nrRegistoIndex >= 0) {
    const compact = lines[nrRegistoIndex].replace(/\s+/g, '');
    if (/^\d{4,}$/.test(compact)) {
      nrRegisto = compact;
    } else {
      const matches = compact.match(/\d{4,}/g) || [];
      nrRegisto = matches[matches.length - 1] || '';
    }
  }

  const middleStart = 2;
  const middleEnd = nrRegistoIndex > 1 ? nrRegistoIndex : lines.length;
  const middleLines = lines.slice(middleStart, middleEnd);

  const mutable = middleLines.slice();
  const cota = takeAndRemove(mutable, (line) => /^Cota\s*:/i.test(line));
  const cdr  = takeAndRemove(mutable, (line) => /\bCDR\b/i.test(line));
  const tb   = takeAndRemove(mutable, (line) => /\bTB\b/i.test(line));

  let localizacao = takeAndRemove(mutable, (line) => /(DMPGU|Incorpora[cç][aã]o)/i.test(line));
  if (!localizacao && mutable.length > 0) {
    localizacao = mutable.shift();
    warnings.push({
      entry: blockNumber,
      section: 'localizacao',
      message: 'Localização inferida automaticamente por ausência de marcador explícito.',
    });
  }

  let assuntos = takeAndRemove(mutable, (line) => line.includes('/'));
  if (!assuntos && mutable.length > 0) {
    assuntos = mutable.shift();
    warnings.push({
      entry: blockNumber,
      section: 'assuntos',
      message: 'Assuntos inferido automaticamente por ausência de padrão com separadores.',
    });
  }

  const notas = mutable.join(' ').trim();

  if (!cabecalho) {
    errors.push({ entry: blockNumber, section: 'cabecalho', message: 'Cabeçalho em falta.' });
  }
  if (!descricao) {
    errors.push({ entry: blockNumber, section: 'descricao', message: 'Descrição em falta.' });
  }
  if (!nrRegisto) {
    errors.push({ entry: blockNumber, section: 'nrRegisto', message: 'Nº de Registo inválido.' });
  }
  if (!localizacao) {
    warnings.push({ entry: blockNumber, section: 'localizacao', message: 'Campo Localização não identificado.' });
  }
  if (!assuntos) {
    warnings.push({ entry: blockNumber, section: 'assuntos', message: 'Campo Assuntos não identificado.' });
  }
  if (!cota) {
    warnings.push({ entry: blockNumber, section: 'cota', message: 'Campo Cota não identificado.' });
  }

  return {
    entry: {
      cabecalho,
      descricao,
      notas,
      localizacao,
      assuntos,
      cota,
      cdr,
      tb,
      nrRegisto,
      ...parseDescricao(descricao),
      estado: '-',
      sourceEntryNumber: blockNumber,
    },
    errors,
    warnings,
  };
}

function splitBlocks(content) {
  const rawLines = content.split('\n').map(normalizeLine);
  const blocks = [];
  let current = [];

  for (const line of rawLines) {
    if (isBlank(line)) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current);
  }

  return blocks;
}

function parseDatabaseTxt(content) {
  const rawLines = content.split('\n').map(normalizeLine);
  if (rawLines.length > 0 && rawLines[0].trim().toLowerCase() === 'mapas') {
    rawLines.shift();
  }

  const blocks = splitBlocks(rawLines.join('\n'));
  let candidateBlocks = blocks;

  if (candidateBlocks.length > 0) {
    const firstBlockJoined = candidateBlocks[0].join(' ').trim().toLowerCase();
    if (firstBlockJoined === 'mapas') {
      candidateBlocks = candidateBlocks.slice(1);
    }
  }

  const entries = [];
  const errors = [];
  const warnings = [];

  candidateBlocks.forEach((block, index) => {
    const blockNumber = index + 1;
    const parsed = parseEntry(block, blockNumber);
    errors.push(...parsed.errors);
    warnings.push(...parsed.warnings);
    if (parsed.entry) {
      entries.push(parsed.entry);
    }
  });

  return { entries, errors, warnings };
}

module.exports = {
  parseDatabaseTxt,
};