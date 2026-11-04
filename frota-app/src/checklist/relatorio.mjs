import { FOTOS } from './model.mjs';

const escapar = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const imagem = value => /^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=\s]+$/.test(value || '') ? value : '';
export function htmlChecklist(dados) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Checklist ${escapar(dados.placa)}</title><style>
    @page { size: A4; margin: 16mm; } body { font: 12px Arial, sans-serif; color: #172b37; }
    h1 { color: #17617e; } table { width: 100%; border-collapse: collapse; } td, th { text-align: left; padding: 7px; border: 1px solid #ccd6dc; }
    th { background: #edf3f6; } .foto { display: inline-block; width: 46%; margin: 1%; vertical-align: top; break-inside: avoid; } .foto img { width: 100%; max-height: 230px; object-fit: contain; }
    .assinatura { break-inside: avoid; } .assinatura img { width: 280px; height: 120px; object-fit: contain; } .observacoes { white-space: pre-wrap; overflow-wrap: anywhere; }
    </style></head><body><h1>Checklist do veículo</h1>
    <p><b>Veículo:</b> ${escapar(dados.nomeVeiculo)} • ${escapar(dados.placa)}</p>
    <p><b>Motorista:</b> ${escapar(dados.motorista)}<br><b>Data:</b> ${escapar(dados.dataHoraFormatada)}<br><b>KM:</b> ${escapar(dados.km)}<br><b>Próxima revisão:</b> ${escapar(dados.proximaRevisaoKm)}<br><b>Situação:</b> ${escapar(dados.status)}</p>
    <table><thead><tr><th>Item verificado</th><th>Avaliação</th></tr></thead><tbody>${dados.itens.map(item => `<tr><td>${escapar(item.label)}</td><td>${escapar(item.valor)}</td></tr>`).join('')}</tbody></table>
    <h2>Observações</h2><p class="observacoes">${escapar(dados.obsGeral)}</p>
    <div class="assinatura"><h2>Assinatura do motorista</h2>${imagem(dados.assinatura) ? `<img alt="Assinatura" src="${imagem(dados.assinatura)}">` : 'Sem assinatura'}<p>${escapar(dados.motorista)}</p></div>
    <h2>Fotos do veículo</h2>${FOTOS.map(foto => `<div class="foto"><b>${escapar(foto.label)}</b><br>${imagem(dados.fotos?.[foto.id]) ? `<img alt="${escapar(foto.label)}" src="${imagem(dados.fotos[foto.id])}">` : 'Foto não anexada'}</div>`).join('')}
    </body></html>`;
}
