import { useEffect, useRef, useState } from 'react';
import { registrarRevisao } from '../lib/frota';
import './operacoes.css';

export default function RegistrarRevisao({ veiculo, aoFechar, aoSalvar }) {
  const dialogo = useRef(null);
  const trava = useRef(false);
  const [proxima, setProxima] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => {
    const anterior = document.activeElement;
    dialogo.current.showModal();
    return () => anterior?.focus();
  }, []);
  const salvar = async event => {
    event.preventDefault();
    if (trava.current) return;
    trava.current = true; setSalvando(true); setErro('');
    try {
      if (!confirmado) throw new Error('Confirme que a manutenção foi realizada.');
      await registrarRevisao(veiculo, proxima);
      aoSalvar('Revisão registrada. A próxima saída já pode ser registrada.');
    } catch (error) { setErro(error.message || 'Não foi possível registrar a revisão.'); }
    finally { trava.current = false; setSalvando(false); }
  };
  return <dialog ref={dialogo} className="operacao-dialog" aria-labelledby="revisao-titulo"
    onCancel={event => { event.preventDefault(); if (!trava.current) aoFechar(); }}>
    <h2 id="revisao-titulo">Registrar revisão realizada</h2>
    <p>{veiculo.nome} · {veiculo.placa}</p>
    <p>A saída está bloqueada pela revisão vencida. Após realizar a manutenção, informe a quilometragem da próxima revisão.</p>
    <p><strong>KM atual:</strong> {Number(veiculo.ultimo_km).toLocaleString('pt-BR')} KM</p>
    <form onSubmit={salvar}>
      <fieldset disabled={salvando}>
        <label>Próxima revisão (KM)<input autoFocus required type="number" min={Number(veiculo.ultimo_km) + 1} step="1" value={proxima} onChange={e => setProxima(e.target.value)} /></label>
        <label><input style={{ display: 'inline', width: 'auto', marginRight: 8 }} type="checkbox" required checked={confirmado} onChange={e => setConfirmado(e.target.checked)} />Confirmo que a troca de óleo / revisão foi realizada.</label>
        {erro && <p role="alert" className="operacao-erro">{erro}</p>}
        <div className="operacao-botoes"><button type="button" onClick={aoFechar}>Cancelar</button><button className="operacao-primario" type="submit">{salvando ? 'Salvando...' : 'Salvar revisão'}</button></div>
      </fieldset>
    </form>
  </dialog>;
}
