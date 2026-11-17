import assert from 'node:assert/strict';
import { test } from 'node:test';
import { criarHandler } from './handler.mjs';

const adminId = '11111111-1111-4111-8111-111111111111';
const outroId = '22222222-2222-4222-8222-222222222222';
const cadastro = { acao: 'criar', nome: ' Motorista Teste ', email: ' TESTE@EXEMPLO.COM ', senha: 'Teste#1234', perfil: 'motorista', ativo: true };

function ambiente(opcoes = {}) {
  const chamadas = [];
  const cliente = {
    auth: { getUser: async token => {
      chamadas.push(['token', token]);
      return { data: { user: opcoes.semSessao ? null : { id: adminId } }, error: null };
    } },
    from: tabela => {
      chamadas.push(['tabela', tabela]);
      let gravando = false;
      const query = {
        select: () => query,
        eq: () => query,
        update: dados => { gravando = true; chamadas.push(['update', dados]); return query; },
        single: async () => gravando
          ? { data: opcoes.falhaPerfil ? null : { id: outroId }, error: opcoes.falhaPerfil ? new Error('RLS') : null }
          : { data: { perfil: opcoes.perfil || 'administrador', ativo: opcoes.ativo ?? true }, error: null },
      };
      return query;
    },
  };
  const servidor = { auth: { admin: {
    createUser: async dados => { chamadas.push(['createUser', dados]); return { data: { user: opcoes.duplicado ? null : { id: outroId } }, error: opcoes.duplicado ? new Error('Duplicate') : null }; },
    deleteUser: async id => { chamadas.push(['deleteUser', id]); return { error: opcoes.falhaRollback || opcoes.falhaExclusao ? new Error('Falha') : null }; },
  } } };
  const handler = criarHandler({ url: 'https://teste.local', anonKey: 'publica', serviceKey: 'servidor',
    createClient: (_url, key) => key === 'servidor' ? servidor : cliente });
  return { chamadas, executar: async (body = cadastro, headers = { Authorization: 'Bearer sessao-real' }, method = 'POST') => {
    const response = await handler(new Request('https://teste.local', { method, headers, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }));
    return { status: response.status, body: method === 'OPTIONS' ? null : await response.json() };
  } };
}

test('exclusão autenticada remove a conta pelo Auth Admin', async () => {
  const a = ambiente();
  const resultado = await a.executar({ acao: 'excluir', id: outroId });
  assert.equal(resultado.status, 200);
  assert.deepEqual(resultado.body, { excluido: true, id: outroId });
  assert.deepEqual(a.chamadas.find(c => c[0] === 'deleteUser'), ['deleteUser', outroId]);
  assert.equal(a.chamadas.some(c => c[0] === 'update'), false);
});
test('exclusão rejeita própria conta, ID inválido e solicitantes sem permissão', async () => {
  for (const [opcoes, id, status] of [
    [{}, adminId, 400], [{}, 'invalido', 400],
    [{ perfil: 'motorista' }, outroId, 403], [{ ativo: false }, outroId, 403],
    [{ semSessao: true }, outroId, 401],
  ]) {
    const a = ambiente(opcoes);
    assert.equal((await a.executar({ acao: 'excluir', id })).status, status);
    assert.equal(a.chamadas.some(c => c[0] === 'deleteUser'), false);
  }
});
test('exclusão não informa sucesso quando o Auth rejeita a remoção', async () => {
  assert.equal((await ambiente({ falhaExclusao: true }).executar({ acao: 'excluir', id: outroId })).status, 409);
});

test('visitante não acessa nem cria cliente administrativo', async () => {
  const a = ambiente();
  assert.equal((await a.executar(cadastro, {})).status, 401);
  assert.deepEqual(a.chamadas, []);
});
test('sessão inválida é rejeitada', async () => {
  const a = ambiente({ semSessao: true });
  assert.equal((await a.executar()).status, 401);
  assert.equal(a.chamadas.some(c => c[0] === 'createUser'), false);
});
for (const opcoes of [{ perfil: 'motorista' }, { ativo: false }]) {
  test(`perfil sem autorização é rejeitado: ${JSON.stringify(opcoes)}`, async () => {
    const a = ambiente(opcoes);
    assert.equal((await a.executar()).status, 403);
    assert.equal(a.chamadas.some(c => c[0] === 'createUser'), false);
  });
}
test('cria conta sem colocar permissão na metadata e normaliza os campos', async () => {
  const a = ambiente();
  assert.equal((await a.executar()).status, 201);
  assert.deepEqual(a.chamadas.find(c => c[0] === 'createUser')[1], {
    email: 'teste@exemplo.com', password: 'Teste#1234', email_confirm: true, user_metadata: { nome: 'Motorista Teste' },
  });
  assert.deepEqual(a.chamadas.find(c => c[0] === 'update')[1], { nome: 'Motorista Teste', perfil: 'motorista', ativo: true });
});
test('valida campos antes de criar conta', async () => {
  for (const campos of [{ nome: ' ' }, { perfil: 'superadmin' }, { ativo: 'true' }, { email: 'invalido' }, { senha: '123' }]) {
    const a = ambiente();
    assert.equal((await a.executar({ ...cadastro, ...campos })).status, 400);
    assert.equal(a.chamadas.some(c => c[0] === 'createUser'), false);
  }
});
test('JSON inválido é rejeitado', async () => {
  assert.equal((await ambiente().executar('{')).status, 400);
});
test('conta duplicada não altera perfil existente', async () => {
  const a = ambiente({ duplicado: true });
  assert.equal((await a.executar()).status, 409);
  assert.equal(a.chamadas.some(c => c[0] === 'update'), false);
});
test('falha no perfil desfaz criação do Auth', async () => {
  const a = ambiente({ falhaPerfil: true });
  assert.equal((await a.executar()).status, 409);
  assert.deepEqual(a.chamadas.find(c => c[0] === 'deleteUser'), ['deleteUser', outroId]);
});
test('falha de compensação pede conferência da conta no Supabase', async () => {
  const r = await ambiente({ falhaPerfil: true, falhaRollback: true }).executar();
  assert.match(r.body.error, /antes de tentar novamente/);
});
test('edição altera somente nome, perfil e situação', async () => {
  const a = ambiente();
  assert.equal((await a.executar({ ...cadastro, acao: 'editar', id: outroId, perfil: 'administrador', ativo: false })).status, 200);
  assert.equal(a.chamadas.some(c => c[0] === 'createUser'), false);
  assert.deepEqual(a.chamadas.find(c => c[0] === 'update')[1], { nome: 'Motorista Teste', perfil: 'administrador', ativo: false });
});
test('administrador não pode retirar o próprio acesso pela função', async () => {
  for (const campos of [{ ativo: false }, { perfil: 'motorista' }]) {
    const a = ambiente();
    assert.equal((await a.executar({ ...cadastro, acao: 'editar', id: adminId, perfil: 'administrador', ...campos })).status, 400);
    assert.equal(a.chamadas.some(c => c[0] === 'update'), false);
  }
});
test('preflight CORS e método não suportado', async () => {
  assert.equal((await ambiente().executar(null, {}, 'OPTIONS')).status, 200);
  assert.equal((await ambiente().executar(null, {}, 'GET')).status, 405);
});
