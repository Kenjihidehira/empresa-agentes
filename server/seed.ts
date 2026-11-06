import { CUSTO_ESTIMADO, type Acao } from '../shared/types';
import { agora, db, novoId, registrarEvento, repo } from './db';

const DEPARTAMENTOS = [
  ['diretoria', 'Diretoria', '#f59e0b'],
  ['produto', 'Produto', '#a78bfa'],
  ['design', 'Design', '#f472b6'],
  ['frontend', 'Frontend', '#38bdf8'],
  ['backend', 'Backend', '#4ade80'],
  ['dados', 'Dados', '#2dd4bf'],
  ['qa', 'QA', '#facc15'],
  ['devops', 'DevOps', '#fb923c'],
  ['suporte', 'Suporte', '#94a3b8'],
] as const;

type SeedAgente = [id: string, nome: string, cargo: string, dep: string, gestor: string | null, perms: Acao[], orcamento: number, instrucoes: string];

const AGENTES: SeedAgente[] = [
  ['helena', 'Helena Duarte', 'CTO', 'diretoria', null, ['planejamento', 'revisao', 'analise'], 50, 'Define prioridades técnicas e arbitra decisões de arquitetura.'],
  ['rui', 'Rui Matos', 'Product Owner', 'produto', 'helena', ['planejamento', 'analise', 'contato_externo'], 20, 'Mantém o backlog priorizado e conversa com clientes.'],
  ['lia', 'Lia Torres', 'Product Designer', 'design', 'rui', ['design', 'analise'], 15, 'Desenha fluxos simples e acessíveis.'],
  ['bruno', 'Bruno Sato', 'Dev Frontend Sênior', 'frontend', 'helena', ['codigo', 'revisao', 'teste'], 30, 'React e TypeScript; preza por performance.'],
  ['carla', 'Carla Nunes', 'Dev Frontend', 'frontend', 'bruno', ['codigo', 'teste'], 20, 'Implementa telas a partir dos protótipos.'],
  ['diego', 'Diego Alves', 'Dev Backend Sênior', 'backend', 'helena', ['codigo', 'revisao', 'teste', 'analise'], 30, 'APIs Node e Postgres; revisa PRs do time.'],
  ['ana', 'Ana Kato', 'Dev Backend', 'backend', 'diego', ['codigo', 'teste'], 20, 'Integrações e filas.'],
  ['marina', 'Marina Lopes', 'Engenheira de Dados', 'dados', 'helena', ['analise', 'codigo'], 25, 'Pipelines e métricas de produto.'],
  ['igor', 'Igor Ramos', 'Analista de QA', 'qa', 'helena', ['teste', 'revisao'], 0, 'Testes exploratórios e E2E. Começa sem orçamento para demonstrar o bloqueio.'],
  ['paula', 'Paula Reis', 'QA de Automação', 'qa', 'igor', ['teste', 'codigo'], 15, 'Automatiza regressões com Playwright.'],
  ['otavio', 'Otávio Lima', 'SRE / DevOps', 'devops', 'helena', ['deploy', 'codigo', 'analise'], 25, 'CI/CD, observabilidade e deploys.'],
  ['sofia', 'Sofia Prado', 'Suporte N2', 'suporte', 'rui', ['suporte', 'contato_externo'], 10, 'Atende clientes e escala bugs para o time.'],
];

type SeedTarefa = [titulo: string, descricao: string, agente: string, acao: Acao, estado?: 'concluida'];

const TAREFAS: SeedTarefa[] = [
  ['Planejar sprint 42', 'Selecionar histórias do backlog para as próximas duas semanas.', 'rui', 'planejamento', 'concluida'],
  ['Code review do PR #318 (pagamentos)', 'Revisar a mudança no cálculo de juros do parcelamento.', 'diego', 'revisao'],
  ['Refatorar módulo de checkout', 'Separar validação, cálculo de frete e pagamento em serviços.', 'bruno', 'codigo'],
  ['Deploy da v2.4.0 em produção', 'Publicar a release com o novo checkout.', 'otavio', 'deploy'],
  ['Testes E2E do checkout', 'Cobrir compra com cartão, Pix e cupom.', 'igor', 'teste'],
  ['Responder cliente sobre bug de login', 'Cliente Acme relata erro 500 ao entrar com SSO.', 'sofia', 'contato_externo'],
  ['Análise de churn do trimestre', 'Identificar os principais motivos de cancelamento.', 'marina', 'analise'],
  ['Wireframe do novo onboarding', 'Reduzir o número de passos até o primeiro valor.', 'lia', 'design'],
  ['Revisar arquitetura do serviço de notificações', 'Avaliar migração para filas.', 'carla', 'revisao'],
];

export function semearSeVazio() {
  const n = (db.prepare('SELECT COUNT(*) AS n FROM agentes').get() as { n: number }).n;
  if (n > 0 || repo.config('semeado')) return false;
  semear();
  return true;
}

export function semear() {
  const ts = agora();
  db.exec('BEGIN');
  DEPARTAMENTOS.forEach(([id, nome, cor], i) =>
    db.prepare('INSERT OR IGNORE INTO departamentos (id, nome, cor, ordem) VALUES (?, ?, ?, ?)').run(id, nome, cor, i),
  );
  for (const [id, nome, cargo, dep, , perms, orc, instr] of AGENTES) {
    db.prepare(
      `INSERT INTO agentes (id, nome, cargo, departamento_id, provedor, instrucoes, permissoes, orcamento, criado_em)
       VALUES (?, ?, ?, ?, 'simulacao', ?, ?, ?, ?)`,
    ).run(id, nome, cargo, dep, instr, JSON.stringify(perms), orc, ts);
  }
  for (const [id, , , , gestor] of AGENTES) if (gestor) db.prepare('UPDATE agentes SET gestor_id = ? WHERE id = ?').run(gestor, id);
  TAREFAS.forEach(([titulo, desc, agente, acao, estado], i) => {
    const t = new Date(Date.now() - (TAREFAS.length - i) * 60_000).toISOString();
    const custo = estado === 'concluida' ? CUSTO_ESTIMADO[acao] : 0;
    db.prepare(
      `INSERT INTO tarefas (id, titulo, descricao, agente_id, acao, estado, custo_estimado, custo, resultado, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      novoId('tar'),
      titulo,
      desc,
      agente,
      acao,
      estado ?? 'pendente',
      CUSTO_ESTIMADO[acao],
      custo,
      estado === 'concluida' ? '[simulação] 8 histórias selecionadas (34 pontos).' : null,
      t,
      t,
    );
    if (custo) db.prepare('UPDATE agentes SET gasto = gasto + ? WHERE id = ?').run(custo, agente);
  });
  db.exec('COMMIT');
  repo.setConfig('empresa', 'Nébula Software');
  repo.setConfig('semeado', '1');
  registrarEvento('sistema', 'Empresa criada com 12 agentes de demonstração.', { nivel: 'sucesso' });
}
