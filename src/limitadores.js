// Limitador de tentativas em memória (reinicia com o processo). Complementa os bloqueios guardados na BD.
function criarLimitador() {
  const falhas = new Map();
  const expirou = (f, janelaMs) => Date.now() - f.desde > janelaMs;
  return {
    bloqueado(chave, max, janelaMs) {
      const f = falhas.get(chave);
      if (!f) return false;
      if (expirou(f, janelaMs)) { falhas.delete(chave); return false; }
      return f.n >= max;
    },
    falha(chave, janelaMs) {
      if (falhas.size > 10_000) for (const [k, f] of falhas) if (expirou(f, janelaMs)) falhas.delete(k);
      const f = falhas.get(chave);
      if (!f || expirou(f, janelaMs)) falhas.set(chave, { n: 1, desde: Date.now() });
      else f.n += 1;
    },
    limpar(chave) { falhas.delete(chave); },
    // Remove todas as chaves de um utilizador (formato `ip|utilizador`), seja qual for o IP.
    limparUtilizador(username) {
      const sufixo = `|${String(username).toLowerCase()}`;
      for (const k of falhas.keys()) if (k.endsWith(sufixo)) falhas.delete(k);
    },
  };
}

module.exports = {
  login: criarLimitador(),
  pedidosRecuperacao: criarLimitador(),
  recuperar: criarLimitador(),
};
