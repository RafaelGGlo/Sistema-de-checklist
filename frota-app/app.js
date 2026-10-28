import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Modal, ScrollView, Switch, ActivityIndicator, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SignatureScreen from 'react-native-signature-canvas';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, signInWithEmailAndPassword, signOut } from "firebase/auth";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, query, where, getDocs } from "firebase/firestore"; 

const firebaseConfig = {
  apiKey: "AIzaSyBPAkWJJOJUkVzohGS_Kg4ipJnAlN0fZ6M",
  authDomain: "projeto-logistica-junco-698b4.firebaseapp.com",
  projectId: "projeto-logistica-junco-698b4",
  storageBucket: "projeto-logistica-junco-698b4.firebasestorage.app",
  messagingSenderId: "1071762650483",
  appId: "1:1071762650483:web:9dee91a05229737ab30106"
};

const appFirebase = initializeApp(firebaseConfig);
const auth = initializeAuth(appFirebase, { persistence: getReactNativePersistence(ReactNativeAsyncStorage) });
const db = getFirestore(appFirebase);

function LoginScreen({ aoLogar }) {
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);

  const fazerLogin = async () => {
    if (nome.trim().length < 2 || senha.trim().length < 4) return Alert.alert("Atenção", "Preencha nome e senha.");
    setCarregando(true);
    let inputNome = nome.trim().toLowerCase();
    const emailFormatado = inputNome.includes('@') ? inputNome : `${inputNome}@junco.com.br`;

    try {
      await signInWithEmailAndPassword(auth, emailFormatado, senha);
      await AsyncStorage.setItem('@motorista_nome', nome.trim().toUpperCase());
      aoLogar();
    } catch {
      Alert.alert("Erro", "Usuário ou senha incorretos.");
    } finally { setCarregando(false); }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Frota Junco</Text>
      <Text style={{ color: '#aaa', marginBottom: 20 }}>Acesso do Motorista</Text>
      <TextInput style={styles.input} placeholder="Seu Nome (ex: paulo)" placeholderTextColor="#666" value={nome} onChangeText={setNome} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Senha" placeholderTextColor="#666" value={senha} onChangeText={setSenha} secureTextEntry />
      <TouchableOpacity style={styles.botao} onPress={fazerLogin} disabled={carregando}>
        {carregando ? <ActivityIndicator color="#fff" /> : <Text style={styles.txtBtn}>Entrar no Sistema</Text>}
      </TouchableOpacity>
    </View>
  );
}

function GaragemScreen({ navigation, aoDeslogar }) {
  const [veiculos, setVeiculos] = useState([]);
  const [nomeMotorista, setNomeMotorista] = useState('');

  // Modais de Viagem
  const [veiculoAcao, setVeiculoAcao] = useState(null);
  const [modalSaida, setModalSaida] = useState(false);
  const [modalChegada, setModalChegada] = useState(false);
  const [kmInput, setKmInput] = useState('');
  const [destinoInput, setDestinoInput] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('@motorista_nome').then(n => { if (n) setNomeMotorista(n); });
    const unsub = onSnapshot(collection(db, 'veiculos'), (snapshot) => {
      setVeiculos(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // 1. INICIAR VIAGEM / SAÍDA
  const confirmarInicioViagem = async () => {
    if (!kmInput || !destinoInput) return Alert.alert("Atenção", "Informe o KM Inicial e o Destino!");
    const dataHoraAtual = new Date().toLocaleString('pt-BR');

    try {
      // Cria registro em 'viagens'
      await addDoc(collection(db, 'viagens'), {
        veiculoId: veiculoAcao.id,
        placa: veiculoAcao.placa,
        nomeVeiculo: veiculoAcao.nome,
        motorista: nomeMotorista,
        destino: destinoInput,
        kmInicial: Number(kmInput),
        kmFinal: null,
        kmPercorrido: null,
        dataHoraSaida: dataHoraAtual,
        dataHoraSaidaTimestamp: new Date().toISOString(),
        dataHoraRetorno: null,
        status: 'Em Andamento'
      });

      // Atualiza status do veículo para 'Em Trânsito'
      await updateDoc(doc(db, 'veiculos', veiculoAcao.id), {
        status: 'Em Trânsito',
        motoristaAtual: nomeMotorista,
        destinoAtual: destinoInput,
        horaSaidaAtual: dataHoraAtual,
        ultimoKm: kmInput,
        ultimoMotorista: nomeMotorista,
        ultimaAtualizacao: dataHoraAtual
      });

      Alert.alert("Boa Viagem!", `Veículo ${veiculoAcao.placa} iniciado com sucesso.`);
      setModalSaida(false);
      setKmInput('');
      setDestinoInput('');
    } catch (e) {
      Alert.alert("Erro", "Falha ao registrar saída.");
    }
  };

  // 2. FINALIZAR VIAGEM / RETORNO
  const confirmarFimViagem = async () => {
    if (!kmInput) return Alert.alert("Atenção", "Informe o KM Final de retorno!");
    const dataHoraAtual = new Date().toLocaleString('pt-BR');
    const kmFinalNum = Number(kmInput);

    try {
      // Busca a viagem em andamento deste veículo
      const q = query(
        collection(db, 'viagens'),
        where('veiculoId', '==', veiculoAcao.id),
        where('status', '==', 'Em Andamento')
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const docViagem = snap.docs[0];
        const dadosViagem = docViagem.data();
        const kmInicialNum = Number(dadosViagem.kmInicial) || kmFinalNum;
        const kmRodado = Math.max(0, kmFinalNum - kmInicialNum);

        await updateDoc(doc(db, 'viagens', docViagem.id), {
          kmFinal: kmFinalNum,
          kmPercorrido: kmRodado,
          dataHoraRetorno: dataHoraAtual,
          status: 'Finalizada'
        });
      }

      // Retorna veículo para o status 'Liberado' (No Pátio)
      await updateDoc(doc(db, 'veiculos', veiculoAcao.id), {
        status: 'Liberado',
        motoristaAtual: '-',
        destinoAtual: '-',
        horaSaidaAtual: '-',
        ultimoKm: kmInput,
        ultimoMotorista: nomeMotorista,
        ultimaAtualizacao: dataHoraAtual
      });

      Alert.alert("Retorno Confirmado!", `Viagem finalizada. Veículo devolvido ao pátio.`);
      setModalChegada(false);
      setKmInput('');
    } catch (e) {
      Alert.alert("Erro", "Falha ao registrar retorno.");
    }
  };

  return (
    <View style={styles.containerGaragem}>
      <View style={styles.headerGaragem}>
        <View>
          <Text style={styles.titulo}>Olá, {nomeMotorista}</Text>
          <Text style={{ color: '#888' }}>Controle de Saída e Inspeções</Text>
        </View>
        <TouchableOpacity onPress={async () => { await signOut(auth); aoDeslogar(); }}>
          <Text style={{ color: '#f44', fontWeight: 'bold' }}>Sair</Text>
        </TouchableOpacity>
      </View>

      <FlatList 
        data={veiculos} 
        keyExtractor={i => i.id} 
        renderItem={({ item }) => {
          const estaComigo = item.status === 'Em Trânsito' && item.motoristaAtual === nomeMotorista;
          const estaComOutro = item.status === 'Em Trânsito' && item.motoristaAtual !== nomeMotorista;

          return (
            <View style={styles.cardVeiculo}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={styles.nomeVeiculo}>{item.nome}</Text>
                  <Text style={{ color: '#aaa' }}>{item.placa} • {item.ultimoKm ? `${item.ultimoKm} KM` : 'KM não reg.'}</Text>
                </View>
                <Text style={{ 
                  color: item.status === 'Avaria' ? '#f44' : item.status === 'Em Trânsito' ? '#0288d1' : '#4caf50', 
                  fontWeight: 'bold', fontSize: 12 
                }}>
                  {item.status === 'Liberado' ? 'NO PÁTIO' : item.status === 'Em Trânsito' ? 'EM VIAGEM' : item.status}
                </Text>
              </View>

              {/* Informação se está na rua */}
              {item.status === 'Em Trânsito' && (
                <View style={styles.infoTransito}>
                  <Text style={{ color: '#b3e5fc', fontSize: 13 }}>
                    👤 Motorista: <strong>{item.motoristaAtual}</strong> {estaComigo ? '(Você)' : ''}
                  </Text>
                  <Text style={{ color: '#b3e5fc', fontSize: 12 }}>
                    📍 Destino: {item.destinoAtual} • Saiu às {item.horaSaidaAtual}
                  </Text>
                </View>
              )}

              {/* Botões de Ação */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {item.status === 'Liberado' && (
                  <TouchableOpacity 
                    style={[styles.btnAcao, { backgroundColor: '#0288d1' }]} 
                    onPress={() => { setVeiculoAcao(item); setKmInput(item.ultimoKm !== '-' ? item.ultimoKm : ''); setModalSaida(true); }}
                  >
                    <Text style={styles.txtBtnAcao}>▶️ Iniciar Viagem</Text>
                  </TouchableOpacity>
                )}

                {estaComigo && (
                  <TouchableOpacity 
                    style={[styles.btnAcao, { backgroundColor: '#2e7d32' }]} 
                    onPress={() => { setVeiculoAcao(item); setKmInput(''); setModalChegada(true); }}
                  >
                    <Text style={styles.txtBtnAcao}>🏁 Cheguei na Empresa</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity 
                  style={[styles.btnAcao, { backgroundColor: '#333' }]} 
                  onPress={() => navigation.navigate('Checklist', { veiculo: item })}
                >
                  <Text style={styles.txtBtnAcao}>📋 Fazer Checklist</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }} 
      />

      {/* MODAL 1: INICIAR VIAGEM */}
      <Modal visible={modalSaida} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Iniciar Viagem / Saída</Text>
            <Text style={{ color: '#aaa', marginBottom: 15 }}>Veículo: {veiculoAcao?.nome} ({veiculoAcao?.placa})</Text>

            <Text style={styles.label}>KM Inicial do Painel:</Text>
            <TextInput style={styles.inputModal} placeholder="Ex: 45200" placeholderTextColor="#666" keyboardType="numeric" value={kmInput} onChangeText={setKmInput} />

            <Text style={styles.label}>Destino / Motivo da Saída:</Text>
            <TextInput style={styles.inputModal} placeholder="Ex: Entrega Campinas / Cliente X" placeholderTextColor="#666" value={destinoInput} onChangeText={setDestinoInput} />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
              <TouchableOpacity style={[styles.botao, { flex: 1, backgroundColor: '#0288d1' }]} onPress={confirmarInicioViagem}>
                <Text style={styles.txtBtn}>Confirmar Saída</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.botao, { backgroundColor: '#333' }]} onPress={() => setModalSaida(false)}>
                <Text style={styles.txtBtn}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: FINALIZAR VIAGEM */}
      <Modal visible={modalChegada} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Finalizar Viagem / Retorno</Text>
            <Text style={{ color: '#aaa', marginBottom: 15 }}>Veículo: {veiculoAcao?.nome} ({veiculoAcao?.placa})</Text>

            <Text style={styles.label}>KM Final no Painel:</Text>
            <TextInput style={styles.inputModal} placeholder="Ex: 45350" placeholderTextColor="#666" keyboardType="numeric" value={kmInput} onChangeText={setKmInput} />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
              <TouchableOpacity style={[styles.botao, { flex: 1, backgroundColor: '#2e7d32' }]} onPress={confirmarFimViagem}>
                <Text style={styles.txtBtn}>Devolver ao Pátio</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.botao, { backgroundColor: '#333' }]} onPress={() => setModalChegada(false)}>
                <Text style={styles.txtBtn}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ChecklistScreen({ route, navigation }) {
  const { veiculo } = route.params;
  const [nomeM, setNomeM] = useState('');
  const [km, setKm] = useState(veiculo.ultimoKm !== '-' ? veiculo.ultimoKm : '');
  const [obsGeral, setObsGeral] = useState('');
  const [modalA, setModalA] = useState(false);
  const refAssinatura = useRef();

  const [itens, setItens] = useState([
    { id: 'oleo', label: 'Óleo do Motor', ok: true, obs: '' },
    { id: 'agua', label: 'Nível de Água', ok: true, obs: '' },
    { id: 'pneu', label: 'Estado dos Pneus', ok: true, obs: '' },
    { id: 'farol', label: 'Faróis e Setas', ok: true, obs: '' },
    { id: 'freio', label: 'Sistemas de Freio', ok: true, obs: '' }
  ]);

  useEffect(() => { AsyncStorage.getItem('@motorista_nome').then(n => setNomeM(n || 'Motorista')); }, []);

  const finalizar = async (assinatura) => {
    setModalA(false);
    const dataAtual = new Date().toLocaleString('pt-BR');
    const problemas = itens.filter(i => !i.ok).map(i => `${i.label}: ${i.obs || 'Com defeito'}`);
    const temProblema = problemas.length > 0;
    const statusChecklist = temProblema ? 'Avaria' : 'Liberado';
    const detalheAvaria = temProblema ? problemas.join(', ') : 'Nenhuma';

    try {
      await addDoc(collection(db, 'checklists'), {
        veiculoId: veiculo.id, placa: veiculo.placa, nomeVeiculo: veiculo.nome,
        motorista: nomeM, km, status: statusChecklist, dataHoraFormatada: dataAtual,
        dataHoraCriacao: new Date().toISOString(), obsGeral, itens, assinatura
      });

      const refVeiculo = doc(db, 'veiculos', veiculo.id);
      await updateDoc(refVeiculo, {
        status: statusChecklist,
        ultimoKm: km,
        ultimoMotorista: nomeM,
        ultimaAvaria: detalheAvaria,
        ultimaAtualizacao: dataAtual
      });
    } catch (e) { console.log("Erro ao salvar:", e); }

    const html = `<html><body style="font-family:Arial;padding:20px;"><h2>Checklist - ${veiculo.nome}</h2><p>Motorista: ${nomeM} | KM: ${km}</p><p>Status: ${statusChecklist}</p></body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
      navigation.goBack();
    } catch { Alert.alert('Erro', 'Não foi possível gerar o PDF.'); }
  };

  return (
    <View style={styles.containerGaragem}>
      <ScrollView>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={{ color: '#5db0d6', marginBottom: 10 }}>← Voltar</Text></TouchableOpacity>
        <Text style={styles.titulo}>Inspeção: {veiculo.placa}</Text>
        <TextInput style={styles.input} placeholder="KM Atual" placeholderTextColor="#666" keyboardType="numeric" value={km} onChangeText={setKm} />
        {itens.map((item, index) => (
          <View key={item.id} style={styles.cardItem}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#fff' }}>{item.label}</Text>
              <Switch value={item.ok} onValueChange={(val) => { const copy = [...itens]; copy[index].ok = val; setItens(copy); }} />
            </View>
            {!item.ok && <TextInput style={styles.inputObs} placeholder="Qual a avaria?" placeholderTextColor="#999" value={item.obs} onChangeText={(t) => { const copy = [...itens]; copy[index].obs = t; setItens(copy); }} />}
          </View>
        ))}
        <TouchableOpacity style={styles.botao} onPress={() => km ? setModalA(true) : Alert.alert('Atenção', 'Informe o KM!')}>
          <Text style={styles.txtBtn}>Assinar e Finalizar</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={modalA} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#121212', paddingTop: 40, paddingHorizontal: 15 }}>
          <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 10 }}>Assine abaixo:</Text>
          <View style={{ height: 350, backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <SignatureScreen ref={refAssinatura} onOK={finalizar} webStyle={`.m-signature-pad--footer {display: none;}`} />
          </View>
          <TouchableOpacity onPress={() => refAssinatura.current.readSignature()} style={[styles.botao, { marginTop: 20, backgroundColor: '#4caf50' }]}>
            <Text style={styles.txtBtn}>Confirmar e Finalizar</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', paddingHorizontal: 20 },
  containerGaragem: { flex: 1, backgroundColor: '#121212', paddingHorizontal: 15, paddingTop: 45 },
  headerGaragem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  titulo: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  input: { backgroundColor: '#1e1e1e', color: '#fff', padding: 14, borderRadius: 8, marginBottom: 12 },
  botao: { backgroundColor: '#5db0d6', padding: 14, borderRadius: 8, alignItems: 'center' },
  txtBtn: { color: '#fff', fontWeight: 'bold' },
  cardVeiculo: { backgroundColor: '#1a1a1a', padding: 15, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#282828' },
  nomeVeiculo: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  infoTransito: { backgroundColor: '#01579b', padding: 8, borderRadius: 6, marginTop: 10 },
  btnAcao: { flex: 1, padding: 10, borderRadius: 6, alignItems: 'center' },
  txtBtnAcao: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  cardItem: { backgroundColor: '#1e1e1e', padding: 14, borderRadius: 8, marginBottom: 10 },
  inputObs: { backgroundColor: '#2a1a1a', color: '#fff', padding: 8, borderRadius: 4, marginTop: 8, borderWidth: 1, borderColor: '#f44' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 10 },
  modalTitulo: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  label: { color: '#aaa', fontSize: 12, marginTop: 10, marginBottom: 4 },
  inputModal: { backgroundColor: '#2a2a2a', color: '#fff', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#444' }
});

const Stack = createNativeStackNavigator();

export default function Index() {
  const [estaLogado, setEstaLogado] = useState(null);
  useEffect(() => { AsyncStorage.getItem('@motorista_nome').then(n => setEstaLogado(n !== null)); }, []);
  if (estaLogado === null) return null;

  return (
    <NavigationContainer independent={true}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!estaLogado ? (
          <Stack.Screen name="Login">{(p) => <LoginScreen {...p} aoLogar={() => setEstaLogado(true)} />}</Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Garagem">{(p) => <GaragemScreen {...p} aoDeslogar={() => setEstaLogado(false)} />}</Stack.Screen>
            <Stack.Screen name="Checklist" component={ChecklistScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}