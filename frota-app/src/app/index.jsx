import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, 
  Modal, ScrollView, ActivityIndicator, Alert, Image, LogBox, BackHandler 
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SignatureScreen from 'react-native-signature-canvas';
import * as ImagePicker from 'expo-image-picker';

// Ignora avisos de reconexão do Firebase
LogBox.ignoreLogs(['@firebase/firestore: Firestore', 'WebChannelConnection RPC']);

// Firebase com proteção contra Fast Refresh e Long Polling
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  initializeAuth, 
  getAuth, 
  getReactNativePersistence, 
  signInWithEmailAndPassword, 
  signOut 
} from "firebase/auth";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { 
  initializeFirestore, 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  doc, 
  updateDoc, 
  query, 
  where 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBPAkWJJOJUkVzohGS_Kg4ipJnAlN0fZ6M",
  authDomain: "projeto-logistica-junco-698b4.firebaseapp.com",
  projectId: "projeto-logistica-junco-698b4",
  storageBucket: "projeto-logistica-junco-698b4.firebasestorage.app",
  messagingSenderId: "1071762650483",
  appId: "1:1071762650483:web:9dee91a05229737ab30106"
};

const appFirebase = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let auth;
try {
  auth = initializeAuth(appFirebase, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
  });
} catch {
  auth = getAuth(appFirebase);
}

let db;
try {
  db = initializeFirestore(appFirebase, {
    experimentalForceLongPolling: true,
  });
} catch {
  db = getFirestore(appFirebase);
}

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
function LoginScreen({ aoLogar }) {
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);

  const fazerLogin = async () => {
    if (nome.trim().length < 2 || senha.trim().length < 4) {
      return Alert.alert("Atenção", "Preencha seu usuário e senha.");
    }
    setCarregando(true);
    let inputNome = nome.trim().toLowerCase();
    const emailFormatado = inputNome.includes('@') ? inputNome : `${inputNome}@junco.com.br`;

    try {
      await signInWithEmailAndPassword(auth, emailFormatado, senha);
      const primeiroNome = formatarPrimeiroNome(inputNome);
      await AsyncStorage.setItem('@motorista_nome', primeiroNome);
      aoLogar();
    } catch {
      Alert.alert("Erro", "Usuário ou senha incorretos.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <View style={styles.containerLogin}>
      <Text style={styles.tituloApp}>🚛 Frota Junco</Text>
      <Text style={styles.subtituloApp}>Acesso do Motorista</Text>

      <TextInput 
        style={styles.input} 
        placeholder="Usuário (ex: marcio)" 
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

  useEffect(() => {
    AsyncStorage.getItem('@motorista_nome').then(n => { 
      if (n) setNomeMotorista(formatarPrimeiroNome(n)); 
    });

    AsyncStorage.getItem('@viagem_ativa_local').then(v => {
      if (v) {
        try {
          setViagemAtiva(JSON.parse(v));
        } catch {}
      }
    });

    const unsubVeiculos = onSnapshot(collection(db, 'veiculos'), (snap) => {
      setVeiculos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => unsubVeiculos();
  }, []);

  useEffect(() => {
    if (!nomeMotorista) return;

    const q = query(
      collection(db, 'viagens'),
      where('motorista', '==', nomeMotorista),
      where('status', '==', 'Em Andamento')
    );

    const unsubViagem = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const dadosViagem = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setViagemAtiva(dadosViagem);
        AsyncStorage.setItem('@viagem_ativa_local', JSON.stringify(dadosViagem));
      } else {
        setViagemAtiva(null);
        AsyncStorage.removeItem('@viagem_ativa_local');
      }
    });

    return () => unsubViagem();
  }, [nomeMotorista]);

  useEffect(() => {
    const backAction = () => {
      if (viagemAtiva) return true;
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [viagemAtiva]);

  const executarInicioViagem = async (veiculoSelecionado) => {
    setModalEscolherVeiculoViagem(false);
    const dataHoraAtual = new Date().toLocaleString('pt-BR');

    try {
      const docRef = await addDoc(collection(db, 'viagens'), {
        veiculoId: veiculoSelecionado.id,
        placa: veiculoSelecionado.placa,
        nomeVeiculo: veiculoSelecionado.nome,
        motorista: nomeMotorista,
        destino: 'Em Rota',
        kmInicial: veiculoSelecionado.ultimoKm !== '-' ? Number(veiculoSelecionado.ultimoKm) : null,
        kmFinal: null,
        kmPercorrido: null,
        dataHoraSaida: dataHoraAtual,
        dataHoraSaidaTimestamp: new Date().toISOString(),
        dataHoraRetorno: null,
        status: 'Em Andamento'
      });

      const novaViagem = {
        id: docRef.id,
        veiculoId: veiculoSelecionado.id,
        placa: veiculoSelecionado.placa,
        nomeVeiculo: veiculoSelecionado.nome,
        motorista: nomeMotorista,
        dataHoraSaida: dataHoraAtual,
        status: 'Em Andamento'
      };

      setViagemAtiva(novaViagem);
      await AsyncStorage.setItem('@viagem_ativa_local', JSON.stringify(novaViagem));

      await updateDoc(doc(db, 'veiculos', veiculoSelecionado.id), {
        status: 'Em Trânsito',
        motoristaAtual: nomeMotorista,
        destinoAtual: 'Em Rota',
        horaSaidaAtual: dataHoraAtual,
        ultimoMotorista: nomeMotorista,
        ultimaAtualizacao: dataHoraAtual
      });
    } catch {
      Alert.alert("Erro", "Não foi possível iniciar a viagem.");
    }
  };

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

  const finalizarViagemAtual = async () => {
    if (!viagemAtiva) return;
    const dataHoraAtual = new Date().toLocaleString('pt-BR');

    try {
      await updateDoc(doc(db, 'viagens', viagemAtiva.id), {
        dataHoraRetorno: dataHoraAtual,
        status: 'Finalizada'
      });

      await updateDoc(doc(db, 'veiculos', viagemAtiva.veiculoId), {
        status: 'Liberado',
        motoristaAtual: '-',
        destinoAtual: '-',
        horaSaidaAtual: '-',
        ultimoMotorista: nomeMotorista,
        ultimaAtualizacao: dataHoraAtual
      });

      await AsyncStorage.removeItem('@viagem_ativa_local');
      setViagemAtiva(null);
    } catch {
      Alert.alert("Erro", "Falha ao finalizar a viagem.");
    }
  };

  const salvarCombustivel = async () => {
    if (!valorCombustivel.trim() || !litrosCombustivel.trim()) {
      return Alert.alert("Atenção", "É obrigatório informar o Valor Total e a quantidade de Litros!");
    }
    const dataHoraAtual = new Date().toLocaleString('pt-BR');

    try {
      await addDoc(collection(db, 'abastecimentos'), {
        veiculoId: viagemAtiva.veiculoId,
        placa: viagemAtiva.placa,
        nomeVeiculo: viagemAtiva.nomeVeiculo,
        motorista: nomeMotorista,
        litros: Number(litrosCombustivel),
        valorTotal: Number(valorCombustivel),
        dataRegistro: dataHoraAtual,
        dataRegistroTimestamp: new Date().toISOString()
      });

      Alert.alert("Sucesso!", `Abastecimento de R$ ${valorCombustivel} (${litrosCombustivel} L) registrado.`);
      setModalCombustivel(false);
      setValorCombustivel('');
      setLitrosCombustivel('');
    } catch {
      Alert.alert("Erro", "Falha ao salvar combustível.");
    }
  };

  const salvarPedagio = async () => {
    if (!valorPedagio.trim()) {
      return Alert.alert("Atenção", "Informe o valor do pedágio!");
    }
    const dataHoraAtual = new Date().toLocaleString('pt-BR');

    try {
      await addDoc(collection(db, 'pedagios'), {
        veiculoId: viagemAtiva.veiculoId,
        placa: viagemAtiva.placa,
        nomeVeiculo: viagemAtiva.nomeVeiculo,
        motorista: nomeMotorista,
        valor: Number(valorPedagio),
        dataRegistro: dataHoraAtual,
        dataRegistroTimestamp: new Date().toISOString()
      });

      Alert.alert("Sucesso!", `Pedágio de R$ ${valorPedagio} registrado.`);
      setModalPedagio(false);
      setValorPedagio('');
    } catch {
      Alert.alert("Erro", "Falha ao salvar pedágio.");
    }
  };

  const veiculoEmViagem = viagemAtiva ? veiculos.find(v => v.id === viagemAtiva.veiculoId) : null;
  const alertaViagemAtiva = veiculoEmViagem ? verificarAlertaRevisao(veiculoEmViagem.ultimoKm, veiculoEmViagem.proximaRevisaoKm) : null;

  return (
    <View style={styles.containerHub}>
      <View style={styles.headerHub}>
        <View>
          <Text style={styles.txtOla}>Olá, {nomeMotorista}</Text>
          <Text style={styles.txtCargo}>Motorista • Frota Junco</Text>
        </View>
        {!viagemAtiva && (
          <TouchableOpacity onPress={async () => { await signOut(auth); aoDeslogar(); }} style={styles.btnSair}>
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

          <TouchableOpacity style={[styles.btnRota, { backgroundColor: '#2e7d32', marginTop: 15 }]} onPress={finalizarViagemAtual}>
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

// ================= TELA 3: CHECKLIST DE INSPEÇÃO DETALHADO =================
function ChecklistScreen({ route, navigation }) {
  const { veiculo } = route.params;
  const [nomeM, setNomeM] = useState('');
  const [km, setKm] = useState(veiculo.ultimoKm && veiculo.ultimoKm !== '-' ? veiculo.ultimoKm : '');
  const [proximaRevisao, setProximaRevisao] = useState(veiculo.proximaRevisaoKm && veiculo.proximaRevisaoKm !== '-' ? String(veiculo.proximaRevisaoKm) : '');

  // Fluidos
  const [oleoMotor, setOleoMotor] = useState('BOM');
  const [nivelAgua, setNivelAgua] = useState('BOM');
  const [fluidoFreio, setFluidoFreio] = useState('BOM');

  // Pneus
  const [pneuDE, setPneuDE] = useState('BOM');
  const [pneuDD, setPneuDD] = useState('BOM');
  const [pneuTE, setPneuTE] = useState('BOM');
  const [pneuTD, setPneuTD] = useState('BOM');

  // Faróis e Iluminação
  const [farolD, setFarolD] = useState('OK');
  const [farolE, setFarolE] = useState('OK');
  const [ilumTraseiraE, setIlumTraseiraE] = useState('OK');
  const [ilumTraseiraD, setIlumTraseiraD] = useState('OK');

  // Setas
  const [setaE, setSetaE] = useState('OK');
  const [setaEDetalhe, setSetaEDetalhe] = useState('FRENTE');
  const [setaD, setSetaD] = useState('OK');
  const [setaDDetalhe, setSetaDDetalhe] = useState('FRENTE');

  // Baú
  const [cadeadoBau, setCadeadoBau] = useState('SIM');

  // Limpeza
  const [limpezaGeral, setLimpezaGeral] = useState('BOM');
  const [limpezaCabine, setLimpezaCabine] = useState('BOM');

  // Observação
  const [temObs, setTemObs] = useState('NAO');
  const [textoObs, setTextoObs] = useState('');

  // 6 Fotos
  const [fotos, setFotos] = useState({
    painel: '',
    cabine: '',
    ldEsq: '',
    ldDir: '',
    traseira: '',
    frente: ''
  });

  const [modalAssinatura, setModalAssinatura] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const refAssinatura = useRef();

  useEffect(() => { 
    AsyncStorage.getItem('@motorista_nome').then(n => {
      if (n) setNomeM(formatarPrimeiroNome(n)); 
    }); 
  }, []);

  const alertaChecklist = verificarAlertaRevisao(km, proximaRevisao);

  const executarCamera = async (campo) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permissão", "É necessária a permissão da câmera para registrar as fotos.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker?.CameraType?.back || 'back',
        allowsEditing: false,
        quality: 0.08,
        base64: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setFotos(prev => ({
          ...prev,
          [campo]: `data:image/jpeg;base64,${result.assets[0].base64}`
        }));
      }
    } catch {
      const res = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        quality: 0.08,
        base64: true
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setFotos(prev => ({
          ...prev,
          [campo]: `data:image/jpeg;base64,${res.assets[0].base64}`
        }));
      }
    }
  };

  const capturarFoto = (campo) => {
    if (campo === 'painel') {
      Alert.alert(
        "Foto do Painel",
        "A foto do painel deve conter o KM do veículo bem nítido e legível!",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Tirar Foto", onPress: () => executarCamera(campo) }
        ]
      );
      return;
    }

    if (campo === 'cabine') {
      Alert.alert(
        "Foto da Cabine",
        "A foto deve enquadrar a cabine inteira (bancos e painel), mostrando o estado de limpeza e conservação!",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Tirar Foto", onPress: () => executarCamera(campo) }
        ]
      );
      return;
    }

    executarCamera(campo);
  };

  const Seletor3 = ({ label, valor, setValor }) => (
    <View style={styles.boxPergunta}>
      <Text style={styles.txtPergunta}>{label}</Text>
      <View style={styles.linhaOpcoes}>
        {['BOM', 'REGULAR', 'RUIM'].map(opt => (
          <TouchableOpacity
            key={opt}
            onPress={() => setValor(opt)}
            style={[
              styles.btnOpcao,
              valor === opt && (opt === 'BOM' ? styles.btnBom : opt === 'REGULAR' ? styles.btnRegular : styles.btnRuim)
            ]}
          >
            <Text style={[styles.txtOpcao, valor === opt && styles.txtOpcaoAtiva]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const Seletor2 = ({ label, valor, setValor, op1 = 'OK', op2 = 'DEFEITO' }) => (
    <View style={styles.boxPergunta}>
      <Text style={styles.txtPergunta}>{label}</Text>
      <View style={styles.linhaOpcoes}>
        {[op1, op2].map(opt => (
          <TouchableOpacity
            key={opt}
            onPress={() => setValor(opt)}
            style={[
              styles.btnOpcao,
              valor === opt && (opt === 'OK' || opt === 'SIM' ? styles.btnBom : styles.btnRuim)
            ]}
          >
            <Text style={[styles.txtOpcao, valor === opt && styles.txtOpcaoAtiva]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // Validação de alteração do KM antes de abrir a assinatura
  const validarEAvancarAssinatura = () => {
    if (!km.trim()) {
      return Alert.alert("Atenção", "Informe o KM atual antes de assinar!");
    }

    const kmAnterior = String(veiculo.ultimoKm || '').trim();
    if (kmAnterior && kmAnterior !== '-' && km.trim() === kmAnterior) {
      Alert.alert(
        "Atenção ao KM",
        "O KM atual não teve alteração em relação ao último registrado. Deseja prosseguir mesmo assim?",
        [
          { text: "Não / Corrigir", style: "cancel" },
          { text: "Sim, prosseguir", onPress: () => setModalAssinatura(true) }
        ]
      );
      return;
    }

    setModalAssinatura(true);
  };

  const finalizarChecklist = async (assinatura) => {
    if (!km.trim()) {
      return Alert.alert("Atenção", "Informe o KM atual!");
    }

    setSalvando(true);
    const dataAtual = new Date().toLocaleString('pt-BR');

    const avariasEncontradas = [];
    if (oleoMotor === 'RUIM') avariasEncontradas.push("Óleo do Motor Ruim");
    if (nivelAgua === 'RUIM') avariasEncontradas.push("Nível de Água Ruim");
    if (fluidoFreio === 'RUIM') avariasEncontradas.push("Fluido de Freio Ruim");
    if (pneuDE === 'RUIM') avariasEncontradas.push("Pneu Dianteiro Esquerdo Ruim");
    if (pneuDD === 'RUIM') avariasEncontradas.push("Pneu Dianteiro Direito Ruim");
    if (pneuTE === 'RUIM') avariasEncontradas.push("Pneu Traseiro Esquerdo Ruim");
    if (pneuTD === 'RUIM') avariasEncontradas.push("Pneu Traseiro Direito Ruim");
    if (farolD === 'DEFEITO') avariasEncontradas.push("Farol Direito com Defeito");
    if (farolE === 'DEFEITO') avariasEncontradas.push("Farol Esquerdo com Defeito");
    if (setaE === 'QUEIMADO') avariasEncontradas.push(`Seta Esquerda Queimada (${setaEDetalhe})`);
    if (setaD === 'QUEIMADO') avariasEncontradas.push(`Seta Direita Queimada (${setaDDetalhe})`);
    if (ilumTraseiraE === 'DEFEITO') avariasEncontradas.push("Iluminação Traseira Esquerda com Defeito");
    if (ilumTraseiraD === 'DEFEITO') avariasEncontradas.push("Iluminação Traseira Direita com Defeito");
    if (cadeadoBau === 'NAO') avariasEncontradas.push("Sem Cadeado no Baú");
    if (limpezaGeral === 'RUIM') avariasEncontradas.push("Limpeza Geral Ruim");
    if (limpezaCabine === 'RUIM') avariasEncontradas.push("Limpeza da Cabine Ruim");

    const statusChecklist = avariasEncontradas.length > 0 ? 'Avaria' : 'Liberado';
    const detalheAvaria = avariasEncontradas.length > 0 ? avariasEncontradas.join(', ') : 'Nenhuma';

    const checklistCompleto = {
      veiculoId: veiculo.id,
      placa: veiculo.placa,
      nomeVeiculo: veiculo.nome,
      motorista: nomeM,
      km: km.trim(),
      proximaRevisaoKm: proximaRevisao.trim() || '-',
      status: statusChecklist,
      dataHoraFormatada: dataAtual,
      dataHoraCriacao: new Date().toISOString(),
      itens: [
        { label: 'Óleo do Motor', valor: oleoMotor, ok: oleoMotor !== 'RUIM' },
        { label: 'Nível de Água', valor: nivelAgua, ok: nivelAgua !== 'RUIM' },
        { label: 'Fluido de Freio', valor: fluidoFreio, ok: fluidoFreio !== 'RUIM' },
        { label: 'Pneu Dianteiro Esquerdo (DE)', valor: pneuDE, ok: pneuDE !== 'RUIM' },
        { label: 'Pneu Dianteiro Direito (DD)', valor: pneuDD, ok: pneuDD !== 'RUIM' },
        { label: 'Pneu Traseiro Esquerdo (TE)', valor: pneuTE, ok: pneuTE !== 'RUIM' },
        { label: 'Pneu Traseiro Direito (TD)', valor: pneuTD, ok: pneuTD !== 'RUIM' },
        { label: 'Farol Direito', valor: farolD, ok: farolD === 'OK' },
        { label: 'Farol Esquerdo', valor: farolE, ok: farolE === 'OK' },
        { label: 'Seta Esquerda', valor: setaE === 'QUEIMADO' ? `QUEIMADO (${setaEDetalhe})` : 'OK', ok: setaE === 'OK' },
        { label: 'Seta Direita', valor: setaD === 'QUEIMADO' ? `QUEIMADO (${setaDDetalhe})` : 'OK', ok: setaD === 'OK' },
        { label: 'Iluminação Traseira Esquerda', valor: ilumTraseiraE, ok: ilumTraseiraE === 'OK' },
        { label: 'Iluminação Traseira Direita', valor: ilumTraseiraD, ok: ilumTraseiraD === 'OK' },
        { label: 'Cadeado no Baú', valor: cadeadoBau, ok: cadeadoBau === 'SIM' },
        { label: 'Limpeza Geral', valor: limpezaGeral, ok: limpezaGeral !== 'RUIM' },
        { label: 'Limpeza da Cabine', valor: limpezaCabine, ok: limpezaCabine !== 'RUIM' }
      ],
      obsGeral: temObs === 'SIM' ? textoObs : 'Nenhuma observação',
      fotos: fotos,
      assinatura: assinatura
    };

    try {
      await addDoc(collection(db, 'checklists'), checklistCompleto);

      await updateDoc(doc(db, 'veiculos', veiculo.id), {
        status: statusChecklist,
        ultimoKm: km.trim(),
        proximaRevisaoKm: proximaRevisao.trim() || veiculo.proximaRevisaoKm || '-',
        ultimoMotorista: nomeM,
        ultimaAvaria: detalheAvaria,
        ultimaAtualizacao: dataAtual
      });

      setModalAssinatura(false);
      navigation.goBack();
    } catch (error) { 
      Alert.alert("Erro ao Enviar", error.message || "Falha ao salvar o checklist.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <View style={styles.containerHub}>
      <ScrollView contentContainerStyle={{ paddingBottom: 50, paddingTop: 45, paddingHorizontal: 16 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#5db0d6', marginBottom: 10, fontSize: 16 }}>← Voltar</Text>
        </TouchableOpacity>
        
        <Text style={styles.tituloApp}>Checklist: {veiculo.nome}</Text>
        <Text style={{ color: '#aaa', marginBottom: 15 }}>Placa: {veiculo.placa}</Text>

        {alertaChecklist && (
          <View style={[styles.boxAlertaRevisao, alertaChecklist.tipo === 'vencida' ? styles.alertaVencida : styles.alertaProxima]}>
            <Text style={styles.txtTituloAlerta}>{alertaChecklist.titulo}</Text>
            <Text style={styles.txtDescAlerta}>{alertaChecklist.mensagem}</Text>
          </View>
        )}
        
        {/* 1. KM ATUAL */}
        <Text style={styles.labelModal}>KM ATUAL *</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Ex: 58200" 
          placeholderTextColor="#666" 
          keyboardType="numeric" 
          value={km} 
          onChangeText={setKm} 
        />

        {/* 2. PRÓXIMA REVISÃO */}
        <Text style={styles.labelModal}>KM DA PRÓXIMA REVISÃO *</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Ex: 60000" 
          placeholderTextColor="#666" 
          keyboardType="numeric" 
          value={proximaRevisao} 
          onChangeText={setProximaRevisao} 
        />

        {/* NÍVEIS DE FLUIDOS */}
        <Text style={styles.divisorSecao}>Níveis & Fluidos</Text>
        <Seletor3 label="Óleo do Motor:" valor={oleoMotor} setValor={setOleoMotor} />
        <Seletor3 label="Nível de Água / Radiador:" valor={nivelAgua} setValor={setNivelAgua} />
        <Seletor3 label="Fluido de Freio:" valor={fluidoFreio} setValor={setFluidoFreio} />

        {/* ESTADO DOS PNEUS */}
        <Text style={styles.divisorSecao}>Estado dos Pneus</Text>
        <Seletor3 label="Pneu Dianteiro Esquerdo (DE):" valor={pneuDE} setValor={setPneuDE} />
        <Seletor3 label="Pneu Dianteiro Direito (DD):" valor={pneuDD} setValor={setPneuDD} />
        <Seletor3 label="Pneu Traseiro Esquerdo (TE):" valor={pneuTE} setValor={setPneuTE} />
        <Seletor3 label="Pneu Traseiro Direito (TD):" valor={pneuTD} setValor={setPneuTD} />

        {/* ILUMINAÇÃO & FARÓIS */}
        <Text style={styles.divisorSecao}>Iluminação & Faróis</Text>
        <Seletor2 label="Farol Direito (D):" valor={farolD} setValor={setFarolD} />
        <Seletor2 label="Farol Esquerdo (E):" valor={farolE} setValor={setFarolE} />

        {/* SETAS */}
        <Seletor2 label="Seta Esquerda (E):" valor={setaE} setValor={setSetaE} op1="OK" op2="QUEIMADO" />
        {setaE === 'QUEIMADO' && (
          <View style={styles.boxCondicional}>
            <Text style={styles.txtCondicional}>Qual lâmpada está queimada?</Text>
            <View style={styles.linhaOpcoes}>
              {['FRENTE', 'TRASEIRA'].map(det => (
                <TouchableOpacity
                  key={det}
                  onPress={() => setSetaEDetalhe(det)}
                  style={[styles.btnOpcao, setaEDetalhe === det && styles.btnRegular]}
                >
                  <Text style={[styles.txtOpcao, setaEDetalhe === det && styles.txtOpcaoAtiva]}>{det}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <Seletor2 label="Seta Direita (D):" valor={setaD} setValor={setSetaD} op1="OK" op2="QUEIMADO" />
        {setaD === 'QUEIMADO' && (
          <View style={styles.boxCondicional}>
            <Text style={styles.txtCondicional}>Qual lâmpada está queimada?</Text>
            <View style={styles.linhaOpcoes}>
              {['FRENTE', 'TRASEIRA'].map(det => (
                <TouchableOpacity
                  key={det}
                  onPress={() => setSetaDDetalhe(det)}
                  style={[styles.btnOpcao, setaDDetalhe === det && styles.btnRegular]}
                >
                  <Text style={[styles.txtOpcao, setaDDetalhe === det && styles.txtOpcaoAtiva]}>{det}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <Seletor2 label="Iluminação Traseira Esquerda (E):" valor={ilumTraseiraE} setValor={setIlumTraseiraE} />
        <Seletor2 label="Iluminação Traseira Direita (D):" valor={ilumTraseiraD} setValor={setIlumTraseiraD} />

        {/* SEGURANÇA DO BAÚ */}
        <Text style={styles.divisorSecao}>Segurança do Baú</Text>
        <Seletor2 label="Tem Cadeado no Baú?" valor={cadeadoBau} setValor={setCadeadoBau} op1="SIM" op2="NAO" />

        {/* LIMPEZA E CONSERVAÇÃO */}
        <Text style={styles.divisorSecao}>Limpeza & Conservação</Text>
        <Seletor3 label="Limpeza Geral:" valor={limpezaGeral} setValor={setLimpezaGeral} />
        <Seletor3 label="Limpeza da Cabine (Interior):" valor={limpezaCabine} setValor={setLimpezaCabine} />

        {/* LEMBRETE AMARELO */}
        <View style={styles.boxLembreteAmarelo}>
          <Text style={styles.txtLembreteAmarelo}>
            ⚠️ Lembrete: Conserve sempre o veículo o mais limpo possível, principalmente o interior da cabine!
          </Text>
        </View>

        {/* 6 FOTOS */}
        <Text style={styles.divisorSecao}>Registro de Fotos do Veículo</Text>
        <View style={styles.gridFotos}>
          {[
            { id: 'painel', label: 'Foto Painel', sub: 'Conter KM do veículo' },
            { id: 'cabine', label: 'Foto Cabine', sub: 'Cabine toda e limpeza' },
            { id: 'ldEsq', label: 'Lado Esquerdo', sub: 'Lateral completa' },
            { id: 'ldDir', label: 'Lado Direito', sub: 'Lateral completa' },
            { id: 'traseira', label: 'Traseira', sub: 'Lanternas e baú' },
            { id: 'frente', label: 'Frente', sub: 'Faróis e para-choque' }
          ].map(f => (
            <View key={f.id} style={styles.cardFoto}>
              <Text style={styles.txtLabelFoto}>{f.label}</Text>
              <Text style={styles.txtSubFoto}>{f.sub}</Text>
              {fotos[f.id] ? (
                <Image source={{ uri: fotos[f.id] }} style={styles.previewFoto} />
              ) : (
                <View style={styles.placeholderFoto}>
                  <Text style={{ fontSize: 22 }}>📷</Text>
                </View>
              )}
              <TouchableOpacity style={styles.btnTirarFoto} onPress={() => capturarFoto(f.id)}>
                <Text style={styles.txtBtnFoto}>{fotos[f.id] ? 'Trocar' : 'Tirar Foto'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* OBSERVAÇÃO */}
        <Text style={styles.divisorSecao}>Observações Adicionais</Text>
        <View style={styles.boxPergunta}>
          <Text style={styles.txtPergunta}>Alguma Observação?</Text>
          <View style={styles.linhaOpcoes}>
            <TouchableOpacity
              onPress={() => setTemObs('NAO')}
              style={[styles.btnOpcao, temObs === 'NAO' && styles.btnOpcaoNao]}
            >
              <Text style={[styles.txtOpcao, temObs === 'NAO' && styles.txtOpcaoAtiva]}>NÃO</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setTemObs('SIM')}
              style={[styles.btnOpcao, temObs === 'SIM' && styles.btnRuim]}
            >
              <Text style={[styles.txtOpcao, temObs === 'SIM' && styles.txtOpcaoAtiva]}>SIM</Text>
            </TouchableOpacity>
          </View>
        </View>

        {temObs === 'SIM' && (
          <TextInput 
            style={[styles.input, { height: 75, textAlignVertical: 'top', marginTop: 8 }]} 
            placeholder="Descreva a observação ou detalhe do veículo..." 
            placeholderTextColor="#666" 
            multiline 
            value={textoObs} 
            onChangeText={setTextoObs} 
          />
        )}

        {/* BOTÃO ASSINATURA */}
        <TouchableOpacity 
          style={[styles.botaoPrincipal, { marginTop: 25, backgroundColor: '#5db0d6' }]} 
          onPress={validarEAvancarAssinatura}
        >
          <Text style={styles.txtBotao}>✍️ Assinar e Enviar Checklist</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* MODAL DE ASSINATURA */}
      <Modal visible={modalAssinatura} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#121212', paddingTop: 45, paddingHorizontal: 15 }}>
          <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, marginBottom: 12 }}>
            Assine com o dedo no quadro branco abaixo:
          </Text>
          <View style={{ height: 350, backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <SignatureScreen 
              ref={refAssinatura} 
              onOK={finalizarChecklist} 
              webStyle={`.m-signature-pad--footer {display: none;}`} 
            />
          </View>
          
          <View style={{ marginTop: 20, gap: 10 }}>
            <TouchableOpacity 
              onPress={() => refAssinatura.current.readSignature()} 
              style={[styles.botaoPrincipal, { backgroundColor: '#4caf50' }]}
              disabled={salvando}
            >
              {salvando ? <ActivityIndicator color="#fff" /> : <Text style={styles.txtBotao}>Confirmar e Enviar</Text>}
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => setModalAssinatura(false)} 
              style={[styles.botaoPrincipal, { backgroundColor: '#333' }]}
            >
              <Text style={styles.txtBotao}>Cancelar</Text>
            </TouchableOpacity>
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

  useEffect(() => { 
    AsyncStorage.getItem('@motorista_nome').then(n => setEstaLogado(n !== null)); 
  }, []);

  if (estaLogado === null) return null;

  return (
    <NavigationContainer independent={true}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!estaLogado ? (
          <Stack.Screen name="Login">{(p) => <LoginScreen {...p} aoLogar={() => setEstaLogado(true)} />}</Stack.Screen>
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