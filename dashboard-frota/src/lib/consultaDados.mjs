// Paginação estável: o período selecionado nunca fica limitado aos primeiros registros.
export async function consultarDados(cliente, tabela, { campos = '*', filtros = {}, ordenar, limite, periodo } = {}) {
  const linhas = [];
  for (;;) {
    const tamanho = Math.min(200, limite == null ? 200 : limite - linhas.length);
    if (tamanho <= 0) break;
    let query = cliente.from(tabela).select(campos);
    for (const [campo, valor] of Object.entries(filtros)) query = query.eq(campo, valor);
    if (periodo) query = query.gte(periodo.campo, periodo.inicioISO).lt(periodo.campo, periodo.fimISO);
    if (ordenar) query = query.order(ordenar, { ascending: false });
    if (ordenar !== 'id') query = query.order('id');
    const { data, error } = await query.range(linhas.length, linhas.length + tamanho - 1);
    if (error) throw error;
    linhas.push(...(data || []));
    if (!data || data.length < tamanho) break;
  }
  return linhas;
}
