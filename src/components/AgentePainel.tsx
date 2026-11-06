import { useState } from 'react';
import { ACAO_LABEL, ACOES_COM_APROVACAO, ESTADO_AGENTE_LABEL, PROVEDOR_LABEL } from '../../shared/types';
import { api, moeda } from '../api';
import { useCtx } from '../App';
import { Modal } from './Modal';
import { Sprite } from './Sprite';
import { LinhaTarefa } from './Tarefas';

export function AgentePainel({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { dados, motor, editarAgente, novaTarefa, acao, abrirAgente } = useCtx();
  const [aberta, setAberta] = useState<string | null>(null);
  const a = dados.agentes.find((x) => x.id === id);
  if (!a) return null;
  const dep = dados.departamentos.find((d) => d.id === a.departamentoId);
  const gestor = dados.agentes.find((x) => x.id === a.gestorId);
  const equipe = dados.agentes.filter((x) => x.gestorId === a.id);
  const tarefas = dados.tarefas.filter((t) => t.agenteId === a.id);
  const pct = a.orcamento > 0 ? Math.min(100, (a.gasto / a.orcamento) * 100) : 100;
  const prov = motor?.provedores[a.provedor];

  const remover = async () => {
    if (!confirm(`Remover ${a.nome}? As tarefas dele também serão apagadas.`)) return;
    const ok = await acao(() => api('DELETE', `/api/agentes/${a.id}`), `${a.nome} foi removido.`);
    if (ok) onFechar();
  };

  return (
    <Modal titulo={a.nome} onFechar={onFechar} lateral>
      <div className="perfil" style={{ '--dep': dep?.cor ?? '#64748b' } as React.CSSProperties}>
        <div className={`perfil-avatar e-${a.estado}`}>
          <Sprite agente={a} cor={dep?.cor ?? '#64748b'} />
        </div>
        <div>
          <p className="perfil-cargo">{a.cargo}</p>
          <p className="perfil-dep">
            <i className="ponto" /> {dep?.nome}
            {a.pacoteId && <span className="tag t-pendente">pacote: {a.pacoteId}</span>}
          </p>
          <p className={`selo inline e-${a.estado}`}>ESTADO: {ESTADO_AGENTE_LABEL[a.estado]}</p>
        </div>
      </div>

      <dl className="ficha">
        <div>
          <dt>Gestor</dt>
          <dd>{gestor ? <button className="link-agente" onClick={() => abrirAgente(gestor.id)}>{gestor.nome}</button> : '— topo da hierarquia —'}</dd>
        </div>
        {equipe.length > 0 && (
          <div>
            <dt>Equipe</dt>
            <dd>
              {equipe.map((x, i) => (
                <span key={x.id}>
                  {i > 0 && ', '}
                  <button className="link-agente" onClick={() => abrirAgente(x.id)}>{x.nome}</button>
                </span>
              ))}
            </dd>
          </div>
        )}
        <div>
          <dt>Motor</dt>
          <dd>
            {PROVEDOR_LABEL[a.provedor]}
            {a.modelo && ` · ${a.modelo}`}
            {prov && !prov.disponivel && <small className="n-aviso"> (indisponível: {prov.detalhe})</small>}
          </dd>
        </div>
        <div>
          <dt>Orçamento</dt>
          <dd>
            <div className={`barra-orc ${pct >= 90 ? 'alto' : ''}`} role="meter" aria-valuenow={a.gasto} aria-valuemin={0} aria-valuemax={a.orcamento}>
              <span style={{ width: `${pct}%` }} />
            </div>
            {moeda(a.gasto)} de {moeda(a.orcamento)} · disponível {moeda(Math.max(0, a.orcamento - a.gasto))}
          </dd>
        </div>
        <div>
          <dt>Permissões</dt>
          <dd className="perm-lista">
            {a.permissoes.length === 0 && <span className="n-erro">nenhuma</span>}
            {a.permissoes.map((p) => (
              <span key={p} className="tag t-pendente">
                {ACAO_LABEL[p]}
                {ACOES_COM_APROVACAO.includes(p) && ' ⚑'}
              </span>
            ))}
          </dd>
        </div>
        {a.instrucoes && (
          <div>
            <dt>Instruções</dt>
            <dd className="instrucoes">{a.instrucoes}</dd>
          </div>
        )}
      </dl>

      <div className="botoes esquerda">
        <button className="btn primario" onClick={() => novaTarefa(a.id)}>
          + Tarefa para {a.nome.split(' ')[0]}
        </button>
        <button className="btn" onClick={() => editarAgente(a)}>
          Editar
        </button>
        <button className="btn perigo" onClick={remover} disabled={a.estado === 'trabalhando'}>
          Remover
        </button>
      </div>

      <h3 className="secao">Tarefas ({tarefas.length})</h3>
      <ul className="lista-tarefas compacta">
        {tarefas.map((t) => (
          <LinhaTarefa key={t.id} tarefa={t} semAgente aberta={aberta === t.id} alternar={() => setAberta(aberta === t.id ? null : t.id)} />
        ))}
        {tarefas.length === 0 && <li className="vazio">Sem tarefas ainda.</li>}
      </ul>
    </Modal>
  );
}
