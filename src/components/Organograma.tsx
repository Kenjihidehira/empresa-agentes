import type { Agente } from '../../shared/types';
import { ESTADO_AGENTE_LABEL } from '../../shared/types';
import { useCtx } from '../App';

export function Organograma() {
  const { dados, novoAgente } = useCtx();
  const ids = new Set(dados.agentes.map((a) => a.id));
  const raizes = dados.agentes.filter((a) => !a.gestorId || !ids.has(a.gestorId));
  return (
    <section className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Organograma</h1>
          <p className="sub">
            {dados.agentes.length} agentes em {dados.departamentos.length} departamentos. Clique em alguém para ver detalhes.
          </p>
        </div>
        <button className="btn" onClick={novoAgente}>
          + Agente
        </button>
      </div>
      <div className="org-legenda">
        {dados.departamentos.map((d) => (
          <span key={d.id} style={{ '--dep': d.cor } as React.CSSProperties}>
            <i className="ponto" /> {d.nome}
          </span>
        ))}
      </div>
      <div className="org-scroll">
        <ul className="org">
          {raizes.map((r) => (
            <No key={r.id} agente={r} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function No({ agente }: { agente: Agente }) {
  const { dados, abrirAgente } = useCtx();
  const filhos = dados.agentes.filter((a) => a.gestorId === agente.id);
  const dep = dados.departamentos.find((d) => d.id === agente.departamentoId);
  return (
    <li>
      <button
        className={`org-no e-${agente.estado}`}
        style={{ '--dep': dep?.cor ?? '#64748b' } as React.CSSProperties}
        onClick={() => abrirAgente(agente.id)}
      >
        <b>{agente.nome}</b>
        <small>{agente.cargo}</small>
        <span className="org-meta">
          <span className="dep-tag">{dep?.nome}</span>
          <span className="estado-ponto" title={ESTADO_AGENTE_LABEL[agente.estado]} />
        </span>
      </button>
      {filhos.length > 0 && (
        <ul>
          {filhos.map((f) => (
            <No key={f.id} agente={f} />
          ))}
        </ul>
      )}
    </li>
  );
}
