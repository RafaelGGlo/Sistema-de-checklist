import { useEffect, useState } from 'react';
import { fotosDoChecklist } from '../lib/frota';
import './fotosChecklist.css';

const posicoes = [
  ['painel', 'Painel'], ['cabine', 'Cabine'], ['ldEsq', 'Lado Esquerdo'],
  ['ldDir', 'Lado Direito'], ['traseira', 'Traseira'], ['frente', 'Frente'],
];

function Foto({ src, label, ampliada = false }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return <p role="status">Não foi possível exibir esta foto.</p>;
  return <img src={src} alt={label} className={ampliada ? 'foto-checklist-ampliada' : 'foto-checklist-miniatura'} onError={() => setFalhou(true)} />;
}

export default function FotosChecklist({ checklistId }) {
  const [estado, setEstado] = useState({ carregando: true });
  const [tentativa, setTentativa] = useState(0);
  const [selecionada, setSelecionada] = useState(null);

  useEffect(() => {
    let ativo = true;
    setEstado({ carregando: true });
    setSelecionada(null);
    fotosDoChecklist(checklistId).then(fotos => {
      if (ativo) setEstado({ fotos });
    }).catch(() => {
      if (ativo) setEstado({ erro: true });
    });
    return () => { ativo = false; };
  }, [checklistId, tentativa]);

  return <section className="fotos-checklist" aria-label="Fotos do veículo">
    <h4>Fotos do veículo</h4>
    {estado.carregando ? <p role="status">Carregando fotos...</p> : estado.erro ? <div role="alert">
      <p>Não foi possível carregar as fotos deste checklist.</p>
      <button type="button" onClick={() => setTentativa(valor => valor + 1)}>Tentar novamente</button>
    </div> : <>
      {!posicoes.some(([id]) => estado.fotos?.[id]) && <p>Nenhuma foto anexada a este checklist.</p>}
      {selecionada && <div className="foto-checklist-detalhe">
        <strong>{selecionada.label}</strong>
        <Foto key={`${checklistId}-${selecionada.id}-${tentativa}`} src={estado.fotos[selecionada.id]} label={selecionada.label} ampliada />
        <button type="button" onClick={() => setSelecionada(null)}>Fechar foto ampliada</button>
      </div>}
      <div className="fotos-checklist-grade">
        {posicoes.map(([id, label]) => <figure key={id}>
          {estado.fotos?.[id] ? <button type="button" aria-label={`Ampliar foto: ${label}`} onClick={() => setSelecionada({ id, label })}>
            <Foto key={`${checklistId}-${id}-${tentativa}`} src={estado.fotos[id]} label={label} />
          </button> : <div className="foto-checklist-ausente">Foto não anexada</div>}
          <figcaption>{label}</figcaption>
        </figure>)}
      </div>
    </>}
  </section>;
}
