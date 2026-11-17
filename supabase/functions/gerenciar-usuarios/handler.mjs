const campos = 'id,nome,email,perfil,ativo,criado_em';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function criarHandler({ createClient, url, anonKey, serviceKey }) {
  return async request => {
    const responder = (status, body) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, 'Content-Type': 'application/json' },
    });
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return responder(405, { error: 'Método não permitido.' });
    if (!url || !anonKey || !serviceKey) return responder(503, { error: 'Configuração do servidor incompleta.' });
    const authorization = request.headers.get('Authorization') || '';
    if (!/^Bearer \S+$/i.test(authorization)) return responder(401, { error: 'Entre novamente para continuar.' });
    try {
      const cliente = createClient(url, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: auth, error: authError } = await cliente.auth.getUser(authorization.slice(7));
      if (authError || !auth.user) return responder(401, { error: 'Sessão inválida. Entre novamente.' });
      const { data: administrador, error: perfilError } = await cliente.from('usuarios')
        .select('perfil,ativo').eq('id', auth.user.id).single();
      if (perfilError || !administrador?.ativo || administrador.perfil !== 'administrador') {
        return responder(403, { error: 'Apenas administradores ativos podem gerenciar usuários.' });
      }
      let dados;
      try { dados = await request.json(); } catch { return responder(400, { error: 'Dados inválidos.' }); }
      if (!dados || typeof dados !== 'object') return responder(400, { error: 'Dados inválidos.' });
      const { acao, id, perfil, ativo } = dados;
      if (acao === 'excluir') {
        if (typeof id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
          return responder(400, { error: 'Usuário inválido.' });
        }
        if (id === auth.user.id) return responder(400, { error: 'Você não pode excluir sua própria conta.' });
        const servidor = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { error } = await servidor.auth.admin.deleteUser(id);
        if (error) return responder(409, { error: 'Não foi possível excluir a conta. Confira os vínculos e arquivos desse usuário no Supabase.' });
        return responder(200, { excluido: true, id });
      }
      const nome = typeof dados.nome === 'string' ? dados.nome.trim() : '';
      if (!['criar', 'editar'].includes(acao) || !nome || nome.length > 150 ||
        !['motorista', 'administrador'].includes(perfil) || typeof ativo !== 'boolean') {
        return responder(400, { error: 'Informe nome (até 150 caracteres), permissão e situação válidos.' });
      }
      if (acao === 'editar') {
        if (typeof id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
          return responder(400, { error: 'Usuário inválido.' });
        }
        if (id === auth.user.id && (!ativo || perfil !== 'administrador')) {
          return responder(400, { error: 'Você não pode desativar sua própria conta nem retirar sua permissão de administrador.' });
        }
        // Usa a sessão do solicitante: RLS revalida a permissão na gravação.
        const { data, error } = await cliente.from('usuarios').update({ nome, perfil, ativo })
          .eq('id', id).select(campos).single();
        if (error) return responder(409, { error: 'Não foi possível atualizar. Confira seu acesso e se o usuário ainda existe.' });
        return responder(200, { usuario: data });
      }
      const email = typeof dados.email === 'string' ? dados.email.trim().toLowerCase() : '';
      const senha = dados.senha;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        typeof senha !== 'string' || senha.length < 8 || senha.length > 128) {
        return responder(400, { error: 'Informe um e-mail válido e uma senha entre 8 e 128 caracteres.' });
      }
      const servidor = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: novo, error: criarError } = await servidor.auth.admin.createUser({
        email, password: senha, email_confirm: true, user_metadata: { nome },
      });
      if (criarError || !novo.user) {
        return responder(409, { error: 'Não foi possível criar a conta. Verifique se o e-mail já existe ou se a senha atende às regras do projeto.' });
      }
      // O trigger existente cria o perfil; não criamos outra tabela ou inserção paralela.
      const { data, error } = await cliente.from('usuarios').update({ nome, perfil, ativo })
        .eq('id', novo.user.id).select(campos).single();
      if (error) {
        const { error: rollbackError } = await servidor.auth.admin.deleteUser(novo.user.id);
        return responder(409, { error: rollbackError
          ? 'A conta foi criada, mas o perfil não foi configurado. Confira este e-mail no Supabase antes de tentar novamente.'
          : 'Cadastro desfeito: não foi possível configurar o perfil. Verifique o trigger frota_novo_usuario e as permissões da tabela usuarios.' });
      }
      return responder(201, { usuario: data });
    } catch {
      return responder(500, { error: 'Falha ao gerenciar usuário. Tente novamente.' });
    }
  };
}
