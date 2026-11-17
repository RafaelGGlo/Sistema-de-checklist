import test from 'node:test';
import assert from 'node:assert/strict';
import { consultarDados } from '../src/lib/consultaDados.mjs';
import { janelaPeriodo } from '../src/lib/dashboardModelo.mjs';

function bancoSimulado(linhas, falharPagina = -1) {
  const chamadas = [];
  return { chamadas, from(tabela) {
    const filtros = [];
    const chamada = { tabela, filtros, ordens: [] };
    chamadas.push(chamada);
    const query = {
      select(campos) { chamada.campos = campos; return this; },
      eq(campo, valor) { filtros.push(['eq', campo, valor]); return this; },
      gte(campo, valor) { filtros.push(['gte', campo, valor]); return this; },
      lt(campo, valor) { filtros.push(['lt', campo, valor]); return this; },
      order(campo, opcoes) { chamada.ordens.push([campo, opcoes]); return this; },
      async range(inicio, fim) {
        chamada.range = [inicio, fim];
        if (chamadas.length - 1 === falharPagina) return { error: new Error('Falha na API') };
        const filtradas = linhas.filter(row => filtros.every(([op, campo, valor]) =>
          op === 'eq' ? row[campo] === valor : op === 'gte' ? row[campo] >= valor : row[campo] < valor));
        return { data: filtradas.slice(inicio, fim + 1) };
      },
    };
    return query;
  } };
}

test('7, 15 e 30 dias incluem hoje em Brasília e atravessam meses corretamente', () => {
  // Em UTC já é dia 1; em Brasília ainda é 31 de outubro.
  const agora = new Date('2026-11-01T02:30:00Z');
  for (const [dias, inicio] of [[7, '2026-10-25'], [15, '2026-10-17'], [30, '2026-10-02']]) {
    const janela = janelaPeriodo(dias, agora);
    assert.equal(janela.hoje, '2026-10-31');
    assert.equal(janela.inicioISO, `${inicio}T03:00:00.000Z`);
    assert.equal(janela.fimISO, '2026-11-01T03:00:00.000Z');
  }
});

test('cada consulta usa a tabela e a data certas e exclui dados fora do período', async () => {
  const janela = janelaPeriodo(7, new Date('2026-11-17T15:00:00Z'));
  for (const [tabela, campo] of [['viagens', 'saida_em'], ['checklists', 'realizado_em'], ['abastecimentos', 'registrado_em'], ['pedagios', 'registrado_em']]) {
    const banco = bancoSimulado([
      { id: 'antes', [campo]: '2026-11-11T02:59:59.999Z' },
      { id: 'inicio', [campo]: janela.inicioISO },
      { id: 'hoje', [campo]: '2026-11-18T02:59:59.999Z' },
      { id: 'futuro', [campo]: janela.fimISO },
    ]);
    const rows = await consultarDados(banco, tabela, { ordenar: campo, periodo: { ...janela, campo } });
    assert.deepEqual(rows.map(r => r.id), ['inicio', 'hoje']);
    assert.equal(banco.chamadas.length, 1);
    assert.equal(banco.chamadas[0].tabela, tabela);
    assert.deepEqual(banco.chamadas[0].filtros, [['gte', campo, janela.inicioISO], ['lt', campo, janela.fimISO]]);
  }
});

test('carrega todo o período além dos antigos limites e mantém ordem estável', async () => {
  const banco = bancoSimulado(Array.from({ length: 450 }, (_, i) => ({ id: String(i) })));
  const rows = await consultarDados(banco, 'viagens', { ordenar: 'saida_em' });
  assert.equal(rows.length, 450);
  assert.deepEqual(banco.chamadas.map(c => c.range), [[0, 199], [200, 399], [400, 599]]);
  assert.deepEqual(banco.chamadas[0].ordens, [['saida_em', { ascending: false }], ['id', undefined]]);
});

test('mantém filtros e limites explícitos de outras telas', async () => {
  const banco = bancoSimulado(Array.from({ length: 300 }, (_, i) => ({ id: String(i), ativo: i % 2 === 0 })));
  const rows = await consultarDados(banco, 'veiculos', { campos: 'id', filtros: { ativo: true }, limite: 100 });
  assert.equal(rows.length, 100);
  assert.equal(banco.chamadas[0].campos, 'id');
  assert.deepEqual(banco.chamadas[0].range, [0, 99]);
});

test('uma falha na segunda página rejeita a consulta em vez de apresentar dados incompletos', async () => {
  const banco = bancoSimulado(Array.from({ length: 300 }, (_, i) => ({ id: String(i) })), 1);
  await assert.rejects(consultarDados(banco, 'checklists'), /Falha na API/);
});
