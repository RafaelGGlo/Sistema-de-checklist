// Interface real exportada pelo Expo; Supabase inteiramente simulado e câmera sintética.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const root = resolve(process.env.CHECKLIST_WEB_ROOT || 'artifacts/checklist-web');
const servidor = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://local').pathname.replace(/\/$/, '/index.html'));
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' }[extname(path)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime }); res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => servidor.listen(8084, '127.0.0.1', r));
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.compartilhamentos = [];
    window.permiteCompartilhar = true;
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }) => window.permiteCompartilhar && files.every(file => file.type === 'application/pdf') });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => {
      const ativo = navigator.userActivation.isActive;
      const arquivo = files[0];
      window.compartilhamentos.push({ nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size, ativo, cabecalho: (await arquivo.text()).slice(0, 5) });
      if (window.compartilhamentos.length === 1) throw new DOMException('Cancelado pelo usuário', 'AbortError');
    } });
  });
  const erros = []; page.on('pageerror', e => { erros.push(e.message); console.error(e.message); });
  const usuario = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'motorista@teste.local', app_metadata: {}, user_metadata: {} };
  const perfil = { ...usuario, nome: 'Motorista Teste', perfil: 'motorista', ativo: true };
  const token = [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ sub: usuario.id, exp: Math.floor(Date.now()/1000) + 3600 })).toString('base64url'), 'teste'].join('.');
  let envios = 0;
  await page.routeWebSocket(/supabase/, ws => ws.close());
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname === '127.0.0.1' || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const json = (body, status = 200) => route.fulfill({ json: body, headers, status });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/auth/v1/token')) return json({ user: usuario, access_token: token, refresh_token: 'teste', token_type: 'bearer', expires_in: 3600 });
    if (url.pathname.endsWith('/auth/v1/user')) return json(usuario);
    if (url.pathname.endsWith('/rest/v1/usuarios')) return json(perfil);
    if (url.pathname.endsWith('/rest/v1/veiculos')) return json([{ id: 'v1', nome: 'Van Teste', placa: 'ABC1234', ultimo_km: 1000, proxima_revisao_km: 10000, ativo: true, status: 'Liberado' }]);
    if (url.pathname.includes('/rpc/')) { envios++; return json({}); }
    if (url.pathname.includes('/rest/v1/')) return json([]);
    throw new Error(`Requisição externa inesperada: ${url.pathname}`);
  });
  await page.goto('http://127.0.0.1:8084');
  await page.getByPlaceholder('E-mail cadastrado no Supabase').fill('motorista@teste.local');
  await page.getByPlaceholder('Senha', { exact: true }).fill('SenhaTeste123');
  await page.getByText('Entrar no Sistema', { exact: true }).click();
  const abrirChecklist = async () => {
    await page.getByText('Fazer Checklist', { exact: true }).click();
    await page.getByText('Van Teste', { exact: true }).click();
    await page.getByRole('button', { name: 'Marcar todos como OK: Níveis & Fluidos', exact: true }).waitFor();
    await page.getByText('Selecione o veículo para realizar a inspeção:', { exact: true }).waitFor({ state: 'hidden' });
  };
  await abrirChecklist();
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
  await page.getByRole('button', { name: 'Marcar todos como OK: Níveis & Fluidos', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
  await page.getByRole('button', { name: 'Marcar todos como OK: Níveis & Fluidos', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '3');
  await page.getByRole('radio', { name: 'Óleo do Motor: RUIM', exact: true }).click();
  assert.equal(await page.getByRole('radio', { name: 'Óleo do Motor: RUIM', exact: true }).getAttribute('aria-checked'), 'true');
  await page.getByRole('button', { name: 'Iluminação & Faróis', exact: true }).click();
  await page.getByRole('radio', { name: 'Seta Esquerda (E): QUEIMADO', exact: true }).click();
  await page.getByRole('radio', { name: 'Lâmpada da Seta Esquerda (E): TRASEIRA', exact: true }).click();
  await page.getByLabel('KM atual', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Assinar e enviar checklist', exact: true }).click();
  await page.getByText('Informe o KM atual antes de assinar!', { exact: true }).waitFor();
  await page.getByLabel('KM atual', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Assinar e enviar checklist', exact: true }).click();
  await page.getByText('Atenção ao KM', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByLabel('KM atual', { exact: true }).fill('1234');
  await page.getByRole('button', { name: 'Iluminação & Faróis', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar captura das 6 fotos', exact: true }).click();
  for (let i = 1; i <= 6; i++) {
    await page.getByText(i <= 2 ? `Foto ${i}/6` : `Foto ${i - 2}/4`, { exact: true }).waitFor();
    assert.equal(await page.locator('video').count(), 1);
    // Uma marca no nó de vídeo prova que a câmera não foi desmontada entre fotos.
    if (i === 1 || i === 3) await page.locator('video').evaluate(video => { video.dataset.teste = 'camera-persistente'; });
    assert.equal(await page.locator('video').getAttribute('data-teste'), 'camera-persistente');
    await page.getByRole('button', { name: 'Tirar foto', exact: true }).click();
    await page.getByRole('button', { name: 'Usar foto', exact: true }).waitFor();
    if (i === 3) await page.screenshot({ path: 'artifacts/checklist-camera.png' });
    if (i === 1) {
      await page.getByRole('button', { name: 'Refazer foto', exact: true }).click();
      await page.getByRole('button', { name: 'Tirar foto', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Usar foto', exact: true }).click();
    if (i === 2) {
      await page.getByRole('button', { name: 'Sair da câmera', exact: true }).click();
      await page.getByRole('button', { name: 'Painel: ver ou refazer foto', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Continuar captura (4 restantes)', exact: true }).click();
    }
  }
  await page.getByRole('button', { name: 'Refazer sequência das 6 fotos', exact: true }).waitFor();
  // Importação múltipla tem revisão explícita dos destinos antes de gravar.
  const imagemGaleria = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#307050'; ctx.fillRect(0, 0, 320, 240);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const arquivos = [1, 2].map(n => ({ name: `veiculo-${n}.png`, mimeType: 'image/png', buffer: Buffer.from(imagemGaleria, 'base64') }));
  const importarGaleria = async () => {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Selecionar da galeria', exact: true }).click();
    await (await chooser).setFiles(arquivos);
    await page.getByText('Confira as fotos da galeria', { exact: true }).waitFor();
  };
  await importarGaleria();
  await page.screenshot({ path: 'artifacts/checklist-galeria.png' });
  await page.getByRole('button', { name: 'Cancelar importação', exact: true }).click();
  await importarGaleria();
  await page.getByRole('button', { name: 'Confirmar fotos', exact: true }).click();
  await page.getByText('Confira as fotos da galeria', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(envios, 0, 'Captura e rascunho não enviam fotos ao servidor');
  await page.getByRole('button', { name: 'Painel: ver ou refazer foto', exact: true }).click();
  await page.getByRole('button', { name: 'Refazer com a câmera', exact: true }).click();
  await page.getByText('Foto 1/1', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Sair da câmera', exact: true }).click();
  await page.getByRole('button', { name: 'Painel: ver ou refazer foto', exact: true }).waitFor();
  await page.getByRole('button', { name: '← Voltar', exact: true }).click();
  await abrirChecklist();
  assert.equal(await page.getByLabel('KM atual', { exact: true }).inputValue(), '1234');
  assert.equal(await page.getByRole('radio', { name: 'Óleo do Motor: RUIM', exact: true }).getAttribute('aria-checked'), 'true');
  await page.getByRole('button', { name: 'Refazer sequência das 6 fotos', exact: true }).waitFor();
  await page.reload(); await abrirChecklist();
  assert.equal(await page.getByLabel('KM atual', { exact: true }).inputValue(), '1234');
  await page.getByRole('button', { name: 'Refazer sequência das 6 fotos', exact: true }).waitFor();
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/checklist-390.png' });
  await page.setViewportSize({ width: 480, height: 900 });
  await page.screenshot({ path: 'artifacts/checklist-480.png' });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({ path: 'artifacts/checklist-320.png' });
  await page.getByRole('button', { name: 'Assinar e enviar checklist', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar e enviar', exact: true }).click();
  await page.getByText('Registre sua assinatura antes de enviar.', { exact: true }).last().waitFor();
  assert.equal(envios, 0);
  const quadro = await page.locator('canvas').boundingBox();
  await page.mouse.move(quadro.x + 20, quadro.y + 30); await page.mouse.down();
  await page.mouse.move(quadro.x + 150, quadro.y + 90, { steps: 15 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Confirmar e enviar', exact: true }).click();
  const compartilhar = page.getByRole('button', { name: 'Compartilhar PDF', exact: true });
  await compartilhar.waitFor();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('[role="button"]')).find(e => e.textContent === 'Preparando PDF...'));
  assert.equal(await page.getByRole('dialog').count(), 0, 'Compartilhamento ocorre fora do modal de assinatura');
  await compartilhar.click(); // Cancelar o seletor não é erro e permite compartilhar de novo.
  await page.waitForFunction(() => window.compartilhamentos.length === 1);
  await compartilhar.click();
  await page.waitForFunction(() => window.compartilhamentos.length === 2);
  const compartilhados = await page.evaluate(() => window.compartilhamentos);
  assert.equal(compartilhados.length, 2);
  for (const arquivo of compartilhados) {
    assert.equal(arquivo.tipo, 'application/pdf');
    assert.equal(arquivo.cabecalho, '%PDF-');
    assert.ok(arquivo.tamanho > 1000);
    assert.ok(arquivo.ativo, 'Compartilhamento web mantém o gesto do usuário');
    assert.match(arquivo.nome, /^Checklist-ABC1234-\d{14}\.pdf$/);
  }
  await page.evaluate(() => { window.permiteCompartilhar = false; });
  const downloadPromise = page.waitForEvent('download');
  await compartilhar.click();
  const download = await downloadPromise;
  const baixado = await readFile(await download.path());
  assert.equal(baixado.subarray(0, 5).toString(), '%PDF-');
  assert.equal(envios, 1, 'Compartilhar, cancelar e baixar não reenviam o checklist');
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.deepEqual(erros, []);
  console.log('PASS: checklist, câmera, galeria, rascunho, assinatura, PDF binário, compartilhamento com gesto do usuário, cancelamento, download e ausência de envio duplicado.');
} finally { await browser.close(); await new Promise(r => servidor.close(r)); }
