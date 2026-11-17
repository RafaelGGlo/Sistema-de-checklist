// Teste de navegador com rede Supabase inteiramente simulada. Nunca cria contas reais.
// Requer Vite em http://127.0.0.1:3211 e PLAYWRIGHT_MODULE apontando para o pacote.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const erros = [];
  page.on('pageerror', error => erros.push(error.message));
  const adminId = '11111111-1111-4111-8111-111111111111';
  const driverId = '22222222-2222-4222-8222-222222222222';
  let usuarios = [
    { id: adminId, nome: 'Administrador Teste', email: 'admin@teste.local', perfil: 'administrador', ativo: true },
    { id: driverId, nome: 'Motorista Teste', email: 'motorista@teste.local', perfil: 'motorista', ativo: true },
  ];
  let falharLista = false;
  let falharCadastro = false;
  let falharExclusao = false;
  const gravacoes = [];
  const user = { id: adminId, aud: 'authenticated', role: 'authenticated', email: 'admin@teste.local', app_metadata: {}, user_metadata: {} };
  const token = [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ sub: adminId, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'teste'].join('.');
  await page.routeWebSocket(/supabase/, ws => ws.close());
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const responder = (body, status = 200) => route.fulfill({ status, headers, json: body });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/auth/v1/token')) return responder({ access_token: token, refresh_token: 'teste', token_type: 'bearer', expires_in: 3600, user });
    if (url.pathname.endsWith('/auth/v1/user')) return responder(user);
    if (url.pathname.endsWith('/rest/v1/usuarios')) {
      if (request.method() === 'PATCH') {
        const dados = request.postDataJSON();
        const id = url.searchParams.get('id').replace(/^eq\./, '');
        gravacoes.push(dados);
        const item = { ...usuarios.find(u => u.id === id), ...dados };
        usuarios = usuarios.map(u => u.id === id ? item : u);
        return responder(item);
      }
      if (url.searchParams.has('id')) return responder(usuarios[0]);
      if (falharLista) return responder({ message: 'Falha de leitura simulada' }, 503);
      return responder(usuarios);
    }
    if (url.pathname.endsWith('/functions/v1/gerenciar-usuarios')) {
      const dados = request.postDataJSON();
      gravacoes.push(dados);
      if (dados.acao === 'excluir') {
        if (falharExclusao) return responder({ error: 'Exclusão indisponível (simulação).' }, 503);
        usuarios = usuarios.filter(u => u.id !== dados.id);
        return responder({ excluido: true, id: dados.id });
      }
      if (falharCadastro) return responder({ error: 'E-mail já cadastrado (simulação).' }, 409);
      const item = dados.acao === 'criar'
        ? { id: '33333333-3333-4333-8333-333333333333', ...dados }
        : { ...usuarios.find(u => u.id === dados.id), ...dados };
      usuarios = [...usuarios.filter(u => u.id !== item.id), item];
      return responder({ usuario: item });
    }
    if (url.pathname.includes('/rest/v1/')) return responder([]);
    throw new Error(`Requisição externa inesperada: ${url.pathname}`);
  });
  await page.goto('http://127.0.0.1:3211');
  await page.getByLabel('E-mail', { exact: true }).fill('admin@teste.local');
  await page.getByLabel('Senha', { exact: true }).fill('SenhaTeste123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: '👥 Usuários', exact: true }).click();
  await page.getByRole('button', { name: 'Editar Motorista Teste', exact: true }).waitFor();
  await page.getByLabel('Buscar por nome ou e-mail').fill('motorista@');
  assert.equal(await page.getByRole('button', { name: 'Editar Administrador Teste', exact: true }).count(), 0);
  await page.getByLabel('Buscar por nome ou e-mail').fill('');
  await page.getByRole('button', { name: '+ Novo usuário', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome completo').fill('Novo Motorista');
  await dialog.getByLabel('E-mail', { exact: true }).fill('novo@teste.local');
  await dialog.getByLabel('Senha inicial').fill('SenhaTeste123');
  falharCadastro = true;
  await dialog.getByRole('button', { name: 'Salvar usuário' }).click();
  await dialog.getByText('E-mail já cadastrado (simulação).', { exact: true }).waitFor();
  falharCadastro = false;
  await dialog.getByRole('button', { name: 'Salvar usuário' }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Editar Novo Motorista', exact: true }).waitFor();
  assert.equal(gravacoes.at(-1).perfil, 'motorista');
  await page.getByRole('button', { name: 'Editar Motorista Teste', exact: true }).click();
  assert.equal(await dialog.getByLabel('E-mail', { exact: true }).getAttribute('readonly'), '');
  await dialog.getByLabel('Permissão', { exact: true }).selectOption('administrador');
  await dialog.getByLabel('Situação', { exact: true }).selectOption('false');
  await dialog.getByRole('button', { name: 'Salvar usuário' }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal(gravacoes.at(-1).perfil, 'administrador');
  assert.equal(gravacoes.at(-1).ativo, false);
  assert.equal('senha' in gravacoes.at(-1), false);
  await page.getByRole('button', { name: 'Editar Administrador Teste', exact: true }).click();
  assert.equal(await dialog.getByLabel('Permissão', { exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByLabel('Situação', { exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/usuarios-painel.png', fullPage: true });
  await page.getByRole('button', { name: '+ Novo usuário', exact: true }).click();
  await page.screenshot({ path: 'artifacts/usuarios-cadastro.png', fullPage: true });
  await page.keyboard.press('Escape');
  falharLista = true;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Falha de leitura simulada' }).waitFor();
  falharLista = false;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByRole('button', { name: 'Editar Novo Motorista', exact: true }).waitFor();
  assert.deepEqual(erros, []);
  assert.equal(await page.getByRole('button', { name: 'Excluir Administrador Teste', exact: true }).isDisabled(), true);
  const antes = gravacoes.length;
  await page.getByRole('button', { name: 'Excluir Novo Motorista', exact: true }).click();
  const confirmacao = page.getByRole('dialog', { name: 'Excluir usuário?' });
  await confirmacao.getByText('novo@teste.local', { exact: true }).waitFor();
  const confirmar = confirmacao.getByRole('button', { name: 'Confirmar exclusão', exact: true });
  const nomeConfirmacao = confirmacao.getByLabel('Digite o nome completo para confirmar');
  assert.equal(await confirmar.isDisabled(), true);
  await nomeConfirmacao.fill('Nome incorreto');
  assert.equal(await confirmar.isDisabled(), true);
  assert.equal(gravacoes.length, antes);
  await confirmacao.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(gravacoes.length, antes);
  await page.getByRole('button', { name: 'Excluir Novo Motorista', exact: true }).click();
  assert.equal(await nomeConfirmacao.inputValue(), '');
  assert.equal(await confirmar.isDisabled(), true);
  await nomeConfirmacao.fill('Novo Motorista');
  assert.equal(await confirmar.isEnabled(), true);
  falharExclusao = true;
  await confirmacao.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await confirmacao.getByRole('alert').getByText('Exclusão indisponível (simulação).', { exact: true }).waitFor();
  falharExclusao = false;
  await page.screenshot({ path: 'artifacts/usuarios-confirmar-exclusao.png', fullPage: true });
  await confirmacao.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await confirmacao.waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'Editar Novo Motorista', exact: true }).count(), 0);
  assert.deepEqual(erros, []);
  console.log('PASS: login simulado, listagem, busca, criação, erro de cadastro, edição, proteção da própria conta, modal e recuperação de falha.');
} finally { await browser.close(); }
