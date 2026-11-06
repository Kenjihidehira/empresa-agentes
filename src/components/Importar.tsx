import { useRef, useState } from 'react';
import { api, dataHora } from '../api';
import { useCtx } from '../App';
import exemploValido from '../../exemplos/pacote-valido.json?raw';
import exemploInvalido from '../../exemplos/pacote-invalido.json?raw';

interface Resultado {
  valido: boolean;
  erros: { caminho: string; mensagem: string }[];
  resumo?: { nome: string; versao: string; departamentos: number; agentes: number; tarefas: number };
}

export function Importar() {
  const { dados, acao, toast, irPara } = useCtx();
  const [conteudo, setConteudo] = useState('');
  const [res, setRes] = useState<Resultado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const carregar = async (f?: File) => {
    if (!f) return;
    if (f.size > 1_500_000) return toast('Arquivo grande demais (máx. 1,5 MB).', 'erro');
    setConteudo(await f.text());
    setRes(null);
  };

  const validar = async () => {
    setOcupado(true);
    setRes((await acao(() => api<Resultado>('POST', '/api/pacotes/validar', { conteudo }))) ?? null);
    setOcupado(false);
  };
  const importar = async () => {
    setOcupado(true);
    const r = await acao(() => api<Resultado>('POST', '/api/pacotes/importar', { conteudo }));
    setOcupado(false);
    setRes(r ?? null);
    if (r?.valido) {
      toast(`Pacote "${r.resumo?.nome}" importado.`);
      setConteudo('');
    }
  };
  const remover = async (id: string, nome: string) => {
    if (!confirm(`Remover o pacote "${nome}" e todos os agentes que vieram dele?`)) return;
    await acao(() => api('DELETE', `/api/pacotes/${id}`), 'Pacote removido.');
  };

  return (
    <section className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Importar pacote</h1>
          <p className="sub">
            Traga um time pronto de <code>empresas-de-agentes</code> no formato <code>agentcompanies/v1</code> (JSON).
          </p>
        </div>
      </div>
      <div className="importar">
        <div className="importar-editor">
          <div
            className="soltar"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              carregar(e.dataTransfer.files[0]);
            }}
          >
            <p>Arraste um arquivo .json aqui ou</p>
            <button className="btn pequeno" onClick={() => arquivo.current?.click()}>
              Escolher arquivo
            </button>
            <input ref={arquivo} type="file" accept=".json,application/json" hidden onChange={(e) => carregar(e.target.files?.[0])} />
            <span className="ou">exemplos:</span>
            <button className="btn pequeno" onClick={() => (setConteudo(exemploValido), setRes(null))}>
              válido
            </button>
            <button className="btn pequeno" onClick={() => (setConteudo(exemploInvalido), setRes(null))}>
              com erros
            </button>
          </div>
          <textarea
            className="codigo"
            spellCheck={false}
            value={conteudo}
            onChange={(e) => (setConteudo(e.target.value), setRes(null))}
            placeholder='{ "apiVersion": "agentcompanies/v1", "kind": "AgentCompany", ... }'
            aria-label="Conteúdo do pacote"
          />
          <div className="botoes">
            <button className="btn" disabled={!conteudo.trim() || ocupado} onClick={validar}>
              Validar
            </button>
            <button className="btn primario" disabled={!conteudo.trim() || ocupado} onClick={importar}>
              Importar
            </button>
          </div>
        </div>
        <aside className="importar-lado">
          {res && (
            <div className={`resultado-validacao ${res.valido ? 'ok' : 'erro'}`} role="status">
              {res.valido ? (
                <>
                  <h3>✓ Pacote válido</h3>
                  {res.resumo && (
                    <p>
                      <b>{res.resumo.nome}</b> v{res.resumo.versao}: {res.resumo.agentes} agentes, {res.resumo.departamentos} departamentos,{' '}
                      {res.resumo.tarefas} tarefas.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h3>✕ {res.erros.length} {res.erros.length === 1 ? 'problema encontrado' : 'problemas encontrados'}</h3>
                  <ul>
                    {res.erros.map((e, i) => (
                      <li key={i}>
                        <code>{e.caminho}</code> {e.mensagem}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <details className="formato" open={!res}>
            <summary>Formato esperado</summary>
            <pre>{`{
  "apiVersion": "agentcompanies/v1",
  "kind": "AgentCompany",
  "metadata": { "name": "...", "version": "1.0.0" },
  "spec": {
    "departments": [{ "id", "name", "color"? }],
    "agents": [{
      "id", "name", "role", "department",
      "reportsTo"?, "provider"?, "model"?,
      "instructions"?, "permissions"?, "budgetUsd"?
    }],
    "tasks"?: [{ "title", "assignee", "action",
                 "description"? }]
  }
}`}</pre>
            <p className="dica">
              <code>department</code> pode apontar para um departamento do pacote ou um já existente (ex.: <code>qa</code>).
            </p>
          </details>
          <h3 className="secao">Pacotes importados</h3>
          {dados.pacotes.length === 0 && <p className="vazio">Nenhum ainda.</p>}
          <ul className="pacotes">
            {dados.pacotes.map((p) => (
              <li key={p.id}>
                <div>
                  <b>{p.nome}</b> <small>v{p.versao}</small>
                  <small>
                    {p.agentes} agentes · {dataHora(p.importadoEm)}
                  </small>
                </div>
                <button className="btn pequeno" onClick={() => irPara('escritorio')}>
                  Ver
                </button>
                <button className="btn pequeno perigo" onClick={() => remover(p.id, p.nome)}>
                  Remover
                </button>
              </li>
            ))}
          </ul>
          <button
            className="btn pequeno perigo restaurar"
            onClick={async () => {
              if (confirm('Apagar tudo e voltar à empresa de demonstração original?'))
                await acao(() => api('POST', '/api/demo/restaurar'), 'Demonstração restaurada.');
            }}
          >
            Restaurar demonstração
          </button>
        </aside>
      </div>
    </section>
  );
}
