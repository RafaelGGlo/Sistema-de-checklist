import { htmlChecklist } from './relatorio.mjs';

export async function gerarPdf(dados) { return htmlChecklist(dados); }
export async function compartilharPdf(html) {
  const frame = document.createElement('iframe');
  frame.title = 'PDF do checklist';
  Object.assign(frame.style, { position: 'fixed', width: '1px', height: '1px', border: '0', bottom: '0', right: '0' });
  await new Promise((resolve, reject) => {
    frame.onload = async () => {
      try {
        await Promise.all(Array.from(frame.contentDocument.images, img => img.decode().catch(() => {})));
        frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
        frame.contentWindow.focus();
        frame.contentWindow.print();
        resolve();
      } catch (error) { frame.remove(); reject(error); }
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
