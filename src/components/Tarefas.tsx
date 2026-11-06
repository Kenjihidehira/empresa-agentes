import { useEffect, useMemo, useState } from 'react';
import { ACAO_LABEL, ACOES_COM_APROVACAO, type Evento, type Tarefa } from '../../shared/types';
import { api, dataHora, hora, moeda } from '../api';
import { useCtx } from '../App';
import { EstadoTarefaTag } from './Estado';

const FILTROS = {
  todas: { rotulo: 'Todas', f: () => true },
  abertas: { rotulo: 'Abertas', f: (t: Tarefa) => ['pendente', 'em_execucao', 'falhou'].includes(t.estado) },
  aprovacao: { rotulo: 'Aguardando aprovação', f: (t: Tarefa) => t.estado === 'aguardando_aprovacao' },
  bloqueadas: { rotulo: 'Bloqueadas', f: (t: Tarefa) => t.estado === 'bloqueada' },
  encerradas: { rotulo: 'Encerradas', f: (t: Tarefa) => ['concluida', 'rejeitada'].includes(t.estado) },
} as const;

export function Tarefas() {
  const { dados, novaTarefa } = useCtx();
  const [filtro, setFiltro] = useState<keyof typeof FILTROS>('todas');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return dados.tarefas.filter((t) => {
      if (!FILTROS[filtro].f(t)) return false;
      if (!q) return true;
      const ag = dados.agentes.find((a) => a.id === t.agenteId);
      return `${t.titulo} ${t.descricao} ${ag?.nome ?? ''}`.toLowerCase().includes(q);
    });
  }, [dados, filtro, busca]);

  return (
    <section className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Tarefas</h1>
          <p className="sub">
            Deploy e contato com cliente sempre passam por aprovação. Permissão e orçamento são checados antes de cada execução.
          </p>
        </div>
        <button className="btn primario" onClick={() => novaTarefa()}>
          + Tarefa
        </button>
      </div>
      <div className="barra-filtros">
        <div className="filtros" role="group" aria-label="Filtrar por estado">
          {Object.entries(FILTROS).map(([k, v]) => (
            <button key={k} className={`chip ${filtro === k ? 'on' : ''}`} onClick={() => setFiltro(k as keyof typeof FILTROS)}>
              {v.rotulo} <span className="contagem">{dados.tarefas.filter(v.f).length}</span>
            </button>
          ))}
        </div>
        <input
          className="busca"
          type="search"
          placeholder="Buscar por título ou agente…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar tarefas"
        />
      </div>
      <ul className="lista-tarefas">
        {lista.map((t) => (
          <LinhaTarefa key={t.id} tarefa={t} aberta={aberta === t.id} alternar={() => setAberta(aberta === t.id ? null : t.id)} />
        ))}
        {lista.length === 0 && <li className="vazio">Nenhuma tarefa neste filtro.</li>}
      </ul>
    </section>
  );
}

export function LinhaTarefa({ tarefa: t, aberta, alternar, semAgente }: { tarefa: Tarefa; aberta: boolean; alternar: () => void; semAgente?: boolean }) {
  const { dados, abrirAgente } = useCtx();
  const ag = dados.agentes.find((a) => a.id === t.agenteId);
  return (
    <li className={`tarefa ${aberta ? 'aberta' : ''}`}>
      <div className="tarefa-linha">
        <button className="tarefa-titulo" onClick={alternar} aria-expanded={aberta}>
          <span className="seta" aria-hidden>{aberta ? '▾' : '▸'}</span>
          <span>
            <b>{t.titulo}</b>
            <small>
              {ACAO_LABEL[t.acao]}
              {ACOES_COM_APROVACAO.includes(t.acao) && ' · exige aprovação'} · {dataHora(t.criadoEm)}
            </small>
          </span>
        </button>
        {!semAgente && (
          <button className="link-agente" onClick={() => ag && abrirAgente(ag.id)}>
            {ag?.nome ?? '—'}
          </button>
        )}
        <EstadoTarefaTag estado={t.estado} />
        <span className="custo">{t.custo ? moeda(t.custo) : `~${moeda(t.custoEstimado)}`}</span>
        <AcoesTarefa tarefa={t} />
      </div>
      {aberta && <DetalheTarefa tarefa={t} />}
    </li>
  );
}

export function AcoesTarefa({ tarefa: t }: { tarefa: Tarefa }) {
  const { executar, irPara } = useCtx();
  if (['pendente', 'bloqueada', 'falhou'].includes(t.estado))
    return (
      <button className="btn pequeno primario" onClick={() => executar(t.id)}>
        {t.estado === 'pendente' ? 'Executar' : 'Tentar de novo'}
      </button>
    );
  if (t.estado === 'aguardando_aprovacao')
    return (
      <button className="btn pequeno aviso" onClick={() => irPara('aprovacoes')}>
        Decidir
      </button>
    );
  if (t.estado === 'em_execucao') return <span className="spinner" aria-label="Executando" />;
  return <span className="acao-vazia" />;
}

function DetalheTarefa({ tarefa: t }: { tarefa: Tarefa }) {
  const { acao, toast } = useCtx();
  const [eventos, setEventos] = useState<Evento[]>([]);
  useEffect(() => {
    api<Evento[]>('GET', `/api/tarefas/${t.id}/eventos`).then(setEventos).catch(() => {});
  }, [t.id, t.atualizadoEm, t.estado]);
  const remover = async () => {
    if (!confirm(`Remover a tarefa "${t.titulo}"?`)) return;
    await acao(() => api('DELETE', `/api/tarefas/${t.id}`), 'Tarefa removida.');
  };
  return (
    <div className="tarefa-detalhe">
      {t.descricao && <p>{t.descricao}</p>}
      {t.erro && <p className="msg-erro">{t.erro}</p>}
      {t.resultado && (
        <div className="resultado">
          <div className="resultado-topo">
            <span>resultado</span>
            <button
              className="btn pequeno"
              onClick={() => navigator.clipboard?.writeText(t.resultado!).then(() => toast('Resultado copiado.'))}
            >
              Copiar
            </button>
          </div>
          <pre>{t.resultado}</pre>
        </div>
      )}
      <ol className="linha-tempo">
        {[...eventos].reverse().map((e) => (
          <li key={e.id} className={`n-${e.nivel === 'sucesso' ? 'ok' : e.nivel}`}>
            <time>{hora(e.ts)}</time> {e.mensagem}
          </li>
        ))}
      </ol>
      {t.estado !== 'em_execucao' && (
        <button className="btn pequeno perigo" onClick={remover}>
          Remover tarefa
        </button>
      )}
    </div>
  );
}
