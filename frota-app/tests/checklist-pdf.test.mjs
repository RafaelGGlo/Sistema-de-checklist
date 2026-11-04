import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlChecklist } from '../src/checklist/relatorio.mjs';
import { formularioInicial, montarChecklist } from '../src/checklist/model.mjs';

test('relatório inclui avaliações, identificação, assinatura e seis fotos', () => {
  const veiculo = { id: 'v1', nome: 'Van', placa: 'ABC1234' };
  const form = formularioInicial(veiculo); form.km = '1000';
  const imagem = 'data:image/png;base64,aGVsbG8=';
  const fotos = Object.fromEntries(['painel', 'cabine', 'ldEsq', 'ldDir', 'traseira', 'frente'].map(id => [id, imagem]));
  const dados = montarChecklist(veiculo, 'Motorista Completo', form, fotos, imagem);
  const html = htmlChecklist(dados);
  for (const valor of ['ABC1234', 'Motorista Completo', '1000', ...dados.itens.map(i => i.label)]) assert.ok(html.includes(valor));
  assert.equal((html.match(/<img /g) || []).length, 7);
});

test('relatório escapa texto digitado e rejeita imagens com conteúdo ativo', () => {
  const html = htmlChecklist({ motorista: '<script>alert(1)</script>', itens: [{ label: '<b>', valor: '"&' }], fotos: { painel: 'javascript:alert(1)' }, assinatura: 'data:image/svg+xml;base64,PHN2Zz4=' });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('<img '));
});
