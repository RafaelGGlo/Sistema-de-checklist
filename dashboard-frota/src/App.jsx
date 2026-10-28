import React, { useState, useEffect, useMemo } from 'react';
import { prepararFotoVeiculo, mensagemErroCadastro } from './cadastroVeiculo.js';
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, where, orderBy, limit, getDocs 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBPAkWJJOJUkVzohGS_Kg4ipJnAlN0fZ6M",
  authDomain: "projeto-logistica-junco-698b4.firebaseapp.com",
  projectId: "projeto-logistica-junco-698b4",
  storageBucket: "projeto-logistica-junco-698b4.firebasestorage.app",
  messagingSenderId: "1071762650483",
  appId: "1:1071762650483:web:9dee91a05229737ab30106"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [verificandoLogin, setVerificandoLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erroLogin, setErroLogin] = useState('');
  const [erroDados, setErroDados] = useState('');
  const [abaAtiva, setAbaAtiva] = useState('patio'); // 'patio' | 'diario' | 'checklists' | 'despesas'

  // Dados do Firebase
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
    return onAuthStateChanged(auth, (user) => {
      setUsuario(user);
      setVerificandoLogin(false);
      setVeiculos([]); setViagens([]); setChecklists([]); setAbastecimentos([]); setPedagios([]);
      setVeiculoDetalhe(null); setChecklistSelecionado(null); setModalVeiculo(false);
    });
  }, []);

  const entrar = async (event) => {
    event.preventDefault();
    if (entrando) return;
    setEntrando(true);
    setErroLogin('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha);
      setSenha('');
    } catch (error) {
      setErroLogin(error.code === 'auth/network-request-failed'
        ? 'Não foi possível conectar. Verifique sua internet.'
        : error.code === 'auth/too-many-requests'
          ? 'Muitas tentativas de login. Aguarde e tente novamente.'
          : 'Não foi possível entrar. Confira seu e-mail e sua senha.');
    } finally {
      setEntrando(false);
    }
  };

  useEffect(() => {
    if (!usuario) return;
    setErroDados('');
    const tratarErroDados = (error) => setErroDados(error.code === 'permission-denied'
      ? 'Sua conta não tem permissão para acessar os dados do painel. Verifique as permissões no Firebase.'
      : `Não foi possível carregar os dados do painel. Código: ${error.code || 'desconhecido'}.`);
    // 1. Veículos
    const unsubVeiculos = onSnapshot(collection(db, 'veiculos'), (snap) => {
      setVeiculos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, tratarErroDados);

    // 2. Viagens
    const qViagens = query(collection(db, 'viagens'), orderBy('dataHoraSaidaTimestamp', 'desc'), limit(100));
    const unsubViagens = onSnapshot(qViagens, (snap) => {
      setViagens(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, tratarErroDados);

    // 3. Checklists
    const qChecklists = query(collection(db, 'checklists'), orderBy('dataHoraFormatada', 'desc'), limit(100));
    const unsubChecklists = onSnapshot(qChecklists, (snap) => {
      setChecklists(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, tratarErroDados);

    // 4. Abastecimentos
    const qAbast = query(collection(db, 'abastecimentos'), orderBy('dataRegistro', 'desc'), limit(50));
    const unsubAbast = onSnapshot(qAbast, (snap) => {
      setAbastecimentos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, tratarErroDados);

    // 5. Pedágios
    const qPedagio = query(collection(db, 'pedagios'), orderBy('dataRegistro', 'desc'), limit(50));
    const unsubPedagio = onSnapshot(qPedagio, (snap) => {
      setPedagios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, tratarErroDados);

    return () => {
      unsubVeiculos();
      unsubViagens();
      unsubChecklists();
      unsubAbast();
      unsubPedagio();
    };
  }, [usuario]);

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
      await addDoc(collection(db, 'veiculos'), {
      nome: nomeVeiculo.trim(),
      placa: placaVeiculo.toUpperCase().trim(),
      tipo: tipoVeiculo,
      ano: anoVeiculo,
      intervaloRevisao: Number(intervaloRevisao) || 30000,
      foto: fotoBase64 || '',
      status: 'Liberado',
      motoristaAtual: '-',
      destinoAtual: '-',
      horaSaidaAtual: '-',
      ultimoKm: '-',
      ultimoMotorista: '-',
      ultimaAvaria: '',
      ultimaAtualizacao: '-'
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
    if (window.confirm(`Deseja realmente excluir ${nome} da frota?`)) {
      await deleteDoc(doc(db, 'veiculos', id));
      if (veiculoDetalhe?.id === id) setVeiculoDetalhe(null);
    }
  };

  const liberarVeiculoManualmente = async (veiculoId) => {
    await updateDoc(doc(db, 'veiculos', veiculoId), {
      status: 'Liberado',
      motoristaAtual: '-',
      destinoAtual: '-',
      horaSaidaAtual: '-',
      ultimaAvaria: ''
    });
    if (veiculoDetalhe) setVeiculoDetalhe(prev => ({ ...prev, status: 'Liberado', motoristaAtual: '-', destinoAtual: '-' }));
  };

  // Abrir Detalhes do Veículo (Busca o último checklist assinado)
  const abrirDetalhes = async (v) => {
    setVeiculoDetalhe(v);
    setUltimoChecklist(null);
    setCarregandoDetalhes(true);

    try {
      const q = query(
        collection(db, 'checklists'),
        where('veiculoId', '==', v.id),
        orderBy('dataHoraCriacao', 'desc'),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setUltimoChecklist(querySnapshot.docs[0].data());
      }
    } catch (e) {
      console.log("Erro ao buscar inspeção:", e);
    } finally {
      setCarregandoDetalhes(false);
    }
  };

  const calcularRevisaoCiclica = (kmAtualStr, intervaloConfig) => {
    if (!kmAtualStr || kmAtualStr === '-') return { tipo: 'aguardando', texto: 'Aguardando 1º KM' };
    const km = Number(kmAtualStr);
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
          <button type="button" style={{ ...styles.cancelBtn, width: '100%', marginTop: '8px' }} onClick={() => signOut(auth)}>Sair</button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main style={styles.main}>
        {erroDados && <p role="alert" style={{ color: '#ff8a80', marginBottom: '16px' }}>{erroDados}</p>}
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>
              {abaAtiva === 'patio' && 'Monitoramento de Pátio e Saídas'}
              {abaAtiva === 'diario' && 'Diário de Bordo e Histórico de Utilização'}
              {abaAtiva === 'checklists' && 'Auditoria de Checklists e Assinaturas'}
              {abaAtiva === 'despesas' && 'Controle de Combustível e Pedágios'}
            </h1>
            <p style={styles.subtitle}>Acompanhamento em tempo real da operação</p>
          </div>
          <div style={styles.dateBadge}>
            📅 {new Date().toLocaleDateString('pt-BR')}
          </div>
        </header>

        {/* ================= ABA 1: PÁTIO & EM TRÂNSITO ================= */}
        {abaAtiva === 'patio' && (
          <div>
            {/* KPIs */}
            <div style={styles.kpiGrid}>
              <div style={styles.kpiCard}>
                <span style={styles.kpiLabel}>Frota Total</span>
                <h2 style={styles.kpiVal}>{veiculos.length}</h2>
              </div>
              <div style={{ ...styles.kpiCard, borderColor: '#5db0d6' }}>
                <span style={{ ...styles.kpiLabel, color: '#5db0d6' }}>🚚 Em Trânsito (Na Rua)</span>
                <h2 style={{ ...styles.kpiVal, color: '#5db0d6' }}>{totalEmTransito}</h2>
              </div>
              <div style={{ ...styles.kpiCard, borderColor: '#4caf50' }}>
                <span style={{ ...styles.kpiLabel, color: '#4caf50' }}>🏢 No Pátio (Disponíveis)</span>
                <h2 style={{ ...styles.kpiVal, color: '#4caf50' }}>{totalNoPatio}</h2>
              </div>
              <div style={{ ...styles.kpiCard, borderColor: '#f44336' }}>
                <span style={{ ...styles.kpiLabel, color: '#f44336' }}>⚠️ Com Avaria / Retido</span>
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
                const rev = calcularRevisaoCiclica(v.ultimoKm, v.intervaloRevisao);
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

                    {v.status === 'Avaria' && v.ultimaAvaria && (
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
                      {emTransito && (
                        <button style={styles.btnRelease} onClick={() => liberarVeiculoManualmente(v.id)}>
                          Retorno Pátio
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= ABA 2: DIÁRIO DE BORDO ================= */}
        {abaAtiva === 'diario' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <p style={{ color: '#aaa', margin: 0 }}>Histórico de quem dirigiu, horários e KM rodado.</p>
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
                      <td style={styles.td}>{viagem.kmInicial ? `${Number(viagem.kmInicial).toLocaleString('pt-BR')} KM` : '-'}</td>
                      <td style={styles.td}>{viagem.kmFinal ? `${Number(viagem.kmFinal).toLocaleString('pt-BR')} KM` : '-'}</td>
                      <td style={styles.td}>
                        {viagem.kmPercorrido ? (
                          <strong style={{ color: '#4caf50' }}>+{Number(viagem.kmPercorrido).toLocaleString('pt-BR')} KM</strong>
                        ) : '-'}
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, backgroundColor: viagem.status === 'Em Andamento' ? '#0288d1' : '#4caf50' }}>
                          {viagem.status === 'Em Andamento' ? 'EM ROTA' : 'FINALIZADA'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {viagens.length === 0 && (
                    <tr><td colSpan="9" style={{ textAlign: 'center', padding: '25px', color: '#666' }}>Nenhuma viagem registrada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= ABA 3: AUDITORIA DE CHECKLISTS ================= */}
        {abaAtiva === 'checklists' && (
          <div>
            <p style={{ color: '#aaa', marginBottom: '15px' }}>
              Clique em qualquer linha para abrir a inspeção completa e ver a <strong>assinatura digital do motorista</strong>.
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
                      <td style={styles.td}>{Number(a.km).toLocaleString('pt-BR')} KM</td>
                      <td style={styles.td}>{a.litros} L</td>
                      <td style={styles.td}>R$ {Number(a.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td style={styles.td}>{a.posto}</td>
                    </tr>
                  ))}
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
                      <td style={styles.td}>{p.local}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

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
              <p><strong>Status Atual:</strong> {veiculoDetalhe.status === 'Em Trânsito' ? `Em Trânsito com ${veiculoDetalhe.motoristaAtual} (desde ${veiculoDetalhe.horaSaidaAtual})` : 'Disponível no Pátio'}</p>
              {veiculoDetalhe.destinoAtual && veiculoDetalhe.destinoAtual !== '-' && (
                <p><strong>Destino:</strong> {veiculoDetalhe.destinoAtual}</p>
              )}
              <p><strong>Quilometragem:</strong> {veiculoDetalhe.ultimoKm !== '-' ? `${Number(veiculoDetalhe.ultimoKm).toLocaleString('pt-BR')} KM` : '-'}</p>
            </div>

            {/* Diagnóstico de Revisão */}
            <div style={{ ...styles.infoBox, marginBottom: '12px', borderLeft: '4px solid #ff9800' }}>
              <p><strong>Ciclo de Revisão:</strong> A cada {(veiculoDetalhe.intervaloRevisao || 30000).toLocaleString('pt-BR')} KM</p>
              <p><strong>Diagnóstico:</strong> {calcularRevisaoCiclica(veiculoDetalhe.ultimoKm, veiculoDetalhe.intervaloRevisao).texto}</p>
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
              {veiculoDetalhe.status !== 'Liberado' && (
                <button style={{ ...styles.btnRelease, flex: 1 }} onClick={() => liberarVeiculoManualmente(veiculoDetalhe.id)}>
                  Liberar para o Pátio
                </button>
              )}
              <button style={{ ...styles.cancelBtn, backgroundColor: '#d32f2f' }} onClick={() => removerVeiculo(veiculoDetalhe.id, veiculoDetalhe.nome)}>
                Excluir
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
  main: { flex: 1, padding: '25px 35px', boxSizing: 'border-box', overflowY: 'auto', height: '100vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #222', paddingBottom: '15px' },
  title: { margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#ffffff' },
  subtitle: { color: '#888', margin: '4px 0 0 0', fontSize: '14px' },
  dateBadge: { fontSize: '14px', fontWeight: 'bold', color: '#5db0d6', backgroundColor: '#1e1e1e', padding: '8px 14px', borderRadius: '6px', border: '1px solid #333' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' },
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
