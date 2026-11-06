import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlChecklist } from '../src/checklist/relatorio.mjs';
import { formularioInicial, montarChecklist } from '../src/checklist/model.mjs';
import { documentoChecklist, nomePdf } from '../src/checklist/pdfDocumento.mjs';
import { PDFDocument, PDFName } from 'pdf-lib';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function exemplo() {
  const veiculo = { id: 'v1', nome: 'Caminhão de inspeção', placa: 'ABC1D23' };
  const form = formularioInicial(veiculo); form.km = '12345';
  return montarChecklist(veiculo, 'José da Silva', form,
    Object.fromEntries(['painel', 'cabine', 'ldEsq', 'ldDir', 'traseira', 'frente'].map(id => [id, png])), png);
}

test('gera um PDF binário válido com assinatura, seis imagens e páginas A4', async () => {
  const dados = exemplo();
  const doc = await documentoChecklist(dados);
  const bytes = await doc.save();
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  const aberto = await PDFDocument.load(bytes);
  assert.equal(aberto.getPageCount(), 2);
  assert.equal(aberto.getTitle(), 'Checklist ABC1D23');
  let imagens = 0;
  for (const page of aberto.getPages()) {
    assert.ok(Math.abs(page.getSize().width - 595.28) < 0.01);
    imagens += page.node.Resources().lookup(PDFName.of('XObject'))?.keys().length || 0;
  }
  assert.equal(imagens, 7);
  assert.match(nomePdf(dados), /^Checklist-ABC1D23-\d{14}\.pdf$/);
});

test('observações longas e caracteres fora do alfabeto não interrompem a geração', async () => {
  const dados = exemplo();
  dados.obsGeral = ('Texto com acentuação, inspeção e segurança 🚚.\n' + 'A'.repeat(180) + '\n').repeat(40);
  const doc = await documentoChecklist(dados);
  assert.ok(doc.getPageCount() > 2);
  await PDFDocument.load(await doc.save());
});

test('imagem corrompida apresenta erro em vez de compartilhar PDF incompleto', async () => {
  const dados = exemplo(); dados.fotos.painel = 'data:image/jpeg;base64,aGVsbG8=';
  await assert.rejects(documentoChecklist(dados), /foto ou assinatura está inválida/);
});

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
