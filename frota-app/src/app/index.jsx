import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, 
  Modal, ActivityIndicator, Alert, BackHandler
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ChecklistScreen from '../checklist/ChecklistScreen';
import UpdateNotice from '../updates/UpdateNotice';

import {
  entrar, sair, perfilAtual, observarSessao, observarDados, iniciarViagem,
  finalizarViagem, registrarDespesa,
} from '../lib/frota';

function formatarPrimeiroNome(texto) {
  if (!texto) return '';
  const limpo = texto.trim().split('@')[0].split(' ')[0];
  return limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase();
}

function verificarAlertaRevisao(kmAtualStr, kmRevStr) {
  const kmAtual = Number(kmAtualStr);
  const kmRev = Number(kmRevStr);
  if (!kmRev || isNaN(kmRev) || !kmAtual || isNaN(kmAtual)) return null;

  const diff = kmRev - kmAtual;
  if (diff < 0) {
    return {
      tipo: 'vencida',
      titulo: '🚨 ATENÇÃO: REVISÃO VENCIDA!',
      mensagem: `A revisão deste veículo ultrapassou ${Math.abs(diff).toLocaleString('pt-BR')} KM!`
    };
  }
  if (diff <= 1000) {
    return {
      tipo: 'proxima',
      titulo: '⚠️ ATENÇÃO: REVISÃO PRÓXIMA!',
      mensagem: `A revisão preventiva está próxima! Faltam apenas ${diff.toLocaleString('pt-BR')} KM.`
    };
  }
  return null;
}

// ================= TELA 1: LOGIN =================
function LoginScreen({ aoLogar, erroSessao }) {
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erroLogin, setErroLogin] = useState('');

  const fazerLogin = async () => {
    if (carregando) return;
    setErroLogin('');
    const emailFormatado = nome.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFormatado) || !senha) {
      setErroLogin('Preencha o e-mail completo e sua senha.');
      return;
    }
    setCarregando(true);

    try {
      const perfil = await entrar(emailFormatado, senha);
      const primeiroNome = formatarPrimeiroNome(perfil.nome);
      await AsyncStorage.setItem('@motorista_nome', primeiroNome);
      aoLogar();
    } catch (error) {
      setErroLogin(error.message || 'Confira seu e-mail e senha.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <View style={styles.containerLogin}>
      <UpdateNotice blocked={carregando} />
      <Text style={styles.tituloApp}>🚛 Frota Junco</Text>
      <Text style={styles.subtituloApp}>Acesso do Motorista</Text>

      <TextInput 
        style={styles.input} 
        placeholder="E-mail cadastrado no Supabase"
        placeholderTextColor="#666" 
        value={nome} 
        onChangeText={setNome} 
        autoCapitalize="none" 
      />
      <TextInput 
        style={styles.input} 
        placeholder="Senha" 
        placeholderTextColor="#666" 
        value={senha} 
        onChangeText={setSenha} 
        secureTextEntry 
      />

      {!!(erroLogin || erroSessao) && (
        <Text accessibilityRole="alert" style={{ color: '#ff8a80', marginBottom: 12 }}>
          {erroLogin || erroSessao}
        </Text>
      )}
      <TouchableOpacity style={styles.botaoPrincipal} onPress={fazerLogin} disabled={carregando}>
        {carregando ? <ActivityIndicator color="#fff" /> : <Text style={styles.txtBotao}>Entrar no Sistema</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ================= TELA 2: MENU PRINCIPAL / HUB =================
function HomeScreen({ navigation, aoDeslogar }) {
  const [veiculos, setVeiculos] = useState([]);
  const [nomeMotorista, setNomeMotorista] = useState('');
  const [viagemAtiva, setViagemAtiva] = useState(null);

  // Modais de Seleção
  const [modalEscolherVeiculoViagem, setModalEscolherVeiculoViagem] = useState(false);
  const [modalEscolherVeiculoChecklist, setModalEscolherVeiculoChecklist] = useState(false);

  // Modais de Despesas
  const [modalCombustivel, setModalCombustivel] = useState(false);
  const [modalPedagio, setModalPedagio] = useState(false);

  // Inputs
  const [valorCombustivel, setValorCombustivel] = useState('');
  const [litrosCombustivel, setLitrosCombustivel] = useState('');
  const [valorPedagio, setValorPedagio] = useState('');

  const [kmRetorno, setKmRetorno] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const operacaoEmCurso = useRef(false);
  const executar = async (acao) => {
    if (operacaoEmCurso.current) return;
    operacaoEmCurso.current = true; setOcupado(true);
    try { await acao(); }
    catch (error) { Alert.alert('Erro', error.message || 'Falha ao salvar.'); }
    finally { operacaoEmCurso.current = false; setOcupado(false); }
  };

  useEffect(() => {
    let ativo = true;
    const cancelar = [];
    const erro = error => Alert.alert('Erro ao carregar', error.message);
    perfilAtual().then(perfil => {
      if (!ativo) return;
      setNomeMotorista(formatarPrimeiroNome(perfil.nome));
      cancelar.push(
        observarDados('veiculos', setVeiculos, erro, { filtros: { ativo: true } }),
        observarDados('viagens', rows => setViagemAtiva(rows[0] || null), erro,
          { filtros: { motorista_id: perfil.id, status: 'Em Andamento' } }),
      );
    }).catch(erro);
    return () => { ativo = false; cancelar.forEach(fn => fn()); };
  }, []);

  useEffect(() => {
    const backAction = () => {
      if (viagemAtiva) return true;
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [viagemAtiva]);

  const executarInicioViagem = (veiculoSelecionado) => executar(async () => {
    const viagem = await iniciarViagem(veiculoSelecionado.id);
    setViagemAtiva(viagem); setModalEscolherVeiculoViagem(false);
  });

  // Exibe apenas a mensagem da revisão e inicia a viagem ao clicar em OK
  const selecionarVeiculoParaViagem = (item) => {
    const alerta = verificarAlertaRevisao(item.ultimoKm, item.proximaRevisaoKm);
    if (alerta) {
      Alert.alert(
        alerta.titulo,
        alerta.mensagem,
        [{ text: "OK", onPress: () => executarInicioViagem(item) }]
      );
    } else {
      executarInicioViagem(item);
    }
  };

  const finalizarViagemAtual = () => executar(async () => {
    if (!viagemAtiva) return;
    if (!/^\d+$/.test(kmRetorno.trim())) throw new Error('Informe o KM final usando apenas números.');
    const kmFinal = Number(kmRetorno);
    if (!Number.isSafeInteger(kmFinal)) throw new Error('KM final inválido.');
    await finalizarViagem(viagemAtiva.id, kmFinal);
    setViagemAtiva(null); setKmRetorno('');
  });

  const salvarCombustivel = () => executar(async () => {
    if (!viagemAtiva) throw new Error('Inicie uma viagem primeiro.');
    await registrarDespesa(viagemAtiva.id, 'abastecimento', valorCombustivel, litrosCombustivel);
    setModalCombustivel(false); setValorCombustivel(''); setLitrosCombustivel('');
    Alert.alert('Sucesso', 'Abastecimento registrado.');
  });

  const salvarPedagio = () => executar(async () => {
    if (!viagemAtiva) throw new Error('Inicie uma viagem primeiro.');
    await registrarDespesa(viagemAtiva.id, 'pedagio', valorPedagio);
    setModalPedagio(false); setValorPedagio('');
    Alert.alert('Sucesso', 'Pedágio registrado.');
  });

  const veiculoEmViagem = viagemAtiva ? veiculos.find(v => v.id === viagemAtiva.veiculoId) : null;
  const alertaViagemAtiva = veiculoEmViagem ? verificarAlertaRevisao(veiculoEmViagem.ultimoKm, veiculoEmViagem.proximaRevisaoKm) : null;

  return (
    <View style={styles.containerHub}>
      <UpdateNotice blocked={ocupado || !!viagemAtiva || modalEscolherVeiculoViagem || modalEscolherVeiculoChecklist || modalCombustivel || modalPedagio || !!kmRetorno} />
      <View style={styles.headerHub}>
        <View>
          <Text style={styles.txtOla}>Olá, {nomeMotorista}</Text>
          <Text style={styles.txtCargo}>Motorista • Frota Junco</Text>
        </View>
        {!viagemAtiva && (
          <TouchableOpacity onPress={() => executar(async () => { await sair(); await AsyncStorage.removeItem('@motorista_nome'); aoDeslogar(); })} style={styles.btnSair}>
            <Text style={styles.txtSair}>Sair</Text>
          </TouchableOpacity>
        )}
      </View>

      {viagemAtiva ? (
        /* ================= ESTADO 1: TRAVADO EM VIAGEM ================= */
        <View style={styles.containerCentralizado}>
          <View style={styles.cardStatusViagem}>
            <Text style={styles.tagEmViagem}>🚚 VIAGEM EM ANDAMENTO</Text>
            <Text style={styles.nomeVeiculoViagem}>{viagemAtiva.nomeVeiculo}</Text>
            <Text style={styles.placaVeiculoViagem}>Placa: {viagemAtiva.placa}</Text>
            <Text style={styles.horaSaidaViagem}>Saída: {viagemAtiva.dataHoraSaida}</Text>
          </View>

          {alertaViagemAtiva && (
            <View style={[styles.boxAlertaRevisao, alertaViagemAtiva.tipo === 'vencida' ? styles.alertaVencida : styles.alertaProxima]}>
              <Text style={styles.txtTituloAlerta}>{alertaViagemAtiva.titulo}</Text>
              <Text style={styles.txtDescAlerta}>{alertaViagemAtiva.mensagem}</Text>
            </View>
          )}

          <Text style={styles.msgTrava}>⚠️ Checklist bloqueado até a finalização da viagem.</Text>

          <TouchableOpacity style={[styles.btnRota, { backgroundColor: '#e65100' }]} onPress={() => setModalCombustivel(true)}>
            <Text style={styles.txtBtnRota}>⛽ Lançar Combustível</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btnRota, { backgroundColor: '#6a1b9a' }]} onPress={() => setModalPedagio(true)}>
            <Text style={styles.txtBtnRota}>💳 Lançar Pedágio</Text>
          </TouchableOpacity>

          <TextInput style={styles.input} placeholder="KM final da viagem" placeholderTextColor="#888"
            keyboardType="numeric" value={kmRetorno} onChangeText={setKmRetorno} editable={!ocupado} />
          <TouchableOpacity disabled={ocupado} style={[styles.btnRota, { backgroundColor: '#2e7d32', marginTop: 15 }]} onPress={finalizarViagemAtual}>
            <Text style={styles.txtBtnRota}>🏁 Finalizar Viagem / Cheguei</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* ================= ESTADO 2: NO PÁTIO ================= */
        <View style={styles.containerCentralizado}>
          <Text style={styles.msgOrientacao}>Selecione uma opção:</Text>

          <TouchableOpacity 
            style={[styles.btnCentralGrande, { backgroundColor: '#0288d1' }]} 
            onPress={() => setModalEscolherVeiculoViagem(true)}
          >
            <Text style={styles.iconeGrande}>▶️</Text>
            <Text style={styles.txtTituloBotao}>Iniciar Viagem</Text>
            <Text style={styles.txtSubBotao}>Selecione o veículo para sair</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.btnCentralGrande, { backgroundColor: '#2e7d32' }]} 
            onPress={() => setModalEscolherVeiculoChecklist(true)}
          >
            <Text style={styles.iconeGrande}>📋</Text>
            <Text style={styles.txtTituloBotao}>Fazer Checklist</Text>
            <Text style={styles.txtSubBotao}>Inspeção preventiva do veículo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* MODAL: SELECIONAR VEÍCULO PARA VIAGEM */}
      <Modal visible={modalEscolherVeiculoViagem} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Iniciar Viagem</Text>
            <Text style={styles.modalSub}>Toque no veículo para iniciar:</Text>

            <FlatList 
              data={veiculos.filter(v => v.status === 'Liberado')} 
              keyExtractor={i => i.id}
              style={{ maxHeight: 300, marginVertical: 10 }}
              renderItem={({ item }) => {
                const alerta = verificarAlertaRevisao(item.ultimoKm, item.proximaRevisaoKm);
                return (
                  <TouchableOpacity style={styles.itemVeiculoLista} onPress={() => selecionarVeiculoParaViagem(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txtItemNome}>{item.nome}</Text>
                      <Text style={styles.txtItemPlaca}>{item.placa} • {item.tipo || 'Caminhão'}</Text>
                      {alerta && (
                        <Text style={{ color: alerta.tipo === 'vencida' ? '#f44336' : '#ff9800', fontSize: 11, fontWeight: 'bold', marginTop: 2 }}>
                          {alerta.tipo === 'vencida' ? '🚨 Revisão Vencida!' : '⚠️ Revisão Próxima!'}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.txtSelecionar}>Iniciar ➔</Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.txtVazio}>Nenhum veículo disponível no pátio.</Text>}
            />

            <TouchableOpacity style={styles.btnCancelarModal} onPress={() => setModalEscolherVeiculoViagem(false)}>
              <Text style={styles.txtBotao}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: SELECIONAR VEÍCULO PARA CHECKLIST */}
      <Modal visible={modalEscolherVeiculoChecklist} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Fazer Checklist</Text>
            <Text style={styles.modalSub}>Selecione o veículo para realizar a inspeção:</Text>

            <FlatList 
              data={veiculos} 
              keyExtractor={i => i.id}
              style={{ maxHeight: 300, marginVertical: 10 }}
              renderItem={({ item }) => {
                const alerta = verificarAlertaRevisao(item.ultimoKm, item.proximaRevisaoKm);
                return (
                  <TouchableOpacity 
                    style={styles.itemVeiculoLista} 
                    onPress={() => {
                      setModalEscolherVeiculoChecklist(false);
                      navigation.navigate('Checklist', { veiculo: item });
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txtItemNome}>{item.nome}</Text>
                      <Text style={styles.txtItemPlaca}>{item.placa}</Text>
                      {alerta && (
                        <Text style={{ color: alerta.tipo === 'vencida' ? '#f44336' : '#ff9800', fontSize: 11, fontWeight: 'bold', marginTop: 2 }}>
                          {alerta.tipo === 'vencida' ? '🚨 Revisão Vencida!' : '⚠️ Revisão Próxima!'}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.txtSelecionar}>Inspecionar ➔</Text>
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity style={styles.btnCancelarModal} onPress={() => setModalEscolherVeiculoChecklist(false)}>
              <Text style={styles.txtBotao}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: COMBUSTÍVEL */}
      <Modal visible={modalCombustivel} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>⛽ Lançar Combustível</Text>
            <Text style={styles.modalSub}>{viagemAtiva?.nomeVeiculo} ({viagemAtiva?.placa})</Text>

            <Text style={styles.labelModal}>Valor Total Pago (R$) *</Text>
            <TextInput 
              style={[styles.inputModal, { fontSize: 18, fontWeight: 'bold', color: '#4caf50' }]} 
              placeholder="Ex: 350.00" 
              placeholderTextColor="#666" 
              keyboardType="numeric" 
              value={valorCombustivel} 
              onChangeText={setValorCombustivel} 
            />

            <Text style={styles.labelModal}>Quantidade de Litros *</Text>
            <TextInput 
              style={styles.inputModal} 
              placeholder="Ex: 60.5" 
              placeholderTextColor="#666" 
              keyboardType="numeric" 
              value={litrosCombustivel} 
              onChangeText={setLitrosCombustivel} 
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
              <TouchableOpacity style={[styles.btnModalAcao, { backgroundColor: '#e65100', flex: 1 }]} onPress={salvarCombustivel}>
                <Text style={styles.txtBotao}>Salvar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnModalAcao, { backgroundColor: '#333' }]} onPress={() => setModalCombustivel(false)}>
                <Text style={styles.txtBotao}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: PEDÁGIO */}
      <Modal visible={modalPedagio} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>💳 Lançar Pedágio</Text>
            <Text style={styles.modalSub}>{viagemAtiva?.nomeVeiculo} ({viagemAtiva?.placa})</Text>

            <Text style={styles.labelModal}>Valor do Pedágio (R$) *</Text>
            <TextInput 
              style={[styles.inputModal, { fontSize: 20, fontWeight: 'bold', color: '#4caf50' }]} 
              placeholder="Ex: 12.50" 
              placeholderTextColor="#666" 
              keyboardType="numeric" 
              value={valorPedagio} 
              onChangeText={setValorPedagio} 
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
              <TouchableOpacity style={[styles.btnModalAcao, { backgroundColor: '#6a1b9a', flex: 1 }]} onPress={salvarPedagio}>
                <Text style={styles.txtBotao}>Salvar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnModalAcao, { backgroundColor: '#333' }]} onPress={() => setModalPedagio(false)}>
                <Text style={styles.txtBotao}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ================= ESTILOS =================
const styles = StyleSheet.create({
  containerLogin: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', paddingHorizontal: 25 },
  tituloApp: { color: '#5db0d6', fontSize: 24, fontWeight: 'bold' },
  subtituloApp: { color: '#888', marginBottom: 25, fontSize: 14 },
  input: { backgroundColor: '#1a1a1a', color: '#fff', padding: 13, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  botaoPrincipal: { backgroundColor: '#5db0d6', padding: 14, borderRadius: 8, alignItems: 'center' },
  txtBotao: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  containerHub: { flex: 1, backgroundColor: '#121212' },
  headerHub: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  txtOla: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  txtCargo: { color: '#888', fontSize: 12 },
  btnSair: { backgroundColor: '#222', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: '#333' },
  txtSair: { color: '#f44', fontWeight: 'bold', fontSize: 13 },

  containerCentralizado: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  msgOrientacao: { color: '#888', fontSize: 15, textAlign: 'center', marginBottom: 20 },
  
  btnCentralGrande: { width: '100%', paddingVertical: 25, paddingHorizontal: 20, borderRadius: 14, marginBottom: 18, alignItems: 'center', elevation: 4 },
  iconeGrande: { fontSize: 36, marginBottom: 6 },
  txtTituloBotao: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  txtSubBotao: { color: '#e0e0e0', fontSize: 13, marginTop: 4 },

  cardStatusViagem: { backgroundColor: '#01579b', padding: 18, borderRadius: 12, marginBottom: 12, alignItems: 'center' },
  tagEmViagem: { color: '#b3e5fc', fontWeight: 'bold', fontSize: 12, letterSpacing: 1 },
  nomeVeiculoViagem: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 4 },
  placaVeiculoViagem: { color: '#e1f5fe', fontSize: 15 },
  horaSaidaViagem: { color: '#b3e5fc', fontSize: 12, marginTop: 4 },
  msgTrava: { color: '#ff8a80', fontSize: 12, textAlign: 'center', marginBottom: 15, fontWeight: 'bold' },

  boxAlertaRevisao: { padding: 14, borderRadius: 10, marginBottom: 15, borderWidth: 1.5, alignItems: 'center' },
  alertaProxima: { backgroundColor: '#3e2723', borderColor: '#ff9800' },
  alertaVencida: { backgroundColor: '#b71c1c', borderColor: '#ff5252' },
  txtTituloAlerta: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 4 },
  txtDescAlerta: { color: '#fff', fontSize: 13, textAlign: 'center', fontWeight: 'bold' },

  btnRota: { width: '100%', padding: 16, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
  txtBtnRota: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  itemVeiculoLista: { backgroundColor: '#282828', padding: 14, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  txtItemNome: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  txtItemPlaca: { color: '#aaa', fontSize: 13 },
  txtSelecionar: { color: '#5db0d6', fontWeight: 'bold', fontSize: 13 },
  txtVazio: { color: '#888', textAlign: 'center', marginVertical: 15 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  modalTitulo: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  modalSub: { color: '#aaa', fontSize: 13, marginBottom: 10 },
  labelModal: { color: '#aaa', fontSize: 12, marginTop: 10, marginBottom: 4 },
  inputModal: { backgroundColor: '#282828', color: '#fff', padding: 11, borderRadius: 6, borderWidth: 1, borderColor: '#444' },
  btnModalAcao: { padding: 12, borderRadius: 6, alignItems: 'center' },
  btnCancelarModal: { backgroundColor: '#333', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 10 },

  divisorSecao: { color: '#5db0d6', fontSize: 15, fontWeight: 'bold', marginTop: 18, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#282828', paddingBottom: 4 },
  boxPergunta: { backgroundColor: '#1a1a1a', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#262626' },
  txtPergunta: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
  linhaOpcoes: { flexDirection: 'row', gap: 8 },
  btnOpcao: { flex: 1, paddingVertical: 10, backgroundColor: '#262626', borderRadius: 6, alignItems: 'center' },
  txtOpcao: { color: '#888', fontWeight: 'bold', fontSize: 12 },
  txtOpcaoAtiva: { color: '#fff' },
  btnBom: { backgroundColor: '#2e7d32' },
  btnRegular: { backgroundColor: '#f57c00' },
  btnRuim: { backgroundColor: '#c62828' },
  btnOpcaoNao: { backgroundColor: '#388e3c' },
  boxCondicional: { backgroundColor: '#251a1a', padding: 10, borderRadius: 6, marginBottom: 10, borderWidth: 1, borderColor: '#d32f2f' },
  txtCondicional: { color: '#ff8a80', fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  
  boxLembreteAmarelo: { backgroundColor: '#fff3cd', borderColor: '#ffeeba', borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 6, marginBottom: 14 },
  txtLembreteAmarelo: { color: '#856404', fontSize: 13, fontWeight: 'bold', lineHeight: 18, textAlign: 'center' },

  gridFotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  cardFoto: { width: '48%', backgroundColor: '#1a1a1a', padding: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#282828', marginBottom: 10 },
  txtLabelFoto: { color: '#ccc', fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  txtSubFoto: { color: '#ffb74d', fontSize: 10, textAlign: 'center', marginBottom: 6, fontWeight: 'bold' },
  placeholderFoto: { width: '100%', height: 75, backgroundColor: '#000', borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  previewFoto: { width: '100%', height: 75, borderRadius: 6, marginBottom: 8, resizeMode: 'cover' },
  btnTirarFoto: { backgroundColor: '#333', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4, width: '100%', alignItems: 'center' },
  txtBtnFoto: { color: '#5db0d6', fontSize: 12, fontWeight: 'bold' }
});

const Stack = createNativeStackNavigator();

export default function Index() {
  const [estaLogado, setEstaLogado] = useState(null);
  const [erroSessao, setErroSessao] = useState('');

  useEffect(() => {
    let ativo = true;
    let versao = 0;
    const cancelar = observarSessao(user => {
      const atual = ++versao;
      if (!user) { if (ativo) setEstaLogado(false); return; }
      setTimeout(() => {
        perfilAtual().then(perfil => {
          if (ativo && atual === versao) {
            void AsyncStorage.setItem('@motorista_nome', formatarPrimeiroNome(perfil.nome));
            setErroSessao('');
            setEstaLogado(true);
          }
        }).catch(error => {
          if (ativo && atual === versao) { setEstaLogado(false); setErroSessao(error.message); }
        });
      }, 0);
    }, error => { if (ativo) { setEstaLogado(false); setErroSessao(error.message); } });
    return () => { ativo = false; cancelar(); };
  }, []);

  if (estaLogado === null) return null;

  return (
    <NavigationContainer independent={true}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!estaLogado ? (
          <Stack.Screen name="Login">{(p) => <LoginScreen {...p} erroSessao={erroSessao} aoLogar={() => { setErroSessao(''); setEstaLogado(true); }} />}</Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Home">{(p) => <HomeScreen {...p} aoDeslogar={() => setEstaLogado(false)} />}</Stack.Screen>
            <Stack.Screen name="Checklist" component={ChecklistScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
