import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignatureScreen from './Assinatura';
import { gerarPdf, compartilharPdf } from './pdf';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import { salvarChecklist } from '../lib/frota';
import { CATEGORIAS, FOTOS, fotosPendentes, marcarCategoria, montarChecklist, progresso } from './model.mjs';
import { useChecklistDraft } from './useChecklistDraft';
import { comprimirFoto } from './imagens';
import CameraSequence from './CameraSequence';

function Botao({ children, onPress, disabled = false, principal = false, estilo, ...props }) {
  return <TouchableOpacity {...props} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.botao, principal && s.principal, disabled && s.desabilitado, estilo]}><Text style={s.textoBotao}>{children}</Text></TouchableOpacity>;
}
function Opcoes({ opcoes, valor, onChange, label, compacta = false }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[s.opcoes, compacta && { width: opcoes.length === 3 ? 222 : 174, flexShrink: 0 }]}>{opcoes.map((opcao, i) => <TouchableOpacity key={opcao} accessibilityRole="radio" accessibilityLabel={`${label}: ${opcao === 'NAO' ? 'NÃO' : opcao}`} aria-checked={valor === opcao} onPress={() => onChange(opcao)}
    style={[s.opcao, valor === opcao && (i === 0 ? s.bom : opcoes.length === 3 && i === 1 ? s.regular : s.ruim)]}>
    <Text style={[s.textoOpcao, valor === opcao && s.selecionada]}>{valor === opcao ? '✓ ' : ''}{opcao === 'NAO' ? 'NÃO' : opcao}</Text>
  </TouchableOpacity>)}</View>;
}
function LinhaItem({ item, form, setForm, larga }) {
  return <View style={s.item}>
    <View style={[s.linhaItem, larga && s.horizontal]}>
      <View style={s.nomeItem}><Text style={s.nome}>{item.pergunta}</Text><Text style={s.revisado}>{form.revisados[item.id] ? 'Revisado' : 'A conferir'}</Text></View>
      <Opcoes compacta={larga} label={item.pergunta} opcoes={item.opcoes} valor={form.valores[item.id]} onChange={valor => setForm(f => ({ ...f, valores: { ...f.valores, [item.id]: valor }, revisados: { ...f.revisados, [item.id]: true } }))} />
    </View>
    {item.detalhe && form.valores[item.id] === 'QUEIMADO' && <View style={s.condicional}>
      <Text style={s.ajuda}>Qual lâmpada está queimada?</Text>
      <Opcoes label={`Lâmpada da ${item.pergunta}`} opcoes={['FRENTE', 'TRASEIRA']} valor={form[item.detalhe]} onChange={valor => setForm(f => ({ ...f, [item.detalhe]: valor }))} />
    </View>}
  </View>;
}

export default function ChecklistScreen({ route, navigation }) {
  const { veiculo } = route.params;
  const { width } = useWindowDimensions();
  const draft = useChecklistDraft(veiculo);
  const { form, setForm, fotos, guardarFoto, perfil, pronto } = draft;
  const [abertas, setAbertas] = useState({ fluidos: true });
  const [confirmacao, setConfirmacao] = useState(null);
  const [sequencia, setSequencia] = useState(null);
  const [fotoAmpliada, setFotoAmpliada] = useState(null);
  const [importacao, setImportacao] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [assinando, setAssinando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [concluido, setConcluido] = useState(null);
  const [etapaPdf, setEtapaPdf] = useState('');
  const pdf = useRef(null);
  const salvo = useRef(null);
  const trava = useRef(false);
  const assinatura = useRef(null);
  const andamento = progresso(form);
  const pendentes = fotosPendentes(fotos);
  const fotosFeitas = FOTOS.length - pendentes.length;
  const nomeMotorista = perfil?.nome ? perfil.nome.trim().split('@')[0].split(' ')[0].toLowerCase().replace(/^./, c => c.toUpperCase()) : '';
  const kmNumero = Number(form.km), revisaoNumero = Number(form.proximaRevisao);
  const faltaRevisao = revisaoNumero - kmNumero;
  const alerta = kmNumero > 0 && revisaoNumero > 0 && faltaRevisao <= 1000
    ? faltaRevisao < 0 ? `REVISÃO VENCIDA: ${Math.abs(faltaRevisao).toLocaleString('pt-BR')} KM acima do previsto.` : `REVISÃO PRÓXIMA: faltam ${faltaRevisao.toLocaleString('pt-BR')} KM.` : '';

  async function abrirCamera(lista) {
    if (trava.current) return;
    trava.current = true; setOcupado(true); setErro('');
    try {
      await Camera.requestCameraPermissionsAsync();
      setFotoAmpliada(null);
      setSequencia(lista);
    } catch { setErro('Não foi possível solicitar a câmera. Use a galeria ou confira as permissões do aparelho.'); }
    finally { trava.current = false; setOcupado(false); }
  }
  async function escolherGaleria(lista) {
    if (trava.current) return;
    trava.current = true; setOcupado(true); setErro('');
    try {
      const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: lista.length > 1, selectionLimit: lista.length, orderedSelection: true, quality: 1 });
      if (resultado.canceled) return;
      const selecionadas = [];
      for (let i = 0; i < Math.min(resultado.assets.length, lista.length); i++) {
        selecionadas.push({ slot: lista[i], imagem: await comprimirFoto(resultado.assets[i]) });
      }
      if (selecionadas.length) { setFotoAmpliada(null); setImportacao(selecionadas); }
    } catch { setErro('Não foi possível selecionar ou preparar as fotos. Confira o acesso à galeria e tente novamente.'); }
    finally { trava.current = false; setOcupado(false); }
  }
  async function importar() {
    if (trava.current) return;
    trava.current = true; setOcupado(true);
    try {
      for (const foto of importacao) await guardarFoto(foto.slot.id, foto.imagem);
      setImportacao(null);
    } catch { setErro('Não foi possível guardar as fotos. Tente novamente.'); }
    finally { trava.current = false; setOcupado(false); }
  }
  function avancarAssinatura() {
    setErro('');
    if (!form.km.trim()) { setErro('Informe o KM atual antes de assinar!'); return; }
    const anterior = String(veiculo.ultimoKm || '').trim();
    if (anterior && anterior !== '-' && form.km.trim() === anterior) {
      setConfirmacao({ titulo: 'Atenção ao KM', mensagem: 'O KM atual não mudou em relação ao último registrado. Deseja prosseguir mesmo assim?', confirmar: () => setAssinando(true) });
    } else setAssinando(true);
  }
  async function enviar(imagemAssinatura) {
    if (trava.current || salvo.current) return;
    if (!form.km.trim() || !imagemAssinatura) { setErro('Informe o KM e registre sua assinatura.'); return; }
    trava.current = true; setSalvando(true); setErro('');
    try {
      const dados = montarChecklist(veiculo, perfil?.nome || nomeMotorista, form, fotos, imagemAssinatura);
      await salvarChecklist(dados);
      salvo.current = dados;
      setConcluido(dados);
      setAssinando(false);
      setEtapaPdf('Gerando PDF com fotos e assinatura...');
      await draft.limparRascunho();
      try {
        // Aguarda o fechamento do Modal antes de abrir uma atividade do Android.
        await new Promise(resolve => setTimeout(resolve, 400));
        pdf.current = await gerarPdf(dados);
        if (Platform.OS !== 'web') {
          setEtapaPdf('Escolha o aplicativo para compartilhar o PDF.');
          await compartilharPdf(pdf.current);
        }
      } catch (error) { setErro(`Checklist salvo. ${error.message || 'Não foi possível abrir o PDF.'} Toque no botão abaixo para tentar novamente.`); }
    } catch (error) { setErro(error.message || 'Falha ao salvar o checklist. Seu rascunho foi mantido.'); }
    finally { trava.current = false; setSalvando(false); setEtapaPdf(''); }
  }
  async function repetirPdf() {
    if (trava.current) return;
    trava.current = true; setSalvando(true); setErro('');
    try {
      if (!pdf.current) { setEtapaPdf('Gerando PDF com fotos e assinatura...'); pdf.current = await gerarPdf(concluido); }
      setEtapaPdf('Escolha o aplicativo para compartilhar o PDF.');
      await compartilharPdf(pdf.current);
    } catch (error) { pdf.current = null; setErro(`${error.message || 'Não foi possível abrir o PDF.'} O checklist já está salvo.`); }
    finally { trava.current = false; setSalvando(false); setEtapaPdf(''); }
  }
  if (concluido) return <SafeAreaView style={s.container}>
    <View style={[s.conteudo, { padding: 20, gap: 12 }]}>
      <Text accessibilityRole="header" style={s.titulo}>Checklist enviado</Text>
      <Text style={s.ajuda}>{concluido.nomeVeiculo} • {concluido.placa}</Text>
      <Text accessibilityRole="status" style={s.ajuda}>{etapaPdf || 'Seu checklist está salvo. Toque em Compartilhar PDF para escolher WhatsApp, e-mail ou outro aplicativo.'}</Text>
      {Platform.OS === 'web' && <Text style={s.ajuda}>Se o navegador não oferecer compartilhamento de arquivos, o PDF será baixado.</Text>}
      {salvando && <ActivityIndicator accessibilityLabel={etapaPdf || 'Preparando PDF'} color="#5db0d6" />}
      {!!erro && <Text accessibilityRole="alert" style={s.erro}>{erro}</Text>}
      <Botao principal disabled={salvando} onPress={repetirPdf}>{salvando ? 'Preparando PDF...' : 'Compartilhar PDF'}</Botao>
      <Botao disabled={salvando} onPress={() => navigation.goBack()}>Concluir</Botao>
    </View>
  </SafeAreaView>;
  if (!pronto) return <SafeAreaView style={s.container}><Botao onPress={() => navigation.goBack()}>← Voltar</Botao>{draft.erro ? <Text accessibilityRole="alert" style={s.erro}>{draft.erro}</Text> : <ActivityIndicator accessibilityLabel="Recuperando checklist" color="#5db0d6" />}</SafeAreaView>;
  const listaCaptura = pendentes.length ? pendentes : FOTOS;
  return <SafeAreaView style={s.container}>
    <View style={s.conteudo} pointerEvents={salvando ? 'none' : 'auto'}>
      <View style={s.topo}>
        <Botao onPress={() => navigation.goBack()}>← Voltar</Botao>
        <View style={s.identificacao}><Text accessibilityRole="header" style={s.titulo}>Checklist: {veiculo.nome}</Text><Text style={s.ajuda}>{veiculo.placa} • {nomeMotorista}</Text></View>
      </View>
      <ScrollView contentContainerStyle={s.rolagem} keyboardShouldPersistTaps="handled">
        <View style={s.resumo}><View style={s.entre}><Text style={s.nome}>Verificações revisadas</Text><Text style={s.destaque}>{andamento.concluidos}/{andamento.total}</Text></View>
          <View accessibilityRole="progressbar" accessibilityLabel="Progresso das verificações" aria-valuemin={0} aria-valuemax={andamento.total} aria-valuenow={andamento.concluidos} style={s.trilho}><View style={[s.progresso, { width: `${andamento.percentual}%` }]} /></View>
          <Text style={s.ajuda}>Toque na avaliação após conferir cada item. Fotos: {fotosFeitas}/6.</Text>
        </View>
        {!!draft.aviso && <Text accessibilityRole="status" style={s.ajuda}>{draft.aviso}</Text>}
        {!!alerta && <Text style={s.alerta}>{alerta}</Text>}
        <View style={s.campos}>
          <View style={s.campo}><Text style={s.label}>KM ATUAL *</Text><TextInput accessibilityLabel="KM atual" style={s.input} keyboardType="numeric" value={form.km} placeholder="Ex: 58200" placeholderTextColor="#888" onChangeText={km => setForm(f => ({ ...f, km }))} /></View>
          <View style={s.campo}><Text style={s.label}>KM DA PRÓXIMA REVISÃO *</Text><TextInput accessibilityLabel="KM da próxima revisão" style={s.input} keyboardType="numeric" value={form.proximaRevisao} placeholder="Ex: 60000" placeholderTextColor="#888" onChangeText={proximaRevisao => setForm(f => ({ ...f, proximaRevisao }))} /></View>
        </View>
        {CATEGORIAS.map(categoria => {
          const feitas = categoria.itens.filter(i => form.revisados[i.id]).length;
          return <View key={categoria.id} style={s.categoria}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={categoria.titulo} aria-expanded={!!abertas[categoria.id]} style={s.cabecalhoCategoria} onPress={() => setAbertas(v => ({ ...v, [categoria.id]: !v[categoria.id] }))}>
              <Text style={s.tituloCategoria}>{categoria.titulo}</Text><Text style={s.destaque}>{feitas}/{categoria.itens.length} {abertas[categoria.id] ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>
            {abertas[categoria.id] && <View style={s.corpoCategoria}>
              <Botao accessibilityLabel={`Marcar todos como OK: ${categoria.titulo}`} estilo={s.marcarTodos} onPress={() => setConfirmacao({ titulo: 'Todos os itens foram verificados?', mensagem: `Confirme que você verificou todos os itens de ${categoria.titulo}. As avaliações desta categoria serão substituídas por BOM, OK ou SIM. Você poderá alterar cada item depois.`, confirmar: () => setForm(f => marcarCategoria(f, categoria)) })}>Marcar todos como OK</Botao>
              {categoria.itens.map(item => <LinhaItem key={item.id} item={item} form={form} setForm={setForm} larga={width >= 380} />)}
              {categoria.id === 'limpeza' && <Text style={s.lembrete}>Conserve o veículo limpo, principalmente o interior da cabine.</Text>}
            </View>}
          </View>;
        })}
        <View style={s.secao}>
          <View style={s.entre}><Text accessibilityRole="header" style={s.tituloCategoria}>Fotos do veículo</Text><Text style={s.destaque}>{fotosFeitas}/6</Text></View>
          <Text style={s.ajuda}>Painel, cabine, duas laterais, traseira e frente. Confira a nitidez do KM.</Text>
          <Botao principal disabled={ocupado} onPress={() => abrirCamera(listaCaptura)}>{fotosFeitas === 0 ? 'Iniciar captura das 6 fotos' : pendentes.length ? `Continuar captura (${pendentes.length} restantes)` : 'Refazer sequência das 6 fotos'}</Botao>
          <Botao disabled={ocupado} onPress={() => escolherGaleria(listaCaptura)}>Selecionar da galeria</Botao>
          {ocupado && <ActivityIndicator accessibilityLabel="Preparando fotos" color="#5db0d6" />}
          <View style={s.gradeFotos}>{FOTOS.map(foto => <TouchableOpacity key={foto.id} accessibilityRole="button" accessibilityLabel={`${foto.label}: ${fotos[foto.id] ? 'ver ou refazer foto' : 'adicionar foto'}`} style={s.foto} disabled={ocupado} onPress={() => setFotoAmpliada(foto)}>
            {fotos[foto.id] ? <Image source={{ uri: fotos[foto.id] }} style={s.miniatura} /> : <View style={[s.miniatura, s.placeholder]}><Text style={s.ajuda}>+ Foto</Text></View>}
            <Text style={s.labelFoto}>{fotos[foto.id] ? '✓ ' : ''}{foto.label}</Text>
          </TouchableOpacity>)}</View>
        </View>
        <View style={s.secao}><Text style={s.tituloCategoria}>Observações adicionais</Text>
          <Opcoes label="Alguma observação?" opcoes={['NAO', 'SIM']} valor={form.temObs} onChange={temObs => setForm(f => ({ ...f, temObs }))} />
          {form.temObs === 'SIM' && <TextInput accessibilityLabel="Observações do veículo" style={[s.input, s.observacao]} multiline placeholder="Descreva a observação ou detalhe do veículo..." placeholderTextColor="#888" value={form.textoObs} onChangeText={textoObs => setForm(f => ({ ...f, textoObs }))} />}
        </View>
        {!!erro && <Text accessibilityRole="alert" style={s.erro}>{erro}</Text>}
        <Text style={s.ajuda}>Rascunho salvo neste aparelho. As fotos são enviadas somente ao concluir o checklist.</Text>
      </ScrollView>
      <View style={s.rodape}><Botao principal disabled={ocupado} onPress={avancarAssinatura}>Assinar e enviar checklist</Botao></View>
    </View>
    {!!confirmacao && <Modal transparent visible animationType="fade" onRequestClose={() => setConfirmacao(null)}><View style={s.fundoModal}><View accessibilityViewIsModal style={s.modal}>
      <Text accessibilityRole="header" style={s.titulo}>{confirmacao.titulo}</Text><Text style={s.descricao}>{confirmacao.mensagem}</Text>
      <Botao onPress={() => setConfirmacao(null)}>Cancelar</Botao><Botao principal onPress={() => { confirmacao.confirmar(); setConfirmacao(null); }}>Confirmar</Botao>
    </View></View></Modal>}
    {!!sequencia && <CameraSequence sequencia={sequencia} aoGuardar={guardarFoto} aoFechar={() => setSequencia(null)} />}
    {!!fotoAmpliada && <Modal visible animationType="slide" onRequestClose={() => { if (!ocupado) setFotoAmpliada(null); }}><SafeAreaView style={s.telaModal}>
      <Text style={s.titulo}>{fotoAmpliada.label}</Text><Text style={s.ajuda}>{fotoAmpliada.orientacao}</Text>
      {!!fotos[fotoAmpliada.id] && <Image source={{ uri: fotos[fotoAmpliada.id] }} resizeMode="contain" style={s.previewGrande} />}
      {!!erro && <Text accessibilityRole="alert" style={s.erro}>{erro}</Text>}
      <Botao principal disabled={ocupado} onPress={() => abrirCamera([fotoAmpliada])}>{fotos[fotoAmpliada.id] ? 'Refazer com a câmera' : 'Tirar foto'}</Botao>
      <Botao disabled={ocupado} onPress={() => escolherGaleria([fotoAmpliada])}>Escolher da galeria</Botao>
      <Botao disabled={ocupado} onPress={() => setFotoAmpliada(null)}>Voltar ao checklist</Botao>
    </SafeAreaView></Modal>}
    {!!importacao && <Modal visible animationType="slide" onRequestClose={() => { if (!ocupado) setImportacao(null); }}><SafeAreaView style={s.telaModal}>
      <Text style={s.titulo}>Confira as fotos da galeria</Text><Text style={s.ajuda}>As imagens serão usadas nesta ordem. Confira o enquadramento indicado antes de confirmar.</Text>
      <ScrollView>{importacao.map(foto => <View key={foto.slot.id} style={s.secao}><Text style={s.tituloCategoria}>{foto.slot.label}</Text><Text style={s.ajuda}>{foto.slot.orientacao}</Text><Image source={{ uri: foto.imagem }} style={s.previewGaleria} resizeMode="contain" /></View>)}</ScrollView>
      <Botao disabled={ocupado} onPress={() => setImportacao(null)}>Cancelar importação</Botao><Botao principal disabled={ocupado} onPress={importar}>{ocupado ? 'Guardando...' : 'Confirmar fotos'}</Botao>
    </SafeAreaView></Modal>}
    <Modal visible={assinando} animationType="slide" onRequestClose={() => { if (!salvando) { setAssinando(false); if (salvo.current) navigation.goBack(); } }}><SafeAreaView style={s.telaModal}>
      <Text style={s.titulo}>Assinatura do motorista</Text><Text style={s.ajuda}>Assine com o dedo no quadro branco.</Text>
      {<View style={s.assinatura}>{assinando && <SignatureScreen ref={assinatura} onOK={enviar} onEmpty={() => setErro('Registre sua assinatura antes de enviar.')} onBegin={() => setErro('')} onError={() => setErro('Não foi possível carregar a assinatura. Volte ao checklist e tente novamente.')} imageType="image/png" backgroundColor="#ffffff" penColor="#111111" androidLayerType="software" webStyle=".m-signature-pad {box-shadow: none; border: none; margin: 0; top: 0; left: 0; width: 100%; height: 100%;} .m-signature-pad--body {border: none; inset: 0;} .m-signature-pad--footer {display: none;}" />}</View>}
      {!!erro && <Text accessibilityRole="alert" style={s.erro}>{erro}</Text>}
      {salvando && <ActivityIndicator color="#5db0d6" />}
      {<><Botao principal disabled={salvando} onPress={() => assinatura.current?.readSignature()}>{salvando ? 'Enviando e gerando PDF...' : 'Confirmar e enviar'}</Botao><Botao disabled={salvando} onPress={() => assinatura.current?.clearSignature()}>Limpar assinatura</Botao><Botao disabled={salvando} onPress={() => setAssinando(false)}>Voltar ao checklist</Botao></>}
    </SafeAreaView></Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' }, conteudo: { flex: 1 }, topo: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#303030' }, identificacao: { flex: 1 },
  titulo: { color: '#5db0d6', fontSize: 21, fontWeight: 'bold' }, ajuda: { color: '#b8b8b8', fontSize: 13, lineHeight: 19, marginVertical: 5 }, rolagem: { padding: 12, gap: 12, maxWidth: 900, width: '100%', alignSelf: 'center', paddingBottom: 20 },
  botao: { minHeight: 44, backgroundColor: '#303030', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, justifyContent: 'center', alignItems: 'center', marginVertical: 3 }, principal: { backgroundColor: '#17617e' }, textoBotao: { color: '#fff', fontSize: 14, fontWeight: 'bold', textAlign: 'center' }, desabilitado: { opacity: 0.5 },
  resumo: { padding: 12, borderRadius: 10, backgroundColor: '#1d1d1d' }, entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, destaque: { color: '#79c6e8', fontWeight: 'bold', fontSize: 14 }, nome: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 19 },
  trilho: { height: 7, borderRadius: 4, backgroundColor: '#383838', marginVertical: 9, overflow: 'hidden' }, progresso: { height: '100%', backgroundColor: '#5db0d6' }, campos: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, campo: { flex: 1, minWidth: 140 }, label: { color: '#ccc', fontSize: 11, marginBottom: 6 },
  input: { minHeight: 46, backgroundColor: '#262626', borderColor: '#444', borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16, color: '#fff' }, categoria: { borderWidth: 1, borderColor: '#333', borderRadius: 10, overflow: 'hidden', backgroundColor: '#1a1a1a' }, cabecalhoCategoria: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12 }, tituloCategoria: { color: '#79c6e8', fontSize: 15, fontWeight: 'bold', flexShrink: 1 }, corpoCategoria: { paddingHorizontal: 10, paddingBottom: 4 },
  marcarTodos: { backgroundColor: '#20352b', alignSelf: 'flex-start', marginBottom: 4 }, item: { paddingVertical: 9, borderTopColor: '#333', borderTopWidth: 1 }, linhaItem: { gap: 6 }, horizontal: { flexDirection: 'row', alignItems: 'center' }, nomeItem: { flex: 1 }, revisado: { color: '#aebbb3', fontSize: 11, marginTop: 1 }, opcoes: { flexDirection: 'row', gap: 5 }, opcao: { minHeight: 44, minWidth: 44, flexGrow: 1, flexBasis: 0, paddingHorizontal: 8, paddingVertical: 10, backgroundColor: '#303030', borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#555' }, textoOpcao: { color: '#ddd', fontSize: 12, fontWeight: 'bold', textAlign: 'center' }, selecionada: { color: '#fff' }, bom: { backgroundColor: '#245c2d', borderColor: '#70b07c' }, regular: { backgroundColor: '#754009', borderColor: '#e6a760' }, ruim: { backgroundColor: '#852c2c', borderColor: '#ec8888' },
  condicional: { padding: 10, backgroundColor: '#322121', borderRadius: 8, marginTop: 8 }, lembrete: { color: '#f4d48a', fontSize: 12, lineHeight: 18, paddingVertical: 8 }, secao: { gap: 6 }, gradeFotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, foto: { width: '31%', flexGrow: 1, maxWidth: '33%', minHeight: 94, backgroundColor: '#242424', borderWidth: 1, borderColor: '#444', borderRadius: 8, padding: 4 }, miniatura: { height: 64, width: '100%', borderRadius: 5 }, placeholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#191919' }, labelFoto: { color: '#ddd', fontSize: 11, textAlign: 'center', marginTop: 5 }, observacao: { height: 90, textAlignVertical: 'top' }, erro: { color: '#ffb4ab', fontSize: 14, lineHeight: 21, paddingVertical: 8 }, alerta: { color: '#ffd294', backgroundColor: '#492a14', padding: 12, borderRadius: 8 },
  rodape: { borderTopWidth: 1, borderTopColor: '#333', padding: 10 }, fundoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,.85)', justifyContent: 'center', padding: 20 }, modal: { backgroundColor: '#202020', padding: 20, borderRadius: 12, borderColor: '#444', borderWidth: 1, gap: 8, maxWidth: 500, width: '100%', alignSelf: 'center' }, descricao: { color: '#ddd', fontSize: 15, lineHeight: 23, marginVertical: 12 }, telaModal: { flex: 1, padding: 16, backgroundColor: '#121212', gap: 8 }, previewGrande: { flex: 1, minHeight: 140, backgroundColor: '#000' }, previewGaleria: { width: '100%', height: 200, backgroundColor: '#000' }, assinatura: { flex: 1, minHeight: 200, backgroundColor: '#fff', overflow: 'hidden', borderRadius: 8 },
});
