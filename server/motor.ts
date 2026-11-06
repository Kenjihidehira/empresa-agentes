import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACAO_LABEL,
  ACOES_COM_APROVACAO,
  PROVEDOR_LABEL,
  type Agente,
  type EstadoAgente,
  type Provedor,
  type StatusMotor,
  type Tarefa,
} from '../shared/types';
import { agora, atualizarAgente, atualizarTarefa, db, novoId, registrarEvento, repo, temPermissao } from './db';

export class ErroRegra extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

const SIM_PASSO_MS = Number(process.env.SIM_PASSO_MS ?? 1600);
const TIMEOUT_CLI_MS = Number(process.env.TIMEOUT_CLI_MS ?? 5 * 60_000);
const WORKSPACE = resolve(process.cwd(), 'data/workspace');

const arred = (n: number) => Math.round(n * 10000) / 10000;

// ---------------------------------------------------------------------------
// Estado do agente: derivado das tarefas dele, então nunca fica dessincronizado.
// ---------------------------------------------------------------------------
export function recalcularAgente(agenteId: string) {
  const tarefas = db
    .prepare('SELECT id, estado FROM tarefas WHERE agente_id = ? ORDER BY atualizado_em DESC')
    .all(agenteId) as { id: string; estado: string }[];
  const primeira = (estado: string) => tarefas.find((t) => t.estado === estado);
  let estado: EstadoAgente = 'ocioso';
  let atual: string | null = null;
  const execucao = primeira('em_execucao');
  const aprovacao = primeira('aguardando_aprovacao');
  const bloqueada = primeira('bloqueada');
  if (execucao) [estado, atual] = ['trabalhando', execucao.id];
  else if (aprovacao) [estado, atual] = ['aguardando_aprovacao', aprovacao.id];
  else if (bloqueada) [estado, atual] = ['bloqueado', bloqueada.id];
  else if (tarefas[0]?.estado === 'falhou') [estado, atual] = ['erro', tarefas[0].id];
  atualizarAgente(agenteId, { estado, tarefa_atual_id: atual });
}

// ---------------------------------------------------------------------------
// Regras de negócio
// ---------------------------------------------------------------------------
export type Verificacao = { ok: true } | { ok: false; motivo: string };

export function verificarRegras(agente: Agente, tarefa: Tarefa): Verificacao {
  if (!temPermissao(agente, tarefa.acao)) {
    return {
      ok: false,
      motivo: `${agente.nome} não tem permissão para "${ACAO_LABEL[tarefa.acao]}". Permissões atuais: ${
        agente.permissoes.map((p) => ACAO_LABEL[p]).join(', ') || 'nenhuma'
      }.`,
    };
  }
  const disponivel = arred(agente.orcamento - agente.gasto);
  if (tarefa.custoEstimado > disponivel) {
    return {
      ok: false,
      motivo: `Orçamento insuficiente: ${agente.nome} tem US$ ${disponivel.toFixed(2)} disponíveis e a tarefa custa cerca de US$ ${tarefa.custoEstimado.toFixed(2)}.`,
    };
  }
  return { ok: true };
}

const aprovacaoDaTarefa = (tarefaId: string, estado: string) =>
  db.prepare('SELECT id FROM aprovacoes WHERE tarefa_id = ? AND estado = ? LIMIT 1').get(tarefaId, estado) as
    | { id: string }
    | undefined;

/**
 * Pede a execução de uma tarefa. Aplica permissões, orçamento e o gate de aprovação.
 * Retorna o estado resultante; a execução em si roda em segundo plano.
 */
export function executarTarefa(tarefaId: string): Tarefa {
  const tarefa = repo.tarefa(tarefaId);
  if (!tarefa) throw new ErroRegra('Tarefa não encontrada.', 404);
  if (!['pendente', 'bloqueada', 'falhou'].includes(tarefa.estado)) {
    throw new ErroRegra(`A tarefa está "${tarefa.estado}" e não pode ser executada agora.`);
  }
  const agente = repo.agente(tarefa.agenteId);
  if (!agente) throw new ErroRegra('O agente responsável não existe mais.', 404);
  if (agente.estado === 'trabalhando') {
    throw new ErroRegra(`${agente.nome} já está trabalhando em outra tarefa. Aguarde terminar.`);
  }

  const regras = verificarRegras(agente, tarefa);
  if (!regras.ok) {
    atualizarTarefa(tarefa.id, { estado: 'bloqueada', erro: regras.motivo });
    registrarEvento('tarefa.bloqueada', `Bloqueada: ${tarefa.titulo}. ${regras.motivo}`, {
      nivel: 'erro',
      agenteId: agente.id,
      tarefaId: tarefa.id,
    });
    recalcularAgente(agente.id);
    return repo.tarefa(tarefa.id)!;
  }

  if (ACOES_COM_APROVACAO.includes(tarefa.acao) && !aprovacaoDaTarefa(tarefa.id, 'aprovada')) {
    if (!aprovacaoDaTarefa(tarefa.id, 'pendente')) {
      db.prepare('INSERT INTO aprovacoes (id, tarefa_id, motivo, estado, criado_em) VALUES (?, ?, ?, ?, ?)').run(
        novoId('apr'),
        tarefa.id,
        `"${ACAO_LABEL[tarefa.acao]}" exige aprovação humana antes de executar.`,
        'pendente',
        agora(),
      );
    }
    atualizarTarefa(tarefa.id, { estado: 'aguardando_aprovacao', erro: null });
    registrarEvento('aprovacao.solicitada', `${agente.nome} pediu aprovação para: ${tarefa.titulo}`, {
      nivel: 'aviso',
      agenteId: agente.id,
      tarefaId: tarefa.id,
    });
    recalcularAgente(agente.id);
    return repo.tarefa(tarefa.id)!;
  }

  iniciar(agente, tarefa);
  return repo.tarefa(tarefa.id)!;
}

export function decidirAprovacao(aprovacaoId: string, decisao: 'aprovada' | 'rejeitada', nota?: string) {
  const apr = repo.aprovacao(aprovacaoId);
  if (!apr) throw new ErroRegra('Aprovação não encontrada.', 404);
  if (apr.estado !== 'pendente') throw new ErroRegra('Essa aprovação já foi decidida.');
  const tarefa = repo.tarefa(apr.tarefaId)!;
  db.prepare('UPDATE aprovacoes SET estado = ?, nota = ?, decidido_em = ? WHERE id = ?').run(
    decisao,
    nota ?? null,
    agora(),
    apr.id,
  );
  if (decisao === 'rejeitada') {
    atualizarTarefa(tarefa.id, { estado: 'rejeitada', erro: nota ? `Rejeitada: ${nota}` : 'Rejeitada por um humano.' });
    registrarEvento('aprovacao.rejeitada', `Rejeitado: ${tarefa.titulo}${nota ? ` (${nota})` : ''}`, {
      nivel: 'erro',
      agenteId: tarefa.agenteId,
      tarefaId: tarefa.id,
    });
    recalcularAgente(tarefa.agenteId);
    return repo.tarefa(tarefa.id)!;
  }
  registrarEvento('aprovacao.aprovada', `Aprovado: ${tarefa.titulo}`, {
    nivel: 'sucesso',
    agenteId: tarefa.agenteId,
    tarefaId: tarefa.id,
  });
  // Volta para pendente e passa de novo pelas regras (orçamento pode ter mudado).
  atualizarTarefa(tarefa.id, { estado: 'pendente' });
  recalcularAgente(tarefa.agenteId);
  return executarTarefa(tarefa.id);
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
function iniciar(agente: Agente, tarefa: Tarefa) {
  atualizarTarefa(tarefa.id, { estado: 'em_execucao', erro: null, resultado: null });
  registrarEvento('tarefa.iniciada', `${agente.nome} começou: ${tarefa.titulo} [${PROVEDOR_LABEL[agente.provedor]}]`, {
    agenteId: agente.id,
    tarefaId: tarefa.id,
  });
  recalcularAgente(agente.id);

  const runner = agente.provedor === 'simulacao' ? simular : agente.provedor === 'claude' ? rodarClaude : rodarCodex;
  runner(agente, tarefa)
    .then(({ resultado, custo }) => {
      const atual = repo.tarefa(tarefa.id);
      if (!atual || atual.estado !== 'em_execucao') return;
      const c = arred(custo);
      atualizarTarefa(tarefa.id, { estado: 'concluida', resultado, custo: c });
      db.prepare('UPDATE agentes SET gasto = gasto + ? WHERE id = ?').run(c, agente.id);
      registrarEvento('tarefa.concluida', `${agente.nome} concluiu: ${tarefa.titulo} (US$ ${c.toFixed(2)})`, {
        nivel: 'sucesso',
        agenteId: agente.id,
        tarefaId: tarefa.id,
      });
    })
    .catch((e: Error) => {
      if (!repo.tarefa(tarefa.id)) return;
      atualizarTarefa(tarefa.id, { estado: 'falhou', erro: e.message });
      registrarEvento('tarefa.falhou', `Falha em ${tarefa.titulo}: ${e.message}`, {
        nivel: 'erro',
        agenteId: agente.id,
        tarefaId: tarefa.id,
      });
    })
    .finally(() => {
      if (repo.agente(agente.id)) recalcularAgente(agente.id);
    });
}

function montarPrompt(agente: Agente, tarefa: Tarefa) {
  return [
    `Você é ${agente.nome}, ${agente.cargo} em uma empresa de desenvolvimento de software.`,
    agente.instrucoes && `Instruções: ${agente.instrucoes}`,
    `Tipo de trabalho: ${ACAO_LABEL[tarefa.acao]}.`,
    `Tarefa: ${tarefa.titulo}`,
    tarefa.descricao && `Detalhes: ${tarefa.descricao}`,
    'Responda em português, de forma objetiva, com o resultado do trabalho. Não execute comandos nem altere arquivos.',
  ]
    .filter(Boolean)
    .join('\n');
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RESULTADOS_SIMULADOS: Record<string, string[]> = {
  planejamento: ['Backlog priorizado em 3 épicos', '8 histórias estimadas (34 pontos)', 'Riscos: dependência da API de pagamentos'],
  codigo: ['Módulo refatorado em 4 arquivos', 'Complexidade ciclomática caiu de 18 para 7', 'Testes unitários atualizados (+12)'],
  revisao: ['2 sugestões de nomenclatura', '1 possível condição de corrida apontada', 'Aprovado com ressalvas'],
  teste: ['42 cenários executados', '40 passaram, 2 falharam (timeout no pagamento)', 'Relatório anexado ao ticket'],
  design: ['3 variações de wireframe', 'Fluxo reduzido de 6 para 4 telas', 'Protótipo navegável pronto para teste'],
  analise: ['Churn mensal estimado em 4,2%', 'Principal fator: onboarding incompleto', 'Recomendação: e-mail de ativação no D+2'],
  deploy: ['Build verificado', 'Rollout canário 10% → 100% sem erros', 'Versão publicada e monitorada por 15 min'],
  suporte: ['Ticket classificado como N2', 'Causa raiz identificada', 'Base de conhecimento atualizada'],
  contato_externo: ['Resposta redigida e enviada ao cliente', 'Prazo de correção informado', 'Ticket marcado como aguardando cliente'],
};

async function simular(agente: Agente, tarefa: Tarefa) {
  const passos = ['Lendo contexto e histórico', `Executando ${ACAO_LABEL[tarefa.acao].toLowerCase()}`, 'Revisando o resultado'];
  for (const p of passos) {
    await espera(SIM_PASSO_MS * (0.6 + Math.random() * 0.8));
    if (repo.tarefa(tarefa.id)?.estado !== 'em_execucao') throw new Error('Execução cancelada.');
    registrarEvento('tarefa.progresso', `${agente.nome}: ${p}…`, { agenteId: agente.id, tarefaId: tarefa.id });
  }
  const linhas = RESULTADOS_SIMULADOS[tarefa.acao] ?? ['Trabalho concluído'];
  return {
    resultado: `[simulação] ${tarefa.titulo}\n` + linhas.map((l) => `• ${l}`).join('\n'),
    custo: tarefa.custoEstimado * (0.8 + Math.random() * 0.4),
  };
}

function rodarCli(bin: string, args: string[]): Promise<string> {
  mkdirSync(WORKSPACE, { recursive: true });
  return new Promise((resolveP, reject) => {
    const proc = spawn(bin, args, { cwd: WORKSPACE, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`${bin} não respondeu em ${Math.round(TIMEOUT_CLI_MS / 1000)}s.`));
    }, TIMEOUT_CLI_MS);
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new Error(e.code === 'ENOENT' ? `"${bin}" não está instalado neste computador.` : e.message));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolveP(out.trim());
      else reject(new Error(`${bin} saiu com código ${code}: ${(err || out).trim().slice(-500) || 'sem detalhes'}`));
    });
  });
}

async function rodarClaude(agente: Agente, tarefa: Tarefa) {
  const args = ['-p', montarPrompt(agente, tarefa), '--output-format', 'json'];
  if (agente.modelo) args.push('--model', agente.modelo);
  const saida = await rodarCli('claude', args);
  try {
    const json = JSON.parse(saida);
    if (json.is_error) throw new Error(json.result || 'Claude retornou erro.');
    return { resultado: String(json.result ?? ''), custo: Number(json.total_cost_usd ?? tarefa.custoEstimado) };
  } catch (e) {
    if (e instanceof SyntaxError) return { resultado: saida, custo: tarefa.custoEstimado };
    throw e;
  }
}

async function rodarCodex(agente: Agente, tarefa: Tarefa) {
  const args = ['exec', '--skip-git-repo-check'];
  if (agente.modelo) args.push('-m', agente.modelo);
  args.push(montarPrompt(agente, tarefa));
  const saida = await rodarCli('codex', args);
  // O Codex CLI não informa custo; usamos a estimativa da ação.
  return { resultado: saida, custo: tarefa.custoEstimado };
}

// ---------------------------------------------------------------------------
// Status dos provedores e recuperação após reinício
// ---------------------------------------------------------------------------
let cacheStatus: { em: number; valor: StatusMotor } | null = null;

function binario(bin: string) {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 8000 });
  if (r.error) return { disponivel: false, detalhe: `"${bin}" não encontrado no PATH.` };
  return { disponivel: r.status === 0, detalhe: (r.stdout || r.stderr).trim().split('\n')[0] || bin };
}

export function statusMotor(): StatusMotor {
  if (cacheStatus && Date.now() - cacheStatus.em < 60_000) return cacheStatus.valor;
  const provedores: Record<Provedor, { disponivel: boolean; detalhe: string }> = {
    simulacao: { disponivel: true, detalhe: 'Dados fictícios, nenhum modelo é chamado.' },
    chatgpt: binario('codex'),
    claude: binario('claude'),
  };
  cacheStatus = { em: Date.now(), valor: { provedores } };
  return cacheStatus.valor;
}

export function recuperarAposReinicio() {
  const presas = db.prepare("SELECT id, agente_id FROM tarefas WHERE estado = 'em_execucao'").all() as {
    id: string;
    agente_id: string;
  }[];
  for (const t of presas) {
    atualizarTarefa(t.id, {
      estado: 'falhou',
      erro: 'A execução foi interrompida porque o servidor reiniciou. Execute de novo.',
    });
    registrarEvento('tarefa.interrompida', 'Execução interrompida pelo reinício do servidor.', {
      nivel: 'aviso',
      agenteId: t.agente_id,
      tarefaId: t.id,
    });
  }
  for (const a of repo.agentes()) recalcularAgente(a.id);
}
