import { z } from 'zod';
import { ACOES, CUSTO_ESTIMADO, PROVEDORES, type Acao } from '../shared/types';
import { agora, db, novoId, registrarEvento, repo } from './db';
import { recalcularAgente } from './motor';

const obrig = (tipo: string) => ({
  error: (i: { input?: unknown }) => (i.input === undefined ? 'campo obrigatório' : `deve ser ${tipo}`),
});
const texto = () => z.string(obrig('texto'));

const id = z
  .string(obrig('texto'))
  .regex(/^[a-z0-9][a-z0-9-_]*$/, 'use só letras minúsculas, números, "-" ou "_" (ex.: "dev-backend")');

export const esquemaPacote = z
  .object({
    apiVersion: z.literal('agentcompanies/v1', { error: 'deve ser exatamente "agentcompanies/v1"' }),
    kind: z.literal('AgentCompany', { error: 'deve ser exatamente "AgentCompany"' }),
    metadata: z.object({
      name: texto().min(1, 'não pode ser vazio'),
      version: z.string().default('1.0.0'),
      description: z.string().optional(),
    }),
    spec: z.object({
      departments: z
        .array(
          z.object({
            id,
            name: texto().min(1),
            color: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}$/, 'use uma cor hexadecimal como "#4ade80"')
              .default('#64748b'),
          }),
        )
        .default([]),
      agents: z
        .array(
          z.object({
            id,
            name: texto().min(1),
            role: texto().min(1),
            department: texto(),
            reportsTo: z.string().nullable().optional(),
            provider: z.enum(PROVEDORES, { error: `use um de: ${PROVEDORES.join(', ')}` }).default('simulacao'),
            model: z.string().optional(),
            instructions: z.string().default(''),
            permissions: z
              .array(z.enum(ACOES, { error: `permissão desconhecida; use: ${ACOES.join(', ')}` }))
              .default([]),
            budgetUsd: z.number({ error: 'deve ser um número' }).min(0, 'não pode ser negativo').default(0),
          }),
        )
        .min(1, 'o pacote precisa de pelo menos um agente'),
      tasks: z
        .array(
          z.object({
            title: texto().min(1),
            description: z.string().default(''),
            assignee: texto(),
            action: z.enum(ACOES, { error: `ação desconhecida; use: ${ACOES.join(', ')}` }),
          }),
        )
        .default([]),
    }),
  })
  .strict();

export type PacoteAgentCompany = z.infer<typeof esquemaPacote>;

export interface ResultadoValidacao {
  valido: boolean;
  erros: { caminho: string; mensagem: string }[];
  resumo?: { nome: string; versao: string; departamentos: number; agentes: number; tarefas: number };
}

const formatarCaminho = (p: PropertyKey[]) =>
  p.reduce<string>((acc, k) => (typeof k === 'number' ? `${acc}[${k}]` : acc ? `${acc}.${String(k)}` : String(k)), '') || '(raiz)';

export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'pacote';

export function validarPacote(entrada: unknown): ResultadoValidacao & { pacote?: PacoteAgentCompany } {
  let dados = entrada;
  if (typeof entrada === 'string') {
    try {
      dados = JSON.parse(entrada);
    } catch (e) {
      return { valido: false, erros: [{ caminho: '(arquivo)', mensagem: `JSON inválido: ${(e as Error).message}` }] };
    }
  }
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    return { valido: false, erros: [{ caminho: '(raiz)', mensagem: 'o pacote deve ser um objeto JSON' }] };
  }

  const r = esquemaPacote.safeParse(dados);
  if (!r.success) {
    return {
      valido: false,
      erros: r.error.issues.map((i) => ({
        caminho: formatarCaminho(i.path),
        mensagem: i.code === 'unrecognized_keys' ? `campo(s) não reconhecido(s): ${i.keys.join(', ')}` : i.message,
      })),
    };
  }

  // Checagens de consistência entre referências.
  const p = r.data;
  const erros: ResultadoValidacao['erros'] = [];
  const deps = new Set(p.spec.departments.map((d) => d.id));
  const existentes = new Set(repo.departamentos().map((d) => d.id));
  const agentes = new Set<string>();

  p.spec.departments.forEach((d, i) => {
    if (p.spec.departments.findIndex((x) => x.id === d.id) !== i)
      erros.push({ caminho: `spec.departments[${i}].id`, mensagem: `id "${d.id}" repetido` });
  });
  p.spec.agents.forEach((a, i) => {
    if (agentes.has(a.id)) erros.push({ caminho: `spec.agents[${i}].id`, mensagem: `id "${a.id}" repetido` });
    agentes.add(a.id);
    if (!deps.has(a.department) && !existentes.has(a.department))
      erros.push({
        caminho: `spec.agents[${i}].department`,
        mensagem: `departamento "${a.department}" não existe no pacote nem na empresa (existentes: ${[...deps, ...existentes].join(', ')})`,
      });
  });
  p.spec.agents.forEach((a, i) => {
    if (a.reportsTo && !agentes.has(a.reportsTo))
      erros.push({ caminho: `spec.agents[${i}].reportsTo`, mensagem: `agente "${a.reportsTo}" não existe no pacote` });
    if (a.reportsTo === a.id)
      erros.push({ caminho: `spec.agents[${i}].reportsTo`, mensagem: 'um agente não pode ser gestor de si mesmo' });
  });
  p.spec.tasks.forEach((t, i) => {
    if (!agentes.has(t.assignee))
      erros.push({ caminho: `spec.tasks[${i}].assignee`, mensagem: `agente "${t.assignee}" não existe no pacote` });
  });
  const pacoteId = slug(p.metadata.name);
  if (repo.pacotes().some((x) => x.id === pacoteId))
    erros.push({
      caminho: 'metadata.name',
      mensagem: `já existe um pacote importado chamado "${p.metadata.name}". Remova-o antes de importar de novo.`,
    });

  return {
    valido: erros.length === 0,
    erros,
    pacote: p,
    resumo: {
      nome: p.metadata.name,
      versao: p.metadata.version,
      departamentos: p.spec.departments.length,
      agentes: p.spec.agents.length,
      tarefas: p.spec.tasks.length,
    },
  };
}

export function importarPacote(entrada: unknown) {
  const v = validarPacote(entrada);
  if (!v.valido || !v.pacote) return v;
  const p = v.pacote;
  const pid = slug(p.metadata.name);
  const ns = (x: string) => `${pid}:${x}`;
  const depsPacote = new Set(p.spec.departments.map((d) => d.id));
  const ordemBase = (repo.departamentos().at(-1)?.ordem ?? 0) + 1;
  const ts = agora();

  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO pacotes (id, nome, versao, importado_em, conteudo) VALUES (?, ?, ?, ?, ?)').run(
      pid,
      p.metadata.name,
      p.metadata.version,
      ts,
      JSON.stringify(p),
    );
    p.spec.departments.forEach((d, i) =>
      db.prepare('INSERT INTO departamentos (id, nome, cor, ordem) VALUES (?, ?, ?, ?)').run(ns(d.id), d.name, d.color, ordemBase + i),
    );
    const insAgente = db.prepare(
      `INSERT INTO agentes (id, nome, cargo, departamento_id, gestor_id, provedor, modelo, instrucoes, permissoes, orcamento, pacote_id, criado_em)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const a of p.spec.agents) {
      insAgente.run(
        ns(a.id),
        a.name,
        a.role,
        depsPacote.has(a.department) ? ns(a.department) : a.department,
        a.provider,
        a.model ?? null,
        a.instructions,
        JSON.stringify(a.permissions),
        a.budgetUsd,
        pid,
        ts,
      );
    }
    for (const a of p.spec.agents)
      if (a.reportsTo) db.prepare('UPDATE agentes SET gestor_id = ? WHERE id = ?').run(ns(a.reportsTo), ns(a.id));
    for (const t of p.spec.tasks) {
      db.prepare(
        `INSERT INTO tarefas (id, titulo, descricao, agente_id, acao, custo_estimado, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(novoId('tar'), t.title, t.description, ns(t.assignee), t.action, CUSTO_ESTIMADO[t.action as Acao], ts, ts);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  for (const a of p.spec.agents) recalcularAgente(ns(a.id));
  registrarEvento(
    'pacote.importado',
    `Pacote "${p.metadata.name}" importado: ${p.spec.agents.length} agentes, ${p.spec.departments.length} departamentos, ${p.spec.tasks.length} tarefas.`,
    { nivel: 'sucesso' },
  );
  return { ...v, pacoteId: pid };
}

export function removerPacote(pid: string) {
  const pacote = repo.pacotes().find((p) => p.id === pid);
  if (!pacote) return false;
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM agentes WHERE pacote_id = ?').run(pid);
    db.prepare("DELETE FROM departamentos WHERE id LIKE ? || ':%' AND id NOT IN (SELECT departamento_id FROM agentes)").run(pid);
    db.prepare('DELETE FROM pacotes WHERE id = ?').run(pid);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  registrarEvento('pacote.removido', `Pacote "${pacote.nome}" removido.`, { nivel: 'aviso' });
  return true;
}
