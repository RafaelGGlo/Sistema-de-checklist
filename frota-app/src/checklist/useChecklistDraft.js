import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { perfilAtual } from '../lib/frota';
import { FOTOS, formularioInicial, fotosVazias, restaurarFormulario } from './model.mjs';

export function useChecklistDraft(veiculo) {
  const [form, setForm] = useState(() => formularioInicial(veiculo));
  const [fotos, setFotos] = useState(fotosVazias);
  const [perfil, setPerfil] = useState(null);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const chave = useRef('');
  const fila = useRef(Promise.resolve());
  const enviado = useRef(false);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const usuario = await perfilAtual();
        if (!ativo) return;
        setPerfil(usuario);
        chave.current = `@frota:checklist:v1:${usuario.id}:${veiculo.id}`;
        try {
          const dados = await AsyncStorage.multiGet([chave.current, ...FOTOS.map(f => `${chave.current}:foto:${f.id}`)]);
          if (!ativo) return;
          const salvo = dados[0][1] ? JSON.parse(dados[0][1]) : null;
          setForm(restaurarFormulario(veiculo, salvo));
          setFotos(Object.fromEntries(FOTOS.map((f, i) => [f.id, dados[i + 1][1] || ''])));
          if (salvo || dados.slice(1).some(([, value]) => value)) setAviso('Rascunho recuperado neste aparelho.');
        } catch {
          if (ativo) setAviso('Não foi possível recuperar o rascunho local. Confira os dados antes de enviar.');
        }
        if (ativo) setPronto(true);
      } catch (error) { if (ativo) setErro(error.message || 'Não foi possível identificar o motorista. Entre novamente.'); }
    }
    void carregar();
    return () => { ativo = false; };
  }, [veiculo]);

  // Fila única impede uma gravação antiga de substituir um rascunho mais recente.
  useEffect(() => {
    if (!pronto || enviado.current) return;
    const destino = chave.current;
    fila.current = fila.current.then(() => AsyncStorage.setItem(destino, JSON.stringify(form))).catch(() => {
      setAviso('O rascunho não pôde ser salvo neste aparelho. Mantenha a tela aberta até enviar.');
    });
  }, [form, pronto]);

  async function guardarFoto(id, imagem) {
    setFotos(atuais => ({ ...atuais, [id]: imagem }));
    fila.current = fila.current.then(() => AsyncStorage.setItem(`${chave.current}:foto:${id}`, imagem)).catch(() => {
      setAviso('Uma foto está apenas na memória. Mantenha a tela aberta até enviar o checklist.');
    });
    await fila.current;
  }
  async function limparRascunho() {
    enviado.current = true;
    await fila.current;
    try { await AsyncStorage.multiRemove([chave.current, ...FOTOS.map(f => `${chave.current}:foto:${f.id}`)]); }
    catch { setAviso('Checklist enviado, mas o rascunho local não pôde ser removido.'); }
  }
  return { form, setForm, fotos, guardarFoto, perfil, pronto, erro, aviso, limparRascunho };
}
