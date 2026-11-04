import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { comprimirFoto } from './imagens';

export default function CameraSequence({ sequencia, aoGuardar, aoFechar }) {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [indice, setIndice] = useState(0);
  const [preview, setPreview] = useState('');
  const [pronta, setPronta] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [erro, setErro] = useState('');
  const [ativa, setAtiva] = useState(AppState.currentState === 'active');
  const camera = useRef(null);
  const trava = useRef(false);
  const viva = useRef(true);
  const atual = sequencia[indice];
  useEffect(() => {
    viva.current = true;
    const listener = AppState.addEventListener('change', estado => {
      setAtiva(estado === 'active');
      setPronta(false);
    });
    return () => { viva.current = false; listener.remove(); };
  }, []);

  async function capturar() {
    if (trava.current || !pronta || !camera.current || !ativa) return;
    trava.current = true; setOcupada(true); setErro('');
    try {
      const foto = await camera.current.takePictureAsync({ quality: 0.85, shutterSound: true });
      const imagem = await comprimirFoto(foto);
      if (viva.current) setPreview(imagem);
    } catch { if (viva.current) setErro('Não foi possível capturar. Confira a câmera e tente novamente.'); }
    finally { trava.current = false; if (viva.current) setOcupada(false); }
  }
  async function confirmar() {
    if (trava.current || !preview) return;
    trava.current = true; setOcupada(true); setErro('');
    try {
      await aoGuardar(atual.id, preview);
      if (!viva.current) return;
      if (indice + 1 === sequencia.length) aoFechar();
      else { setIndice(i => i + 1); setPreview(''); }
    } catch { if (viva.current) setErro('Não foi possível guardar a foto. Tente confirmar novamente.'); }
    finally { trava.current = false; if (viva.current) setOcupada(false); }
  }
  const botao = (texto, onPress, disabled = false, principal = false) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.botao, principal && s.principal, disabled && s.desabilitado]}><Text style={s.texto}>{texto}</Text></TouchableOpacity>;
  return <Modal visible animationType="slide" onRequestClose={() => { if (!trava.current) aoFechar(); }}>
    <SafeAreaView style={s.container}>
      <View style={s.cabecalho}><Text style={s.contagem}>Foto {indice + 1}/{sequencia.length}</Text>{botao('Sair da câmera', aoFechar, ocupada)}</View>
      <Text accessibilityRole="header" style={s.titulo}>{atual.label}</Text>
      <Text style={s.orientacao}>{atual.orientacao}</Text>
      {!permissao ? <ActivityIndicator color="#5db0d6" /> : !permissao.granted ? <View style={s.permissao}>
        <Text style={s.texto}>Permita o uso da câmera para fotografar o veículo. As fotos confirmadas ficam no rascunho.</Text>
        {permissao.canAskAgain ? botao('Permitir câmera', async () => { try { await pedirPermissao(); } catch { setErro('Não foi possível solicitar acesso à câmera.'); } }, ocupada, true)
          : botao('Abrir configurações', () => { void Linking.openSettings().catch(() => setErro('Abra as configurações do aparelho e permita o acesso à câmera.')); })}
      </View> : <View style={s.areaCamera}>
        {/* A mesma CameraView fica montada entre todas as fotos e durante a revisão. */}
        {ativa && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" onCameraReady={() => setPronta(true)} onMountError={() => { setPronta(false); setErro('Não foi possível abrir a câmera. Feche e tente novamente ou use a galeria.'); }} />}
        {!!preview && <Image accessibilityLabel={`Pré-visualização: ${atual.label}`} source={{ uri: preview }} style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} resizeMode="contain" />}
        {!ativa && <Text style={s.texto}>Retorne ao aplicativo para continuar.</Text>}
      </View>}
      {!!erro && <Text accessibilityRole="alert" style={s.erro}>{erro}</Text>}
      {ocupada && <ActivityIndicator color="#5db0d6" />}
      {permissao?.granted && <View style={s.acoes}>
        {preview ? <>{botao('Refazer foto', () => setPreview(''), ocupada)}{botao('Usar foto', confirmar, ocupada, true)}</> : botao('Tirar foto', capturar, ocupada || !pronta || !ativa, true)}
      </View>}
      <Text style={s.rodape}>As fotos confirmadas são mantidas ao sair. Nada é enviado agora.</Text>
    </SafeAreaView>
  </Modal>;
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 16 }, cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titulo: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginTop: 14 }, contagem: { color: '#5db0d6', fontSize: 16, fontWeight: 'bold' },
  orientacao: { color: '#ddd', fontSize: 15, lineHeight: 22, marginVertical: 12 }, areaCamera: { flex: 1, overflow: 'hidden', borderRadius: 12, backgroundColor: '#000' },
  botao: { minHeight: 48, padding: 12, borderRadius: 8, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center', flexShrink: 1 }, principal: { backgroundColor: '#17617e', flexGrow: 1 }, texto: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  acoes: { flexDirection: 'row', gap: 12, marginTop: 14 }, rodape: { color: '#aaa', fontSize: 12, lineHeight: 18, marginTop: 12 }, erro: { color: '#ffb4ab', marginTop: 10 },
  permissao: { flex: 1, justifyContent: 'center', gap: 20 }, desabilitado: { opacity: 0.5 },
});
