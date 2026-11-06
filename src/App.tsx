import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Agente, Snapshot, StatusMotor } from '../shared/types';
import { api, useEmpresa } from './api';
import { Escritorio } from './components/Escritorio';
import { Organograma } from './components/Organograma';
import { Tarefas } from './components/Tarefas';
import { Aprovacoes } from './components/Aprovacoes';
import { Importar } from './components/Importar';
import { AgenteForm } from './components/AgenteForm';
import { TarefaForm } from './components/TarefaForm';
import { AgentePainel } from './components/AgentePainel';

type Aba = 'escritorio' | 'organograma' | 'tarefas' | 'aprovacoes' | 'importar';
type Modal =
  | { tipo: 'agente'; agente?: Agente }
  | { tipo: 'tarefa'; agenteId?: string }
  | null;
type Toast = { id: number; texto: string; nivel: 'ok' | 'erro' | 'aviso' };

interface Ctx {
  dados: Snapshot;
  motor: StatusMotor | null;
  abrirAgente: (id: string | null) => void;
  agenteAberto: string | null;
  novoAgente: () => void;
  editarAgente: (a: Agente) => void;
  novaTarefa: (agenteId?: string) => void;
  executar: (tarefaId: string) => Promise<void>;
  acao: <T>(fn: () => Promise<T>, ok?: string) => Promise<T | undefined>;
  toast: (texto: string, nivel?: Toast['nivel']) => void;
  irPara: (aba: Aba) => void;
}

const EmpresaCtx = createContext<Ctx | null>(null);
export const useCtx = () => useContext(EmpresaCtx)!;

const ABAS: { id: Aba; rotulo: string; tecla: string }[] = [
  { id: 'escritorio', rotulo: 'Escritório', tecla: '1' },
  { id: 'organograma', rotulo: 'Organograma', tecla: '2' },
  { id: 'tarefas', rotulo: 'Tarefas', tecla: '3' },
  { id: 'aprovacoes', rotulo: 'Aprovações', tecla: '4' },
  { id: 'importar', rotulo: 'Importar', tecla: '5' },
];

function lerAba(): Aba {
  const h = location.hash.replace('#', '') as Aba;
  return ABAS.some((a) => a.id === h) ? h : 'escritorio';
}

export default function App() {
  const { dados, motor, conectado, erro } = useEmpresa();
  const [aba, setAba] = useState<Aba>(lerAba);
  const [modal, setModal] = useState<Modal>(null);
  const [agenteAberto, setAgenteAberto] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const irPara = useCallback((a: Aba) => {
    setAba(a);
    history.replaceState(null, '', `#${a}`);
  }, []);

  const toast = useCallback((texto: string, nivel: Toast['nivel'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, texto, nivel }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), nivel === 'erro' ? 7000 : 4000);
  }, []);

  const acao = useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string) => {
      try {
        const r = await fn();
        if (ok) toast(ok);
        return r;
      } catch (e) {
        toast((e as Error).message, 'erro');
        return undefined;
      }
    },
    [toast],
  );

  const executar = useCallback(
    async (tarefaId: string) => {
      const t = await acao(() => api('POST', `/api/tarefas/${tarefaId}/executar`));
      if (!t) return;
      if (t.estado === 'bloqueada') toast(t.erro, 'erro');
      else if (t.estado === 'aguardando_aprovacao') toast('Ação sensível: aguardando aprovação humana.', 'aviso');
      else toast('Execução iniciada.');
    },
    [acao, toast],
  );

  useEffect(() => {
    const f = () => setAba(lerAba());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  // Atalhos globais: 1–5 trocam de aba; N = nova tarefa; A = novo agente.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (modal || e.ctrlKey || e.metaKey || e.altKey || alvo.closest('input, textarea, select, [contenteditable]')) return;
      const a = ABAS.find((x) => x.tecla === e.key);
      if (a) irPara(a.id);
      else if (e.key.toLowerCase() === 'n') setModal({ tipo: 'tarefa' });
      else if (e.key.toLowerCase() === 'a') setModal({ tipo: 'agente' });
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [modal, irPara]);

  const ctx = useMemo<Ctx | null>(
    () =>
      dados && {
        dados,
        motor,
        agenteAberto,
        abrirAgente: setAgenteAberto,
        novoAgente: () => setModal({ tipo: 'agente' }),
        editarAgente: (agente) => setModal({ tipo: 'agente', agente }),
        novaTarefa: (agenteId) => setModal({ tipo: 'tarefa', agenteId }),
        executar,
        acao,
        toast,
        irPara,
      },
    [dados, motor, agenteAberto, executar, acao, toast, irPara],
  );

  if (!ctx) {
    return (
      <div className="carregando">
        <span className="cursor">{erro ?? 'Conectando ao servidor'}</span>
      </div>
    );
  }

  const pendentes = ctx.dados.kpis.aprovacoesPendentes;

  return (
    <EmpresaCtx.Provider value={ctx}>
      <div className="app">
        <header className="topo">
          <div className="marca">
            <span className="marca-icone" aria-hidden>▌</span>
            <div>
              <strong>{ctx.dados.empresa}</strong>
              <small>empresa de software operada por agentes</small>
            </div>
          </div>
          <nav className="abas" aria-label="Seções">
            {ABAS.map((a) => (
              <button
                key={a.id}
                className={aba === a.id ? 'ativa' : ''}
                aria-current={aba === a.id ? 'page' : undefined}
                onClick={() => irPara(a.id)}
                title={`Atalho: ${a.tecla}`}
              >
                {a.rotulo}
                {a.id === 'aprovacoes' && pendentes > 0 && <span className="badge">{pendentes}</span>}
              </button>
            ))}
          </nav>
          <div className="topo-acoes">
            <span className={`conexao ${conectado ? 'on' : 'off'}`} title={conectado ? 'Tempo real conectado' : 'Reconectando…'}>
              {conectado ? 'AO VIVO' : 'OFFLINE'}
            </span>
            <button className="btn" onClick={() => setModal({ tipo: 'agente' })} title="Atalho: A">
              + Agente
            </button>
            <button className="btn primario" onClick={() => setModal({ tipo: 'tarefa' })} title="Atalho: N">
              + Tarefa
            </button>
          </div>
        </header>

        <main className={`conteudo aba-${aba}`}>
          {/* O escritório 3D fica montado entre abas (só pausa), para não recarregar a sede a cada troca. */}
          <div className="aba-escritorio-wrap" hidden={aba !== 'escritorio'}>
            <Escritorio ativo={aba === 'escritorio'} />
          </div>
          {aba === 'organograma' && <Organograma />}
          {aba === 'tarefas' && <Tarefas />}
          {aba === 'aprovacoes' && <Aprovacoes />}
          {aba === 'importar' && <Importar />}
        </main>

        {agenteAberto && <AgentePainel id={agenteAberto} onFechar={() => setAgenteAberto(null)} />}
        {modal?.tipo === 'agente' && <AgenteForm agente={modal.agente} onFechar={() => setModal(null)} />}
        {modal?.tipo === 'tarefa' && <TarefaForm agenteId={modal.agenteId} onFechar={() => setModal(null)} />}

        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.nivel}`}>
              {t.texto}
            </div>
          ))}
        </div>
      </div>
    </EmpresaCtx.Provider>
  );
}
