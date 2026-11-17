import { useEffect, useRef, useState } from 'react';
import { carregarDashboard } from '../lib/dashboard';
import './dashboard.css';

const moeda = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = value => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const data = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Horário não informado';
const dia = value => `${value.slice(8, 10)}/${value.slice(5, 7)}`;
const statusNomes = { Liberado: 'No pátio', 'Em Trânsito': 'Em trânsito', Avaria: 'Com avaria', Manutenção: 'Em manutenção' };
const statusCores = { Liberado: '#7acb9c', 'Em Trânsito': '#61bde5', Avaria: '#ef9a88', Manutenção: '#e5c273' };

function Icone({ tipo }) {
  const formas = { frota: <><path d="M3 6h12v11H3zM15 10h4l3 4v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>, viagem: <><circle cx="5" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><path d="M5 7v9a3 3 0 0 0 3 3h9M7 5h9a3 3 0 0 1 3 3v4M16 9l3 3 3-3" /></>, custo: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 10h18M16 15h2M7 5V3h10" /></>, alerta: <><path d="M12 3 2 21h20L12 3zM12 9v5" /><circle cx="12" cy="17" r=".6" /></> };
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{formas[tipo]}</svg>;
}

function GraficoDespesas({ serie }) {
  const maior = Math.max(...serie.map(item => item.combustivel + item.pedagio), 0);
  if (!maior) return <div className="dash-vazio dash-vazio-grafico"><Icone tipo="custo" /><strong>Nenhuma despesa neste período</strong><p>Os abastecimentos e pedágios registrados aparecerão aqui.</p></div>;
  return <>
    <div className="dash-grafico" role="img" aria-label={`Despesas ${serie[0].inicio !== serie[0].fim ? 'por semana' : 'por dia'}. Os valores exatos estão na tabela abaixo.`}>
      <div className="dash-escala"><span>{moeda(maior)}</span><span>{moeda(maior / 2)}</span><span>R$ 0</span></div>
      <div className="dash-colunas">{serie.map((item, indice) => <div className="dash-coluna" key={item.inicio}>
        <div className="dash-barra-area" title={`${dia(item.inicio)}${item.inicio !== item.fim ? ` a ${dia(item.fim)}` : ''}: ${moeda(item.combustivel + item.pedagio)}`}>
          <div className="dash-barra-pedagio" style={{ height: `${item.pedagio / maior * 100}%` }} />
          <div className="dash-barra-combustivel" style={{ height: `${item.combustivel / maior * 100}%` }} />
        </div>
        <span>{indice === 0 || indice === serie.length - 1 || indice % Math.ceil(serie.length / 5) === 0 ? dia(item.inicio) : ''}</span>
      </div>)}</div>
    </div>
    <details className="dash-detalhes"><summary>Ver valores do gráfico</summary><div className="dash-tabela-scroll"><table><caption>Despesas registradas por dia ou semana</caption><thead><tr><th>Período</th><th>Combustível</th><th>Pedágio</th><th>Total</th></tr></thead><tbody>{serie.map(item => <tr key={item.inicio}><td>{dia(item.inicio)}{item.inicio !== item.fim ? ` a ${dia(item.fim)}` : ''}</td><td>{moeda(item.combustivel)}</td><td>{moeda(item.pedagio)}</td><td>{moeda(item.combustivel + item.pedagio)}</td></tr>)}</tbody></table></div></details>
  </>;
}

export default function Dashboard({ navegar, novaViagem, novoAbastecimento, novoPedagio, novoVeiculo, refreshKey }) {
  const [dias, setDias] = useState(30);
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const atualizarRef = useRef(() => {});
  useEffect(() => {
    let ativo = true;
    let controller;
    let ocupado = false;
    setResumo(null); setErro('');
    const atualizar = async () => {
      if (ocupado) return;
      ocupado = true;
      controller = new AbortController();
      setCarregando(true);
      try {
        const resultado = await carregarDashboard(dias, controller.signal);
        if (ativo) { setResumo(resultado); setErro(''); }
      } catch (error) { if (ativo) setErro(error.message || 'Não foi possível atualizar o Dashboard.'); }
      finally { ocupado = false; if (ativo) setCarregando(false); }
    };
    atualizarRef.current = atualizar;
    void atualizar();
    const aoFocar = () => { if (document.visibilityState === 'visible') void atualizar(); };
    const timer = setInterval(aoFocar, 60000);
    window.addEventListener('focus', aoFocar);
    document.addEventListener('visibilitychange', aoFocar);
    return () => { ativo = false; controller?.abort(); clearInterval(timer); window.removeEventListener('focus', aoFocar); document.removeEventListener('visibilitychange', aoFocar); };
  }, [dias, refreshKey]);

  return <section className="dashboard" aria-label="Dashboard da frota" aria-busy={carregando}>
    <div className="dash-controles">
      <div><span className="dash-eyebrow">VISÃO GERAL</span><h2>Um olhar sobre a operação</h2><p>Situação atual da frota e resultados do período.</p></div>
      <div className="dash-filtros"><div className="dash-periodos" role="group" aria-label="Período dos indicadores">{[7, 30, 90, 180].map(n => <button key={n} aria-pressed={dias === n} onClick={() => setDias(n)}>{n} dias</button>)}</div><button className="dash-atualizar" disabled={carregando} onClick={() => atualizarRef.current()}>{carregando ? 'Atualizando…' : '↻ Atualizar'}</button></div>
    </div>
    {erro && <div className="dash-erro" role="alert"><strong>Não foi possível atualizar os indicadores.</strong><p>{erro}</p>{resumo && <p>Os valores abaixo são da última atualização concluída.</p>}<button onClick={() => atualizarRef.current()} disabled={carregando}>Tentar novamente</button></div>}
    {!resumo ? <div className="dash-vazio dash-inicial" role="status">{carregando ? 'Carregando os dados da frota…' : 'Os indicadores ficam disponíveis após carregar os dados. Tente novamente.'}</div> : <>
      <div className="dash-contexto"><span>{dia(resumo.periodo.inicio)} a {dia(resumo.periodo.hoje)} · horário de Brasília</span><span>Atualizado em {data(resumo.atualizadoEm)}</span></div>
      <div className="dash-kpis">
        <button className="dash-kpi" onClick={() => navegar('patio')}><span className="dash-kpi-topo">Veículos ativos<Icone tipo="frota" /></span><strong>{numero(resumo.total)}</strong><span><b className="dash-verde">{resumo.disponiveis} disponíveis</b> · {resumo.emTransito} em trânsito</span></button>
        <button className="dash-kpi" onClick={() => navegar('diario')}><span className="dash-kpi-topo">Saídas no período<Icone tipo="viagem" /></span><strong>{numero(resumo.viagens)}</strong><span>{numero(resumo.km)} KM em {resumo.retornos} retornos do período</span></button>
        <button className="dash-kpi" onClick={() => navegar('despesas')}><span className="dash-kpi-topo">Despesas no período<Icone tipo="custo" /></span><strong>{moeda(resumo.despesa)}</strong><span>Combustível + pedágios registrados</span></button>
        <button className={`dash-kpi ${resumo.retidos ? 'dash-kpi-atencao' : ''}`} onClick={() => navegar('patio')}><span className="dash-kpi-topo">Veículos retidos<Icone tipo="alerta" /></span><strong>{numero(resumo.retidos)}</strong><span>Com avaria ou em manutenção agora</span></button>
      </div>
      <div className="dash-grid">
        <article className="dash-painel"><div className="dash-painel-topo"><div><h3>Despesas da operação</h3><p>{dias === 90 ? 'Agrupadas em semanas dentro do período' : 'Distribuição diária no período'}</p></div><button onClick={() => navegar('despesas')}>Ver despesas ↗</button></div>
          <div className="dash-resumo-custos"><div><span><i className="dash-ponto combustivel" />Combustível</span><strong>{moeda(resumo.combustivel)}</strong><small>{numero(resumo.litros)} litros registrados</small></div><div><span><i className="dash-ponto pedagio" />Pedágios</span><strong>{moeda(resumo.pedagio)}</strong><small>Valores lançados no período</small></div></div>
          <GraficoDespesas serie={resumo.serie} />
        </article>
        <article className="dash-painel"><div className="dash-painel-topo"><div><h3>Situação da frota</h3><p>Disponibilidade neste momento</p></div><span className="dash-tag">AGORA</span></div>
          <div className="dash-disponibilidade"><strong>{resumo.total ? Math.round(resumo.disponiveis / resumo.total * 100) : '—'}{resumo.total ? '%' : ''}</strong><span>da frota disponível no pátio</span></div>
          <div className="dash-faixa" role="img" aria-label={resumo.totais.map(item => `${statusNomes[item.status]}: ${item.total}`).join(', ')}>{resumo.totais.map(item => item.total > 0 && <span key={item.status} style={{ flex: item.total, background: statusCores[item.status] }} />)}</div>
          <ul className="dash-status">{resumo.totais.map(item => <li key={item.status}><span><i className="dash-ponto" style={{ background: statusCores[item.status] }} />{statusNomes[item.status]}</span><strong>{item.total}</strong></li>)}</ul>
          {!resumo.total && <button className="dash-link" onClick={novoVeiculo}>+ Cadastrar primeiro veículo</button>}
        </article>
        <article className="dash-painel"><div className="dash-painel-topo"><div><h3>Precisam de atenção</h3><p>Avarias, revisão programada e KM ausente</p></div><span className="dash-contador">{resumo.alertas.length}</span></div>
          {resumo.alertas.length ? <ul className="dash-alertas">{resumo.alertas.slice(0, 5).map(item => <li key={`${item.veiculo.id}-${item.tipo}`}><span className="dash-alerta-sinal">!</span><div><strong>{item.veiculo.nome} <small>{item.veiculo.placa}</small></strong><b>{item.titulo}</b><p>{item.detalhe}</p></div><button aria-label={`Ver ${item.veiculo.nome} no pátio`} onClick={() => navegar('patio')}>↗</button></li>)}</ul> : <div className="dash-vazio"><span className="dash-check">✓</span><strong>Nenhum alerta identificado</strong><p>Continue acompanhando os checklists e a disponibilidade.</p></div>}
          {resumo.alertas.length > 5 && <button className="dash-link" onClick={() => navegar('patio')}>Ver todos no pátio ({resumo.alertas.length} alertas)</button>}
          <p className="dash-nota">Revisões consideram o KM da próxima revisão informado no cadastro/checklist.</p>
        </article>
        <article className="dash-painel"><div className="dash-painel-topo"><div><h3>Inspeções e custos</h3><p>Controle do período selecionado</p></div></div><button className="dash-inspecoes" onClick={() => navegar('checklists')}><div><span>Checklists enviados</span><strong>{resumo.checklists}</strong></div><div><span>Com avaria na inspeção</span><strong className={resumo.checklistsAvaria ? 'dash-ambar' : ''}>{resumo.checklistsAvaria}</strong></div><span>↗</span></button>
          <h4 className="dash-subtitulo">Maiores despesas por veículo</h4>
          {resumo.custos.length ? <ol className="dash-ranking">{resumo.custos.slice(0, 4).map(item => <li key={item.id}><div><strong>{item.nome || 'Veículo'}</strong><small>{item.placa || 'Placa não informada'}</small></div><strong>{moeda(item.valor)}</strong></li>)}</ol> : <p className="dash-sem-dados">Registre uma despesa para acompanhar os custos por veículo.</p>}
        </article>
      </div>
      <article className="dash-painel dash-rotas"><div className="dash-painel-topo"><div><h3>Veículos em trânsito</h3><p>Saídas que aguardam retorno ao pátio</p></div><button onClick={() => navegar('diario')}>Abrir diário de bordo ↗</button></div>
        {resumo.emRota.length ? <div className="dash-tabela-scroll"><table><thead><tr><th>Veículo</th><th>Motorista</th><th>Destino</th><th>Saída</th><th>Situação</th></tr></thead><tbody>{resumo.emRota.map(v => <tr key={v.id}><td><strong>{v.nome}</strong><small>{v.placa}</small></td><td>{v.motorista_atual || 'Não informado'}</td><td>{v.destino_atual || 'Em rota'}</td><td>{data(v.hora_saida_atual)}</td><td><span className="dash-rota-tag">Em trânsito</span></td></tr>)}</tbody></table></div> : <div className="dash-vazio-linha">Nenhum veículo em trânsito no momento. <button onClick={novaViagem}>Registrar uma saída →</button></div>}
      </article>
      <div className="dash-atalhos"><div><strong>Próxima ação</strong><span>Registre a operação sem sair do painel.</span></div><button onClick={novaViagem}>+ Nova viagem</button><button onClick={novoAbastecimento}>+ Combustível</button><button onClick={novoPedagio}>+ Pedágio</button></div>
    </>}
  </section>;
}
