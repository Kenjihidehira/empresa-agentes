import { useMemo, useState, type FormEvent } from 'react';
import { ACAO_LABEL, ACOES, ACOES_COM_APROVACAO, CUSTO_ESTIMADO, type Acao, type Tarefa } from '../../shared/types';
import { api, moeda } from '../api';
import { useCtx } from '../App';
import { Modal } from './Modal';

export function TarefaForm({ agenteId, onFechar }: { agenteId?: string; onFechar: () => void }) {
  const { dados, toast } = useCtx();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [agente, setAgente] = useState(agenteId ?? dados.agentes[0]?.id ?? '');
  const ag = dados.agentes.find((a) => a.id === agente);
  const [acao, setAcao] = useState<Acao>(ag?.permissoes[0] ?? 'codigo');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const avisos = useMemo(() => {
    if (!ag) return [];
    const r: { nivel: string; texto: string }[] = [];
    if (!ag.permissoes.includes(acao)) r.push({ nivel: 'erro', texto: `${ag.nome} não tem permissão para "${ACAO_LABEL[acao]}". A execução será bloqueada.` });
    const disp = ag.orcamento - ag.gasto;
    if (CUSTO_ESTIMADO[acao] > disp) r.push({ nivel: 'erro', texto: `Orçamento disponível (${moeda(disp)}) é menor que o custo estimado.` });
    if (ACOES_COM_APROVACAO.includes(acao)) r.push({ nivel: 'aviso', texto: 'Esta ação vai esperar aprovação humana antes de executar.' });
    return r;
  }, [ag, acao]);

  const enviar = async (executar: boolean) => {
    setErro(null);
    setEnviando(true);
    try {
      const t = await api<Tarefa>('POST', '/api/tarefas', { titulo, descricao, agenteId: agente, acao, executar });
      if (t.estado === 'bloqueada') toast(`Tarefa criada, mas bloqueada: ${t.erro}`, 'erro');
      else if (t.estado === 'aguardando_aprovacao') toast('Tarefa criada e aguardando aprovação.', 'aviso');
      else toast(executar ? 'Tarefa criada e em execução.' : 'Tarefa criada.');
      onFechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    enviar(true);
  };

  return (
    <Modal titulo="Nova tarefa" onFechar={onFechar}>
      <form className="form" onSubmit={submit}>
        <label className="campo">
          <span>Título</span>
          <input required minLength={3} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Corrigir bug no login com SSO" />
        </label>
        <div className="grade-2">
          <label className="campo">
            <span>Responsável</span>
            <select
              value={agente}
              onChange={(e) => {
                setAgente(e.target.value);
                const novo = dados.agentes.find((a) => a.id === e.target.value);
                if (novo && !novo.permissoes.includes(acao) && novo.permissoes[0]) setAcao(novo.permissoes[0]);
              }}
            >
              {dados.departamentos.map((d) => {
                const ags = dados.agentes.filter((a) => a.departamentoId === d.id);
                return ags.length ? (
                  <optgroup key={d.id} label={d.nome}>
                    {ags.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nome} · {a.cargo}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>
          <label className="campo">
            <span>Tipo de trabalho</span>
            <select value={acao} onChange={(e) => setAcao(e.target.value as Acao)}>
              {ACOES.map((a) => (
                <option key={a} value={a}>
                  {ACAO_LABEL[a]} (~{moeda(CUSTO_ESTIMADO[a])}){ag && !ag.permissoes.includes(a) ? ' — sem permissão' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="campo">
          <span>Descrição</span>
          <textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Contexto, critérios de aceite, links…" />
        </label>
        {avisos.map((a) => (
          <p key={a.texto} className={a.nivel === 'erro' ? 'msg-erro' : 'msg-aviso'}>
            {a.texto}
          </p>
        ))}
        {erro && <p className="msg-erro" role="alert">{erro}</p>}
        <div className="botoes">
          <button type="button" className="btn" disabled={enviando || titulo.trim().length < 3} onClick={() => enviar(false)}>
            Só criar
          </button>
          <button className="btn primario" disabled={enviando}>
            Criar e executar
          </button>
        </div>
      </form>
    </Modal>
  );
}
