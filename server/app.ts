import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { ACOES, CUSTO_ESTIMADO, PROVEDORES } from '../shared/types';
import { agora, barramento, db, novoId, registrarEvento, repo, snapshot } from './db';
import { importarPacote, removerPacote, slug, validarPacote } from './importador';
import { decidirAprovacao, ErroRegra, executarTarefa, recalcularAgente, statusMotor } from './motor';
import { semear } from './seed';

const agenteBase = z.object({
  nome: z.string().trim().min(2, 'Nome precisa de pelo menos 2 letras.').max(60),
  cargo: z.string().trim().min(2, 'Informe o cargo.').max(80),
  departamentoId: z.string().min(1, 'Escolha um departamento.'),
  gestorId: z.string().nullable().optional(),
  provedor: z.enum(PROVEDORES),
  modelo: z.string().trim().max(80).nullable().optional(),
  instrucoes: z.string().max(4000),
  permissoes: z.array(z.enum(ACOES)),
  orcamento: z.number().min(0, 'Orçamento não pode ser negativo.').max(100000),
});
// Na criação há valores padrão; na edição (PATCH) só muda o que foi enviado.
const agenteNovo = agenteBase.extend({
  provedor: agenteBase.shape.provedor.default('simulacao'),
  instrucoes: agenteBase.shape.instrucoes.default(''),
  permissoes: agenteBase.shape.permissoes.default([]),
  orcamento: agenteBase.shape.orcamento.default(10),
});

const tarefaBase = z.object({
  titulo: z.string().trim().min(3, 'Título precisa de pelo menos 3 letras.').max(140),
  descricao: z.string().max(4000).default(''),
  agenteId: z.string().min(1, 'Escolha um agente.'),
  acao: z.enum(ACOES),
  executar: z.boolean().default(false),
});

const corpo = <T extends z.ZodTypeAny>(schema: T, dados: unknown): z.infer<T> => {
  const r = schema.safeParse(dados);
  if (!r.success) throw new ErroRegra(r.error.issues.map((i) => i.message).join(' '), 400);
  return r.data;
};

const rota =
  (fn: (req: Request<Record<string, string>>, res: Response) => unknown) =>
  (req: Request<Record<string, string>>, res: Response, next: NextFunction) => {
    try {
      const out = fn(req, res);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (e) {
      next(e);
    }
  };

function checarReferencias(departamentoId: string, gestorId: string | null | undefined, proprioId?: string) {
  if (!repo.departamento(departamentoId)) throw new ErroRegra('Departamento não existe.', 400);
  if (gestorId) {
    if (!repo.agente(gestorId)) throw new ErroRegra('Gestor não existe.', 400);
    if (gestorId === proprioId) throw new ErroRegra('Um agente não pode ser gestor de si mesmo.', 400);
    // Evita ciclos na hierarquia.
    let atual: string | null = gestorId;
    while (atual && proprioId) {
      if (atual === proprioId) throw new ErroRegra('Essa escolha de gestor criaria um ciclo no organograma.', 400);
      atual = repo.agente(atual)?.gestorId ?? null;
    }
  }
}

export function criarApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/estado', rota(() => snapshot()));
  app.get('/api/motor', rota(() => statusMotor()));

  app.get('/api/stream', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write(': conectado\n\n'); // faz proxies (ex.: Vite) repassarem a conexão na hora
    const enviar = () => res.write(`event: mudanca\ndata: ${Date.now()}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    barramento.on('mudanca', enviar);
    req.on('close', () => {
      clearInterval(ping);
      barramento.off('mudanca', enviar);
    });
  });

  // --- Departamentos ---------------------------------------------------------
  app.post(
    '/api/departamentos',
    rota((req, res) => {
      const d = corpo(
        z.object({
          nome: z.string().trim().min(2).max(40),
          cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#64748b'),
        }),
        req.body,
      );
      const id = slug(d.nome);
      if (repo.departamento(id)) throw new ErroRegra('Já existe um departamento com esse nome.');
      const ordem = (repo.departamentos().at(-1)?.ordem ?? 0) + 1;
      db.prepare('INSERT INTO departamentos (id, nome, cor, ordem) VALUES (?, ?, ?, ?)').run(id, d.nome, d.cor, ordem);
      registrarEvento('departamento.criado', `Departamento ${d.nome} criado.`);
      res.status(201);
      return repo.departamento(id);
    }),
  );

  // --- Agentes ---------------------------------------------------------------
  app.post(
    '/api/agentes',
    rota((req, res) => {
      const a = corpo(agenteNovo, req.body);
      checarReferencias(a.departamentoId, a.gestorId);
      const id = novoId('ag');
      db.prepare(
        `INSERT INTO agentes (id, nome, cargo, departamento_id, gestor_id, provedor, modelo, instrucoes, permissoes, orcamento, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        a.nome,
        a.cargo,
        a.departamentoId,
        a.gestorId ?? null,
        a.provedor,
        a.modelo || null,
        a.instrucoes,
        JSON.stringify(a.permissoes),
        a.orcamento,
        agora(),
      );
      registrarEvento('agente.criado', `${a.nome} (${a.cargo}) entrou na empresa.`, { nivel: 'sucesso', agenteId: id });
      res.status(201);
      return repo.agente(id);
    }),
  );

  app.patch(
    '/api/agentes/:id',
    rota((req) => {
      const atual = repo.agente(req.params.id);
      if (!atual) throw new ErroRegra('Agente não encontrado.', 404);
      const a = corpo(agenteBase.partial(), req.body);
      checarReferencias(a.departamentoId ?? atual.departamentoId, a.gestorId === undefined ? atual.gestorId : a.gestorId, atual.id);
      const mapa: Record<string, unknown> = {
        nome: a.nome,
        cargo: a.cargo,
        departamento_id: a.departamentoId,
        gestor_id: a.gestorId,
        provedor: a.provedor,
        modelo: a.modelo === undefined ? undefined : a.modelo || null,
        instrucoes: a.instrucoes,
        permissoes: a.permissoes && JSON.stringify(a.permissoes),
        orcamento: a.orcamento,
      };
      const campos = Object.entries(mapa).filter(([, v]) => v !== undefined);
      if (campos.length) {
        db.prepare(`UPDATE agentes SET ${campos.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
          ...(campos.map(([, v]) => v) as any[]),
          atual.id,
        );
      }
      registrarEvento('agente.atualizado', `Cadastro de ${a.nome ?? atual.nome} atualizado.`, { agenteId: atual.id });
      return repo.agente(atual.id);
    }),
  );

  app.delete(
    '/api/agentes/:id',
    rota((req) => {
      const a = repo.agente(req.params.id);
      if (!a) throw new ErroRegra('Agente não encontrado.', 404);
      if (a.estado === 'trabalhando') throw new ErroRegra(`${a.nome} está trabalhando agora; aguarde terminar para remover.`);
      db.prepare('DELETE FROM agentes WHERE id = ?').run(a.id);
      registrarEvento('agente.removido', `${a.nome} saiu da empresa.`, { nivel: 'aviso' });
      return { ok: true };
    }),
  );

  // --- Tarefas ---------------------------------------------------------------
  app.post(
    '/api/tarefas',
    rota((req, res) => {
      const t = corpo(tarefaBase, req.body);
      const agente = repo.agente(t.agenteId);
      if (!agente) throw new ErroRegra('Agente não encontrado.', 400);
      const id = novoId('tar');
      const ts = agora();
      db.prepare(
        `INSERT INTO tarefas (id, titulo, descricao, agente_id, acao, custo_estimado, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, t.titulo, t.descricao, t.agenteId, t.acao, CUSTO_ESTIMADO[t.acao], ts, ts);
      registrarEvento('tarefa.criada', `Nova tarefa para ${agente.nome}: ${t.titulo}`, { agenteId: agente.id, tarefaId: id });
      res.status(201);
      return t.executar ? executarTarefa(id) : repo.tarefa(id);
    }),
  );

  app.post('/api/tarefas/:id/executar', rota((req) => executarTarefa(req.params.id)));

  app.get(
    '/api/tarefas/:id/eventos',
    rota((req) => {
      if (!repo.tarefa(req.params.id)) throw new ErroRegra('Tarefa não encontrada.', 404);
      return repo.eventos(200, req.params.id);
    }),
  );

  app.delete(
    '/api/tarefas/:id',
    rota((req) => {
      const t = repo.tarefa(req.params.id);
      if (!t) throw new ErroRegra('Tarefa não encontrada.', 404);
      if (t.estado === 'em_execucao') throw new ErroRegra('A tarefa está em execução; aguarde terminar.');
      db.prepare('DELETE FROM tarefas WHERE id = ?').run(t.id);
      registrarEvento('tarefa.removida', `Tarefa removida: ${t.titulo}`, { agenteId: t.agenteId });
      recalcularAgente(t.agenteId);
      return { ok: true };
    }),
  );

  // --- Aprovações ------------------------------------------------------------
  app.post(
    '/api/aprovacoes/:id/decidir',
    rota((req) => {
      const d = corpo(z.object({ decisao: z.enum(['aprovada', 'rejeitada']), nota: z.string().max(500).optional() }), req.body);
      return decidirAprovacao(req.params.id, d.decisao, d.nota);
    }),
  );

  // --- Pacotes agentcompanies/v1 ----------------------------------------------
  app.post(
    '/api/pacotes/validar',
    rota((req) => {
      const { pacote, ...resto } = validarPacote(req.body?.conteudo ?? req.body);
      return resto;
    }),
  );
  app.post(
    '/api/pacotes/importar',
    rota((req, res) => {
      const { pacote, ...r } = importarPacote(req.body?.conteudo ?? req.body);
      res.status(r.valido ? 201 : 422);
      return r;
    }),
  );
  app.delete(
    '/api/pacotes/:id',
    rota((req) => {
      if (!removerPacote(req.params.id)) throw new ErroRegra('Pacote não encontrado.', 404);
      return { ok: true };
    }),
  );

  // --- Restaurar demonstração --------------------------------------------------
  app.post(
    '/api/demo/restaurar',
    rota(() => {
      db.exec('DELETE FROM aprovacoes; DELETE FROM tarefas; DELETE FROM eventos; DELETE FROM agentes; DELETE FROM departamentos; DELETE FROM pacotes; DELETE FROM config;');
      semear();
      return { ok: true };
    }),
  );

  app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

  // Em produção, o Express também serve o frontend compilado.
  const dist = resolve(process.cwd(), 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(resolve(dist, 'index.html')) : next()));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ErroRegra) return res.status(err.status).json({ erro: err.message });
    if (err instanceof SyntaxError) return res.status(400).json({ erro: 'JSON inválido no corpo da requisição.' });
    console.error(err);
    res.status(500).json({ erro: 'Erro interno no servidor.' });
  });

  return app;
}
