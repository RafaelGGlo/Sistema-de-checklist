import { useEffect, useRef, useState } from 'react';
import { lancamentoPainel, observarDados, numeroPositivo } from '../lib/frota';
import './operacoes.css';

const titulos = { viagem: 'Registrar saída', retorno: 'Registrar retorno', abastecimento: 'Lançar combustível', pedagio: 'Lançar pedágio' };
const dataLocal = () => {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
function kmValido(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('Informe uma quilometragem inteira e maior ou igual a zero.');
  return Number(value);
}

export default function LancamentoOperacional({ operacao, veiculos, aoFechar, aoSalvar }) {
  const { tipo, veiculoId = '', viagem } = operacao;
  const [motoristas, setMotoristas] = useState([]);
  const [viagens, setViagens] = useState([]);
  const [carregando, setCarregando] = useState(tipo !== 'retorno');
  const [erroLista, setErroLista] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);
  const dialogo = useRef(null);
  const [form, setForm] = useState({
    veiculo: viagem?.veiculoId || veiculoId, motorista: viagem?.motoristaId || '', destino: '',
    km: viagem ? String(Math.max(Number(viagem.kmInicial || 0), Number(veiculos.find(v => v.id === viagem.veiculoId)?.ultimo_km || 0)))
      : String(veiculos.find(v => v.id === veiculoId)?.ultimo_km ?? ''),
    valor: '', litros: '', local: '', data: dataLocal(), viagem: '',
  });
  const alterar = (campo, valor) => setForm(anterior => ({ ...anterior, [campo]: valor }));
  useEffect(() => {
    const anterior = document.activeElement;
    dialogo.current?.showModal();
    return () => { anterior?.focus(); };
  }, []);
  useEffect(() => {
    if (tipo === 'retorno') return;
    return observarDados('usuarios', rows => {
      setMotoristas(rows); setCarregando(false); setErroLista('');
    }, error => { setErroLista(error.message); setCarregando(false); }, { filtros: { ativo: true } });
  }, [tipo]);
  useEffect(() => {
    setViagens([]);
    if (!['abastecimento', 'pedagio'].includes(tipo) || !form.veiculo || !form.motorista) return;
    return observarDados('viagens', setViagens, error => setErroLista(error.message), {
      filtros: { veiculo_id: form.veiculo, motorista_id: form.motorista },
      ordenar: 'saida_em', limite: 100,
    });
  }, [tipo, form.veiculo, form.motorista]);
  const veiculo = veiculos.find(v => v.id === form.veiculo);
  const opcoesVeiculos = veiculos.filter(v => tipo !== 'viagem' || v.status === 'Liberado');
  const viagensVinculaveis = viagens.filter(v => v.veiculoId === form.veiculo && v.motoristaId === form.motorista);
  const salvar = async event => {
    event.preventDefault();
    if (trava.current) return;
    trava.current = true; setSalvando(true); setErro('');
    try {
      if (tipo === 'retorno') {
        const km = kmValido(form.km);
        const minimo = Math.max(Number(viagem.kmInicial || 0), Number(veiculo?.ultimo_km || 0));
        if (km < minimo) throw new Error(`KM final deve ser maior ou igual a ${minimo}.`);
        await lancamentoPainel('finalizar_viagem', { p_viagem_id: viagem.id, p_km_final: km });
      } else {
        if (!veiculo || !motoristas.some(m => m.id === form.motorista)) throw new Error('Selecione o veículo e o motorista.');
        if (tipo === 'viagem') {
          const km = kmValido(form.km);
          if (km < Number(veiculo.ultimo_km || 0)) throw new Error('KM inicial inferior ao último registrado.');
          if (!form.destino.trim()) throw new Error('Informe o destino.');
          await lancamentoPainel('iniciar_viagem', {
            p_veiculo_id: form.veiculo, p_motorista_id: form.motorista, p_destino: form.destino.trim(), p_km_inicial: km,
          });
        } else {
          const data = new Date(form.data);
          if (!Number.isFinite(data.getTime())) throw new Error('Informe a data do lançamento.');
          await lancamentoPainel('registrar_despesa', {
            p_veiculo_id: form.veiculo, p_motorista_id: form.motorista, p_tipo: tipo,
            p_valor: numeroPositivo(form.valor), p_registrado_em: data.toISOString(),
            p_litros: tipo === 'abastecimento' ? numeroPositivo(form.litros) : null,
            p_km: tipo === 'abastecimento' && form.km !== '' ? kmValido(form.km) : null,
            p_local: form.local.trim() || null, p_viagem_id: form.viagem || null,
          });
        }
      }
      aoSalvar(`${titulos[tipo]}: salvo com sucesso.`);
    } catch (error) { setErro(error.message || 'Não foi possível salvar. Tente novamente.'); }
    finally { trava.current = false; setSalvando(false); }
  };
  return <dialog ref={dialogo} className="operacao-dialog" aria-labelledby="operacao-titulo" onCancel={event => { event.preventDefault(); if (!trava.current) aoFechar(); }}>
    <h2 id="operacao-titulo">{titulos[tipo]}</h2>
    {tipo === 'retorno' && <p>{viagem.nomeVeiculo} · {viagem.placa} · {viagem.motorista}</p>}
    <form onSubmit={salvar}>
      <fieldset disabled={salvando}>
        {tipo !== 'retorno' && <>
          <label>Veículo<select required autoFocus value={form.veiculo} onChange={e => setForm({ ...form, veiculo: e.target.value, viagem: '', km: String(veiculos.find(v => v.id === e.target.value)?.ultimo_km ?? '') })}>
            <option value="">Selecione um veículo</option>{opcoesVeiculos.map(v => <option key={v.id} value={v.id}>{v.nome} · {v.placa}</option>)}
          </select></label>
          {!opcoesVeiculos.length && <p role="status">{tipo === 'viagem' ? 'Nenhum veículo liberado. Confira as avarias no Pátio antes de registrar a saída.' : 'Cadastre um veículo no Pátio para lançar despesas.'}</p>}
          <label>Motorista<select required disabled={carregando || !!erroLista} value={form.motorista} onChange={e => setForm({ ...form, motorista: e.target.value, viagem: '' })}>
            <option value="">{carregando ? 'Carregando motoristas...' : 'Selecione um motorista'}</option>{motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select></label>
          {!carregando && !erroLista && !motoristas.length && <p role="status">Cadastre e ative o motorista em Usuários.</p>}
          {tipo === 'viagem' && <label>Destino<input required maxLength={200} value={form.destino} onChange={e => alterar('destino', e.target.value)} /></label>}
        </>}
        {(tipo === 'viagem' || tipo === 'retorno' || tipo === 'abastecimento') && <label>{tipo === 'retorno' ? 'KM final' : tipo === 'viagem' ? 'KM inicial' : 'KM no abastecimento (opcional)'}
          <input autoFocus={tipo === 'retorno'} type="number" min={tipo === 'abastecimento' ? 0 : Math.max(Number(veiculo?.ultimo_km || 0), Number(viagem?.kmInicial || 0))} step="1" required={tipo !== 'abastecimento'} value={form.km} onChange={e => alterar('km', e.target.value)} />
        </label>}
        {['abastecimento', 'pedagio'].includes(tipo) && <>
          <label>Data e hora<input type="datetime-local" required value={form.data} onChange={e => alterar('data', e.target.value)} /></label>
          <label>Valor (R$)<input inputMode="decimal" required placeholder="0,00" value={form.valor} onChange={e => alterar('valor', e.target.value)} /></label>
          {tipo === 'abastecimento' && <label>Litros<input inputMode="decimal" required placeholder="0,000" value={form.litros} onChange={e => alterar('litros', e.target.value)} /></label>}
          <label>{tipo === 'abastecimento' ? 'Posto (opcional)' : 'Local / Praça (opcional)'}<input maxLength={200} value={form.local} onChange={e => alterar('local', e.target.value)} /></label>
          <label>Vincular à viagem (opcional)<select value={form.viagem} onChange={e => alterar('viagem', e.target.value)}><option value="">Sem vínculo com viagem</option>{viagensVinculaveis.map(v => <option key={v.id} value={v.id}>{v.destino} · {v.dataHoraSaida} · {v.status}</option>)}</select></label>
        </>}
        {(erro || erroLista) && <p role="alert" className="operacao-erro">{erro || erroLista}</p>}
        <div className="operacao-botoes"><button type="button" onClick={aoFechar}>Cancelar</button><button className="operacao-primario" type="submit" disabled={tipo !== 'retorno' && (carregando || !!erroLista || !opcoesVeiculos.length || !motoristas.length)}>{salvando ? 'Salvando...' : 'Salvar registro'}</button></div>
      </fieldset>
    </form>
  </dialog>;
}
