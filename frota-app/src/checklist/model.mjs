// Perguntas, valores e chaves do checklist existente. Não altera o contrato da RPC.
const tres = ['BOM', 'REGULAR', 'RUIM'];
const item = (id, label, pergunta, opcoes = tres, detalhe) => ({ id, label, pergunta, opcoes, detalhe });
export const CATEGORIAS = [
  { id: 'fluidos', titulo: 'Níveis & Fluidos', itens: [
    item('oleoMotor', 'Óleo do Motor', 'Óleo do Motor'),
    item('nivelAgua', 'Nível de Água', 'Nível de Água / Radiador'),
    item('fluidoFreio', 'Fluido de Freio', 'Fluido de Freio'),
  ] },
  { id: 'pneus', titulo: 'Estado dos Pneus', itens: [
    item('pneuDE', 'Pneu Dianteiro Esquerdo (DE)', 'Pneu Dianteiro Esquerdo (DE)'),
    item('pneuDD', 'Pneu Dianteiro Direito (DD)', 'Pneu Dianteiro Direito (DD)'),
    item('pneuTE', 'Pneu Traseiro Esquerdo (TE)', 'Pneu Traseiro Esquerdo (TE)'),
    item('pneuTD', 'Pneu Traseiro Direito (TD)', 'Pneu Traseiro Direito (TD)'),
  ] },
  { id: 'iluminacao', titulo: 'Iluminação & Faróis', itens: [
    item('farolD', 'Farol Direito', 'Farol Direito (D)', ['OK', 'DEFEITO']),
    item('farolE', 'Farol Esquerdo', 'Farol Esquerdo (E)', ['OK', 'DEFEITO']),
    item('setaE', 'Seta Esquerda', 'Seta Esquerda (E)', ['OK', 'QUEIMADO'], 'setaEDetalhe'),
    item('setaD', 'Seta Direita', 'Seta Direita (D)', ['OK', 'QUEIMADO'], 'setaDDetalhe'),
    item('ilumTraseiraE', 'Iluminação Traseira Esquerda', 'Iluminação Traseira Esquerda (E)', ['OK', 'DEFEITO']),
    item('ilumTraseiraD', 'Iluminação Traseira Direita', 'Iluminação Traseira Direita (D)', ['OK', 'DEFEITO']),
  ] },
  { id: 'bau', titulo: 'Segurança do Baú', itens: [item('cadeadoBau', 'Cadeado no Baú', 'Tem Cadeado no Baú?', ['SIM', 'NAO'])] },
  { id: 'limpeza', titulo: 'Limpeza & Conservação', itens: [
    item('limpezaGeral', 'Limpeza Geral', 'Limpeza Geral'),
    item('limpezaCabine', 'Limpeza da Cabine', 'Limpeza da Cabine (Interior)'),
  ] },
];
export const ITENS = CATEGORIAS.flatMap(categoria => categoria.itens);
export const FOTOS = [
  { id: 'painel', label: 'Painel', orientacao: 'Enquadre o painel com o KM nítido e legível.' },
  { id: 'cabine', label: 'Cabine', orientacao: 'Enquadre bancos e painel, mostrando limpeza e conservação.' },
  { id: 'ldEsq', label: 'Lado Esquerdo', orientacao: 'Enquadre a lateral esquerda completa.' },
  { id: 'ldDir', label: 'Lado Direito', orientacao: 'Enquadre a lateral direita completa.' },
  { id: 'traseira', label: 'Traseira', orientacao: 'Mostre as lanternas e o baú.' },
  { id: 'frente', label: 'Frente', orientacao: 'Mostre os faróis e o para-choque.' },
];
export const fotosVazias = () => Object.fromEntries(FOTOS.map(foto => [foto.id, '']));
export function formularioInicial(veiculo) {
  return {
    km: veiculo.ultimoKm && veiculo.ultimoKm !== '-' ? String(veiculo.ultimoKm) : '',
    proximaRevisao: veiculo.proximaRevisaoKm && veiculo.proximaRevisaoKm !== '-' ? String(veiculo.proximaRevisaoKm) : '',
    valores: Object.fromEntries(ITENS.map(pergunta => [pergunta.id, pergunta.opcoes[0]])),
    revisados: {}, setaEDetalhe: 'FRENTE', setaDDetalhe: 'FRENTE', temObs: 'NAO', textoObs: '',
  };
}
export function marcarCategoria(form, categoria) {
  return { ...form,
    valores: { ...form.valores, ...Object.fromEntries(categoria.itens.map(i => [i.id, i.opcoes[0]])) },
    revisados: { ...form.revisados, ...Object.fromEntries(categoria.itens.map(i => [i.id, true])) },
  };
}
export function progresso(form) {
  const concluidos = ITENS.filter(i => form.revisados[i.id]).length;
  return { concluidos, total: ITENS.length, percentual: Math.round(concluidos / ITENS.length * 100) };
}
export function fotosPendentes(fotos) { return FOTOS.filter(foto => !fotos[foto.id]); }
export function restaurarFormulario(veiculo, salvo) {
  const inicial = formularioInicial(veiculo);
  if (!salvo || typeof salvo !== 'object') return inicial;
  for (const campo of ['km', 'proximaRevisao', 'textoObs']) if (typeof salvo[campo] === 'string') inicial[campo] = salvo[campo];
  for (const campo of ['setaEDetalhe', 'setaDDetalhe']) if (['FRENTE', 'TRASEIRA'].includes(salvo[campo])) inicial[campo] = salvo[campo];
  if (['SIM', 'NAO'].includes(salvo.temObs)) inicial.temObs = salvo.temObs;
  for (const i of ITENS) {
    if (i.opcoes.includes(salvo.valores?.[i.id])) {
      inicial.valores[i.id] = salvo.valores[i.id];
      inicial.revisados[i.id] = salvo.revisados?.[i.id] === true;
    }
  }
  return inicial;
}
export function montarChecklist(veiculo, motorista, form, fotos, assinatura, agora = new Date()) {
  const itens = ITENS.map(i => {
    const valor = form.valores[i.id];
    return {
      label: i.label,
      valor: i.detalhe && valor === 'QUEIMADO' ? `QUEIMADO (${form[i.detalhe]})` : valor,
      ok: i.opcoes === tres ? valor !== 'RUIM' : valor === i.opcoes[0],
    };
  });
  return {
    veiculoId: veiculo.id, placa: veiculo.placa, nomeVeiculo: veiculo.nome, motorista,
    km: form.km.trim(), proximaRevisaoKm: form.proximaRevisao.trim() || '-',
    status: itens.some(i => !i.ok) ? 'Avaria' : 'Liberado',
    dataHoraFormatada: agora.toLocaleString('pt-BR'), dataHoraCriacao: agora.toISOString(),
    itens, obsGeral: form.temObs === 'SIM' ? form.textoObs : 'Nenhuma observação',
    fotos: Object.fromEntries(FOTOS.map(f => [f.id, fotos[f.id] || ''])), assinatura,
  };
}
