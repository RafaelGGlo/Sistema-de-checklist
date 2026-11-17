import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { gerarPdfNativo } from '../src/checklist/pdfNativo.mjs';
import { documentoChecklist } from '../src/checklist/pdfDocumento.mjs';
import { FOTOS, formularioInicial, montarChecklist } from '../src/checklist/model.mjs';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const veiculo = { id: 'v1', nome: 'Caminhão', placa: 'ABC1234' };
const form = formularioInicial(veiculo); form.km = '1234';
const dados = montarChecklist(veiculo, 'José', form, Object.fromEntries(FOTOS.map(foto => [foto.id, png])), png);

test('PDF nativo é guardado antes de disponibilizar o arquivo', async () => {
  const uri = await gerarPdfNativo(dados, {
    imprimir: async () => ({ uri: 'file:///cache/documento.pdf', numberOfPages: 2 }),
    guardar: async origem => { assert.equal(origem, 'file:///cache/documento.pdf'); return 'file:///documents/Checklist.pdf'; },
    gerarBinario: () => assert.fail('Não deve gerar o documento duas vezes'),
  });
  assert.equal(uri, 'file:///documents/Checklist.pdf');
});

for (const falha of ['erro', 'sem páginas', 'demora', 'gravação']) {
  test(`gera PDF válido com assinatura quando a impressão nativa falha: ${falha}`, async () => {
    const bytes = await gerarPdfNativo(dados, {
      limiteMs: 15,
      imprimir: async () => {
        if (falha === 'erro') throw new Error('WebView indisponível');
        if (falha === 'demora') return new Promise(() => {});
        return { uri: 'file:///cache/documento.pdf', numberOfPages: falha === 'sem páginas' ? 0 : 2 };
      },
      guardar: async () => { throw new Error('Arquivo de impressão não disponível'); },
      gerarBinario: async payload => (await documentoChecklist(payload)).save(),
    });
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
  });
}
