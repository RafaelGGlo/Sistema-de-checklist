import React, { useEffect, useState } from 'react';
import './paginas.css';

const paginas = {
  patio: { icon: '🏢', nome: 'Pátio e Em Trânsito', descricao: 'Veja onde cada veículo está e organize a disponibilidade da frota.', singular: 'veículo', campos: ['Veículo', 'Placa', 'Motorista', 'Status'], opcoes: ['No pátio', 'Em trânsito', 'Manutenção'] },
  viagens: { icon: '🛣️', nome: 'Diário de Bordo (Viagens)', descricao: 'Registre saídas, acompanhe destinos e finalize os retornos.', singular: 'viagem', campos: ['Veículo', 'Motorista', 'Destino', 'KM inicial', 'KM final', 'Status'], opcoes: ['Em andamento', 'Concluída'] },
  auditorias: { icon: '📋', nome: 'Listas de verificação para auditorias', descricao: 'Acompanhe as inspeções e identifique o que precisa de atenção.', singular: 'inspeção', campos: ['Veículo', 'Responsável', 'Data', 'Pneus', 'Freios', 'Luzes', 'Observações', 'Status'], opcoes: ['Pendente', 'Aprovada', 'Com avaria'] },
  despesas: { icon: '⛽', nome: 'Combustível e Pedágios', descricao: 'Organize abastecimentos e pedágios e acompanhe os custos da operação.', singular: 'despesa', campos: ['Veículo', 'Data', 'Tipo', 'Valor', 'Litros', 'Local'], opcoes: [] },
};
const hoje = new Date().toLocaleDateString('en-CA');
const iniciais = {
  patio: [{ id: 'v1', Veículo: 'Caminhão 01', Placa: 'ABC-1D23', Motorista: 'Carlos Silva', Status: 'No pátio' }, { id: 'v2', Veículo: 'Van 02', Placa: 'DEF-4G56', Motorista: 'Ana Souza', Status: 'Em trânsito' }],
  viagens: [{ id: 't1', Veículo: 'Van 02', Motorista: 'Ana Souza', Destino: 'Centro de distribuição', 'KM inicial': '42500', 'KM final': '', Status: 'Em andamento' }],
  auditorias: [{ id: 'a1', Veículo: 'Caminhão 01', Responsável: 'Carlos Silva', Data: hoje, Pneus: 'OK', Freios: 'OK', Luzes: 'Verificar', Observações: 'Verificar farol direito.', Status: 'Com avaria' }],
  despesas: [{ id: 'd1', Veículo: 'Caminhão 01', Data: hoje, Tipo: 'Combustível', Valor: '350', Litros: '55', Local: 'Posto Central' }, { id: 'd2', Veículo: 'Van 02', Data: hoje, Tipo: 'Pedágio', Valor: '18.5', Litros: '', Local: 'Praça 01' }],
};
const rota = () => window.location.pathname.split('/')[2] in paginas ? window.location.pathname.split('/')[2] : 'patio';
const dinheiro = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PaginasFrota() {
  const [pagina, setPagina] = useState(rota);
  const [dados, setDados] = useState(() => {
    try { const valor = JSON.parse(localStorage.getItem('frota-modelo-v1')); return valor && Object.keys(paginas).every(chave => Array.isArray(valor[chave])) ? valor : iniciais; } catch { return iniciais; }
  });
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('Todos');
  const [form, setForm] = useState(null);
  const [aviso, setAviso] = useState('');
  useEffect(() => { const voltar = () => { setPagina(rota()); setBusca(''); setFiltro('Todos'); setForm(null); }; window.addEventListener('popstate', voltar); return () => window.removeEventListener('popstate', voltar); }, []);
  useEffect(() => { try { localStorage.setItem('frota-modelo-v1', JSON.stringify(dados)); } catch { setAviso('O navegador não permitiu salvar. As alterações duram apenas nesta sessão.'); } }, [dados]);
  const config = paginas[pagina];
  const registros = dados[pagina];
  const linhas = registros.filter(item => Object.values(item).some(valor => String(valor).toLocaleLowerCase().includes(busca.toLocaleLowerCase())) && (filtro === 'Todos' || (item.Status || item.Tipo) === filtro));
  const navegar = chave => { window.history.pushState({}, '', `/modelo/${chave}`); setPagina(chave); setBusca(''); setFiltro('Todos'); setForm(null); setAviso(''); };
  const atualizar = (id, mudancas) => setDados(anterior => ({ ...anterior, [pagina]: anterior[pagina].map(item => item.id === id ? { ...item, ...mudancas } : item) }));
  const salvar = event => {
    event.preventDefault();
    if (pagina === 'viagens' && form['KM final'] && Number(form['KM final']) < Number(form['KM inicial'])) { setAviso('O KM final deve ser maior ou igual ao KM inicial.'); return; }
    setDados(anterior => ({ ...anterior, [pagina]: form.id ? anterior[pagina].map(item => item.id === form.id ? form : item) : [...anterior[pagina], { ...form, id: crypto.randomUUID() }] })); setForm(null); setAviso('Registro salvo neste navegador.');
  };
  const novo = () => { setAviso(''); setForm(Object.fromEntries(config.campos.map(campo => [campo, campo === 'Data' ? hoje : campo === 'Status' ? config.opcoes[0] : campo === 'Tipo' ? 'Combustível' : ['Pneus', 'Freios', 'Luzes'].includes(campo) ? 'OK' : '']))); };
  const exportar = () => {
    const csv = '\uFEFF' + [config.campos, ...linhas.map(item => config.campos.map(campo => item[campo] || ''))].map(linha => linha.map(valor => `"${String(valor).replaceAll('"', '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `${pagina}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const indicadores = pagina === 'patio' ? [['Veículos na frota', registros.length], ['No pátio', registros.filter(x => x.Status === 'No pátio').length], ['Em trânsito', registros.filter(x => x.Status === 'Em trânsito').length], ['Em manutenção', registros.filter(x => x.Status === 'Manutenção').length]]
    : pagina === 'viagens' ? [['Viagens registradas', registros.length], ['Em andamento', registros.filter(x => x.Status === 'Em andamento').length], ['Concluídas', registros.filter(x => x.Status === 'Concluída').length], ['KM percorridos', registros.reduce((s, x) => s + (x['KM final'] ? Math.max(0, Number(x['KM final']) - Number(x['KM inicial'])) : 0), 0).toLocaleString('pt-BR')]]
    : pagina === 'auditorias' ? [['Inspeções', registros.length], ['Aprovadas', registros.filter(x => x.Status === 'Aprovada').length], ['Com avaria', registros.filter(x => x.Status === 'Com avaria').length], ['Pendentes', registros.filter(x => x.Status === 'Pendente').length]]
    : [['Despesa total', dinheiro(registros.reduce((s, x) => s + Number(x.Valor || 0), 0))], ['Combustível', dinheiro(registros.filter(x => x.Tipo === 'Combustível').reduce((s, x) => s + Number(x.Valor || 0), 0))], ['Pedágios', dinheiro(registros.filter(x => x.Tipo === 'Pedágio').reduce((s, x) => s + Number(x.Valor || 0), 0))], ['Litros abastecidos', registros.filter(x => x.Tipo === 'Combustível').reduce((s, x) => s + Number(x.Litros || 0), 0).toLocaleString('pt-BR') + ' L']];
  return <div className="modelo">
    <aside className="modelo-sidebar"><div className="modelo-brand"><h2>🚛 Frota Junco</h2><span>OPERACIONAL</span></div><nav aria-label="Páginas da frota">{Object.entries(paginas).map(([chave, item]) => <a href={`/modelo/${chave}`} key={chave} aria-current={pagina === chave ? 'page' : undefined} onClick={event => { event.preventDefault(); navegar(chave); }}>{item.icon} {item.nome}</a>)}</nav><a className="modelo-original" href="/">← Voltar ao sistema original</a></aside>
    <main className="modelo-main"><div className="modelo-demo">MODELO INTERATIVO <span>Dados fictícios · alterações salvas somente neste navegador</span></div><header><div><p className="modelo-eyebrow">CONTROLE DA FROTA / {pagina.toUpperCase()}</p><h1>{config.nome}</h1><p>{config.descricao}</p></div><button className="modelo-primary" onClick={novo}>+ Adicionar {config.singular}</button></header>
      <section className="modelo-kpis" aria-label="Resumo">{indicadores.map(([titulo, valor]) => <article key={titulo}><span>{titulo}</span><strong>{valor}</strong></article>)}</section>
      {aviso && <p role="status" className="modelo-aviso">{aviso}</p>}
      <section className="modelo-panel"><div className="modelo-toolbar"><input aria-label="Buscar registros" placeholder="Buscar veículo, motorista ou informação..." value={busca} onChange={event => setBusca(event.target.value)} /><select aria-label="Filtrar registros" value={filtro} onChange={event => setFiltro(event.target.value)}>{['Todos', ...(pagina === 'despesas' ? ['Combustível', 'Pedágio'] : config.opcoes)].map(opcao => <option key={opcao}>{opcao}</option>)}</select><button onClick={exportar}>Exportar CSV</button></div><div className="modelo-table-scroll"><table><thead><tr>{config.campos.map(campo => <th key={campo}>{campo}</th>)}<th>Ações</th></tr></thead><tbody>{linhas.map(item => <tr key={item.id}>{config.campos.map(campo => <td key={campo}>{campo === 'Status' || campo === 'Tipo' ? <span className={`modelo-badge ${['Com avaria', 'Manutenção', 'Pendente'].includes(item[campo]) ? 'attention' : ''}`}>{item[campo]}</span> : campo === 'Valor' ? dinheiro(item[campo]) : item[campo] || '—'}</td>)}<td><div className="modelo-row-actions"><button onClick={() => { setAviso(''); setForm({ ...item }); }}>Editar</button>{pagina === 'patio' && <button onClick={() => atualizar(item.id, { Status: item.Status === 'No pátio' ? 'Em trânsito' : 'No pátio' })}>{item.Status === 'No pátio' ? 'Registrar saída' : 'Voltar ao pátio'}</button>}{pagina === 'viagens' && item.Status === 'Em andamento' && <button onClick={() => { setAviso('Preencha o KM final para concluir a viagem.'); setForm({ ...item, Status: 'Concluída' }); }}>Registrar retorno</button>}<button className="modelo-danger" onClick={() => { if (window.confirm('Excluir este registro do modelo?')) setDados(anterior => ({ ...anterior, [pagina]: anterior[pagina].filter(x => x.id !== item.id) })); }}>Excluir</button></div></td></tr>)}{!linhas.length && <tr><td colSpan={config.campos.length + 1} className="modelo-empty">Nenhum registro encontrado. Adicione um registro ou ajuste a busca.</td></tr>}</tbody></table></div><footer>{linhas.length} registro(s) encontrado(s)</footer></section>
    </main>
    {form && <div className="modelo-overlay" onClick={event => { if (event.target === event.currentTarget) setForm(null); }}><section className="modelo-dialog" role="dialog" aria-modal="true" aria-labelledby="modelo-form-title"><h2 id="modelo-form-title">{form.id ? 'Editar' : 'Adicionar'} {config.singular}</h2><p>Preencha os dados do registro.</p><form onSubmit={salvar}>{config.campos.map(campo => { const opcoes = campo === 'Status' ? config.opcoes : campo === 'Tipo' ? ['Combustível', 'Pedágio'] : ['Pneus', 'Freios', 'Luzes'].includes(campo) ? ['OK', 'Verificar', 'Não se aplica'] : null; return <label key={campo}>{campo}{opcoes ? <select value={form[campo]} onChange={event => setForm({ ...form, [campo]: event.target.value })}>{opcoes.map(opcao => <option key={opcao}>{opcao}</option>)}</select> : <input autoFocus={campo === config.campos[0]} type={campo === 'Data' ? 'date' : ['Valor', 'Litros', 'KM inicial', 'KM final'].includes(campo) ? 'number' : 'text'} min="0" step={['Valor', 'Litros'].includes(campo) ? '0.01' : '1'} required={!['Observações', 'Litros', 'KM final'].includes(campo) || (campo === 'KM final' && form.Status === 'Concluída')} value={form[campo]} onChange={event => setForm({ ...form, [campo]: event.target.value })} />}</label>; })}{aviso && <p role="status">{aviso}</p>}<div className="modelo-form-actions"><button type="button" onClick={() => setForm(null)}>Cancelar</button><button className="modelo-primary" type="submit">Salvar {config.singular}</button></div></form></section></div>}
  </div>;
}
