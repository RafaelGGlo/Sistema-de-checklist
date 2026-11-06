import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { documentoChecklist, nomePdf } from './pdfDocumento.mjs';

export async function gerarPdf(dados) {
  if (!FileSystem.cacheDirectory) throw new Error('Não foi possível acessar os arquivos do aplicativo.');
  const doc = await documentoChecklist(dados);
  const uri = FileSystem.cacheDirectory + nomePdf(dados);
  await FileSystem.writeAsStringAsync(uri, await doc.saveAsBase64(), { encoding: FileSystem.EncodingType.Base64 });
  const arquivo = await FileSystem.getInfoAsync(uri);
  if (!arquivo.exists || !arquivo.size) throw new Error('O PDF não foi gravado. Tente novamente.');
  return uri;
}
export async function compartilharPdf(uri) {
  const arquivo = await FileSystem.getInfoAsync(uri);
  if (!arquivo.exists || !arquivo.size) throw new Error('O PDF não está mais disponível. Gere o arquivo novamente.');
  if (!await Sharing.isAvailableAsync()) throw new Error('O compartilhamento não está disponível neste aparelho.');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Compartilhar checklist em PDF' });
}
