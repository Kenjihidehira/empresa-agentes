// Tipos e constantes compartilhados entre backend e frontend.

export const ACOES = [
  'planejamento',
  'codigo',
  'revisao',
  'teste',
  'design',
  'analise',
  'deploy',
  'suporte',
  'contato_externo',
] as const;
export type Acao = (typeof ACOES)[number];

export const ACAO_LABEL: Record<Acao, string> = {
  planejamento: 'Planejamento',
  codigo: 'Código',
  revisao: 'Code review',
  teste: 'Testes',
  design: 'Design',
  analise: 'Análise de dados',
  deploy: 'Deploy em produção',
  suporte: 'Suporte interno',
  contato_externo: 'Contato com cliente',
};

/** Ações que nunca rodam sem um humano aprovar antes. */
export const ACOES_COM_APROVACAO: Acao[] = ['deploy', 'contato_externo'];

/** Custo estimado (USD) de cada ação, usado para checar orçamento antes de executar. */
export const CUSTO_ESTIMADO: Record<Acao, number> = {
  planejamento: 0.4,
  codigo: 1.2,
  revisao: 0.6,
  teste: 0.8,
  design: 0.7,
  analise: 0.9,
  deploy: 0.5,
  suporte: 0.3,
  contato_externo: 0.2,
};

export const PROVEDORES = ['simulacao', 'chatgpt', 'claude'] as const;
export type Provedor = (typeof PROVEDORES)[number];
export const PROVEDOR_LABEL: Record<Provedor, string> = {
  simulacao: 'Simulação',
  chatgpt: 'ChatGPT (Codex CLI)',
  claude: 'Claude (Claude Code CLI)',
};

export type EstadoAgente = 'ocioso' | 'trabalhando' | 'aguardando_aprovacao' | 'bloqueado' | 'erro';
export type EstadoTarefa =
  | 'pendente'
  | 'em_execucao'
  | 'aguardando_aprovacao'
  | 'concluida'
  | 'falhou'
  | 'bloqueada'
  | 'rejeitada';

export const ESTADO_TAREFA_LABEL: Record<EstadoTarefa, string> = {
  pendente: 'Pendente',
  em_execucao: 'Em execução',
  aguardando_aprovacao: 'Aguardando aprovação',
  concluida: 'Concluída',
  falhou: 'Falhou',
  bloqueada: 'Bloqueada',
  rejeitada: 'Rejeitada',
};

export const ESTADO_AGENTE_LABEL: Record<EstadoAgente, string> = {
  ocioso: 'OCIOSO',
  trabalhando: 'TRABALHANDO',
  aguardando_aprovacao: 'AGUARDANDO APROVAÇÃO',
  bloqueado: 'BLOQUEADO',
  erro: 'ERRO',
};

export interface Departamento {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
}

export interface Agente {
  id: string;
  nome: string;
  cargo: string;
  departamentoId: string;
  gestorId: string | null;
  provedor: Provedor;
  modelo: string | null;
  instrucoes: string;
  permissoes: Acao[];
  orcamento: number;
  gasto: number;
  estado: EstadoAgente;
  tarefaAtualId: string | null;
  pacoteId: string | null;
  criadoEm: string;
}

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string;
  agenteId: string;
  acao: Acao;
  estado: EstadoTarefa;
  custoEstimado: number;
  custo: number;
  resultado: string | null;
  erro: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export type NivelEvento = 'info' | 'sucesso' | 'aviso' | 'erro';

export interface Evento {
  id: number;
  ts: string;
  tipo: string;
  nivel: NivelEvento;
  agenteId: string | null;
  tarefaId: string | null;
  mensagem: string;
}

export interface Aprovacao {
  id: string;
  tarefaId: string;
  motivo: string;
  estado: 'pendente' | 'aprovada' | 'rejeitada';
  nota: string | null;
  criadoEm: string;
  decididoEm: string | null;
}

export interface Pacote {
  id: string;
  nome: string;
  versao: string;
  importadoEm: string;
  agentes: number;
  departamentos: number;
}

export interface StatusMotor {
  provedores: Record<Provedor, { disponivel: boolean; detalhe: string }>;
}

export interface Snapshot {
  empresa: string;
  departamentos: Departamento[];
  agentes: Agente[];
  tarefas: Tarefa[];
  aprovacoes: Aprovacao[];
  eventos: Evento[];
  pacotes: Pacote[];
  kpis: {
    agentesAtivos: number;
    tarefasConcluidas: number;
    tarefasAbertas: number;
    aprovacoesPendentes: number;
    custoTotal: number;
  };
}
