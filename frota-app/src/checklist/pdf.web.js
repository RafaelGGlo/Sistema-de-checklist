import { documentoChecklist, nomePdf } from './pdfDocumento.mjs';

export async function gerarPdf(dados) {
  const doc = await documentoChecklist(dados);
  const bytes = await doc.save();
  return new File([bytes], nomePdf(dados), { type: 'application/pdf' });
}
export async function compartilharPdf(arquivo) {
  const payload = { files: [arquivo], title: 'Checklist do veículo' };
  if (navigator.canShare?.({ files: [arquivo] }) && navigator.share) {
    try { await navigator.share(payload); }
    catch (error) { if (error.name !== 'AbortError') throw error; }
    return;
  }
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = url; link.download = arquivo.name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function salvarPdfNoCelular(arquivo) { await compartilharPdf(arquivo); return true; }
