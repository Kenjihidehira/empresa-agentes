import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { criarApp } from '../app';
import { semear } from '../seed';
import type { Snapshot, Tarefa } from '../../shared/types';

// Rodar com DB_PATH=:memory: e SIM_PASSO_MS baixo (veja "npm test").
let server: Server;
let base = '';

const api = async (metodo: string, caminho: string, corpo?: unknown) => {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: (await r.json()) as any };
};
const estado = async () => (await api('GET', '/api/estado')).json as Snapshot;
const esperarTarefa = async (id: string, alvo: string, ms = 5000) => {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const t = (await estado()).tarefas.find((x) => x.id === id)!;
    if (t.estado === alvo) return t;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`tarefa ${id} não chegou em ${alvo}`);
};
const novaTarefa = async (agenteId: string, acao: string, titulo = 'Tarefa de teste') =>
  (await api('POST', '/api/tarefas', { titulo, agenteId, acao })).json as Tarefa;

before(async () => {
  semear();
  server = criarApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('cria agente e ele aparece no estado e no organograma', async () => {
  const r = await api('POST', '/api/agentes', {
    nome: 'Vera Lins', cargo: 'Dev Backend', departamentoId: 'backend', gestorId: 'diego', permissoes: ['codigo'], orcamento: 5,
  });
  assert.equal(r.status, 201);
  const s = await estado();
  const vera = s.agentes.find((a) => a.nome === 'Vera Lins')!;
  assert.equal(vera.gestorId, 'diego');
  assert.equal(vera.estado, 'ocioso');
});

test('valida dados ao criar agente', async () => {
  const r = await api('POST', '/api/agentes', { nome: 'X', cargo: '', departamentoId: 'nao-existe' });
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /Nome precisa/);
});

test('tarefa executa, passa por em_execucao e termina concluída com eventos e custo', async () => {
  const t = await novaTarefa('bruno', 'codigo');
  const exec = await api('POST', `/api/tarefas/${t.id}/executar`);
  assert.equal(exec.json.estado, 'em_execucao');
  assert.equal((await estado()).agentes.find((a) => a.id === 'bruno')!.estado, 'trabalhando');
  const fim = await esperarTarefa(t.id, 'concluida');
  assert.ok(fim.custo > 0);
  assert.match(fim.resultado!, /simulação/);
  const eventos = (await api('GET', `/api/tarefas/${t.id}/eventos`)).json as { tipo: string }[];
  const tipos = eventos.map((e) => e.tipo);
  for (const tipo of ['tarefa.criada', 'tarefa.iniciada', 'tarefa.progresso', 'tarefa.concluida']) assert.ok(tipos.includes(tipo), tipo);
  const bruno = (await estado()).agentes.find((a) => a.id === 'bruno')!;
  assert.equal(bruno.estado, 'ocioso');
  assert.ok(bruno.gasto > 0);
});

test('deploy fica aguardando aprovação até um humano aprovar', async () => {
  const t = await novaTarefa('otavio', 'deploy', 'Deploy de teste');
  const r = await api('POST', `/api/tarefas/${t.id}/executar`);
  assert.equal(r.json.estado, 'aguardando_aprovacao');
  await new Promise((res) => setTimeout(res, 150));
  assert.equal((await esperarTarefa(t.id, 'aguardando_aprovacao')).estado, 'aguardando_aprovacao');
  const apr = (await estado()).aprovacoes.find((a) => a.tarefaId === t.id && a.estado === 'pendente')!;
  assert.ok(apr);
  const d = await api('POST', `/api/aprovacoes/${apr.id}/decidir`, { decisao: 'aprovada' });
  assert.equal(d.json.estado, 'em_execucao');
  await esperarTarefa(t.id, 'concluida');
});

test('contato externo rejeitado não executa', async () => {
  const t = await novaTarefa('sofia', 'contato_externo', 'Responder cliente');
  await api('POST', `/api/tarefas/${t.id}/executar`);
  const apr = (await estado()).aprovacoes.find((a) => a.tarefaId === t.id)!;
  const d = await api('POST', `/api/aprovacoes/${apr.id}/decidir`, { decisao: 'rejeitada', nota: 'tom inadequado' });
  assert.equal(d.json.estado, 'rejeitada');
  const again = await api('POST', `/api/aprovacoes/${apr.id}/decidir`, { decisao: 'aprovada' });
  assert.equal(again.status, 409);
});

test('agente sem permissão não executa', async () => {
  const t = await novaTarefa('lia', 'deploy', 'Lia tentando deploy');
  const r = await api('POST', `/api/tarefas/${t.id}/executar`);
  assert.equal(r.json.estado, 'bloqueada');
  assert.match(r.json.erro, /não tem permissão/);
  assert.equal((await estado()).agentes.find((a) => a.id === 'lia')!.estado, 'bloqueado');
});

test('agente sem orçamento não executa; volta a executar depois de receber orçamento', async () => {
  const t = await novaTarefa('igor', 'teste', 'E2E');
  const r = await api('POST', `/api/tarefas/${t.id}/executar`);
  assert.equal(r.json.estado, 'bloqueada');
  assert.match(r.json.erro, /Orçamento insuficiente/);
  await api('PATCH', '/api/agentes/igor', { orcamento: 10 });
  const r2 = await api('POST', `/api/tarefas/${t.id}/executar`);
  assert.equal(r2.json.estado, 'em_execucao');
  await esperarTarefa(t.id, 'concluida');
});

test('importa pacote agentcompanies/v1 válido', async () => {
  const conteudo = readFileSync('exemplos/pacote-valido.json', 'utf8');
  const r = await api('POST', '/api/pacotes/importar', { conteudo });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const s = await estado();
  assert.ok(s.departamentos.some((d) => d.id === 'squad-mobile:mobile'));
  const nina = s.agentes.find((a) => a.id === 'squad-mobile:nina')!;
  assert.equal(nina.gestorId, 'squad-mobile:tiago');
  assert.equal(s.agentes.find((a) => a.id === 'squad-mobile:leo')!.departamentoId, 'qa');
  assert.equal(s.tarefas.filter((t) => t.agenteId.startsWith('squad-mobile:')).length, 2);
  const dup = await api('POST', '/api/pacotes/importar', { conteudo });
  assert.equal(dup.status, 422);
  assert.match(dup.json.erros[0].mensagem, /já existe/);
});

test('pacote inválido devolve erros úteis com o caminho do campo', async () => {
  const conteudo = readFileSync('exemplos/pacote-invalido.json', 'utf8');
  const r = await api('POST', '/api/pacotes/importar', { conteudo });
  assert.equal(r.status, 422);
  const caminhos = r.json.erros.map((e: any) => e.caminho);
  for (const c of ['apiVersion', 'spec.departments[0].id', 'spec.agents[0].provider', 'spec.agents[0].permissions[1]', 'spec.agents[0].budgetUsd'])
    assert.ok(caminhos.includes(c), `faltou erro em ${c}: ${caminhos}`);
  const json = await api('POST', '/api/pacotes/validar', { conteudo: '{ quebrado' });
  assert.match(json.json.erros[0].mensagem, /JSON inválido/);
  const ref = await api('POST', '/api/pacotes/validar', {
    conteudo: JSON.stringify({
      apiVersion: 'agentcompanies/v1', kind: 'AgentCompany', metadata: { name: 'Ref' },
      spec: { agents: [{ id: 'a', name: 'A', role: 'R', department: 'marte' }], tasks: [{ title: 'x', assignee: 'b', action: 'codigo' }] },
    }),
  });
  assert.deepEqual(ref.json.erros.map((e: any) => e.caminho), ['spec.agents[0].department', 'spec.tasks[0].assignee']);
});
