const fData = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
export function diaSP(value) {
  if (value == null || value === '') return null;
  const data = new Date(value);
  if (!Number.isFinite(data.getTime())) return null;
  const partes = Object.fromEntries(fData.formatToParts(data).map(p => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
}
const somarDias = (dia, quantidade) => new Date(Date.parse(`${dia}T12:00:00Z`) + quantidade * 86400000).toISOString().slice(0, 10);
export function janelaPeriodo(dias, agora = new Date()) {
  if (![7, 30, 90, 180].includes(dias)) throw new Error('Período inválido.');
  const hoje = diaSP(agora);
  const inicio = somarDias(hoje, 1 - dias);
  return { dias, hoje, inicio, inicioISO: `${inicio}T03:00:00.000Z`, fimISO: `${somarDias(hoje, 1)}T03:00:00.000Z` };
}
const numero = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const soma = (rows, campo) => rows.reduce((total, row) => total + numero(row[campo]), 0);
export function resumirDashboard(dados, periodo) {
  const { veiculos, viagens, retornos, checklists, abastecimentos, pedagios } = dados;
  const totais = ['Liberado', 'Em Trânsito', 'Avaria', 'Manutenção'].map(status => ({ status, total: veiculos.filter(v => v.status === status).length }));
  const combustivel = soma(abastecimentos, 'valor_total');
  const pedagio = soma(pedagios, 'valor');
  const alertas = veiculos.flatMap(v => {
    const lista = [];
    if (['Avaria', 'Manutenção'].includes(v.status)) lista.push({ tipo: 'retido', veiculo: v, titulo: v.status === 'Avaria' ? 'Veículo com avaria' : 'Veículo em manutenção', detalhe: v.ultima_avaria || 'Verifique a situação antes de liberar uma saída.' });
    if (v.ultimo_km == null) lista.push({ tipo: 'km', veiculo: v, titulo: 'Quilometragem não cadastrada', detalhe: 'Faça o checklist e informe o KM para iniciar uma viagem.' });
    if (v.ultimo_km != null && v.proxima_revisao_km != null) {
      const faltam = numero(v.proxima_revisao_km) - numero(v.ultimo_km);
      if (faltam <= 1000) lista.push({ tipo: 'revisao', veiculo: v, titulo: faltam <= 0 ? 'Revisão vencida ou no limite' : 'Revisão próxima', detalhe: faltam <= 0 ? `Revisão programada para ${numero(v.proxima_revisao_km).toLocaleString('pt-BR')} KM.` : `Faltam ${faltam.toLocaleString('pt-BR')} KM para a revisão.` });
    }
    return lista;
  });
  const passo = periodo.dias >= 90 ? 7 : 1;
  const serie = [];
  for (let i = 0; i < periodo.dias; i += passo) serie.push({ inicio: somarDias(periodo.inicio, i), fim: somarDias(periodo.inicio, Math.min(i + passo, periodo.dias) - 1), combustivel: 0, pedagio: 0 });
  for (const [rows, campo, destino] of [[abastecimentos, 'valor_total', 'combustivel'], [pedagios, 'valor', 'pedagio']]) {
    for (const row of rows) {
      const dia = diaSP(row.registrado_em);
      const faixa = serie.find(item => dia && dia >= item.inicio && dia <= item.fim);
      if (faixa) faixa[destino] += numero(row[campo]);
    }
  }
  const custos = new Map();
  for (const [rows, campo] of [[abastecimentos, 'valor_total'], [pedagios, 'valor']]) {
    for (const row of rows) {
      const key = row.veiculo_id;
      const item = custos.get(key) || { id: key, nome: row.nome_veiculo, placa: row.placa, valor: 0 };
      item.valor += numero(row[campo]); custos.set(key, item);
    }
  }
  return { totais, total: veiculos.length, disponiveis: totais[0].total, emTransito: totais[1].total,
    retidos: totais[2].total + totais[3].total, viagens: viagens.length, retornos: retornos.length,
    km: soma(retornos, 'km_percorrido'), combustivel, pedagio, despesa: combustivel + pedagio,
    litros: soma(abastecimentos, 'litros'), checklists: checklists.length,
    checklistsAvaria: checklists.filter(c => c.status === 'Avaria').length,
    alertas, serie, custos: [...custos.values()].sort((a, b) => b.valor - a.valor),
    emRota: veiculos.filter(v => v.status === 'Em Trânsito').sort((a, b) => String(b.hora_saida_atual || '').localeCompare(String(a.hora_saida_atual || ''))),
  };
}
