import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ESTADO_AGENTE_LABEL, type Agente, type Departamento } from '../../shared/types';
import { hora, moeda, useMedia } from '../api';
import { useCtx } from '../App';
import { Sprite } from './Sprite';

const lerPref = <T,>(chave: string, padrao: T): T => {
  try {
    const v = localStorage.getItem(chave);
    return v === null ? padrao : (JSON.parse(v) as T);
  } catch {
    return padrao;
  }
};
const salvarPref = (chave: string, v: unknown) => {
  try {
    localStorage.setItem(chave, JSON.stringify(v));
  } catch {
    /* navegação privada: ignora */
  }
};

export function Escritorio() {
  const { dados } = useCtx();
  const movel = useMedia('(max-width: 760px)');
  const [filtro, setFiltro] = useState<string>('todos');
  const [zoom, setZoom] = useState<number>(() => lerPref('zoom', 1));
  const [terminais, setTerminais] = useState<boolean>(() => lerPref('terminais', true));

  useEffect(() => salvarPref('zoom', zoom), [zoom]);
  useEffect(() => salvarPref('terminais', terminais), [terminais]);

  const deps = useMemo(
    () =>
      dados.departamentos
        .filter((d) => filtro === 'todos' || d.id === filtro)
        .map((d) => ({ dep: d, agentes: dados.agentes.filter((a) => a.departamentoId === d.id) }))
        .filter((z) => z.agentes.length > 0 || filtro !== 'todos'),
    [dados, filtro],
  );

  return (
    <section className="escritorio">
      <div className="barra-escritorio">
        <div className="filtros" role="group" aria-label="Filtrar por setor">
          <button className={`chip ${filtro === 'todos' ? 'on' : ''}`} onClick={() => setFiltro('todos')}>
            Todos
          </button>
          {dados.departamentos.map((d) => (
            <button
              key={d.id}
              className={`chip ${filtro === d.id ? 'on' : ''}`}
              style={{ '--dep': d.cor } as React.CSSProperties}
              onClick={() => setFiltro(filtro === d.id ? 'todos' : d.id)}
            >
              <i className="ponto" /> {d.nome}
            </button>
          ))}
        </div>
        <div className="controles">
          {!movel && (
            <div className="zoom" role="group" aria-label="Zoom">
              <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))} aria-label="Diminuir zoom">−</button>
              <button onClick={() => setZoom(1)} title="Voltar a 100%">{Math.round(zoom * 100)}%</button>
              <button onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(1)))} aria-label="Aumentar zoom">+</button>
            </div>
          )}
          <button className="btn pequeno" onClick={() => setTerminais((t) => !t)} aria-pressed={!terminais}>
            {terminais ? 'Ocultar terminais' : 'Mostrar terminais'}
          </button>
        </div>
      </div>

      {movel ? (
        <div className="lista-movel">
          {terminais && <TerminalControle />}
          {deps.map(({ dep, agentes }) => (
            <div key={dep.id} className="grupo-movel" style={{ '--dep': dep.cor } as React.CSSProperties}>
              <h3>[ {dep.nome.toUpperCase()} ]</h3>
              {agentes.map((a) => (
                <CartaoMovel key={a.id} agente={a} />
              ))}
            </div>
          ))}
          {terminais && <ConsoleEventos />}
        </div>
      ) : (
        <Piso deps={deps} zoom={zoom} terminais={terminais} />
      )}
    </section>
  );
}

function Piso({ deps, zoom, terminais }: { deps: { dep: Departamento; agentes: Agente[] }[]; zoom: number; terminais: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  // Navegação espacial com as setas: vai para o cubículo mais próximo naquela direção.
  const navegar = (e: KeyboardEvent<HTMLDivElement>) => {
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = dirs[e.key];
    if (!d) return;
    const todos = [...ref.current!.querySelectorAll<HTMLButtonElement>('.cubiculo')];
    if (!todos.length) return;
    e.preventDefault();
    const atual = document.activeElement as HTMLElement;
    if (!todos.includes(atual as HTMLButtonElement)) return todos[0]!.focus();
    const c = (el: Element) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2] as const;
    };
    const [x0, y0] = c(atual);
    let melhor: HTMLButtonElement | null = null;
    let menor = Infinity;
    for (const el of todos) {
      if (el === atual) continue;
      const [x, y] = c(el);
      const dx = x - x0;
      const dy = y - y0;
      const ao = dx * d[0] + dy * d[1];
      if (ao <= 4) continue;
      const lateral = Math.abs(d[0] ? dy : dx);
      const custo = ao + lateral * 2.5;
      if (custo < menor) [menor, melhor] = [custo, el];
    }
    melhor?.focus();
    melhor?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <div className="piso-area">
      <div className="piso-viewport" ref={ref} onKeyDown={navegar}>
        <div className="piso" style={{ zoom } as React.CSSProperties}>
          {deps.map(({ dep, agentes }) => (
            <div key={dep.id} className="setor" style={{ '--dep': dep.cor } as React.CSSProperties}>
              <div className="setor-placa">
                <span>[ {dep.nome.toUpperCase()} ]</span>
                <small>{agentes.length} {agentes.length === 1 ? 'agente' : 'agentes'}</small>
              </div>
              <div className="baias">
                {agentes.map((a) => (
                  <Cubiculo key={a.id} agente={a} />
                ))}
                {agentes.length === 0 && <p className="vazio">Setor vazio.</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {terminais && (
        <>
          <ConsoleEventos flutuante />
          <TerminalControle flutuante />
        </>
      )}
      <p className="dica-teclado" aria-hidden>
        ←↑↓→ navegar · Enter abrir · N nova tarefa · A novo agente
      </p>
    </div>
  );
}

function rotuloEstado(a: Agente, titulo?: string) {
  const base = `ESTADO: ${ESTADO_AGENTE_LABEL[a.estado]}`;
  if (!titulo || a.estado === 'ocioso') return base;
  const curto = titulo.length > 34 ? titulo.slice(0, 33) + '…' : titulo;
  return `${base} (${curto.toUpperCase()})`;
}

function Cubiculo({ agente }: { agente: Agente }) {
  const { dados, abrirAgente, agenteAberto } = useCtx();
  const dep = dados.departamentos.find((d) => d.id === agente.departamentoId);
  const tarefa = dados.tarefas.find((t) => t.id === agente.tarefaAtualId);
  return (
    <button
      className={`cubiculo e-${agente.estado} ${agenteAberto === agente.id ? 'selecionado' : ''}`}
      style={{ '--dep': dep?.cor ?? '#64748b' } as React.CSSProperties}
      onClick={() => abrirAgente(agente.id)}
      aria-label={`${agente.nome}, ${agente.cargo}. ${rotuloEstado(agente, tarefa?.titulo)}`}
    >
      <span className="rotulo-estado">{rotuloEstado(agente, tarefa?.titulo)}</span>
      <span className="baia" aria-hidden>
        <span className="divisoria-fundo" />
        <span className="divisoria-lado" />
        <span className="mesa">
          <span className="monitor">
            <span className="tela" />
          </span>
          <span className="teclado" />
          <span className="caneca" />
        </span>
        <span className="cadeira" />
        <Sprite agente={agente} cor={dep?.cor ?? '#64748b'} />
      </span>
      <span className="placa-nome">
        <b>{agente.nome}</b>
        <small>{agente.cargo}</small>
      </span>
    </button>
  );
}

function CartaoMovel({ agente }: { agente: Agente }) {
  const { dados, abrirAgente } = useCtx();
  const tarefa = dados.tarefas.find((t) => t.id === agente.tarefaAtualId);
  const dep = dados.departamentos.find((d) => d.id === agente.departamentoId);
  return (
    <button className={`cartao-movel e-${agente.estado}`} onClick={() => abrirAgente(agente.id)}>
      <span className="mini-monitor" aria-hidden>
        <Sprite agente={agente} cor={dep?.cor ?? '#64748b'} pequeno />
      </span>
      <span className="cartao-texto">
        <b>{agente.nome}</b>
        <small>{agente.cargo}</small>
        <span className="rotulo-estado inline">{rotuloEstado(agente, tarefa?.titulo)}</span>
      </span>
    </button>
  );
}

const NIVEL_COR = { info: 'n-info', sucesso: 'n-ok', aviso: 'n-aviso', erro: 'n-erro' } as const;

export function ConsoleEventos({ flutuante }: { flutuante?: boolean }) {
  const { dados } = useCtx();
  return (
    <aside className={`terminal console ${flutuante ? 'flutuante topo-esq' : ''}`} aria-label="Console de eventos">
      <header>
        <span className="luzes" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        tail -f eventos.log
      </header>
      <ol className="linhas" aria-live="polite">
        {dados.eventos.slice(0, 14).map((e) => (
          <li key={e.id} className={NIVEL_COR[e.nivel]}>
            <time>[{hora(e.ts)}]</time> {e.mensagem}
          </li>
        ))}
        {dados.eventos.length === 0 && <li className="n-info">sem eventos ainda…</li>}
      </ol>
    </aside>
  );
}

export function TerminalControle({ flutuante }: { flutuante?: boolean }) {
  const { dados, abrirAgente, irPara } = useCtx();
  const k = dados.kpis;
  const ativos = dados.agentes.filter((a) => a.estado === 'trabalhando');
  const pend = dados.aprovacoes.filter((a) => a.estado === 'pendente');
  const bloqueados = dados.agentes.filter((a) => a.estado === 'bloqueado' || a.estado === 'erro');
  return (
    <aside className={`terminal controle ${flutuante ? 'flutuante baixo-esq' : ''}`} aria-label="Terminal de controle">
      <header>
        <span className="luzes" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        terminal de controle
      </header>
      <div className="linhas">
        <p className="prompt">$ status --empresa</p>
        <dl className="kpis">
          <div>
            <dt>agentes</dt>
            <dd>{dados.agentes.length}</dd>
          </div>
          <div>
            <dt>trabalhando</dt>
            <dd className="n-ok">{k.agentesAtivos}</dd>
          </div>
          <div>
            <dt>tarefas abertas</dt>
            <dd>{k.tarefasAbertas}</dd>
          </div>
          <div>
            <dt>concluídas</dt>
            <dd>{k.tarefasConcluidas}</dd>
          </div>
          <div>
            <dt>aprovações</dt>
            <dd className={k.aprovacoesPendentes ? 'n-aviso' : ''}>{k.aprovacoesPendentes}</dd>
          </div>
          <div>
            <dt>custo total</dt>
            <dd>{moeda(k.custoTotal)}</dd>
          </div>
        </dl>
        <p className="prompt">$ ps --ativos</p>
        {ativos.length === 0 && <p className="n-info">nenhum agente trabalhando</p>}
        {ativos.map((a) => (
          <button key={a.id} className="linha-link n-ok" onClick={() => abrirAgente(a.id)}>
            ▸ {a.nome}: {dados.tarefas.find((t) => t.id === a.tarefaAtualId)?.titulo ?? '…'}
          </button>
        ))}
        {pend.length > 0 && (
          <>
            <p className="prompt">$ aprovacoes --pendentes</p>
            {pend.slice(0, 4).map((p) => (
              <button key={p.id} className="linha-link n-aviso" onClick={() => irPara('aprovacoes')}>
                ! {dados.tarefas.find((t) => t.id === p.tarefaId)?.titulo}
              </button>
            ))}
          </>
        )}
        {bloqueados.length > 0 && (
          <>
            <p className="prompt">$ alertas</p>
            {bloqueados.slice(0, 4).map((a) => (
              <button key={a.id} className="linha-link n-erro" onClick={() => abrirAgente(a.id)}>
                ✕ {a.nome}: {a.estado === 'erro' ? 'falha na última tarefa' : 'bloqueado'}
              </button>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
