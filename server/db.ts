import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  Acao,
  Agente,
  Aprovacao,
  Departamento,
  Evento,
  NivelEvento,
  Pacote,
  Snapshot,
  Tarefa,
} from '../shared/types';

const DB_PATH = process.env.DB_PATH ?? resolve(process.cwd(), 'data/empresa.db');
if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pacotes (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, versao TEXT NOT NULL,
  importado_em TEXT NOT NULL, conteudo TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS departamentos (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, cor TEXT NOT NULL, ordem INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS agentes (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cargo TEXT NOT NULL,
  departamento_id TEXT NOT NULL REFERENCES departamentos(id),
  gestor_id TEXT REFERENCES agentes(id) ON DELETE SET NULL,
  provedor TEXT NOT NULL DEFAULT 'simulacao',
  modelo TEXT,
  instrucoes TEXT NOT NULL DEFAULT '',
  permissoes TEXT NOT NULL DEFAULT '[]',
  orcamento REAL NOT NULL DEFAULT 0,
  gasto REAL NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'ocioso',
  tarefa_atual_id TEXT,
  pacote_id TEXT REFERENCES pacotes(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tarefas (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  agente_id TEXT NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
  acao TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendente',
  custo_estimado REAL NOT NULL DEFAULT 0,
  custo REAL NOT NULL DEFAULT 0,
  resultado TEXT,
  erro TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS aprovacoes (
  id TEXT PRIMARY KEY,
  tarefa_id TEXT NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendente',
  nota TEXT,
  criado_em TEXT NOT NULL,
  decidido_em TEXT
);
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  tipo TEXT NOT NULL,
  nivel TEXT NOT NULL DEFAULT 'info',
  agente_id TEXT,
  tarefa_id TEXT,
  mensagem TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eventos_tarefa ON eventos(tarefa_id);
`);

/** Emite 'mudanca' sempre que o estado muda; o SSE repassa ao navegador. */
export const barramento = new EventEmitter();
barramento.setMaxListeners(100);

export const agora = () => new Date().toISOString();
export const novoId = (prefixo: string) => `${prefixo}_${randomUUID().slice(0, 8)}`;

type Row = Record<string, any>;

const mapDepartamento = (r: Row): Departamento => ({ id: r.id, nome: r.nome, cor: r.cor, ordem: r.ordem });
const mapAgente = (r: Row): Agente => ({
  id: r.id,
  nome: r.nome,
  cargo: r.cargo,
  departamentoId: r.departamento_id,
  gestorId: r.gestor_id,
  provedor: r.provedor,
  modelo: r.modelo,
  instrucoes: r.instrucoes,
  permissoes: JSON.parse(r.permissoes),
  orcamento: r.orcamento,
  gasto: r.gasto,
  estado: r.estado,
  tarefaAtualId: r.tarefa_atual_id,
  pacoteId: r.pacote_id,
  criadoEm: r.criado_em,
});
const mapTarefa = (r: Row): Tarefa => ({
  id: r.id,
  titulo: r.titulo,
  descricao: r.descricao,
  agenteId: r.agente_id,
  acao: r.acao,
  estado: r.estado,
  custoEstimado: r.custo_estimado,
  custo: r.custo,
  resultado: r.resultado,
  erro: r.erro,
  criadoEm: r.criado_em,
  atualizadoEm: r.atualizado_em,
});
const mapAprovacao = (r: Row): Aprovacao => ({
  id: r.id,
  tarefaId: r.tarefa_id,
  motivo: r.motivo,
  estado: r.estado,
  nota: r.nota,
  criadoEm: r.criado_em,
  decididoEm: r.decidido_em,
});
const mapEvento = (r: Row): Evento => ({
  id: r.id,
  ts: r.ts,
  tipo: r.tipo,
  nivel: r.nivel,
  agenteId: r.agente_id,
  tarefaId: r.tarefa_id,
  mensagem: r.mensagem,
});

export const repo = {
  departamentos: () => db.prepare('SELECT * FROM departamentos ORDER BY ordem, nome').all().map(mapDepartamento),
  departamento: (id: string) => {
    const r = db.prepare('SELECT * FROM departamentos WHERE id = ?').get(id);
    return r ? mapDepartamento(r) : null;
  },
  agentes: () => db.prepare('SELECT * FROM agentes ORDER BY criado_em, nome').all().map(mapAgente),
  agente: (id: string) => {
    const r = db.prepare('SELECT * FROM agentes WHERE id = ?').get(id);
    return r ? mapAgente(r) : null;
  },
  tarefas: () => db.prepare('SELECT * FROM tarefas ORDER BY criado_em DESC').all().map(mapTarefa),
  tarefa: (id: string) => {
    const r = db.prepare('SELECT * FROM tarefas WHERE id = ?').get(id);
    return r ? mapTarefa(r) : null;
  },
  aprovacoes: () => db.prepare('SELECT * FROM aprovacoes ORDER BY criado_em DESC').all().map(mapAprovacao),
  aprovacao: (id: string) => {
    const r = db.prepare('SELECT * FROM aprovacoes WHERE id = ?').get(id);
    return r ? mapAprovacao(r) : null;
  },
  eventos: (limite = 200, tarefaId?: string) =>
    (tarefaId
      ? db.prepare('SELECT * FROM eventos WHERE tarefa_id = ? ORDER BY id DESC LIMIT ?').all(tarefaId, limite)
      : db.prepare('SELECT * FROM eventos ORDER BY id DESC LIMIT ?').all(limite)
    ).map(mapEvento),
  pacotes: (): Pacote[] =>
    db
      .prepare(
        `SELECT p.id, p.nome, p.versao, p.importado_em,
           (SELECT COUNT(*) FROM agentes a WHERE a.pacote_id = p.id) AS agentes,
           (SELECT COUNT(*) FROM departamentos d WHERE d.id LIKE p.id || ':%') AS departamentos
         FROM pacotes p ORDER BY p.importado_em DESC`,
      )
      .all()
      .map((r: Row) => ({
        id: r.id,
        nome: r.nome,
        versao: r.versao,
        importadoEm: r.importado_em,
        agentes: r.agentes,
        departamentos: r.departamentos,
      })),
  config: (chave: string) => (db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave) as Row | undefined)?.valor ?? null,
  setConfig: (chave: string, valor: string) =>
    db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').run(chave, valor),
};

export function registrarEvento(
  tipo: string,
  mensagem: string,
  opts: { nivel?: NivelEvento; agenteId?: string | null; tarefaId?: string | null } = {},
) {
  db.prepare('INSERT INTO eventos (ts, tipo, nivel, agente_id, tarefa_id, mensagem) VALUES (?, ?, ?, ?, ?, ?)').run(
    agora(),
    tipo,
    opts.nivel ?? 'info',
    opts.agenteId ?? null,
    opts.tarefaId ?? null,
    mensagem,
  );
  notificar();
}

let pendente: NodeJS.Timeout | null = null;
/** Agrupa várias mudanças seguidas em uma única notificação. */
export function notificar() {
  if (pendente) return;
  pendente = setTimeout(() => {
    pendente = null;
    barramento.emit('mudanca');
  }, 50);
}

export function atualizarTarefa(id: string, campos: Partial<Record<'estado' | 'custo' | 'resultado' | 'erro', unknown>>) {
  const chaves = Object.keys(campos);
  if (!chaves.length) return;
  const sets = chaves.map((c) => `${c} = ?`).join(', ');
  db.prepare(`UPDATE tarefas SET ${sets}, atualizado_em = ? WHERE id = ?`).run(
    ...(Object.values(campos) as any[]),
    agora(),
    id,
  );
  notificar();
}

export function atualizarAgente(
  id: string,
  campos: Partial<Record<'estado' | 'tarefa_atual_id' | 'gasto' | 'orcamento', unknown>>,
) {
  const chaves = Object.keys(campos);
  if (!chaves.length) return;
  db.prepare(`UPDATE agentes SET ${chaves.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
    ...(Object.values(campos) as any[]),
    id,
  );
  notificar();
}

export function snapshot(): Snapshot {
  const agentes = repo.agentes();
  const tarefas = repo.tarefas();
  const aprovacoes = repo.aprovacoes();
  return {
    empresa: repo.config('empresa') ?? 'Empresa de Agentes',
    departamentos: repo.departamentos(),
    agentes,
    tarefas,
    aprovacoes,
    eventos: repo.eventos(60),
    pacotes: repo.pacotes(),
    kpis: {
      agentesAtivos: agentes.filter((a) => a.estado === 'trabalhando').length,
      tarefasConcluidas: tarefas.filter((t) => t.estado === 'concluida').length,
      tarefasAbertas: tarefas.filter((t) => !['concluida', 'rejeitada'].includes(t.estado)).length,
      aprovacoesPendentes: aprovacoes.filter((a) => a.estado === 'pendente').length,
      custoTotal: Math.round(agentes.reduce((s, a) => s + a.gasto, 0) * 100) / 100,
    },
  };
}

export function temPermissao(agente: Agente, acao: Acao) {
  return agente.permissoes.includes(acao);
}
