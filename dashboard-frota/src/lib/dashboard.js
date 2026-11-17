import { supabase } from './supabase';
import { janelaPeriodo, resumirDashboard } from './dashboardModelo.mjs';

// Páginas estáveis evitam que o limite padrão da API corte os indicadores.
async function todasLinhas(tabela, campos, configurar, signal) {
  const rows = [];
  let total;
  do {
    let query = supabase.from(tabela).select(campos, total == null ? { count: 'exact' } : {}).order('id').range(rows.length, rows.length + 199);
    query = configurar(query).abortSignal(signal);
    const result = await query;
    if (result.error) throw new Error(`Não foi possível carregar ${tabela}: ${result.error.message}`);
    if (total == null) total = result.count;
    if (!result.data?.length) break;
    rows.push(...result.data);
    if (total == null && result.data.length < 200) break;
  } while (total == null || rows.length < total);
  return [...new Map(rows.map(row => [row.id, row])).values()];
}

export async function carregarDashboard(dias, signal) {
  if (!supabase) throw new Error('Configure o Supabase para carregar o Dashboard.');
  const periodo = janelaPeriodo(dias);
  const noPeriodo = campo => q => q.gte(campo, periodo.inicioISO).lt(campo, periodo.fimISO);
  const [veiculos, viagens, retornos, checklists, abastecimentos, pedagios] = await Promise.all([
    todasLinhas('veiculos', 'id,nome,placa,status,ultimo_km,proxima_revisao_km,ultima_avaria,motorista_atual,destino_atual,hora_saida_atual', q => q.eq('ativo', true), signal),
    todasLinhas('viagens', 'id,nome_veiculo,placa,motorista,destino,saida_em,retorno_em,status', noPeriodo('saida_em'), signal),
    todasLinhas('viagens', 'id,km_percorrido', q => noPeriodo('retorno_em')(q).eq('status', 'Finalizada'), signal),
    todasLinhas('checklists', 'id,status', noPeriodo('realizado_em'), signal),
    todasLinhas('abastecimentos', 'id,veiculo_id,nome_veiculo,placa,valor_total,litros,registrado_em', noPeriodo('registrado_em'), signal),
    todasLinhas('pedagios', 'id,veiculo_id,nome_veiculo,placa,valor,registrado_em', noPeriodo('registrado_em'), signal),
  ]);
  return { ...resumirDashboard({ veiculos, viagens, retornos, checklists, abastecimentos, pedagios }, periodo), periodo, atualizadoEm: new Date() };
}
