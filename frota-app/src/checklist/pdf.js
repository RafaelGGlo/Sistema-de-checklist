import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { documentoChecklist, nomePdf } from './pdfDocumento.mjs';
import { htmlChecklist } from './relatorio.mjs';
import { gerarPdfNativo } from './pdfNativo.mjs';

function conferir(arquivo) {
  if (!arquivo.exists || !arquivo.size) {
    const erro = new Error('O PDF não está disponível. Tente gerar novamente.');
    erro.code = 'PDF_INDISPONIVEL';
    throw erro;
  }
  return arquivo.uri;
}
function destino(dados) {
  const pasta = new Directory(Paths.document, 'checklists');
  pasta.create({ intermediates: true, idempotent: true });
  return new File(pasta, nomePdf(dados));
}
export async function gerarPdf(dados) {
  // Deixa o Android retirar o WebView de assinatura antes de criar o de impressão.
  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 150)));
  return gerarPdfNativo(dados, {
    imprimir: () => Print.printToFileAsync({ html: htmlChecklist(dados), width: 595.28, height: 841.89 }),
    guardar: async uri => {
      const arquivo = destino(dados);
      await new File(uri).copy(arquivo, { overwrite: true });
      return conferir(arquivo);
    },
    gerarBinario: async () => {
      const doc = await documentoChecklist(dados);
      const arquivo = destino(dados);
      // Grava os bytes diretamente, sem uma segunda cópia do PDF em base64.
      arquivo.write(await doc.save());
      return conferir(arquivo);
    },
  });
}
export async function compartilharPdf(uri) {
  conferir(new File(uri));
  if (!await Sharing.isAvailableAsync()) throw new Error('O compartilhamento não está disponível neste aparelho.');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Compartilhar checklist em PDF' });
}
export async function salvarPdfNoCelular(uri) {
  const arquivo = new File(uri);
  conferir(arquivo);
  let pasta;
  try { pasta = await Directory.pickDirectoryAsync(); }
  catch (error) {
    if (/cancel|dismiss/i.test(`${error.code || ''} ${error.message || ''}`)) return false;
    throw error;
  }
  await arquivo.copy(pasta, { overwrite: true });
  return true;
}
