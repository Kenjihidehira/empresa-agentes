import { useState } from 'react';
import { ACAO_LABEL, type Aprovacao } from '../../shared/types';
import { api, dataHora, moeda } from '../api';
import { useCtx } from '../App';

export function Aprovacoes() {
  const { dados } = useCtx();
  const pendentes = dados.aprovacoes.filter((a) => a.estado === 'pendente');
  const historico = dados.aprovacoes.filter((a) => a.estado !== 'pendente');
  return (
    <section className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Aprovações</h1>
          <p className="sub">Ações sensíveis param aqui até um humano decidir. Nada é executado sem a sua aprovação.</p>
        </div>
      </div>
      <h2 className="secao">Pendentes ({pendentes.length})</h2>
      {pendentes.length === 0 && (
        <p className="vazio">Nenhuma aprovação pendente. Execute uma tarefa de deploy ou de contato com cliente para ver o fluxo.</p>
      )}
      <div className="cards-aprovacao">
        {pendentes.map((a) => (
          <CartaoAprovacao key={a.id} aprovacao={a} />
        ))}
      </div>
      {historico.length > 0 && (
        <>
          <h2 className="secao">Histórico</h2>
          <ul className="historico">
            {historico.map((a) => {
              const t = dados.tarefas.find((x) => x.id === a.tarefaId);
              return (
                <li key={a.id}>
                  <span className={`tag ${a.estado === 'aprovada' ? 't-concluida' : 't-rejeitada'}`}>
                    {a.estado === 'aprovada' ? 'Aprovada' : 'Rejeitada'}
                  </span>
                  <span className="hist-titulo">{t?.titulo ?? 'tarefa removida'}</span>
                  {a.nota && <em>“{a.nota}”</em>}
                  <time>{a.decididoEm && dataHora(a.decididoEm)}</time>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function CartaoAprovacao({ aprovacao: a }: { aprovacao: Aprovacao }) {
  const { dados, acao, abrirAgente } = useCtx();
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const t = dados.tarefas.find((x) => x.id === a.tarefaId);
  const ag = t && dados.agentes.find((x) => x.id === t.agenteId);
  if (!t || !ag) return null;
  const decidir = async (decisao: 'aprovada' | 'rejeitada') => {
    setEnviando(true);
    await acao(
      () => api('POST', `/api/aprovacoes/${a.id}/decidir`, { decisao, nota: nota.trim() || undefined }),
      decisao === 'aprovada' ? 'Aprovado. A execução começou.' : 'Rejeitado. A tarefa não será executada.',
    );
    setEnviando(false);
  };
  return (
    <article className="cartao-aprovacao">
      <header>
        <span className="tag t-aguardando_aprovacao">{ACAO_LABEL[t.acao]}</span>
        <time>{dataHora(a.criadoEm)}</time>
      </header>
      <h3>{t.titulo}</h3>
      {t.descricao && <p>{t.descricao}</p>}
      <dl>
        <div>
          <dt>Solicitante</dt>
          <dd>
            <button className="link-agente" onClick={() => abrirAgente(ag.id)}>
              {ag.nome}
            </button>{' '}
            · {ag.cargo}
          </dd>
        </div>
        <div>
          <dt>Custo estimado</dt>
          <dd>{moeda(t.custoEstimado)}</dd>
        </div>
        <div>
          <dt>Motivo</dt>
          <dd>{a.motivo}</dd>
        </div>
      </dl>
      <label className="campo">
        <span>Observação (opcional)</span>
        <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: aprovado após janela das 22h" maxLength={500} />
      </label>
      <div className="botoes">
        <button className="btn perigo" disabled={enviando} onClick={() => decidir('rejeitada')}>
          Rejeitar
        </button>
        <button className="btn primario" disabled={enviando} onClick={() => decidir('aprovada')}>
          Aprovar e executar
        </button>
      </div>
    </article>
  );
}
