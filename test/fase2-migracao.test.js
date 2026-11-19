const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { migrar, paraIso } = require('../scripts/migrar-json-para-sqlite');
const db = require('../src/db');
const documentos = require('../src/db/repos/documentos');

function prepararLegacy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigat-legacy-'));
  fs.mkdirSync(path.join(dir, 'datasets'));
  const entrada = (n, extra = {}) => ({
    sourceEntryNumber: n, cabecalho: `DOC ${n}`, descricao: `Planta número ${n}`, cota: `MP ${n}`, autor: 'Autor', estado: '-', ...extra,
  });
  const antigo = {
    entries: [
      entrada(1, { autor: 'Antigo', updatedAt: '2026-03-01T10:00:00Z', updatedBy: 'ana' }),
      entrada(2, { estado: 'Em Consulta', estadoChangedAt: '2026-03-02T10:00:00Z', estadoChangedBy: 'ana' }),
      entrada(3, { estado: 'Empréstimo', estadoChangedAt: '2026-03-03T10:00:00Z', estadoMeta: { dataSaida: '05/03/2026', requisitante: 'AML' } }),
      entrada(50, { descricao: 'Planta criada à mão', cota: 'MP 50', createdAt: '2026-03-04T10:00:00Z', createdBy: 'ana' }),
    ],
    deletedEntries: [],
    history: [{
      id: 'h1', action: 'edit', timestamp: '2026-03-01T10:00:00Z', user: 'ana',
      entryRef: { sourceEntryNumber: 1, cabecalho: 'DOC 1' }, details: { prev: entrada(1, { autor: 'Original' }), next: entrada(1, { autor: 'Antigo' }) },
    }],
  };
  const canonico = { entries: [entrada(1, { autor: 'Original' }), entrada(2), entrada(3), entrada(4)], deletedEntries: [entrada(9)], history: [] };
  fs.writeFileSync(path.join(dir, 'datasets', 'a.json'), JSON.stringify(antigo));
  fs.writeFileSync(path.join(dir, 'datasets', 'b.json'), JSON.stringify(canonico));
  fs.writeFileSync(path.join(dir, 'datasets.json'), JSON.stringify({
    activeDatasetId: 'inexistente',
    datasets: [
      { id: 'a', name: 'antigo', type: 'cartografia', uploadedAt: '2026-01-01T00:00:00Z', uploadedBy: 'admin' },
      { id: 'b', name: 'Cartografia GEO - BD', type: 'cartografia', uploadedAt: '2026-02-01T00:00:00Z', uploadedBy: 'admin' },
      { id: 'c', name: 'sem ficheiro', uploadedAt: '2026-02-01T00:00:00Z' },
    ],
  }));
  fs.writeFileSync(path.join(dir, 'users.json'), JSON.stringify([{ id: 'u1', username: 'ana', role: 'write', passwordHash: 'hash', createdAt: '2026-01-01T00:00:00Z' }]));
  return dir;
}

test('paraIso converte formatos comuns', () => {
  assert.equal(paraIso('05/03/2026'), '2026-03-05');
  assert.equal(paraIso('2026-03-05T10:00:00Z'), '2026-03-05');
  assert.equal(paraIso('abc'), '');
});

test('simulação não grava; aplicar migra, recupera trabalho e arquiva os JSON', () => {
  const dir = prepararLegacy();
  const sim = migrar({ dir });
  assert.equal(sim.relatorio.aplicado, false);
  assert.ok(!fs.existsSync(path.join(dir, 'sigat.db')));
  assert.ok(fs.existsSync(path.join(dir, 'datasets.json')));

  const { relatorio } = migrar({ dir, aplicar: true });
  const carto = relatorio.colecoes.find((c) => c.colecao === 'cartografia');
  assert.equal(carto.canonico, 'Cartografia GEO - BD');
  assert.equal(carto.documentos, 4);
  assert.equal(carto.eliminados, 1);
  assert.equal(carto.recuperado[0].edicoes, 1);
  assert.equal(carto.recuperado[0].estados, 2);
  assert.equal(carto.recuperado[0].criados, 1);
  assert.ok(relatorio.avisos.some((a) => a.includes('sem ficheiro') || a.includes('inexistente')));
  assert.ok(fs.existsSync(path.join(dir, 'legacy', 'datasets.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'datasets.json')));

  db.abrir(dir);
  try {
    const lista = documentos.listar('cartografia');
    assert.equal(lista.length, 5);
    assert.equal(lista.find((d) => d.numero === 1).autor, 'Antigo');
    assert.equal(lista.find((d) => d.numero === 2).estado, 'Em Consulta');
    const emp = lista.find((d) => d.numero === 3);
    assert.equal(emp.estado, 'Empréstimo');
    assert.equal(emp.estadoMeta.requisitante, 'AML');
    assert.equal(emp.estadoMeta.dataSaida, '2026-03-05');
    assert.ok(lista.some((d) => d.descricao === 'Planta criada à mão'));
    assert.equal(db.getDb().prepare('SELECT COUNT(*) n FROM utilizadores WHERE username = ?').get('ana').n, 1);
    assert.ok(db.getDb().prepare('SELECT COUNT(*) n FROM historico').get().n >= 1);
  } finally {
    documentos.invalidar();
    db.fecharBd();
  }

  // Segunda execução: não duplica
  fs.renameSync(path.join(dir, 'legacy', 'datasets.json'), path.join(dir, 'datasets.json'));
  fs.renameSync(path.join(dir, 'legacy', 'datasets'), path.join(dir, 'datasets'));
  const segunda = migrar({ dir, aplicar: true });
  assert.ok(segunda.relatorio.avisos.some((a) => a.includes('já tem documentos')));
  fs.rmSync(dir, { recursive: true, force: true });
});
