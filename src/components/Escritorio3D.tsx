import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Departamento } from '../../shared/types';
import { useCtx } from '../App';
import { Mundo } from '../three/mundo';
import { JanelaChat, PainelControle, Rotulo } from './Escritorio';

/** Escritório em 3D (Three.js) com a sede e os agentes do kit glTF. */
export default function Escritorio3D({
  deps,
  ativo,
  terminais,
  onFecharTerminais,
}: {
  deps: Departamento[];
  ativo: boolean;
  terminais: boolean;
  onFecharTerminais: () => void;
}) {
  const { dados, abrirAgente, agenteAberto } = useCtx();
  const host = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const mundo = useRef<Mundo | null>(null);
  const rotulos = useRef(new Map<string, HTMLDivElement>());
  const [carga, setCarga] = useState<{ fase: 'carregando' | 'pronto' | 'erro'; progresso: number; msg?: string }>({ fase: 'carregando', progresso: 0 });
  const [zoom, setZoom] = useState(1.1);
  const [economico, setEconomico] = useState(false);

  // Cria a cena uma vez.
  useEffect(() => {
    let m: Mundo;
    try {
      m = new Mundo(host.current!);
    } catch (e) {
      setCarga({ fase: 'erro', progresso: 0, msg: 'Este navegador não conseguiu iniciar o WebGL, necessário para o escritório 3D. Ative a aceleração de hardware ou use outro navegador.' });
      return;
    }
    mundo.current = m;
    m.onZoom = (z) => setZoom(z);
    m.onEconomico = () => setEconomico(true);
    m.onQuadro = (pos) => {
      for (const [id, p] of pos) {
        const el = rotulos.current.get(id);
        if (!el) continue;
        if (!p) {
          el.style.display = 'none';
          continue;
        }
        el.style.display = '';
        el.style.transform = `translate(${Math.round(p[0])}px, ${Math.round(p[1])}px) translate(-50%, -100%)`;
      }
    };
    m.carregarAmbiente((f) => setCarga((c) => ({ ...c, progresso: f })))
      .then(() => setCarga({ fase: 'pronto', progresso: 1 }))
      .catch((e) => setCarga({ fase: 'erro', progresso: 0, msg: `Não foi possível carregar a sede 3D (${(e as Error).message}).` }));
    return () => m.destruir();
  }, []);

  // Sincroniza agentes, estados e filtro de setor.
  useEffect(() => {
    const visiveis = new Set(deps.map((d) => d.id));
    mundo.current?.sincronizar(
      dados.agentes.map((a) => ({
        id: a.id,
        estado: a.estado,
        cor: dados.departamentos.find((d) => d.id === a.departamentoId)?.cor ?? '#64748b',
        visivel: visiveis.has(a.departamentoId),
      })),
    );
  }, [dados.agentes, dados.departamentos, deps, carga.fase]);

  useEffect(() => mundo.current?.selecionar(agenteAberto), [agenteAberto]);
  useEffect(() => mundo.current?.pausar(!ativo), [ativo, carga.fase]);

  // Clique (sem arrastar) seleciona o agente sob o ponteiro.
  const inicio = useRef<[number, number] | null>(null);
  const onDown = (e: PointerEvent) => (inicio.current = [e.clientX, e.clientY]);
  const onUp = (e: PointerEvent) => {
    const i = inicio.current;
    inicio.current = null;
    if (!i || Math.abs(e.clientX - i[0]) + Math.abs(e.clientY - i[1]) > 5 || e.button !== 0) return;
    const id = mundo.current?.escolher(e.clientX, e.clientY);
    if (id) abrirAgente(id);
  };
  const onMove = (e: PointerEvent) => {
    if (e.buttons) return;
    const id = mundo.current?.escolher(e.clientX, e.clientY);
    host.current!.style.cursor = id ? 'pointer' : 'grab';
  };

  // Setas navegam entre os rótulos (navegação espacial), como no modo pixel.
  const navegar = (e: KeyboardEvent<HTMLDivElement>) => {
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = dirs[e.key];
    if (!d) return;
    const todos = [...area.current!.querySelectorAll<HTMLButtonElement>('.alvo-agente')].filter((b) => b.offsetParent);
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
  };

  return (
    <div className={`piso-area ${terminais ? '' : 'terminais-ocultos'}`} ref={area} onKeyDown={navegar}>
      <div className="cena-3d" ref={host} onPointerDown={onDown} onPointerUp={onUp} onPointerMove={onMove} onContextMenu={(e) => e.preventDefault()} />
      <div className="camada-rotulos">
        {dados.agentes.map((a) => (
          <Rotulo
            key={a.id}
            agente={a}
            tarefa={dados.tarefas.find((t) => t.id === a.tarefaAtualId)}
            selecionado={a.id === agenteAberto}
            registrar={(el) => {
              if (el) {
                el.style.display = 'none';
                rotulos.current.set(a.id, el);
              } else rotulos.current.delete(a.id);
            }}
            onAbrir={() => {
              abrirAgente(a.id);
              mundo.current?.focar(a.id);
            }}
          />
        ))}
      </div>

      {carga.fase === 'carregando' && (
        <div className="carga-3d">
          <span>Carregando sede 3D… {Math.round(carga.progresso * 100)}%</span>
          <div className="barra-orc">
            <span style={{ width: `${carga.progresso * 100}%` }} />
          </div>
        </div>
      )}
      {carga.fase === 'erro' && (
        <div className="carga-3d erro">
          <span>{carga.msg}</span>
          <small>As outras abas (Tarefas, Aprovações, Organograma) continuam funcionando normalmente.</small>
        </div>
      )}

      <div className="zoom zoom-3d" role="group" aria-label="Zoom">
        <button onClick={() => mundo.current?.zoom(1 / 1.25)} aria-label="Diminuir zoom">−</button>
        <span>{Math.round((zoom / 1.1) * 100)}%</span>
        {economico && (
          <span className="economico" title="Este computador não sustentou a animação com sombras; elas foram desligadas para manter a fluidez.">
            modo leve
          </span>
        )}
        <button onClick={() => mundo.current?.zoom(1.25)} aria-label="Aumentar zoom">+</button>
      </div>

      {terminais && (
        <>
          <JanelaChat flutuante onFechar={onFecharTerminais} />
          <PainelControle flutuante />
        </>
      )}
      <p className="dica-teclado" aria-hidden>
        arraste para mover · botão direito gira · roda dá zoom · clique num agente para abrir
      </p>
    </div>
  );
}
