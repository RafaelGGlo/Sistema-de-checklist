import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATEGORIAS, FOTOS, ITENS, exigirFotos, formularioInicial, fotosVazias, fotosPendentes, marcarCategoria, montarChecklist, progresso, restaurarFormulario } from '../src/checklist/model.mjs';
const veiculo = { id: 'v1', nome: 'Van', placa: 'ABC1234', ultimoKm: '1000', proximaRevisaoKm: '10000' };
const fotosCompletas = () => Object.fromEntries(FOTOS.map(foto => [foto.id, `data:image/jpeg;base64,${foto.id}`]));

test('bloqueia todas as 63 combinações incompletas e libera somente as seis fotos confirmadas', () => {
  for (let mascara = 0; mascara < 64; mascara++) {
    const fotos = Object.fromEntries(FOTOS.filter((_, i) => mascara & (1 << i)).map(foto => [foto.id, 'foto confirmada']));
    if (mascara === 63) {
      assert.doesNotThrow(() => exigirFotos(fotos));
      assert.doesNotThrow(() => montarChecklist(veiculo, 'Motorista', formularioInicial(veiculo), fotos, 'assinatura'));
    } else {
      assert.throws(() => exigirFotos(fotos), /As 6 fotos são obrigatórias/);
      assert.throws(() => montarChecklist(veiculo, 'Motorista', formularioInicial(veiculo), fotos, 'assinatura'), /As 6 fotos são obrigatórias/);
      for (const foto of fotosPendentes(fotos)) {
        assert.throws(() => exigirFotos(fotos), erro => erro.message.includes(foto.label));
      }
    }
  }
});

test('fotos ausentes, valores inválidos e chaves extras não completam a inspeção', () => {
  for (const valor of ['', '   ', null, undefined, false, 1, {}]) {
    for (const foto of FOTOS) {
      const fotos = { ...fotosCompletas(), [foto.id]: valor, extra: 'foto' };
      assert.deepEqual(fotosPendentes(fotos), [foto]);
      assert.throws(() => exigirFotos(fotos), /As 6 fotos são obrigatórias/);
    }
  }
  assert.equal(fotosPendentes(null).length, 6);
  assert.equal(fotosPendentes(undefined).length, 6);
});

test('preserva as 16 avaliações e seis posições reais, sem confundir valores padrão com revisão', () => {
  const form = formularioInicial(veiculo);
  assert.equal(ITENS.length, 16);
  assert.equal(CATEGORIAS.length, 5);
  assert.deepEqual(FOTOS.map(f => f.id), ['painel', 'cabine', 'ldEsq', 'ldDir', 'traseira', 'frente']);
  assert.deepEqual(progresso(form), { concluidos: 0, total: 16, percentual: 0 });
  assert.equal(montarChecklist(veiculo, 'Rafael', form, fotosCompletas(), 'assinatura').status, 'Liberado');
});
test('marcação em grupo fica restrita à categoria e admite alterações posteriores', () => {
  const inicial = formularioInicial(veiculo);
  const marcado = marcarCategoria(inicial, CATEGORIAS[0]);
  assert.equal(progresso(marcado).concluidos, 3);
  assert.equal(progresso(inicial).concluidos, 0);
  marcado.valores.oleoMotor = 'RUIM';
  assert.equal(montarChecklist(veiculo, 'Rafael', marcado, fotosCompletas(), 'a').status, 'Avaria');
  const tudo = CATEGORIAS.reduce(marcarCategoria, inicial);
  assert.deepEqual(progresso(tudo), { concluidos: 16, total: 16, percentual: 100 });
});
test('o contrato enviado preserva campos, ordem das perguntas e regra REGULAR sem avaria', () => {
  const form = formularioInicial(veiculo);
  form.valores.oleoMotor = 'REGULAR';
  form.valores.setaE = 'QUEIMADO'; form.setaEDetalhe = 'TRASEIRA';
  form.temObs = 'SIM'; form.textoObs = 'Lâmpada queimada';
  const fotos = { ...fotosCompletas(), painel: 'data:image/jpeg;base64,teste' };
  const payload = montarChecklist(veiculo, 'Rafael', form, fotos, 'assinatura', new Date('2026-11-04T12:00:00Z'));
  assert.deepEqual(Object.keys(payload), ['veiculoId', 'placa', 'nomeVeiculo', 'motorista', 'km', 'proximaRevisaoKm', 'status', 'dataHoraFormatada', 'dataHoraCriacao', 'itens', 'obsGeral', 'fotos', 'assinatura']);
  assert.equal(payload.status, 'Avaria');
  assert.deepEqual(payload.itens[0], { label: 'Óleo do Motor', valor: 'REGULAR', ok: true });
  assert.deepEqual(payload.itens[9], { label: 'Seta Esquerda', valor: 'QUEIMADO (TRASEIRA)', ok: false });
  assert.equal(payload.obsGeral, 'Lâmpada queimada');
  assert.deepEqual(payload.fotos, fotos);
  assert.equal('revisados' in payload, false);
  assert.deepEqual(payload.itens.map(i => i.label), ['Óleo do Motor', 'Nível de Água', 'Fluido de Freio', 'Pneu Dianteiro Esquerdo (DE)', 'Pneu Dianteiro Direito (DD)', 'Pneu Traseiro Esquerdo (TE)', 'Pneu Traseiro Direito (TD)', 'Farol Direito', 'Farol Esquerdo', 'Seta Esquerda', 'Seta Direita', 'Iluminação Traseira Esquerda', 'Iluminação Traseira Direita', 'Cadeado no Baú', 'Limpeza Geral', 'Limpeza da Cabine']);
});
test('cada avaliação negativa mantém a regra de avaria e os valores positivos não a acionam', () => {
  for (const i of ITENS) {
    for (const valor of i.opcoes) {
      const form = formularioInicial(veiculo); form.valores[i.id] = valor;
      const payload = montarChecklist(veiculo, 'Rafael', form, fotosCompletas(), 'a');
      const negativo = ['RUIM', 'DEFEITO', 'QUEIMADO', 'NAO'].includes(valor);
      assert.equal(payload.status, negativo ? 'Avaria' : 'Liberado', `${i.id} ${valor}`);
    }
  }
});
test('restaura apenas opções válidas e retoma a sequência sem sobrescrever fotos existentes', () => {
  const salvo = formularioInicial(veiculo); salvo.valores.pneuDE = 'RUIM'; salvo.revisados.pneuDE = true;
  salvo.valores.farolD = 'ADMIN'; salvo.km = '2222';
  const form = restaurarFormulario(veiculo, JSON.parse(JSON.stringify(salvo)));
  assert.equal(form.valores.pneuDE, 'RUIM'); assert.equal(form.revisados.pneuDE, true);
  assert.equal(form.valores.farolD, 'OK'); assert.equal(form.km, '2222');
  assert.deepEqual(fotosPendentes({ painel: 'foto', cabine: 'foto' }).map(f => f.id), ['ldEsq', 'ldDir', 'traseira', 'frente']);
});
