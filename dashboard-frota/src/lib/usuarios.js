import { supabase } from './supabase';

export async function excluirUsuario(id) {
  if (!supabase) throw new Error('Configure o Supabase para gerenciar usuários.');
  const { data, error } = await supabase.functions.invoke('gerenciar-usuarios', { body: { acao: 'excluir', id } });
  if (error) {
    let mensagem;
    try { mensagem = (await error.context?.json())?.error; } catch { /* Falha sem JSON. */ }
    throw new Error(mensagem || 'A exclusão está indisponível. Publique a função gerenciar-usuarios no Supabase e tente novamente.');
  }
  if (!data?.excluido || data.id !== id) throw new Error('O servidor não confirmou a exclusão do usuário.');
}

export async function listarUsuarios() {
  if (!supabase) throw new Error('Configure o Supabase para consultar usuários.');
  // Paginação evita omitir contas ao atingir o limite padrão da Data API.
  const usuarios = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.from('usuarios')
      .select('id,nome,email,perfil,ativo,criado_em').order('nome').order('id').range(inicio, inicio + 499);
    if (error) throw error;
    usuarios.push(...data);
    if (data.length < 500) return usuarios;
  }
}

export async function salvarUsuario(dados) {
  if (!supabase) throw new Error('Configure o Supabase para gerenciar usuários.');
  if (dados.acao === 'editar') {
    const nome = typeof dados.nome === 'string' ? dados.nome.trim() : '';
    if (!nome || nome.length > 150 ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(dados.id || '') ||
      !['motorista', 'administrador'].includes(dados.perfil) || typeof dados.ativo !== 'boolean') {
      throw new Error('Informe nome, permissão e situação válidos.');
    }
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw new Error('Entre novamente para continuar.');
    const { data: admin, error: adminError } = await supabase.from('usuarios')
      .select('perfil,ativo').eq('id', auth.user.id).single();
    if (adminError || !admin?.ativo || admin.perfil !== 'administrador') {
      throw new Error('Apenas administradores ativos podem gerenciar usuários.');
    }
    if (dados.id === auth.user.id && (!dados.ativo || dados.perfil !== 'administrador')) {
      throw new Error('Você não pode desativar sua própria conta nem retirar sua permissão de administrador.');
    }
    // A sessão do administrador e as policies RLS autorizam a gravação no banco.
    const { data, error } = await supabase.from('usuarios')
      .update({ nome, perfil: dados.perfil, ativo: dados.ativo }).eq('id', dados.id)
      .select('id,nome,email,perfil,ativo,criado_em').single();
    if (error) throw new Error('Não foi possível atualizar. Confira sua conexão, sua permissão de administrador e se o usuário ainda existe.');
    if (!data) throw new Error('O banco não confirmou a atualização do usuário.');
    return data;
  }
  const { data, error } = await supabase.functions.invoke('gerenciar-usuarios', { body: dados });
  if (error) {
    let mensagem;
    try { mensagem = (await error.context?.json())?.error; } catch { /* Resposta de rede sem JSON. */ }
    throw new Error(mensagem || 'Não foi possível acessar a função gerenciar-usuarios. Confira a conexão e a publicação da função no Supabase.');
  }
  if (!data?.usuario) throw new Error('O servidor não confirmou a gravação do usuário.');
  return data.usuario;
}
