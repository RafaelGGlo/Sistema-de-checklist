// Rede simulada: não consulta nem altera dados reais.
// Requer Vite em 3211 e PLAYWRIGHT_MODULE, se Playwright não estiver instalado.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const erros = [];
  page.on('pageerror', error => erros.push(error.message));
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'admin@teste.local', app_metadata: {}, user_metadata: {} };
  const token = [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'teste'].join('.');
  const imagem = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const fotos = Object.fromEntries(['painel', 'cabine', 'ldEsq', 'ldDir', 'traseira', 'frente'].map(id => [id, imagem]));
  let resposta = fotos, falhar = false, consultas = 0;
  const checklist = { id: 'c1', nome_veiculo: 'Caminhão Teste', placa: 'ABC1D23', motorista: 'Motorista Teste', km: 85000, status: 'Liberado', realizado_em: new Date().toISOString(), itens: [], assinatura: imagem };
  await page.routeWebSocket(/supabase/, ws => ws.close());
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const responder = (json, status = 200) => route.fulfill({ status, headers, json });
    assert.equal(req.method() === 'GET' || req.method() === 'OPTIONS' || url.pathname.endsWith('/auth/v1/token'), true, 'Nenhuma gravação é esperada');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/auth/v1/token')) return responder({ access_token: token, refresh_token: 'teste', token_type: 'bearer', expires_in: 3600, user });
    if (url.pathname.endsWith('/auth/v1/user')) return responder(user);
    if (url.pathname.endsWith('/rest/v1/usuarios')) return responder({ id: user.id, perfil: 'administrador', ativo: true });
    if (url.pathname.endsWith('/rest/v1/checklists')) {
      if (url.searchParams.get('select') === 'fotos') {
        consultas++;
        assert.equal(url.searchParams.get('id'), 'eq.c1');
        if (falhar) return responder({ message: 'Falha simulada' }, 503);
        return responder({ fotos: resposta });
      }
      assert.ok(!url.searchParams.get('select').split(',').includes('fotos'), 'Listagem não baixa fotos');
      return responder([checklist]);
    }
    if (url.pathname.includes('/rest/v1/')) return responder([]);
    throw new Error(`Requisição inesperada: ${url.pathname}`);
  });
  await page.goto('http://127.0.0.1:3211');
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('SenhaTeste123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: /Registros/ }).click();
  await page.getByRole('button', { name: /Checklists/ }).click();
  await page.getByRole('button', { name: 'Ver Checklist', exact: true }).waitFor();
  assert.equal(consultas, 0);
  const abrir = () => page.getByRole('button', { name: 'Ver Checklist', exact: true }).click();
  const fechar = () => page.getByRole('button', { name: 'Fechar Janela', exact: true }).click();
  const galeria = page.getByRole('region', { name: 'Fotos do veículo' });
  await abrir();
  await galeria.getByRole('button', { name: 'Ampliar foto: Frente', exact: true }).waitFor();
  assert.equal(await galeria.getByRole('button', { name: /Ampliar foto:/ }).count(), 6);
  assert.equal(await galeria.locator('img').evaluateAll(imgs => imgs.every(img => img.complete && img.naturalWidth > 0)), true);
  await galeria.getByRole('button', { name: 'Ampliar foto: Painel', exact: true }).click();
  await galeria.locator('.foto-checklist-ampliada').waitFor();
  await galeria.getByRole('button', { name: 'Fechar foto ampliada' }).click();
  assert.equal(await galeria.locator('.foto-checklist-ampliada').count(), 0);
  await fechar();
  resposta = {};
  await abrir();
  await galeria.getByText('Nenhuma foto anexada a este checklist.').waitFor();
  assert.equal(await galeria.getByText('Foto não anexada', { exact: true }).count(), 6);
  await fechar();
  falhar = true;
  await abrir();
  await galeria.getByRole('alert').waitFor();
  falhar = false;
  resposta = { painel: imagem, cabine: 'data:image/png;base64,invalida' };
  await galeria.getByRole('button', { name: 'Tentar novamente' }).click();
  await galeria.getByText('Não foi possível exibir esta foto.').waitFor();
  assert.equal(await galeria.getByText('Foto não anexada', { exact: true }).count(), 4);
  await page.setViewportSize({ width: 390, height: 844 });
  const largura = await galeria.boundingBox();
  assert.ok(largura.width <= 390, 'Galeria cabe na tela móvel');
  await fechar();
  await galeria.waitFor({ state: 'detached' });
  assert.deepEqual(erros, []);
  console.log('PASS: fotos sob demanda, seis imagens, ampliação, ausência, falha/repetição, imagem inválida, tela móvel e fechamento.');
} finally { await browser.close(); }
