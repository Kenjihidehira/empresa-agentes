import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ESTADO_AGENTE_LABEL, type Agente, type Tarefa } from '../../shared/types';
import { api, hora, moeda } from '../api';
import { useCtx } from '../App';

// O Three.js é carregado sob demanda, fora do pacote principal.
const Escritorio3D = lazy(() => import('./Escritorio3D'));

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

export function Escritorio({ ativo = true }: { ativo?: boolean }) {
  const { dados } = useCtx();
  const [filtro, setFiltro] = useState<string>('todos');
  const [terminais, setTerminais] = useState<boolean>(() => lerPref('terminais', true));
  useEffect(() => salvarPref('terminais', terminais), [terminais]);

  const deps = useMemo(
    () => dados.departamentos.filter((d) => filtro === 'todos' || d.id === filtro),
    [dados.departamentos, filtro],
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
          <button className="btn pequeno" onClick={() => setTerminais((t) => !t)} aria-pressed={!terminais}>
            {terminais ? 'Ocultar terminais' : 'Mostrar terminais'}
          </button>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="piso-area">
            <div className="carga-3d">
              <span>Carregando motor 3D…</span>
            </div>
          </div>
        }
      >
        <Escritorio3D deps={deps} ativo={ativo} terminais={terminais} onFecharTerminais={() => setTerminais(false)} />
      </Suspense>
    </section>
  );
}

export function Rotulo({
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
// Janela de chat (eventos ao vivo + delegar tarefa ao agente selecionado)
// ---------------------------------------------------------------------------
export function JanelaChat({ flutuante, onFechar }: { flutuante?: boolean; onFechar?: () => void }) {
  const { dados, agenteAberto, toast } = useCtx();
  const [texto, setTexto] = useState('');
  const [minimizada, setMinimizada] = useState(() => window.matchMedia('(max-width: 760px)').matches);
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
