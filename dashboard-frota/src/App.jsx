import React, { useState, useEffect, useMemo } from 'react';
import Usuarios from './pages/Usuarios.jsx';
import LancamentoOperacional from './pages/LancamentoOperacional.jsx';
import Dashboard from './pages/Dashboard.jsx';
import RegistrarRevisao from './pages/RegistrarRevisao.jsx';
import { prepararFotoVeiculo, mensagemErroCadastro } from './cadastroVeiculo.js';
import {
  observarSessao, entrar as entrarSupabase, sair, perfilAtual, observarDados,
  cadastrarVeiculo as inserirVeiculo, arquivarVeiculo, liberarVeiculo, ultimoChecklist as buscarUltimoChecklist,
  viagemAtivaDoVeiculo,
} from './lib/frota';

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [verificandoLogin, setVerificandoLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erroLogin, setErroLogin] = useState('');
  const [erroDados, setErroDados] = useState('');
  const [operacao, setOperacao] = useState(null);
  const [sucesso, setSucesso] = useState('');
  const [versaoDados, setVersaoDados] = useState(0);
  const [abaAtiva, setAbaAtiva] = useState('dashboard');

  // Dados do Supabase
  const [veiculos, setVeiculos] = useState([]);
  const [viagens, setViagens] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [abastecimentos, setAbastecimentos] = useState([]);
  const [pedagios, setPedagios] = useState([]);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('Todos');

  // Modais
  const [modalVeiculo, setModalVeiculo] = useState(false);
  const [veiculoDetalhe, setVeiculoDetalhe] = useState(null);
  const [ultimoChecklist, setUltimoChecklist] = useState(null);
  const [checklistSelecionado, setChecklistSelecionado] = useState(null);
  const [carregandoDetalhes, setCarregandoDetalhes] = useState(false);

  // Form Cadastro Veículo
  const [nomeVeiculo, setNomeVeiculo] = useState('');
  const [placaVeiculo, setPlacaVeiculo] = useState('');
  const [tipoVeiculo, setTipoVeiculo] = useState('Caminhão 3/4');
  const [anoVeiculo, setAnoVeiculo] = useState(new Date().getFullYear().toString());
  const [intervaloRevisao, setIntervaloRevisao] = useState('30000');
  const [fotoBase64, setFotoBase64] = useState('');
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [salvandoVeiculo, setSalvandoVeiculo] = useState(false);
  const [erroCadastro, setErroCadastro] = useState('');
  const [avisoCadastro, setAvisoCadastro] = useState('');

  useEffect(() => {
    if (!salvandoVeiculo) return;
    const timer = setTimeout(() => {
      setAvisoCadastro('Aguardando confirmação do banco. Verifique sua conexão e mantenha esta janela aberta.');
    }, 15000);
    return () => clearTimeout(timer);
  }, [salvandoVeiculo]);

  useEffect(() => {
    let ativo = true;
    let versao = 0;
    const cancelar = observarSessao((user) => {
      const atual = ++versao;
      setVeiculos([]); setViagens([]); setChecklists([]); setAbastecimentos([]); setPedagios([]);
      setVeiculoDetalhe(null); setChecklistSelecionado(null); setModalVeiculo(false);
      setOperacao(null); setSucesso('');
      if (!user) { setUsuario(null); setVerificandoLogin(false); return; }
      setTimeout(() => {
        perfilAtual().then(perfil => {
          if (perfil.perfil !== 'administrador') throw new Error('Esta conta não tem acesso ao painel de administração.');
          if (ativo && atual === versao) { setUsuario(user); setVerificandoLogin(false); }
        }).catch(error => {
          if (ativo && atual === versao) {
            setUsuario(null); setVerificandoLogin(false); setErroLogin(error.message);
          }
        });
      }, 0);
    }, error => setErroLogin(error.message));
    return () => { ativo = false; cancelar(); };
  }, []);

  const entrar = async (event) => {
    event.preventDefault();
    if (entrando) return;
    setEntrando(true);
    setErroLogin('');
    try {
      await entrarSupabase(email.trim(), senha, true);
      setSenha('');
    } catch (error) {
      setErroLogin(error.message || 'Não foi possível entrar. Confira seu e-mail e senha.');
    } finally {
      setEntrando(false);
    }
  };

  useEffect(() => {
    if (!usuario) return;
    setErroDados('');
    let ativo = true;
    const cancelar = [];
    const erro = error => { if (ativo) setErroDados(error.message || 'Falha ao carregar os dados.'); };
    perfilAtual().then(perfil => {
      if (!ativo) return;
      if (perfil.perfil !== 'administrador') throw new Error('Esta conta não tem acesso ao painel de administração.');
      cancelar.push(
        observarDados('veiculos', setVeiculos, erro, { filtros: { ativo: true } }),
        observarDados('viagens', setViagens, erro, { ordenar: 'saida_em', limite: 100 }),
        observarDados('checklists', setChecklists, erro, {
          ordenar: 'realizado_em', limite: 100,
          // As fotos em base64 ficam no banco; a auditoria usa os itens e a assinatura.
          campos: 'id,veiculo_id,motorista_id,motorista,nome_veiculo,placa,km,proxima_revisao_km,status,realizado_em,obs_geral,itens,assinatura',
        }),
        observarDados('abastecimentos', setAbastecimentos, erro, { ordenar: 'registrado_em', limite: 50 }),
        observarDados('pedagios', setPedagios, erro, { ordenar: 'registrado_em', limite: 50 }),
      );
    }).catch(erro);
    return () => { ativo = false; cancelar.forEach(fn => fn()); };
  }, [usuario, versaoDados]);

  const abrirOperacao = dados => { setSucesso(''); setOperacao(dados); };
  const operacaoSalva = mensagem => {
    setOperacao(null); setSucesso(mensagem); setErroDados('');
    setVersaoDados(versao => versao + 1);
  };
  const registrarRetorno = async veiculo => {
    try {
      const viagem = await viagemAtivaDoVeiculo(veiculo.id);
      if (!viagem) throw new Error('Este veículo não possui viagem em andamento. Confira o Diário de Bordo.');
      abrirOperacao({ tipo: 'retorno', viagem });
    } catch (error) { setErroDados(error.message); }
  };
  const abrirChecklist = () => {
    const url = new URL(import.meta.env.VITE_MOTORISTA_URL || `${window.location.protocol}//${window.location.hostname}:8081`);
    window.open(url.href, '_blank', 'noopener,noreferrer');
  };

  const handleUploadFoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const input = e.target;
    setErroCadastro('');
    setFotoBase64('');
    setProcessandoFoto(true);
    try {
      setFotoBase64(await prepararFotoVeiculo(file));
    } catch (error) {
      input.value = '';
      setErroCadastro(error.message);
    } finally {
      setProcessandoFoto(false);
    }
  };

  const cadastrarVeiculo = async (e) => {
    e.preventDefault();
    if (salvandoVeiculo || processandoFoto) return;
    setErroCadastro('');
    setAvisoCadastro('');
    if (!nomeVeiculo.trim() || !placaVeiculo.trim()) {
      setErroCadastro('Preencha o nome e a placa do veículo.');
      return;
    }
    if (!navigator.onLine) {
      setErroCadastro('Sem conexão com a internet. Reconecte e tente salvar novamente.');
      return;
    }

    setSalvandoVeiculo(true);
    try {
      await inserirVeiculo({
        nome: nomeVeiculo.trim(), placa: placaVeiculo.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        tipo: tipoVeiculo, ano: Number(anoVeiculo),
        intervalo_revisao: Number(intervaloRevisao) || 30000, foto: fotoBase64 || null,
      });

    setNomeVeiculo(''); setPlacaVeiculo(''); setIntervaloRevisao('30000'); setFotoBase64('');
    setBusca(''); setFiltroStatus('Todos');
    setModalVeiculo(false);
    } catch (error) {
      setErroCadastro(mensagemErroCadastro(error));
    } finally {
      setSalvandoVeiculo(false);
      setAvisoCadastro('');
    }
  };

  const removerVeiculo = async (id, nome) => {
    if (!window.confirm('Arquivar ' + nome + ' da frota? O histórico será preservado.')) return;
    try {
      await arquivarVeiculo(id);
      setVeiculos(anterior => anterior.filter(v => v.id !== id));
      if (veiculoDetalhe?.id === id) setVeiculoDetalhe(null);
    } catch (error) { setErroDados(error.message); }
  };

  const liberarVeiculoManualmente = async (veiculoId) => {
    try {
      await liberarVeiculo(veiculoId);
      setVeiculoDetalhe(null);
      setVersaoDados(versao => versao + 1);
      setSucesso('Veículo liberado para o pátio.');
    } catch (error) { setErroDados(error.message); }
  };

  const abrirDetalhes = async (v) => {
    setVeiculoDetalhe(v); setUltimoChecklist(null); setCarregandoDetalhes(true);
    try { setUltimoChecklist(await buscarUltimoChecklist(v.id)); }
    catch (error) { setErroDados(error.message); }
    finally { setCarregandoDetalhes(false); }
  };

  const calcularRevisaoCiclica = (kmAtualStr, intervaloConfig, revisaoProgramada) => {
    if (!kmAtualStr || kmAtualStr === '-') return { tipo: 'aguardando', texto: 'Aguardando 1º KM' };
    const km = Number(kmAtualStr);
    if (revisaoProgramada != null && revisaoProgramada !== '-' && revisaoProgramada !== '') {
      const alvo = Number(revisaoProgramada);
      const faltam = alvo - km;
      if (Number.isFinite(alvo)) {
        if (faltam <= 0) return { tipo: 'vencida', texto: `SAÍDA BLOQUEADA: troca de óleo/revisão em ${alvo.toLocaleString('pt-BR')} KM vencida (+${Math.abs(faltam).toLocaleString('pt-BR')} KM). Realize a manutenção e registre a próxima revisão.` };
        return { tipo: faltam <= 2000 ? 'alerta' : 'em_dia', texto: `Próxima revisão em ${alvo.toLocaleString('pt-BR')} KM — faltam ${faltam.toLocaleString('pt-BR')} KM` };
      }
    }
    const ciclo = Number(intervaloConfig) || 30000;
    if (isNaN(km) || km <= 0) return { tipo: 'aguardando', texto: 'KM não informado' };

    const resto = km % ciclo;
    const proximoAlvo = Math.ceil(km / ciclo) * ciclo === km ? km + ciclo : Math.ceil(km / ciclo) * ciclo;
    const faltam = proximoAlvo - km;

    if (resto > 0 && resto <= 2000 && km >= ciclo) {
      const cicloVencido = Math.floor(km / ciclo) * ciclo;
      return { tipo: 'vencida', texto: `🚨 REVISÃO DE ${cicloVencido.toLocaleString('pt-BR')} KM VENCIDA (+${resto} KM)` };
    }
    if (faltam <= 2000) {
      return { tipo: 'alerta', texto: `⚠️ REVISÃO DE ${proximoAlvo.toLocaleString('pt-BR')} KM PRÓXIMA (Faltam ${faltam} KM)` };
    }
    return { tipo: 'em_dia', texto: `✅ Em Dia (Próxima revisão em ${proximoAlvo.toLocaleString('pt-BR')} KM - Faltam ${faltam.toLocaleString('pt-BR')} KM)` };
  };

  const exportarViagensCSV = () => {
    if (viagens.length === 0) return alert("Nenhuma viagem registrada!");
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Data Saida,Data Retorno,Veiculo,Placa,Motorista,Destino,KM Inicial,KM Final,KM Percorrido,Status\n";
    
    viagens.forEach(v => {
      const row = [
        `"${v.dataHoraSaida || '-'}"`,
        `"${v.dataHoraRetorno || '-'}"`,
        `"${v.nomeVeiculo || '-'}"`,
        `"${v.placa || '-'}"`,
        `"${v.motorista || '-'}"`,
        `"${v.destino || '-'}"`,
        `"${v.kmInicial || '-'}"`,
        `"${v.kmFinal || '-'}"`,
        `"${v.kmPercorrido ? `${v.kmPercorrido} km` : '-'}"`,
        `"${v.status || '-'}"`
      ];
      csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `diario_de_bordo_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const veiculosFiltrados = useMemo(() => {
    return veiculos.filter(v => {
      const atendeBusca = v.nome.toLowerCase().includes(busca.toLowerCase()) || 
                          v.placa.toLowerCase().includes(busca.toLowerCase()) ||
                          (v.motoristaAtual && v.motoristaAtual.toLowerCase().includes(busca.toLowerCase()));
      const atendeStatus = filtroStatus === 'Todos' || v.status === filtroStatus;
      return atendeBusca && atendeStatus;
    });
  }, [veiculos, busca, filtroStatus]);

  const totalEmTransito = veiculos.filter(v => v.status === 'Em Trânsito').length;
  const totalNoPatio = veiculos.filter(v => v.status === 'Liberado').length;
  const totalAvaria = veiculos.filter(v => v.status === 'Avaria').length;

  if (verificandoLogin || !usuario) {
    return (
      <div style={styles.modalOverlay}>
        <div style={{ ...styles.modal, maxWidth: '95vw', color: '#fff' }}>
          <h1 style={{ fontSize: '24px', marginBottom: '12px' }}>Frota Junco</h1>
          {verificandoLogin ? <p role="status">Verificando acesso...</p> : (
            <form onSubmit={entrar}>
              <p style={{ color: '#aaa', marginBottom: '16px' }}>Entre com sua conta para acessar o painel.</p>
              <label style={styles.label} htmlFor="email-painel">E-mail</label>
              <input id="email-painel" style={styles.input} type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} disabled={entrando} />
              <label style={styles.label} htmlFor="senha-painel">Senha</label>
              <input id="senha-painel" style={styles.input} type="password" autoComplete="current-password" required value={senha} onChange={e => setSenha(e.target.value)} disabled={entrando} />
              {erroLogin && <p role="alert" style={{ color: '#ff8a80', marginBottom: '12px' }}>{erroLogin}</p>}
              <button type="submit" style={styles.addBtn} disabled={entrando}>{entrando ? 'Entrando...' : 'Entrar'}</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Sidebar Lateral */}
      <aside style={styles.sidebar}>
        <div style={{ padding: '20px 15px', borderBottom: '1px solid #282828' }}>
          <h2 style={styles.logo}>🚛 Frota Junco</h2>
          <span style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '1px' }}>Controle Operacional</span>
        </div>

        <nav style={styles.navMenu}>
          <button aria-current={abaAtiva === 'dashboard' ? 'page' : undefined} style={abaAtiva === 'dashboard' ? styles.menuBtnActive : styles.menuBtn} onClick={() => setAbaAtiva('dashboard')}>
            📊 Dashboard
          </button>
          <button style={abaAtiva === 'usuarios' ? styles.menuBtnActive : styles.menuBtn} onClick={() => setAbaAtiva('usuarios')}>
            👥 Usuários
          </button>
          <button style={abaAtiva === 'patio' ? styles.menuBtnActive : styles.menuBtn} onClick={() => setAbaAtiva('patio')}>
            🏢 Pátio & Em Trânsito
          </button>
          <button style={abaAtiva === 'diario' ? styles.menuBtnActive : styles.menuBtn} onClick={() => setAbaAtiva('diario')}>
            🛣️ Diário de Bordo (Viagens)
          </button>
          <button style={abaAtiva === 'checklists' ? styles.menuBtnActive : styles.menuBtn} onClick={() => setAbaAtiva('checklists')}>
            📋 Auditoria Checklists
          </button>
          <button style={abaAtiva === 'despesas' ? styles.menuBtnActive : styles.menuBtn} onClick={() => setAbaAtiva('despesas')}>
            ⛽ Combustível & Pedágios
          </button>
        </nav>

        <div style={{ padding: '15px' }}>
          <button style={styles.addBtn} onClick={() => { setErroCadastro(''); setModalVeiculo(true); }}>+ Novo Veículo</button>
          <button type="button" style={{ ...styles.cancelBtn, width: '100%', marginTop: '8px' }} onClick={() => sair().catch(error => setErroDados(error.message))}>Sair</button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main style={styles.main}>
        {erroDados && <p role="alert" style={{ color: '#ff8a80', marginBottom: '16px' }}>{erroDados}</p>}
        {sucesso && <p role="status" className="operacao-sucesso">{sucesso}</p>}
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>
              {abaAtiva === 'dashboard' && 'Dashboard'}
              {abaAtiva === 'usuarios' && 'Usuários e Permissões'}
              {abaAtiva === 'patio' && 'Monitoramento de Pátio e Saídas'}
              {abaAtiva === 'diario' && 'Diário de Bordo e Histórico de Utilização'}
              {abaAtiva === 'checklists' && 'Auditoria de Checklists e Assinaturas'}
              {abaAtiva === 'despesas' && 'Controle de Combustível e Pedágios'}
            </h1>
            <p style={styles.subtitle}>{abaAtiva === 'dashboard' ? 'Indicadores e prioridades da frota' : abaAtiva === 'usuarios' ? 'Cadastro de contas e controle de acesso à frota' : 'Acompanhamento em tempo real da operação'}</p>
          </div>
          <div style={styles.dateBadge}>
            📅 {new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
          </div>
        </header>
        {abaAtiva === 'usuarios' && <Usuarios key={usuario.id} usuarioId={usuario.id} />}
        {abaAtiva === 'dashboard' && <Dashboard refreshKey={versaoDados} navegar={setAbaAtiva}
          novaViagem={() => abrirOperacao({ tipo: 'viagem' })}
          novoAbastecimento={() => abrirOperacao({ tipo: 'abastecimento' })}
          novoPedagio={() => abrirOperacao({ tipo: 'pedagio' })}
          novoVeiculo={() => { setErroCadastro(''); setModalVeiculo(true); }} />}

        {/* ================= ABA 1: PÁTIO & EM TRÂNSITO ================= */}
        {abaAtiva === 'patio' && (
          <div>
            <div className="operacao-toolbar">
              <p>Registre a saída de veículos liberados e acompanhe os retornos.</p>
              <button className="operacao-primario" onClick={() => abrirOperacao({ tipo: 'viagem' })}>+ Registrar saída</button>
            </div>
            {/* KPIs */}
            <div style={styles.kpiGrid}>
              <div style={{ ...styles.kpiCard, borderColor: '#5db0d6' }}>
                <span style={{ ...styles.kpiLabel, color: '#5db0d6' }}>🚚 Em Trânsito (Na Rua)</span>
                <h2 style={{ ...styles.kpiVal, color: '#5db0d6' }}>{totalEmTransito}</h2>
              </div>
              <div style={{ ...styles.kpiCard, borderColor: '#4caf50' }}>
                <span style={{ ...styles.kpiLabel, color: '#4caf50' }}>🏢 No Pátio (Disponíveis)</span>
                <h2 style={{ ...styles.kpiVal, color: '#4caf50' }}>{totalNoPatio}</h2>
              </div>
              <div style={{ ...styles.kpiCard, borderColor: '#f44336' }}>
                <span style={{ ...styles.kpiLabel, color: '#f44336' }}>⚠️ Com Avaria</span>
                <h2 style={{ ...styles.kpiVal, color: '#f44336' }}>{totalAvaria}</h2>
              </div>
            </div>

            {/* Busca e Filtros */}
            <div style={styles.filterBar}>
              <input 
                style={styles.searchInput} 
                placeholder="🔍 Buscar por veículo, placa ou motorista..." 
                value={busca} 
                onChange={e => setBusca(e.target.value)} 
              />
              <div style={styles.filterGroup}>
                {['Todos', 'Liberado', 'Em Trânsito', 'Avaria'].map(status => (
                  <button 
                    key={status} 
                    onClick={() => setFiltroStatus(status)} 
                    style={{ 
                      ...styles.filterTab, 
                      backgroundColor: filtroStatus === status ? '#5db0d6' : '#222', 
                      color: filtroStatus === status ? '#fff' : '#aaa' 
                    }}
                  >
                    {status === 'Liberado' ? 'No Pátio' : status}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid dos Veículos */}
            <div style={styles.gridVeiculos}>
              {veiculosFiltrados.map(v => {
                const rev = calcularRevisaoCiclica(v.ultimoKm, v.intervaloRevisao, v.proximaRevisaoKm);
                const emTransito = v.status === 'Em Trânsito';
                return (
                  <div key={v.id} style={{ ...styles.cardVeiculo, borderColor: getBorderColor(v.status) }}>
                    {v.foto && <img src={v.foto} alt={v.nome} style={styles.imgCard} />}
                    <div style={styles.cardHeader}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>{v.nome}</h4>
                        <span style={{ color: '#888', fontSize: '13px' }}>{v.placa} • {v.tipo || 'Caminhão'}</span>
                      </div>
                      <span style={{ ...styles.badge, backgroundColor: getBadgeColor(v.status) }}>
                        {emTransito ? 'EM TRÂNSITO' : v.status === 'Liberado' ? 'NO PÁTIO' : v.status}
                      </span>
                    </div>

                    {/* Alerta de Viagem Ativa */}
                    {emTransito && (
                      <div style={styles.boxEmTransito}>
                        <p style={{ margin: '0 0 3px 0' }}><strong>👤 Motorista:</strong> {v.motoristaAtual}</p>
                        <p style={{ margin: '0 0 3px 0' }}><strong>📍 Destino:</strong> {v.destinoAtual || 'Rota de Entrega'}</p>
                        <p style={{ margin: 0 }}><strong>🕒 Saiu às:</strong> {v.horaSaidaAtual}</p>
                      </div>
                    )}

                    {['Avaria', 'Manutenção'].includes(v.status) && v.ultimaAvaria && (
                      <div style={styles.boxAvaria}>⚠️ <strong>Avaria:</strong> {v.ultimaAvaria}</div>
                    )}

                    {/* Alerta de Revisão a cada 30.000 KM */}
                    {rev.tipo !== 'aguardando' && (
                      <div style={{
                        ...styles.boxRevisao,
                        backgroundColor: rev.tipo === 'vencida' ? '#b71c1c' : rev.tipo === 'alerta' ? '#e65100' : '#1b5e20',
                        color: '#fff'
                      }}>
                        {rev.texto}
                      </div>
                    )}

                    <div style={styles.cardBody}>
                      <p><strong>KM Atual:</strong> {v.ultimoKm !== '-' ? `${Number(v.ultimoKm).toLocaleString('pt-BR')} KM` : '-'}</p>
                      <p><strong>Ciclo Revisão:</strong> A cada {(v.intervaloRevisao || 30000).toLocaleString('pt-BR')} KM</p>
                      <p><strong>Última Atualização:</strong> {v.ultimaAtualizacao || '-'}</p>
                    </div>

                    <div style={styles.actionRow}>
                      <button style={styles.btnDetail} onClick={() => abrirDetalhes(v)}>Ver Detalhes & Assinatura</button>
                      {v.status === 'Liberado' && <button style={styles.btnTable} onClick={() => abrirOperacao({ tipo: rev.tipo === 'vencida' ? 'revisao' : 'viagem', veiculoId: v.id, veiculo: v })}>{rev.tipo === 'vencida' ? 'Registrar revisão' : 'Registrar saída'}</button>}
                      {emTransito && (
                        <button style={styles.btnRelease} onClick={() => registrarRetorno(v)}>
                          Retorno Pátio
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {!veiculosFiltrados.length && <p style={{ color: '#aaa' }}>{veiculos.length ? 'Nenhum veículo corresponde aos filtros.' : 'Nenhum veículo cadastrado. Use + Novo Veículo para começar.'}</p>}
            </div>
          </div>
        )}

        {/* ================= ABA 2: DIÁRIO DE BORDO ================= */}
        {abaAtiva === 'diario' && (
          <div>
            <div className="operacao-toolbar">
              <p style={{ color: '#aaa', margin: 0 }}>Histórico de quem dirigiu, horários e KM rodado.</p>
              <button className="operacao-primario" onClick={() => abrirOperacao({ tipo: 'viagem' })}>+ Nova viagem</button>
              <button style={styles.exportBtn} onClick={exportarViagensCSV}>📥 Exportar CSV</button>
            </div>

            <div style={styles.tableCard}>
              <table style={styles.table}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', textAlign: 'left' }}>
                    <th style={styles.th}>Saída</th>
                    <th style={styles.th}>Retorno</th>
                    <th style={styles.th}>Veículo / Placa</th>
                    <th style={styles.th}>Motorista</th>
                    <th style={styles.th}>Destino</th>
                    <th style={styles.th}>KM Saída</th>
                    <th style={styles.th}>KM Retorno</th>
                    <th style={styles.th}>KM Rodado</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {viagens.map(viagem => (
                    <tr key={viagem.id} style={{ borderBottom: '1px solid #222' }}>
                      <td style={styles.td}>{viagem.dataHoraSaida || '-'}</td>
                      <td style={styles.td}>{viagem.dataHoraRetorno || <span style={{ color: '#5db0d6', fontWeight: 'bold' }}>Em Rota</span>}</td>
                      <td style={styles.td}><strong>{viagem.nomeVeiculo}</strong> ({viagem.placa})</td>
                      <td style={styles.td}><strong>{viagem.motorista}</strong></td>
                      <td style={styles.td}>{viagem.destino || 'Entrega'}</td>
                      <td style={styles.td}>{viagem.kmInicial != null ? `${Number(viagem.kmInicial).toLocaleString('pt-BR')} KM` : '-'}</td>
                      <td style={styles.td}>{viagem.kmFinal != null ? `${Number(viagem.kmFinal).toLocaleString('pt-BR')} KM` : '-'}</td>
                      <td style={styles.td}>
                        {viagem.kmPercorrido != null ? (
                          <strong style={{ color: '#4caf50' }}>+{Number(viagem.kmPercorrido).toLocaleString('pt-BR')} KM</strong>
                        ) : '-'}
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, backgroundColor: viagem.status === 'Em Andamento' ? '#0288d1' : '#4caf50' }}>
                          {viagem.status === 'Em Andamento' ? 'EM ROTA' : 'FINALIZADA'}
                        </span>
                      </td>
                      <td style={styles.td}>{viagem.status === 'Em Andamento' && <button style={styles.btnTable} onClick={() => abrirOperacao({ tipo: 'retorno', viagem })}>Registrar retorno</button>}</td>
                    </tr>
                  ))}
                  {viagens.length === 0 && (
                    <tr><td colSpan="10" style={{ textAlign: 'center', padding: '25px', color: '#aaa' }}>Nenhuma viagem registrada. Use + Nova viagem para registrar uma saída.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= ABA 3: AUDITORIA DE CHECKLISTS ================= */}
        {abaAtiva === 'checklists' && (
          <div>
            <div className="operacao-toolbar">
              <p>O preenchimento, as fotos e a assinatura são feitos no aplicativo. Os checklists enviados aparecem nesta auditoria.</p>
              <button className="operacao-primario" onClick={abrirChecklist}>+ Novo checklist no aplicativo</button>
            </div>
            <p style={{ color: '#aaa', marginBottom: '15px' }}>
              Use Ver Checklist para abrir a inspeção completa e ver a <strong>assinatura digital do motorista</strong>.
            </p>
            <div style={styles.tableCard}>
              <table style={styles.table}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', textAlign: 'left' }}>
                    <th style={styles.th}>Data / Hora</th>
                    <th style={styles.th}>Veículo</th>
                    <th style={styles.th}>Placa</th>
                    <th style={styles.th}>Motorista</th>
                    <th style={styles.th}>KM</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Assinatura</th>
                    <th style={styles.th}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {checklists.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #222' }}>
                      <td style={styles.td}>{c.dataHoraFormatada || '-'}</td>
                      <td style={styles.td}><strong>{c.nomeVeiculo || '-'}</strong></td>
                      <td style={styles.td}>{c.placa || '-'}</td>
                      <td style={styles.td}><strong>{c.motorista || '-'}</strong></td>
                      <td style={styles.td}>{c.km ? `${Number(c.km).toLocaleString('pt-BR')} KM` : '-'}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, backgroundColor: getBadgeColor(c.status) }}>{c.status}</span>
                      </td>
                      <td style={styles.td}>
                        {c.assinatura ? (
                          <span style={{ color: '#4caf50', fontWeight: 'bold' }}>✍️ Assinado</span>
                        ) : (
                          <span style={{ color: '#888' }}>Sem assinatura</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        <button style={styles.btnTable} onClick={() => setChecklistSelecionado(c)}>
                          Ver Checklist
                        </button>
                      </td>
                    </tr>
                  ))}
                  {checklists.length === 0 && (
                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '25px', color: '#666' }}>Nenhum checklist registrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= ABA 4: COMBUSTÍVEL & PEDÁGIOS ================= */}
        {abaAtiva === 'despesas' && (
          <div>
            <div className="operacao-toolbar">
              <p>Registre despesas com ou sem vínculo a uma viagem.</p>
              <div className="operacao-botoes" style={{ marginTop: 0 }}>
                <button className="operacao-primario" onClick={() => abrirOperacao({ tipo: 'abastecimento' })}>+ Lançar combustível</button>
                <button onClick={() => abrirOperacao({ tipo: 'pedagio' })}>+ Lançar pedágio</button>
              </div>
            </div>
            <h3 style={{ color: '#fff', marginBottom: '15px' }}>⛽ Lançamentos de Combustível</h3>
            <div style={styles.tableCard}>
              <table style={styles.table}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', textAlign: 'left' }}>
                    <th style={styles.th}>Data Registro</th>
                    <th style={styles.th}>Veículo / Placa</th>
                    <th style={styles.th}>Motorista</th>
                    <th style={styles.th}>KM</th>
                    <th style={styles.th}>Litros</th>
                    <th style={styles.th}>Valor Total (R$)</th>
                    <th style={styles.th}>Posto</th>
                  </tr>
                </thead>
                <tbody>
                  {abastecimentos.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #222' }}>
                      <td style={styles.td}>{a.dataRegistro}</td>
                      <td style={styles.td}><strong>{a.nomeVeiculo}</strong> ({a.placa})</td>
                      <td style={styles.td}>{a.motorista}</td>
                      <td style={styles.td}>{a.km == null ? '—' : `${Number(a.km).toLocaleString('pt-BR')} KM`}</td>
                      <td style={styles.td}>{a.litros} L</td>
                      <td style={styles.td}>R$ {Number(a.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td style={styles.td}>{a.posto || '—'}</td>
                    </tr>
                  ))}
                  {!abastecimentos.length && <tr><td colSpan="7" style={{ ...styles.td, textAlign: 'center', color: '#aaa' }}>Nenhum abastecimento registrado. Use + Lançar combustível.</td></tr>}
                </tbody>
              </table>
            </div>

            <h3 style={{ color: '#fff', margin: '30px 0 15px 0' }}>💳 Lançamentos de Pedágios</h3>
            <div style={styles.tableCard}>
              <table style={styles.table}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', textAlign: 'left' }}>
                    <th style={styles.th}>Data Registro</th>
                    <th style={styles.th}>Veículo / Placa</th>
                    <th style={styles.th}>Motorista</th>
                    <th style={styles.th}>Valor Pago (R$)</th>
                    <th style={styles.th}>Local / Praça</th>
                  </tr>
                </thead>
                <tbody>
                  {pedagios.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #222' }}>
                      <td style={styles.td}>{p.dataRegistro}</td>
                      <td style={styles.td}><strong>{p.nomeVeiculo}</strong> ({p.placa})</td>
                      <td style={styles.td}>{p.motorista}</td>
                      <td style={styles.td}><strong style={{ color: '#4caf50' }}>R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                      <td style={styles.td}>{p.local || '—'}</td>
                    </tr>
                  ))}
                  {!pedagios.length && <tr><td colSpan="5" style={{ ...styles.td, textAlign: 'center', color: '#aaa' }}>Nenhum pedágio registrado. Use + Lançar pedágio.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
      {operacao?.tipo === 'revisao'
        ? <RegistrarRevisao veiculo={operacao.veiculo} aoFechar={() => setOperacao(null)} aoSalvar={operacaoSalva} />
        : operacao && <LancamentoOperacional key={`${operacao.tipo}-${operacao.viagem?.id || operacao.veiculoId || ''}`} operacao={operacao} veiculos={veiculos} viagens={viagens} aoFechar={() => setOperacao(null)} aoSalvar={operacaoSalva} />}

      {/* ================= MODAL: CADASTRO VEÍCULO ================= */}
      {modalVeiculo && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modal, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} role="dialog" aria-modal="true" aria-label="Cadastrar Novo Veículo">
            <h3 style={{ color: '#fff', marginTop: 0 }}>Cadastrar Novo Veículo</h3>
            <form onSubmit={cadastrarVeiculo}>
              <fieldset disabled={salvandoVeiculo || processandoFoto} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <label style={styles.label}>Nome / Modelo:</label>
              <input style={styles.input} placeholder="Ex: Caminhão IVECO Baú 01" maxLength={120} value={nomeVeiculo} onChange={e => setNomeVeiculo(e.target.value)} required />
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Placa:</label>
                  <input style={styles.input} placeholder="Ex: ABC-1234" maxLength={10} value={placaVeiculo} onChange={e => setPlacaVeiculo(e.target.value)} required />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Ano:</label>
                  <input style={styles.input} placeholder="Ex: 2024" maxLength={4} value={anoVeiculo} onChange={e => setAnoVeiculo(e.target.value)} />
                </div>
              </div>

              <label style={styles.label}>Categoria:</label>
              <select style={styles.select} value={tipoVeiculo} onChange={e => setTipoVeiculo(e.target.value)}>
                <option>Caminhão 3/4</option>
                <option>Caminhão Toco</option>
                <option>Caminhão Truck</option>
                <option>Van de Carga</option>
                <option>Furgão / Utilitário</option>
              </select>

              <label style={styles.label}>Intervalo de Revisão (KM):</label>
              <input style={styles.input} type="number" placeholder="Padrão: 30000" value={intervaloRevisao} onChange={e => setIntervaloRevisao(e.target.value)} />
              
              <label style={styles.label}>Foto do Veículo:</label>
              <input type="file" accept="image/*" onChange={handleUploadFoto} style={{ margin: '8px 0', color: '#ccc' }} />
              {fotoBase64 && <img src={fotoBase64} alt="Preview" style={styles.previewImg} />}
              {erroCadastro && <p role="alert" style={{ color: '#ff8a80', marginTop: '12px' }}>{erroCadastro}</p>}
              {processandoFoto && <p role="status">Preparando foto...</p>}
              {avisoCadastro && <p role="status" style={{ color: '#ffd180', marginTop: '12px' }}>{avisoCadastro}</p>}

              <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                <button type="submit" style={{ ...styles.addBtn, flex: 1 }}>{salvandoVeiculo ? 'Salvando...' : 'Salvar Veículo'}</button>
                <button type="button" onClick={() => setModalVeiculo(false)} style={styles.cancelBtn}>Cancelar</button>
              </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 1: DETALHES DO VEÍCULO + ÚLTIMO CHECKLIST ASSINADO ================= */}
      {veiculoDetalhe && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modal, width: '540px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, color: '#fff' }}>{veiculoDetalhe.nome}</h2>
                <span style={{ color: '#aaa', fontSize: '13px' }}>Placa: <strong>{veiculoDetalhe.placa}</strong> • {veiculoDetalhe.tipo}</span>
              </div>
              <span style={{ ...styles.badge, backgroundColor: getBadgeColor(veiculoDetalhe.status) }}>
                {veiculoDetalhe.status === 'Liberado' ? 'NO PÁTIO' : veiculoDetalhe.status}
              </span>
            </div>

            {veiculoDetalhe.foto && (
              <img src={veiculoDetalhe.foto} alt="Foto" style={{ width: '100%', height: '160px', objectFit: 'contain', backgroundColor: '#000', borderRadius: '8px', margin: '12px 0' }} />
            )}

            <div style={{ ...styles.infoBox, borderLeft: '4px solid #5db0d6', marginBottom: '12px' }}>
              <p><strong>Status Atual:</strong> {veiculoDetalhe.status === 'Em Trânsito' ? `Em Trânsito com ${veiculoDetalhe.motoristaAtual} (desde ${veiculoDetalhe.horaSaidaAtual})` : veiculoDetalhe.status === 'Liberado' ? 'Disponível no Pátio' : veiculoDetalhe.status}</p>
              {veiculoDetalhe.destinoAtual && veiculoDetalhe.destinoAtual !== '-' && (
                <p><strong>Destino:</strong> {veiculoDetalhe.destinoAtual}</p>
              )}
              <p><strong>Quilometragem:</strong> {veiculoDetalhe.ultimoKm !== '-' ? `${Number(veiculoDetalhe.ultimoKm).toLocaleString('pt-BR')} KM` : '-'}</p>
            </div>

            {/* Diagnóstico de Revisão */}
            <div style={{ ...styles.infoBox, marginBottom: '12px', borderLeft: '4px solid #ff9800' }}>
              <p><strong>Ciclo de Revisão:</strong> A cada {(veiculoDetalhe.intervaloRevisao || 30000).toLocaleString('pt-BR')} KM</p>
              <p><strong>Diagnóstico:</strong> {calcularRevisaoCiclica(veiculoDetalhe.ultimoKm, veiculoDetalhe.intervaloRevisao, veiculoDetalhe.proximaRevisaoKm).texto}</p>
            </div>

            <h4 style={{ color: '#fff', borderBottom: '1px solid #333', paddingBottom: '5px', margin: '15px 0 10px 0' }}>Último Checklist Assinado</h4>
            
            {carregandoDetalhes ? (
              <p style={{ color: '#5db0d6', textAlign: 'center' }}>Buscando inspeção...</p>
            ) : ultimoChecklist ? (
              <div>
                <div style={styles.infoBox}>
                  <p><strong>Motorista:</strong> {ultimoChecklist.motorista || '-'}</p>
                  <p><strong>KM Registrado:</strong> {ultimoChecklist.km ? `${Number(ultimoChecklist.km).toLocaleString('pt-BR')} KM` : '-'}</p>
                  <p><strong>Data / Hora:</strong> {ultimoChecklist.dataHoraFormatada}</p>
                </div>

                <h5 style={{ color: '#fff', marginTop: '12px', marginBottom: '6px' }}>Itens Inspecionados:</h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {ultimoChecklist.itens ? ultimoChecklist.itens.map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', backgroundColor: '#2a2a2a', borderRadius: '4px', fontSize: '13px' }}>
                      <span style={{ color: '#fff' }}>{item.label}</span>
                      <span style={{ color: item.ok ? '#4caf50' : '#f44336', fontWeight: 'bold' }}>
                        {item.ok ? 'OK' : `AVARIA: ${item.obs || 'Defeito'}`}
                      </span>
                    </div>
                  )) : <p style={{ color: '#888', fontSize: '13px' }}>Sem itens detalhados.</p>}
                </div>

                {ultimoChecklist.obsGeral ? (
                  <p style={{ marginTop: '10px', fontSize: '13px', color: '#ccc' }}><strong>Observações:</strong> {ultimoChecklist.obsGeral}</p>
                ) : null}

                {/* EXIBIÇÃO DA ASSINATURA DIGITAL */}
                {ultimoChecklist.assinatura && (
                  <div style={{ marginTop: '15px', backgroundColor: '#222', padding: '12px', borderRadius: '8px', border: '1px solid #333' }}>
                    <span style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '6px' }}>✍️ Assinatura Digital do Motorista ({ultimoChecklist.motorista}):</span>
                    <div style={{ backgroundColor: '#fff', borderRadius: '6px', padding: '8px', display: 'flex', justifyContent: 'center' }}>
                      <img src={ultimoChecklist.assinatura} alt="Assinatura" style={{ height: '75px', maxWidth: '100%', objectFit: 'contain' }} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: '#888', textAlign: 'center' }}>Nenhum checklist registrado para este veículo ainda.</p>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              {veiculoDetalhe.status === 'Em Trânsito' && <button style={styles.btnRelease} onClick={() => { registrarRetorno(veiculoDetalhe); setVeiculoDetalhe(null); }}>Registrar retorno</button>}
              {['Avaria', 'Manutenção'].includes(veiculoDetalhe.status) && (
                <button style={{ ...styles.btnRelease, flex: 1 }} onClick={() => liberarVeiculoManualmente(veiculoDetalhe.id)}>
                  Liberar para o Pátio
                </button>
              )}
              <button style={{ ...styles.cancelBtn, backgroundColor: '#d32f2f' }} onClick={() => removerVeiculo(veiculoDetalhe.id, veiculoDetalhe.nome)}>
                Arquivar
              </button>
              <button style={styles.cancelBtn} onClick={() => setVeiculoDetalhe(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: VISUALIZAR CHECKLIST SELECIONADO DA AUDITORIA ================= */}
      {checklistSelecionado && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modal, width: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>Checklist de {checklistSelecionado.nomeVeiculo} ({checklistSelecionado.placa})</h3>
            
            <div style={styles.infoBox}>
              <p><strong>Motorista:</strong> {checklistSelecionado.motorista}</p>
              <p><strong>Data/Hora:</strong> {checklistSelecionado.dataHoraFormatada}</p>
              <p><strong>KM Registrado:</strong> {checklistSelecionado.km} KM</p>
              <p><strong>Status Geral:</strong> <span style={{ color: checklistSelecionado.status === 'Avaria' ? '#f44' : '#4caf50', fontWeight: 'bold' }}>{checklistSelecionado.status}</span></p>
            </div>

            <h5 style={{ color: '#fff', marginTop: '15px', marginBottom: '8px' }}>Itens Verificados:</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {checklistSelecionado.itens ? checklistSelecionado.itens.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', backgroundColor: '#2a2a2a', borderRadius: '4px', fontSize: '13px' }}>
                  <span style={{ color: '#fff' }}>{item.label}</span>
                  <span style={{ color: item.ok ? '#4caf50' : '#f44336', fontWeight: 'bold' }}>
                    {item.ok ? 'OK' : `AVARIA: ${item.obs || 'Defeito'}`}
                  </span>
                </div>
              )) : <p style={{ color: '#888' }}>Sem itens individuais.</p>}
            </div>

            {checklistSelecionado.obsGeral ? (
              <p style={{ marginTop: '10px', fontSize: '13px', color: '#ccc' }}><strong>Obs:</strong> {checklistSelecionado.obsGeral}</p>
            ) : null}

            {/* ASSINATURA */}
            {checklistSelecionado.assinatura ? (
              <div style={{ marginTop: '15px', backgroundColor: '#222', padding: '12px', borderRadius: '8px', border: '1px solid #333' }}>
                <span style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '6px' }}>✍️ Assinatura do Motorista:</span>
                <div style={{ backgroundColor: '#fff', borderRadius: '6px', padding: '8px', display: 'flex', justifyContent: 'center' }}>
                  <img src={checklistSelecionado.assinatura} alt="Assinatura" style={{ height: '75px', maxWidth: '100%', objectFit: 'contain' }} />
                </div>
              </div>
            ) : (
              <p style={{ color: '#888', marginTop: '10px' }}>Nenhuma assinatura gravada.</p>
            )}

            <button style={{ ...styles.cancelBtn, width: '100%', marginTop: '20px' }} onClick={() => setChecklistSelecionado(null)}>
              Fechar Janela
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function getBadgeColor(status) {
  if (status === 'Avaria') return '#f44336';
  if (status === 'Em Trânsito') return '#0288d1';
  return '#4caf50';
}

function getBorderColor(status) {
  if (status === 'Avaria') return '#f44336';
  if (status === 'Em Trânsito') return '#0288d1';
  return '#2a3b4c';
}

const styles = {
  container: { display: 'flex', width: '100vw', height: '100vh', backgroundColor: '#121212', color: '#fff', boxSizing: 'border-box', overflow: 'hidden' },
  sidebar: { width: '250px', minWidth: '250px', backgroundColor: '#1a1a1a', display: 'flex', flexDirection: 'column', borderRight: '1px solid #282828', boxSizing: 'border-box' },
  logo: { color: '#5db0d6', fontSize: '20px', margin: 0, fontWeight: 'bold' },
  navMenu: { flex: 1, padding: '15px 10px', display: 'flex', flexDirection: 'column', gap: '6px' },
  menuBtn: { backgroundColor: 'transparent', color: '#aaa', border: 'none', padding: '12px 14px', borderRadius: '6px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', transition: '0.2s' },
  menuBtnActive: { backgroundColor: '#282828', color: '#5db0d6', border: 'none', padding: '12px 14px', borderRadius: '6px', textAlign: 'left', fontWeight: 'bold', fontSize: '13px' },
  addBtn: { backgroundColor: '#5db0d6', color: '#fff', border: 'none', padding: '11px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', width: '100%' },
  exportBtn: { backgroundColor: '#333', color: '#5db0d6', border: '1px solid #5db0d6', padding: '9px 14px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' },
  cancelBtn: { backgroundColor: '#333', color: '#fff', border: 'none', padding: '11px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  btnTable: { backgroundColor: '#282828', color: '#5db0d6', border: '1px solid #444', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  main: { flex: 1, minWidth: 0, padding: '25px 35px', boxSizing: 'border-box', overflowY: 'auto', height: '100vh' },
  header: { display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #222', paddingBottom: '15px' },
  title: { margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#ffffff' },
  subtitle: { color: '#888', margin: '4px 0 0 0', fontSize: '14px' },
  dateBadge: { fontSize: '14px', fontWeight: 'bold', color: '#5db0d6', backgroundColor: '#1e1e1e', padding: '8px 14px', borderRadius: '6px', border: '1px solid #333' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' },
  kpiCard: { backgroundColor: '#1a1a1a', padding: '16px', borderRadius: '8px', border: '1px solid #282828', textAlign: 'center' },
  kpiLabel: { fontSize: '13px', color: '#aaa', display: 'block', marginBottom: '4px' },
  kpiVal: { margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#fff' },
  filterBar: { display: 'flex', justifyContent: 'space-between', marginBottom: '20px', gap: '15px' },
  searchInput: { flex: 1, backgroundColor: '#1a1a1a', color: '#fff', border: '1px solid #333', padding: '11px 16px', borderRadius: '6px', fontSize: '14px' },
  filterGroup: { display: 'flex', gap: '6px' },
  filterTab: { border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
  gridVeiculos: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '20px' },
  cardVeiculo: { backgroundColor: '#1a1a1a', padding: '16px', borderRadius: '8px', borderWidth: '2px', borderStyle: 'solid', boxSizing: 'border-box' },
  imgCard: { width: '100%', height: '135px', objectFit: 'contain', backgroundColor: '#0e0e0e', borderRadius: '6px', marginBottom: '12px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' },
  badge: { padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', color: '#fff' },
  boxEmTransito: { backgroundColor: '#01579b', padding: '9px 12px', borderRadius: '6px', marginBottom: '10px', fontSize: '12px', color: '#e1f5fe' },
  boxAvaria: { backgroundColor: '#b71c1c', padding: '8px', borderRadius: '4px', marginBottom: '8px', fontSize: '12px' },
  boxRevisao: { padding: '8px 10px', borderRadius: '4px', marginBottom: '10px', fontSize: '12px', fontWeight: 'bold', lineHeight: '1.4' },
  cardBody: { fontSize: '13px', color: '#bbb', display: 'flex', flexDirection: 'column', gap: '5px' },
  actionRow: { display: 'flex', gap: '6px', marginTop: '14px' },
  btnDetail: { flex: 1, backgroundColor: '#282828', color: '#fff', border: 'none', padding: '9px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
  btnRelease: { backgroundColor: '#4caf50', color: '#fff', border: 'none', padding: '9px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
  tableCard: { backgroundColor: '#1a1a1a', borderRadius: '8px', border: '1px solid #282828', padding: '15px', overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', color: '#ccc', fontSize: '13px' },
  th: { padding: '12px 10px', color: '#888', fontWeight: 'bold' },
  td: { padding: '12px 10px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal: { backgroundColor: '#1a1a1a', padding: '24px', borderRadius: '8px', width: '450px', boxSizing: 'border-box' },
  label: { fontSize: '12px', color: '#aaa', marginTop: '8px', display: 'block' },
  input: { width: '100%', padding: '10px', margin: '4px 0 8px 0', backgroundColor: '#282828', color: '#fff', border: '1px solid #333', borderRadius: '4px', boxSizing: 'border-box' },
  select: { width: '100%', padding: '10px', margin: '4px 0 8px 0', backgroundColor: '#282828', color: '#fff', border: '1px solid #333', borderRadius: '4px', boxSizing: 'border-box' },
  infoBox: { backgroundColor: '#242424', padding: '12px', borderRadius: '6px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '5px' },
  previewImg: { width: '100%', height: '110px', objectFit: 'contain', backgroundColor: '#000', borderRadius: '6px', marginTop: '6px' }
};
