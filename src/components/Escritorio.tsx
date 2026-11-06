import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { ESTADO_AGENTE_LABEL, type Agente, type Departamento, type Tarefa } from '../../shared/types';
import { api, hora, moeda, useMedia } from '../api';
import { useCtx } from '../App';
import { desenharCena, desenharFundo, montarLayout, placasSetor, type Ator, type EstadoVisual } from '../iso/cena';
import { Sprite } from './Sprite';

const ZOOMS = [1, 1.5, 2, 2.5, 3];

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

const SELO: Record<string, string> = {
  trabalhando: 'TRABALHANDO',
  aguardando_aprovacao: 'AGUARDANDO APROVAÇÃO',
  bloqueado: 'BLOQUEADO',
  erro: 'ERRO',
};

export function Escritorio() {
  const { dados } = useCtx();
  const movel = useMedia('(max-width: 760px)');
  const [filtro, setFiltro] = useState<string>('todos');
  const [zoom, setZoom] = useState<number>(() => lerPref('zoom-iso', 2));
  const [terminais, setTerminais] = useState<boolean>(() => lerPref('terminais', true));

  useEffect(() => salvarPref('zoom-iso', zoom), [zoom]);
  useEffect(() => salvarPref('terminais', terminais), [terminais]);

  const deps = useMemo(
    () => dados.departamentos.filter((d) => filtro === 'todos' || d.id === filtro),
    [dados.departamentos, filtro],
  );
  const mudarZoom = (dir: number) => {
    const i = ZOOMS.indexOf(zoom);
    setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + dir))]!);
  };

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
              <button onClick={() => mudarZoom(-1)} aria-label="Diminuir zoom">−</button>
              <button onClick={() => setZoom(2)} title="Voltar a 200%">{Math.round(zoom * 100)}%</button>
              <button onClick={() => mudarZoom(1)} aria-label="Aumentar zoom">+</button>
            </div>
          )}
          <button className="btn pequeno" onClick={() => setTerminais((t) => !t)} aria-pressed={!terminais}>
            {terminais ? 'Ocultar terminais' : 'Mostrar terminais'}
          </button>
        </div>
      </div>

      {movel ? (
        <div className="lista-movel">
          {terminais && <PainelControle />}
          {deps.map((dep) => {
            const ags = dados.agentes.filter((a) => a.departamentoId === dep.id);
            if (!ags.length) return null;
            return (
              <div key={dep.id} className="grupo-movel" style={{ '--dep': dep.cor } as React.CSSProperties}>
                <h3>[ {dep.nome.toUpperCase()} ]</h3>
                {ags.map((a) => (
                  <CartaoMovel key={a.id} agente={a} />
                ))}
              </div>
            );
          })}
          {terminais && <JanelaChat />}
        </div>
      ) : (
        <PisoIso deps={deps} zoom={zoom} terminais={terminais} onFecharTerminais={() => setTerminais(false)} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Escritório isométrico (canvas + rótulos HTML)
// ---------------------------------------------------------------------------
function PisoIso({ deps, zoom, terminais, onFecharTerminais }: { deps: Departamento[]; zoom: number; terminais: boolean; onFecharTerminais: () => void }) {
  const { dados, abrirAgente, agenteAberto } = useCtx();
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rotulos = useRef(new Map<string, HTMLDivElement>());
  const atores = useRef<Ator[]>([]);
  const hover = useRef<string | null>(null);
  const estado = useRef({ dados, zoom, agenteAberto });
  estado.current = { dados, zoom, agenteAberto };

  // O layout só muda quando entram/saem agentes ou setores.
  const chave = deps
    .map((d) => `${d.id}:${dados.agentes.filter((a) => a.departamentoId === d.id).map((a) => a.id + (a.permissoes.includes('codigo') ? '+' : '')).join(',')}`)
    .join('|');
  const layout = useMemo(() => montarLayout(deps, dados.agentes), [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  const placas = useMemo(() => placasSetor(layout), [layout]);
  const postos = layout.postos;

  const fundo = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = layout.largura;
    c.height = layout.altura;
    desenharFundo(c.getContext('2d')!, layout);
    return c;
  }, [layout]);

  // Centraliza a câmera ao montar e ao mudar layout/zoom.
  useLayoutEffect(() => {
    const v = viewport.current;
    if (!v) return;
    v.scrollLeft = (layout.largura * zoom - v.clientWidth) / 2;
    v.scrollTop = Math.max(0, (layout.altura * zoom - v.clientHeight) / 2 - 40);
  }, [layout, zoom]);

  // Laço de animação (~30 fps).
  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!;
    let raf = 0;
    let ultimo = 0;
    const quadro = (t: number) => {
      raf = requestAnimationFrame(quadro);
      if (t - ultimo < 33) return;
      ultimo = t;
      const { dados: d, zoom: z, agenteAberto: sel } = estado.current;
      const visuais = new Map<string, EstadoVisual>();
      for (const a of d.agentes) {
        visuais.set(a.id, {
          estado: a.estado,
          cor: d.departamentos.find((x) => x.id === a.departamentoId)?.cor ?? '#64748b',
          selecionado: a.id === sel,
          hover: a.id === hover.current,
        });
      }
      ctx.drawImage(fundo, 0, 0);
      atores.current = desenharCena(ctx, layout, visuais, t);
      for (const at of atores.current) {
        const el = rotulos.current.get(at.agenteId);
        if (el) el.style.transform = `translate(${Math.round(at.cabeca[0] * z)}px, ${Math.round(at.cabeca[1] * z)}px) translate(-50%, -100%)`;
      }
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
  }, [layout, fundo]);

  // Arrastar para mover a câmera; clique simples seleciona agente.
  const arraste = useRef<{ x: number; y: number; sl: number; st: number; moveu: boolean } | null>(null);
  const acharAtor = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const x = (e.clientX - r.left) / zoom;
    const y = (e.clientY - r.top) / zoom;
    for (let i = atores.current.length - 1; i >= 0; i--) {
      const [bx, by, bw, bh] = atores.current[i]!.caixa;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return atores.current[i]!.agenteId;
    }
    return null;
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, .terminal')) return;
    const v = viewport.current!;
    arraste.current = { x: e.clientX, y: e.clientY, sl: v.scrollLeft, st: v.scrollTop, moveu: false };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const a = arraste.current;
    if (a && e.buttons === 1) {
      const dx = e.clientX - a.x;
      const dy = e.clientY - a.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) a.moveu = true;
      if (a.moveu) {
        viewport.current!.scrollLeft = a.sl - dx;
        viewport.current!.scrollTop = a.st - dy;
      }
      return;
    }
    if ((e.target as HTMLElement).tagName !== 'CANVAS') {
      hover.current = null;
      return;
    }
    hover.current = acharAtor(e);
    canvas.current!.style.cursor = hover.current ? 'pointer' : 'grab';
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const a = arraste.current;
    arraste.current = null;
    if (a && !a.moveu && (e.target as HTMLElement).tagName === 'CANVAS') {
      const id = acharAtor(e);
      if (id) abrirAgente(id);
    }
  };

  // Navegação espacial com as setas entre os rótulos dos agentes.
  const navegar = (e: KeyboardEvent<HTMLDivElement>) => {
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = dirs[e.key];
    if (!d) return;
    const todos = [...viewport.current!.querySelectorAll<HTMLButtonElement>('.alvo-agente')];
    if (!todos.length) return;
    e.preventDefault();
    const atual = document.activeElement as HTMLButtonElement;
    if (!todos.includes(atual)) return todos[0]!.focus();
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
      const ao = (x - x0) * d[0] + (y - y0) * d[1];
      if (ao <= 4) continue;
      const custo = ao + Math.abs(d[0] ? y - y0 : x - x0) * 2.5;
      if (custo < menor) [menor, melhor] = [custo, el];
    }
    melhor?.focus();
    melhor?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const porId = new Map(dados.agentes.map((a) => [a.id, a]));

  return (
    <div className="piso-area">
      <div
        className="piso-viewport iso"
        ref={viewport}
        onKeyDown={navegar}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => {
          arraste.current = null;
          hover.current = null;
        }}
      >
        <div className={`palco ${zoom < 1.5 ? 'compacto' : ''}`} style={{ width: layout.largura * zoom, height: layout.altura * zoom }}>
          <canvas ref={canvas} width={layout.largura} height={layout.altura} style={{ width: layout.largura * zoom, height: layout.altura * zoom }} />
          {placas.map((p) =>
            p.exec && p.parede ? (
              <div key={p.dep.id} className="placa-parede" style={{ left: p.parede[0] * zoom, top: p.parede[1] * zoom, fontSize: 5.5 * zoom }}>
                SALA DA {p.dep.nome.toUpperCase()}
              </div>
            ) : (
              <div
                key={p.dep.id}
                className="placa-setor"
                style={{ left: p.x * zoom, top: p.y * zoom, '--dep': p.dep.cor } as React.CSSProperties}
              >
                {p.dep.nome.toUpperCase()}
              </div>
            ),
          )}
          {postos.map((p) => {
            const a = porId.get(p.agenteId);
            if (!a) return null;
            const tarefa = dados.tarefas.find((t) => t.id === a.tarefaAtualId);
            return (
              <Rotulo
                key={a.id}
                agente={a}
                tarefa={tarefa}
                selecionado={a.id === agenteAberto}
                registrar={(el) => (el ? rotulos.current.set(a.id, el) : rotulos.current.delete(a.id))}
                onAbrir={() => abrirAgente(a.id)}
              />
            );
          })}
        </div>
      </div>
      {terminais && (
        <>
          <JanelaChat flutuante onFechar={onFecharTerminais} />
          <PainelControle flutuante />
        </>
      )}
      <p className="dica-teclado" aria-hidden>
        arraste para mover · ←↑↓→ navegar · Enter abrir · N nova tarefa · A novo agente
      </p>
    </div>
  );
}

function Rotulo({
  agente: a,
  tarefa,
  selecionado,
  registrar,
  onAbrir,
}: {
  agente: Agente;
  tarefa?: Tarefa;
  selecionado: boolean;
  registrar: (el: HTMLDivElement | null) => void;
  onAbrir: () => void;
}) {
  const selo = SELO[a.estado];
  const dica = `${a.nome} · ${a.cargo}\nESTADO: ${ESTADO_AGENTE_LABEL[a.estado]}${tarefa && a.estado !== 'ocioso' ? `\n${tarefa.titulo}` : ''}`;
  return (
    <div ref={registrar} className={`rotulo-iso e-${a.estado} ${selecionado ? 'sel' : ''}`}>
      <button className="nome-iso alvo-agente" onClick={onAbrir} title={dica} aria-label={dica.replace(/\n/g, '. ')}>
        {a.nome.toUpperCase()}
      </button>
      {selo && <span className={`selo e-${a.estado}`}>{selo}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Celular
// ---------------------------------------------------------------------------
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
        {SELO[agente.estado] ? (
          <span className={`selo inline e-${agente.estado}`} title={tarefa?.titulo}>
            {SELO[agente.estado]}
            {tarefa ? ` · ${tarefa.titulo}` : ''}
          </span>
        ) : (
          <span className="selo inline e-ocioso">OCIOSO</span>
        )}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Janela de chat (eventos ao vivo + delegar tarefa ao agente selecionado)
// ---------------------------------------------------------------------------
export function JanelaChat({ flutuante, onFechar }: { flutuante?: boolean; onFechar?: () => void }) {
  const { dados, agenteAberto, toast } = useCtx();
  const [texto, setTexto] = useState('');
  const [minimizada, setMinimizada] = useState(false);
  const lista = useRef<HTMLOListElement>(null);
  const alvo = dados.agentes.find((a) => a.id === agenteAberto);
  const eventos = dados.eventos.slice(0, 18).reverse();
  const ultimo = eventos.at(-1)?.id;

  useEffect(() => {
    if (lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [ultimo, minimizada]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!alvo || texto.trim().length < 3) return;
    const acao = alvo.permissoes.find((p) => p !== 'deploy' && p !== 'contato_externo') ?? alvo.permissoes[0] ?? 'codigo';
    try {
      const t = await api<Tarefa>('POST', '/api/tarefas', { titulo: texto.trim(), agenteId: alvo.id, acao, executar: true });
      setTexto('');
      if (t.estado === 'bloqueada') toast(`Bloqueada: ${t.erro}`, 'erro');
      else if (t.estado === 'aguardando_aprovacao') toast('Aguardando aprovação humana.', 'aviso');
      else toast(`${alvo.nome.split(' ')[0]} começou a trabalhar.`);
    } catch (err) {
      toast((err as Error).message, 'erro');
    }
  };

  return (
    <aside className={`janela-chat ${flutuante ? 'flutuante topo-esq' : ''} ${minimizada ? 'min' : ''}`} aria-label="Canal de eventos">
      <header>
        <span>#operação · ao vivo</span>
        <span className="janela-botoes">
          <button onClick={() => setMinimizada((m) => !m)} aria-label={minimizada ? 'Restaurar' : 'Minimizar'}>
            {minimizada ? '□' : '_'}
          </button>
          {onFechar && (
            <button onClick={onFechar} aria-label="Fechar terminais">
              ×
            </button>
          )}
        </span>
      </header>
      {!minimizada && (
        <>
          <ol className="mensagens" ref={lista} aria-live="polite">
            {eventos.map((ev) => {
              const ag = dados.agentes.find((a) => a.id === ev.agenteId);
              const quem = ag?.nome ?? 'Sistema';
              const msg = ag && ev.mensagem.startsWith(ag.nome) ? ev.mensagem.slice(ag.nome.length).replace(/^[:\s]+/, '') : ev.mensagem;
              return (
                <li key={ev.id} className={`n-${ev.nivel === 'sucesso' ? 'ok' : ev.nivel}`}>
                  <b>{quem}:</b> <span>{msg}</span>
                  <time>{hora(ev.ts)}</time>
                </li>
              );
            })}
          </ol>
          <form onSubmit={enviar} className="chat-entrada">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              disabled={!alvo}
              maxLength={140}
              placeholder={alvo ? `Delegar tarefa a ${alvo.nome.split(' ')[0]}…` : 'Clique em um agente para delegar'}
              aria-label="Delegar tarefa ao agente selecionado"
            />
            <button disabled={!alvo || texto.trim().length < 3} aria-label="Enviar">
              ➤
            </button>
          </form>
        </>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Painel de controle
// ---------------------------------------------------------------------------
export function PainelControle({ flutuante }: { flutuante?: boolean }) {
  const { dados, irPara } = useCtx();
  const k = dados.kpis;
  const alertas = dados.agentes.filter((a) => a.estado === 'bloqueado' || a.estado === 'erro').length;
  const status = alertas ? 'ATENÇÃO' : 'OPERACIONAL';
  return (
    <aside className={`painel-controle ${flutuante ? 'flutuante baixo-dir' : ''}`} aria-label="Painel de controle">
      <h2>PAINEL DE CONTROLE</h2>
      <dl>
        <div>
          <dt>AGENTES ATIVOS:</dt>
          <dd>{k.agentesAtivos}</dd>
        </div>
        <div>
          <dt>PROJETOS:</dt>
          <dd>{k.tarefasAbertas}</dd>
        </div>
        <div className="clicavel" onClick={() => irPara('aprovacoes')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && irPara('aprovacoes')}>
          <dt>APROVAÇÕES:</dt>
          <dd className={k.aprovacoesPendentes ? 'n-aviso' : ''}>{k.aprovacoesPendentes}</dd>
        </div>
        <div>
          <dt>CUSTO:</dt>
          <dd>{moeda(k.custoTotal)}</dd>
        </div>
        <div>
          <dt>ESTADO:</dt>
          <dd className={alertas ? 'n-erro' : ''}>{status}</dd>
        </div>
      </dl>
    </aside>
  );
}
