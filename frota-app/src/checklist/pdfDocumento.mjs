// A distribuição UMD inclui os helpers; evita incompatibilidade de tslib no Metro.
import * as pdfLib from 'pdf-lib/dist/pdf-lib.min.js';
import { FOTOS } from './model.mjs';
const { PDFDocument, StandardFonts, rgb } = pdfLib.PDFDocument ? pdfLib : pdfLib.default;

export function nomePdf(dados) {
  const placa = String(dados.placa || 'veiculo').replace(/[^a-zA-Z0-9-]/g, '');
  const data = String(dados.dataHoraCriacao || new Date().toISOString()).replace(/[^0-9]/g, '').slice(0, 14);
  return `Checklist-${placa}-${data}.pdf`;
}

// Gera o arquivo diretamente, sem WebView, serviço de impressão ou acesso à rede.
export async function documentoChecklist(dados) {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const azul = rgb(0.09, 0.38, 0.49), tinta = rgb(0.09, 0.16, 0.21);
  const largura = 595.28, altura = 841.89, margem = 40, util = largura - margem * 2;
  let pagina, y;
  function textoSeguro(valor) {
    return Array.from(String(valor ?? '').normalize('NFC')).map(char => {
      if (char === '\n') return char;
      if (char === '\r' || char === '\t') return ' ';
      try { normal.encodeText(char); return char; } catch { return '?'; }
    }).join('');
  }
  function novaPagina() { pagina = doc.addPage([largura, altura]); y = altura - margem; }
  function espaco(tamanho) { if (y - tamanho < 52) novaPagina(); }
  function linhas(valor, maximo, fonte, tamanho) {
    const resultado = [];
    for (const paragrafo of textoSeguro(valor).split('\n')) {
      let linha = '';
      for (const char of paragrafo) {
        if (linha && fonte.widthOfTextAtSize(linha + char, tamanho) > maximo) {
          const separador = linha.lastIndexOf(' ');
          if (separador > 0) {
            resultado.push(linha.slice(0, separador)); linha = linha.slice(separador + 1) + char;
          } else { resultado.push(linha); linha = char; }
        } else linha += char;
      }
      resultado.push(linha);
    }
    return resultado;
  }
  function texto(valor, { tamanho = 10, fonte = normal, cor = tinta, x = margem, maximo = util } = {}) {
    for (const linha of linhas(valor, maximo, fonte, tamanho)) {
      espaco(tamanho + 5);
      pagina.drawText(linha, { x, y: y - tamanho, size: tamanho, font: fonte, color: cor });
      y -= tamanho + 5;
    }
  }
  function titulo(valor) { espaco(45); y -= 10; texto(valor, { tamanho: 14, fonte: negrito, cor: azul }); y -= 4; }
  async function imagem(data) {
    if (!/^data:image\/(png|jpe?g);base64,/.test(data || '')) return null;
    try { return data.startsWith('data:image/png') ? await doc.embedPng(data) : await doc.embedJpg(data); }
    catch { throw new Error('Uma foto ou assinatura está inválida. Não foi possível gerar o PDF completo.'); }
  }
  function desenharImagem(img, x, topo, maxLargura, maxAltura) {
    const escala = Math.min(maxLargura / img.width, maxAltura / img.height);
    const w = img.width * escala, h = img.height * escala;
    pagina.drawImage(img, { x: x + (maxLargura - w) / 2, y: topo - h, width: w, height: h });
  }
  doc.setTitle(`Checklist ${textoSeguro(dados.placa)}`);
  doc.setAuthor('Frota Junco');
  novaPagina();
  texto('CHECKLIST DO VEÍCULO', { tamanho: 21, fonte: negrito, cor: azul }); y -= 10;
  texto(`Veículo: ${dados.nomeVeiculo || '-'} | Placa: ${dados.placa || '-'}`, { fonte: negrito });
  texto(`Motorista: ${dados.motorista || '-'}`);
  texto(`Data: ${dados.dataHoraFormatada || '-'}`);
  texto(`KM atual: ${dados.km || '-'} | Próxima revisão: ${dados.proximaRevisaoKm || '-'}`);
  texto(`Situação: ${dados.status || '-'}`, { fonte: negrito });
  titulo('Avaliações');
  for (const [indice, item] of dados.itens.entries()) {
    const esquerda = linhas(item.label, util * 0.66 - 10, normal, 10);
    const direita = linhas(item.valor, util * 0.34 - 10, negrito, 10);
    const h = Math.max(esquerda.length, direita.length) * 14 + 10;
    espaco(h);
    if (indice % 2 === 0) pagina.drawRectangle({ x: margem, y: y - h, width: util, height: h, color: rgb(0.94, 0.96, 0.97) });
    for (const [i, linha] of esquerda.entries()) pagina.drawText(linha, { x: margem + 5, y: y - 15 - i * 14, size: 10, font: normal, color: tinta });
    for (const [i, linha] of direita.entries()) pagina.drawText(linha, { x: margem + util * 0.66, y: y - 15 - i * 14, size: 10, font: negrito, color: tinta });
    y -= h;
  }
  titulo('Observações'); texto(dados.obsGeral || 'Nenhuma observação.');
  espaco(150); titulo('Assinatura do motorista');
  const assinatura = await imagem(dados.assinatura);
  if (assinatura) { desenharImagem(assinatura, margem, y, 280, 80); y -= 85; }
  else texto('Sem assinatura');
  texto(dados.motorista || '-');
  novaPagina(); titulo('Fotos do veículo');
  const topoFotos = y;
  for (const [indice, foto] of FOTOS.entries()) {
    const x = margem + (indice % 2) * (util / 2 + 6);
    const topo = topoFotos - Math.floor(indice / 2) * 223;
    pagina.drawText(foto.label, { x, y: topo - 12, size: 11, font: negrito, color: azul });
    const img = await imagem(dados.fotos?.[foto.id]);
    if (img) desenharImagem(img, x, topo - 25, util / 2 - 12, 178);
    else pagina.drawText('Foto não anexada', { x, y: topo - 50, size: 10, font: normal, color: tinta });
  }
  for (const [indice, page] of doc.getPages().entries()) {
    page.drawText(`Frota Junco | ${indice + 1} / ${doc.getPageCount()}`, { x: margem, y: 25, size: 9, font: normal, color: azul });
  }
  return doc;
}
