// Ficha/lista de impressão (PDF pelo diálogo de impressão do browser) com o modelo institucional configurado.

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const val = (v) => (String(v ?? '').trim() ? esc(v) : '—');
const LOGO_OK = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
const COR_OK = /^#[0-9a-fA-F]{6}$/;

function estadoHtml(entry) {
  let html = val(entry.estado);
  if (entry.estado === 'Empréstimo' && entry.estadoMeta) {
    html += `<br><span class="meta-sm">Data de saída: ${val(entry.estadoMeta.dataSaida)} · Registado por: ${val(entry.estadoMeta.registadoPor)}</span>`;
  } else if (entry.estadoChangedAt) {
    html += `<br><span class="meta-sm">Alterado em: ${esc(new Date(entry.estadoChangedAt).toLocaleString('pt-PT'))} · Por: ${val(entry.estadoChangedBy)}</span>`;
  }
  return html;
}

const campo = (rotulo, valor) => `<div class="entry-card-field"><span class="label">${rotulo}</span><span class="value">${valor}</span></div>`;

function miniaturasHtml(imagens) {
  if (!imagens?.length) return '';
  return `<div class="thumbs">${imagens.map((i) => `<figure><img src="${esc(i.src)}" alt="" />${i.legenda ? `<figcaption>${esc(i.legenda)}</figcaption>` : ''}</figure>`).join('')}</div>`;
}

function cartaoCartografia(entry, nomeColecao, imagens) {
  return `<div class="entry-card">
    <div class="entry-card-header"><h3>${val(entry.cabecalho)}</h3><span class="entry-card-source">${esc(nomeColecao)}</span></div>
    <div class="entry-card-field entry-card-field--full"><span class="label">Descrição</span><span class="value">${val(entry.descricao)}</span></div>
    <div class="entry-card-grid">
      ${campo('Nº Registo', val(entry.nrRegisto))}${campo('Cota', val(entry.cota))}${campo('CDR', val(entry.cdr))}${campo('TB', val(entry.tb))}
      ${campo('Localização', val(entry.localizacao))}${campo('Assuntos', val(entry.assuntos))}${campo('Notas', val(entry.notas))}${campo('Autor', val(entry.autor))}
      ${campo('Ano', val(entry.ano))}${campo('Tipo', val(entry.tipo))}${campo('Cor', val(entry.cor))}${campo('Dimensão', val(entry.dimensao))}
      ${campo('Estado', estadoHtml(entry))}
    </div>${miniaturasHtml(imagens)}</div>`;
}

function cartaoAturb(entry, nomeColecao, imagens) {
  return `<div class="entry-card">
    <div class="entry-card-header"><h3>${val(entry.titulo)}</h3><span class="entry-card-source">${esc(nomeColecao)}</span></div>
    <div class="entry-card-grid">
      ${campo('Autor', val(entry.autor))}${campo('Local', val(entry.local))}${campo('Data', val(entry.data))}${campo('Caixa nº', val(entry.caixaNr))}
      ${campo('Estado', estadoHtml(entry))}
    </div>${miniaturasHtml(imagens)}</div>`;
}

/**
 * itens: [{ type, nomeColecao, entry, imagens?: [{src, legenda}] }]
 * modelo: { pdf_cabecalho1, pdf_cabecalho2, pdf_rodape, pdf_cor, pdf_logo }
 * Devolve false se o browser bloqueou a janela.
 */
export function abrirFicha({ itens, modelo = {}, utilizador = '' }) {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return false;

  const cor = COR_OK.test(modelo.pdf_cor || '') ? modelo.pdf_cor : '#1e293b';
  const logo = LOGO_OK.test(modelo.pdf_logo || '') ? modelo.pdf_logo : '';
  const grupo = (tipo, titulo) => {
    const lista = itens.filter((i) => (tipo === 'aturb' ? i.type === 'aturb' : i.type !== 'aturb'));
    if (!lista.length) return '';
    return `<h2>${titulo} (${lista.length})</h2>${lista.map((i) => (tipo === 'aturb'
      ? cartaoAturb(i.entry, i.nomeColecao, i.imagens) : cartaoCartografia(i.entry, i.nomeColecao, i.imagens))).join('')}`;
  };

  win.document.write(`<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
    <title>${esc(modelo.pdf_cabecalho1 || 'SIGAT')}</title>
    <style>
      :root { --cor: ${cor}; }
      body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 20px; }
      .cabecalho { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid var(--cor); padding-bottom: 10px; margin-bottom: 8px; }
      .cabecalho img { max-height: 64px; max-width: 160px; object-fit: contain; }
      .cabecalho .l1 { font-size: 12px; color: #444; margin: 0; }
      .cabecalho .l2 { font-size: 18px; font-weight: 700; color: var(--cor); margin: 2px 0 0; }
      h2 { font-size: 15px; margin: 24px 0 10px; color: var(--cor); border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
      .meta { font-size: 11px; color: #666; margin-bottom: 20px; }
      .entry-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; background: #fafbfc; }
      .entry-card-header { margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
      .entry-card-header h3 { font-size: 14px; margin: 0 0 2px; color: #1e293b; }
      .entry-card-source { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
      .entry-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
      .entry-card-field { margin-bottom: 6px; }
      .entry-card-field--full { margin-bottom: 10px; }
      .entry-card-field .label { display: block; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
      .entry-card-field .value { display: block; font-size: 12px; color: #1e293b; word-break: break-word; }
      .meta-sm { font-size: 10px; color: #94a3b8; }
      .thumbs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .thumbs figure { margin: 0; text-align: center; font-size: 9px; color: #64748b; }
      .thumbs img { max-height: 110px; max-width: 150px; border: 1px solid #cbd5e1; }
      .rodape { margin-top: 24px; border-top: 1px solid #cbd5e1; padding-top: 8px; font-size: 10px; color: #64748b; text-align: center; }
      @media print { body { margin: 10px; } .entry-card { break-inside: avoid; } }
    </style>
  </head><body>
    <div class="cabecalho">
      ${logo ? `<img src="${logo}" alt="" />` : ''}
      <div><p class="l1">${esc(modelo.pdf_cabecalho1)}</p><p class="l2">${esc(modelo.pdf_cabecalho2)}</p></div>
    </div>
    <p class="meta">Emitido por: <strong>${esc(utilizador || '—')}</strong> em ${esc(new Date().toLocaleString('pt-PT'))} &middot; ${itens.length} entrada(s)</p>
    ${grupo('cartografia', 'Cartografia')}${grupo('aturb', 'ATURB')}
    ${modelo.pdf_rodape ? `<div class="rodape">${esc(modelo.pdf_rodape)}</div>` : ''}
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
  return true;
}
