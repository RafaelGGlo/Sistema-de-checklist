import { supabase } from './supabase';
import { consultarDados } from './consultaDados.mjs';

function cliente() {
  if (!supabase) throw new Error('Configure a URL e a chave publicável do Supabase no arquivo .env.local.');
  return supabase;
}

export function verificar(result) {
  if (result.error) throw result.error;
  return result.data;
}

const dataBR = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
const campos = {
  veiculo_id: 'veiculoId', nome_veiculo: 'nomeVeiculo', motorista_id: 'motoristaId',
  intervalo_revisao: 'intervaloRevisao', proxima_revisao_km: 'proximaRevisaoKm',
  motorista_atual: 'motoristaAtual', destino_atual: 'destinoAtual',
  ultimo_motorista: 'ultimoMotorista', ultima_avaria: 'ultimaAvaria',
  km_inicial: 'kmInicial', km_final: 'kmFinal', km_percorrido: 'kmPercorrido',
  obs_geral: 'obsGeral', valor_total: 'valorTotal',
};
export function adaptar(row) {
  const item = { ...row };
  for (const [origem, destino] of Object.entries(campos)) item[destino] = row[origem];
  item.ultimoKm = row.ultimo_km == null ? '-' : String(row.ultimo_km);
  item.proximaRevisaoKm = row.proxima_revisao_km == null ? '-' : String(row.proxima_revisao_km);
  item.horaSaidaAtual = dataBR(row.hora_saida_atual);
  item.ultimaAtualizacao = dataBR(row.ultima_atualizacao);
  item.dataHoraSaida = dataBR(row.saida_em);
  item.dataHoraRetorno = row.retorno_em ? dataBR(row.retorno_em) : null;
  item.dataHoraSaidaTimestamp = row.saida_em;
  item.dataHoraFormatada = dataBR(row.realizado_em);
  item.dataHoraCriacao = row.realizado_em;
  item.dataRegistro = dataBR(row.registrado_em);
  item.dataRegistroTimestamp = row.registrado_em;
  return item;
}

export async function perfilAtual() {
  const user = verificar(await cliente().auth.getUser()).user;
  if (!user) throw new Error('Entre novamente para continuar.');
  const perfil = verificar(await cliente().from('usuarios').select('*').eq('id', user.id).single());
  if (!perfil.ativo) throw new Error('Sua conta está inativa. Peça ao administrador para ativá-la.');
  return perfil;
}
export async function entrar(email, password, somenteAdmin = false) {
  verificar(await cliente().auth.signInWithPassword({ email, password }));
  try {
    const perfil = await perfilAtual();
    if (somenteAdmin && perfil.perfil !== 'administrador') throw new Error('Esta conta não tem acesso ao painel de administração.');
    return perfil;
  } catch (error) {
    await cliente().auth.signOut();
    throw error;
  }
}
export async function sair() { verificar(await cliente().auth.signOut()); }
export function observarSessao(callback, erro = () => {}) {
  if (!supabase) { erro(new Error('Configure o Supabase no arquivo .env.local.')); callback(null); return () => {}; }
  let ativo = true;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (ativo) callback(session?.user ?? null);
  });
  return () => { ativo = false; subscription.unsubscribe(); };
}

// Realtime acelera a atualização; polling também cobre reconexões e perda de eventos.
export function observarDados(tabela, callback, erro, opcoes = {}) {
  let ativo = true, carregando = false, repetir = false;
  const carregar = async () => {
    if (!ativo || document.visibilityState === 'hidden') return;
    if (carregando) { repetir = true; return; }
    carregando = true;
    try {
      const rows = await consultarDados(cliente(), tabela, opcoes);
      if (ativo) callback(rows.map(adaptar));
    } catch (error) { if (ativo) erro?.(error); }
    finally {
      carregando = false;
      if (ativo && repetir) { repetir = false; void carregar(); }
    }
  };
  void carregar();
  const timer = setInterval(carregar, 60000);
  document.addEventListener('visibilitychange', carregar);
  const canal = cliente().channel(`frota-${tabela}-${Math.random()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tabela }, carregar).subscribe();
  return () => {
    ativo = false;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', carregar);
    void cliente().removeChannel(canal);
  };
}

export async function cadastrarVeiculo(dados) {
  return verificar(await cliente().from('veiculos').insert(dados).select().single());
}
export async function registrarRevisao(veiculo, proximaRevisao) {
  const km = Number(proximaRevisao);
  if (!/^\d+$/.test(String(proximaRevisao)) || !Number.isSafeInteger(km) || km <= Number(veiculo.ultimo_km)) {
    throw new Error('A próxima revisão deve ser um KM inteiro maior que o KM atual.');
  }
  // Evita sobrescrever um retorno ou revisão registrados enquanto o formulário estava aberto.
  let query = cliente().from('veiculos').update({ proxima_revisao_km: km, ultima_atualizacao: new Date().toISOString() })
    .eq('id', veiculo.id).eq('ativo', true).eq('status', 'Liberado').eq('ultimo_km', veiculo.ultimo_km);
  query = veiculo.proxima_revisao_km == null ? query.is('proxima_revisao_km', null) : query.eq('proxima_revisao_km', veiculo.proxima_revisao_km);
  const rows = verificar(await query.select('id'));
  if (rows.length !== 1) throw new Error('O veículo foi atualizado ou não está no pátio. Feche o formulário e confira os dados antes de tentar novamente.');
}
export async function arquivarVeiculo(id) {
  return verificar(await cliente().rpc('frota_arquivar_veiculo', { p_veiculo_id: id }));
}
export async function liberarVeiculo(id) {
  return lancamentoPainel('liberar_veiculo', { p_veiculo_id: id });
}
export async function viagemAtivaDoVeiculo(id) {
  const rows = verificar(await cliente().from('viagens').select('*').eq('veiculo_id', id).eq('status', 'Em Andamento').limit(1));
  return rows[0] ? adaptar(rows[0]) : null;
}
export async function ultimoChecklist(id) {
  const rows = verificar(await cliente().from('checklists').select('*').eq('veiculo_id', id)
    .order('realizado_em', { ascending: false }).limit(1));
  return rows[0] ? adaptar(rows[0]) : null;
}
export async function iniciarViagem(id) {
  return adaptar(verificar(await cliente().rpc('frota_iniciar_viagem', { p_veiculo_id: id })));
}
export async function finalizarViagem(id, km) {
  return verificar(await cliente().rpc('frota_finalizar_viagem', { p_viagem_id: id, p_km_final: km }));
}
export function numeroPositivo(texto) {
  const valor = Number(String(texto).trim().replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0) throw new Error('Informe um valor maior que zero. Use vírgula ou ponto para os centavos.');
  return valor;
}
export async function registrarDespesa(viagemId, tipo, valor, litros = null) {
  return verificar(await cliente().rpc('frota_registrar_despesa', {
    p_viagem_id: viagemId, p_tipo: tipo, p_valor: numeroPositivo(valor),
    p_litros: litros == null ? null : numeroPositivo(litros),
  }));
}
export async function salvarChecklist(dados) {
  return verificar(await cliente().rpc('frota_salvar_checklist', { p_dados: dados }));
}

export async function lancamentoPainel(acao, dados) {
  const result = await cliente().rpc(`frota_painel_${acao}`, dados);
  if (result.error?.code === 'PGRST202') {
    throw new Error('Os lançamentos do painel precisam ser habilitados no banco. Execute database/007_lancamentos_painel.sql no SQL Editor do Supabase.');
  }
  return verificar(result);
}
