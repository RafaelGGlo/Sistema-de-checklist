import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { htmlChecklist } from './relatorio.mjs';

export async function gerarPdf(dados) {
  const { uri } = await Print.printToFileAsync({ html: htmlChecklist(dados), width: 595, height: 842 });
  return uri;
}
export async function compartilharPdf(uri) {
  if (!await Sharing.isAvailableAsync()) throw new Error('O compartilhamento não está disponível neste aparelho.');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Compartilhar checklist em PDF' });
}
