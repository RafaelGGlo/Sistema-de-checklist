import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diaSP, janelaPeriodo, resumirDashboard } from '../src/lib/dashboardModelo.mjs';

const vazio = () => ({ veiculos: [], viagens: [], retornos: [], checklists: [], abastecimentos: [], pedagios: [] });

test('períodos usam dias de Brasília, inclusive perto da meia-noite e na mudança de mês', () => {
  const p = janelaPeriodo(7, new Date('2026-11-16T01:30:00Z'));
  assert.equal(p.hoje, '2026-11-15');
  assert.equal(p.inicio, '2026-11-09');
  assert.equal(p.inicioISO, '2026-11-09T03:00:00.000Z');
  assert.equal(p.fimISO, '2026-11-16T03:00:00.000Z');
  assert.equal(janelaPeriodo(30, new Date('2026-01-01T12:00:00Z')).inicio, '2025-12-03');
  assert.equal(diaSP('2026-11-16T02:59:59Z'), '2026-11-15');
  assert.equal(diaSP(null), null);
  assert.equal(diaSP('inválido'), null);
  assert.throws(() => janelaPeriodo(0), /inválido/);
});

test('situação atual, avarias e KM zero são tratados sem presumir revisão vencida', () => {
  const dados = vazio();
  dados.veiculos = [
    { id: '1', status: 'Liberado', ultimo_km: 0 },
    { id: '2', status: 'Avaria', ultimo_km: 20000, proxima_revisao_km: 20000 },
    { id: '3', status: 'Manutenção', ultimo_km: null },
    { id: '4', status: 'Em Trânsito', ultimo_km: 25000, proxima_revisao_km: 26000 },
    { id: '5', status: 'Liberado', ultimo_km: 91000 },
  ];
  const r = resumirDashboard(dados, janelaPeriodo(30));
  assert.equal(r.total, 5); assert.equal(r.disponiveis, 2); assert.equal(r.emTransito, 1); assert.equal(r.retidos, 2);
  assert.equal(r.alertas.filter(a => a.tipo === 'km').length, 1);
  assert.equal(r.alertas.filter(a => a.tipo === 'revisao').length, 2);
  assert.equal(r.alertas.some(a => a.veiculo.id === '5'), false);
});

test('KM corresponde aos retornos no período, independentemente das saídas', () => {
  const dados = vazio();
  dados.viagens = [{ id: 'saida-sem-retorno', saida_em: '2026-11-16T12:00:00Z' }];
  dados.retornos = [{ id: 'saida-anterior-retorno-atual', km_percorrido: 150 }, { id: 'outro', km_percorrido: '30' }, { id: 'legado', km_percorrido: null }];
  dados.checklists = [{ status: 'Avaria' }, { status: 'Avaria' }, { status: 'Liberado' }];
  const r = resumirDashboard(dados, janelaPeriodo(7));
  assert.equal(r.viagens, 1); assert.equal(r.retornos, 3); assert.equal(r.km, 180);
  assert.equal(r.checklists, 3); assert.equal(r.checklistsAvaria, 2); assert.equal(r.retidos, 0);
});

test('despesas completas, valores numéricos da API, ranking e dias sem lançamento', () => {
  const dados = vazio();
  dados.abastecimentos = Array.from({ length: 1205 }, (_, i) => ({ id: `a${i}`, veiculo_id: 'v1', nome_veiculo: 'Van', placa: 'ABC1234', valor_total: '10.50', litros: '2', registrado_em: '2026-11-16T12:00:00Z' }));
  dados.pedagios = [{ id: 'p1', veiculo_id: 'arquivado', valor: '21.50', registrado_em: '2026-11-16T02:30:00Z' }];
  const r = resumirDashboard(dados, janelaPeriodo(7, new Date('2026-11-16T12:00:00Z')));
  assert.equal(r.combustivel, 12652.5); assert.equal(r.pedagio, 21.5); assert.equal(r.despesa, 12674);
  assert.equal(r.litros, 2410); assert.equal(r.custos.length, 2); assert.equal(r.custos[0].id, 'v1');
  assert.equal(r.serie.length, 7);
  assert.equal(r.serie.find(s => s.inicio === '2026-11-15').pedagio, 21.5);
  assert.equal(r.serie[0].combustivel, 0);
  assert.equal(r.serie.reduce((s, item) => s + item.combustivel + item.pedagio, 0), r.despesa);
});

test('90 dias são agrupados em semanas contíguas sem perder o primeiro/último dia', () => {
  const p = janelaPeriodo(90, new Date('2026-11-16T12:00:00Z'));
  const dados = vazio();
  dados.pedagios = [
    { veiculo_id: 'v', valor: 10, registrado_em: `${p.inicio}T03:00:00Z` },
    { veiculo_id: 'v', valor: 20, registrado_em: `${p.hoje}T23:00:00-03:00` },
  ];
  const r = resumirDashboard(dados, p);
  assert.equal(r.serie.length, 13); assert.equal(r.serie[0].inicio, p.inicio); assert.equal(r.serie.at(-1).fim, p.hoje);
  assert.equal(r.serie.reduce((s, item) => s + item.pedagio, 0), 30);
  const rVazio = resumirDashboard(vazio(), p);
  assert.equal(rVazio.despesa, 0); assert.equal(rVazio.total, 0); assert.equal(rVazio.alertas.length, 0);
});

test('180 dias cobrem toda a base do TCC e agrupam despesas em semanas', () => {
  const p = janelaPeriodo(180, new Date('2026-11-16T12:00:00Z'));
  assert.equal(p.inicio, '2026-05-21');
  assert.equal(p.hoje, '2026-11-16');
  const dados = vazio();
  dados.pedagios = [{ valor: 10, registrado_em: '2026-05-21T03:00:00Z' }, { valor: 20, registrado_em: '2026-11-17T02:59:59Z' }];
  const r = resumirDashboard(dados, p);
  assert.equal(r.serie.length, 26);
  assert.equal(r.serie.at(-1).fim, p.hoje);
  assert.equal(r.serie.reduce((s, item) => s + item.pedagio, 0), 30);
});
