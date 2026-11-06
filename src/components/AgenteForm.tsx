import { useState, type FormEvent } from 'react';
import { ACAO_LABEL, ACOES, ACOES_COM_APROVACAO, PROVEDOR_LABEL, PROVEDORES, type Acao, type Agente, type Provedor } from '../../shared/types';
import { api } from '../api';
import { useCtx } from '../App';
import { Modal } from './Modal';

export function AgenteForm({ agente, onFechar }: { agente?: Agente; onFechar: () => void }) {
  const { dados, motor, acao, abrirAgente } = useCtx();
  const [f, setF] = useState({
    nome: agente?.nome ?? '',
    cargo: agente?.cargo ?? '',
    departamentoId: agente?.departamentoId ?? dados.departamentos[0]?.id ?? '',
    gestorId: agente?.gestorId ?? '',
    provedor: agente?.provedor ?? ('simulacao' as Provedor),
    modelo: agente?.modelo ?? '',
    instrucoes: agente?.instrucoes ?? '',
    permissoes: agente?.permissoes ?? (['codigo'] as Acao[]),
    orcamento: String(agente?.orcamento ?? 10),
  });
  const [novoDep, setNovoDep] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const alternarPerm = (p: Acao) =>
    set('permissoes', f.permissoes.includes(p) ? f.permissoes.filter((x) => x !== p) : [...f.permissoes, p]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    const orcamento = Number(f.orcamento.replace(',', '.'));
    if (!Number.isFinite(orcamento) || orcamento < 0) return setErro('Orçamento deve ser um número maior ou igual a zero.');
    setEnviando(true);
    try {
      let departamentoId = f.departamentoId;
      if (departamentoId === '__novo') {
        const d = await api('POST', '/api/departamentos', { nome: novoDep });
        departamentoId = d.id;
      }
      const corpo = { ...f, departamentoId, orcamento, gestorId: f.gestorId || null, modelo: f.modelo || null };
      const salvo = agente
        ? await api<Agente>('PATCH', `/api/agentes/${agente.id}`, corpo)
        : await api<Agente>('POST', '/api/agentes', corpo);
      await acao(async () => salvo, agente ? 'Agente atualizado.' : `${salvo.nome} entrou na empresa.`);
      onFechar();
      abrirAgente(salvo.id);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const gestores = dados.agentes.filter((a) => a.id !== agente?.id);
  const status = motor?.provedores[f.provedor];

  return (
    <Modal titulo={agente ? `Editar ${agente.nome}` : 'Contratar agente'} onFechar={onFechar}>
      <form className="form" onSubmit={salvar}>
        <div className="grade-2">
          <label className="campo">
            <span>Nome</span>
            <input required minLength={2} value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Vera Lins" />
          </label>
          <label className="campo">
            <span>Cargo</span>
            <input required minLength={2} value={f.cargo} onChange={(e) => set('cargo', e.target.value)} placeholder="Ex.: Dev Backend" />
          </label>
          <label className="campo">
            <span>Departamento</span>
            <select value={f.departamentoId} onChange={(e) => set('departamentoId', e.target.value)}>
              {dados.departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
              <option value="__novo">+ Novo departamento…</option>
            </select>
          </label>
          {f.departamentoId === '__novo' ? (
            <label className="campo">
              <span>Nome do novo departamento</span>
              <input required minLength={2} value={novoDep} onChange={(e) => setNovoDep(e.target.value)} placeholder="Ex.: Segurança" />
            </label>
          ) : (
            <label className="campo">
              <span>Gestor</span>
              <select value={f.gestorId} onChange={(e) => set('gestorId', e.target.value)}>
                <option value="">— sem gestor (topo) —</option>
                {gestores.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome} · {a.cargo}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="campo">
            <span>Motor de execução</span>
            <select value={f.provedor} onChange={(e) => set('provedor', e.target.value as Provedor)}>
              {PROVEDORES.map((p) => (
                <option key={p} value={p}>
                  {PROVEDOR_LABEL[p]}
                  {motor && !motor.provedores[p].disponivel ? ' (indisponível)' : ''}
                </option>
              ))}
            </select>
            {status && <small className={status.disponivel ? 'dica' : 'dica n-aviso'}>{status.detalhe}</small>}
          </label>
          <label className="campo">
            <span>Modelo (opcional)</span>
            <input
              value={f.modelo}
              onChange={(e) => set('modelo', e.target.value)}
              disabled={f.provedor === 'simulacao'}
              placeholder={f.provedor === 'claude' ? 'ex.: sonnet' : f.provedor === 'chatgpt' ? 'ex.: gpt-5-codex' : 'não se aplica'}
            />
          </label>
          <label className="campo">
            <span>Orçamento (US$)</span>
            <input inputMode="decimal" value={f.orcamento} onChange={(e) => set('orcamento', e.target.value)} />
            {agente && <small className="dica">Já gasto: US$ {agente.gasto.toFixed(2)}</small>}
          </label>
        </div>
        <fieldset className="campo">
          <legend>Permissões</legend>
          <div className="perms">
            {ACOES.map((p) => (
              <label key={p} className={`perm ${f.permissoes.includes(p) ? 'on' : ''}`}>
                <input type="checkbox" checked={f.permissoes.includes(p)} onChange={() => alternarPerm(p)} />
                {ACAO_LABEL[p]}
                {ACOES_COM_APROVACAO.includes(p) && <em title="Exige aprovação humana"> ⚑</em>}
              </label>
            ))}
          </div>
          <small className="dica">⚑ mesmo com permissão, a ação só roda depois de aprovação humana.</small>
        </fieldset>
        <label className="campo">
          <span>Instruções (prompt do agente)</span>
          <textarea rows={3} value={f.instrucoes} onChange={(e) => set('instrucoes', e.target.value)} placeholder="Como esse agente deve trabalhar?" />
        </label>
        {erro && <p className="msg-erro" role="alert">{erro}</p>}
        <div className="botoes">
          <button type="button" className="btn" onClick={onFechar}>
            Cancelar
          </button>
          <button className="btn primario" disabled={enviando}>
            {agente ? 'Salvar' : 'Contratar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
