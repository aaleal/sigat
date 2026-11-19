// Descarrega um ficheiro de um endpoint autenticado (o header Authorization impede usar um link direto).
export async function downloadFile(url, token) {
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    let message = `Erro HTTP ${response.status}`;
    try { message = (await response.json()).message || message; } catch { /* corpo não JSON */ }
    throw new Error(message);
  }
  const disposition = response.headers.get('content-disposition') || '';
  const nome = /filename="([^"]+)"/.exec(disposition)?.[1] || 'sigat-exportacao';
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
  return nome;
}
