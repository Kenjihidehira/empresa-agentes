# Empresa de Agentes

Aplicação web para gerenciar agentes de IA como funcionários de uma **empresa virtual de desenvolvimento de software**.
O escritório é uma planta de cubículos em estilo terminal: cada agente tem uma baia com monitor. A cor do monitor e um
rótulo verde/amarelo/vermelho mostram o que ele está fazendo (`ESTADO: TRABALHANDO (REFATORAR MÓDULO DE CHECKOUT)`).

- **Stack:** TypeScript, React 18 + Vite, Express 5, SQLite (`node:sqlite`, nativo do Node 22, sem compilação).
- **Motores de execução:** Simulação (padrão, sem custo), ChatGPT via Codex CLI e Claude via Claude Code CLI.
- **Regras aplicadas no backend:** permissões por tipo de trabalho, orçamento por agente e aprovação humana para ações sensíveis.

## Requisitos

- Node.js **22.5 ou mais novo** (usa o módulo `node:sqlite`).
- Opcional, para executar com modelos reais:
  - [Codex CLI](https://github.com/openai/codex) instalado e logado (`codex login`) para agentes "ChatGPT".
  - [Claude Code](https://docs.claude.com/en/docs/claude-code) instalado e logado (`claude`) para agentes "Claude".

## Como rodar

```bash
npm install
npm run dev      # API em :3001 + interface em http://localhost:5173 (hot reload)
```

Produção (compila o frontend e o Express serve tudo em uma porta):

```bash
npm start        # http://localhost:3001
```

Outros comandos:

```bash
npm test         # testes automáticos das regras de negócio e do importador
npm run build    # checagem de tipos + build do frontend
npm run reset    # apaga o banco; a empresa de demonstração é recriada na próxima inicialização
```

Variáveis de ambiente opcionais: `PORT` (padrão 3001), `DB_PATH` (padrão `data/empresa.db`),
`SIM_PASSO_MS` (duração de cada passo da simulação), `TIMEOUT_CLI_MS` (limite para Codex/Claude, padrão 5 min).

## O que tem na tela

| Aba | O que faz |
| --- | --- |
| **Escritório** | Cubículos por setor. Console de eventos ao vivo (canto superior esquerdo), terminal de controle com KPIs, agentes ativos, aprovações e alertas (canto inferior esquerdo), botão **Ocultar terminais**, zoom e filtro por setor. No celular, vira uma lista de cartões. |
| **Organograma** | Hierarquia (gestor → equipe) com cor do departamento e estado de cada agente. |
| **Tarefas** | Criar, filtrar, buscar, executar e acompanhar: resultado, erro e linha do tempo de eventos de cada tarefa. |
| **Aprovações** | Fila de ações sensíveis com Aprovar/Rejeitar, observação opcional e histórico. |
| **Importar** | Validação e importação de pacotes `agentcompanies/v1`, lista de pacotes importados e botão para restaurar a demonstração. |

Clique em um agente para abrir a ficha: gestor, equipe, motor, barra de orçamento, permissões, instruções e tarefas.

**Teclado:** `1`–`5` trocam de aba, `N` abre uma nova tarefa, `A` cria um novo agente, setas navegam entre os cubículos,
`Enter` abre a ficha e `Esc` fecha janelas.

Tudo atualiza em tempo real via Server-Sent Events (`/api/stream`).

## Regras de negócio

Ao executar uma tarefa, o backend verifica nesta ordem:

1. **Permissão:** o agente precisa ter o tipo de trabalho (`codigo`, `deploy`, ...) na lista de permissões. Se não tiver, a tarefa fica **Bloqueada** e o motivo é registrado.
2. **Orçamento:** `orçamento − gasto` precisa cobrir o custo estimado da ação. Se não cobrir, a tarefa fica **Bloqueada**.
3. **Aprovação humana:** `deploy` e `contato_externo` criam uma aprovação e ficam em **Aguardando aprovação**. Só rodam depois de aprovadas. Se forem rejeitadas, ficam **Rejeitadas**. Depois da aprovação, as regras 1 e 2 são checadas de novo.

Depois de passar pelas regras, a tarefa vai para **Em execução** e termina como **Concluída** (o custo real é somado ao gasto do agente) ou **Falhou**.
Tarefas bloqueadas ou com falha podem ser executadas de novo, por exemplo depois de aumentar o orçamento.
O estado do agente vem das tarefas dele: trabalhando › aguardando aprovação › bloqueado › erro › ocioso.
Se o servidor reiniciar durante uma execução, a tarefa vira **Falhou** com uma mensagem explicando o motivo.

### Demonstração

A empresa **Nébula Software** começa com 9 departamentos (Diretoria, Produto, Design, Frontend, Backend, Dados, QA,
DevOps, Suporte), 12 agentes e tarefas prontas para testar cada regra:

- *Refatorar módulo de checkout* (Bruno): executa normalmente.
- *Deploy da v2.4.0 em produção* (Otávio) e *Responder cliente sobre bug de login* (Sofia): exigem aprovação.
- *Testes E2E do checkout* (Igor): **Igor começa com orçamento zero**, então a tarefa é bloqueada. Dê orçamento a ele em *Editar* e tente de novo.

## Motores de execução

| Motor | Como roda | Custo |
| --- | --- | --- |
| Simulação | Passos com atraso e resultado fictício | Estimativa ±20% |
| ChatGPT | `codex exec --skip-git-repo-check [-m modelo] "<prompt>"` | Estimativa da ação (o Codex não informa custo) |
| Claude | `claude -p "<prompt>" --output-format json [--model modelo]` | `total_cost_usd` informado pelo Claude Code |

Os CLIs rodam com a conta já logada no computador, dentro de `data/workspace/`. O prompt instrui o modelo a só
responder, sem executar comandos. A ficha do agente e o formulário mostram se cada CLI foi encontrado.

## Formato de pacote `agentcompanies/v1`

```json
{
  "apiVersion": "agentcompanies/v1",
  "kind": "AgentCompany",
  "metadata": { "name": "Squad Mobile", "version": "1.0.0", "description": "opcional" },
  "spec": {
    "departments": [{ "id": "mobile", "name": "Mobile", "color": "#e879f9" }],
    "agents": [
      {
        "id": "nina", "name": "Nina Costa", "role": "Dev Mobile",
        "department": "mobile", "reportsTo": "tiago",
        "provider": "simulacao", "model": "opcional", "instructions": "opcional",
        "permissions": ["codigo", "teste"], "budgetUsd": 12
      }
    ],
    "tasks": [{ "title": "Corrigir crash", "assignee": "nina", "action": "codigo", "description": "opcional" }]
  }
}
```

- `department` pode apontar para um departamento do próprio pacote ou para um já existente na empresa (ex.: `qa`).
- `permissions`/`action`: `planejamento`, `codigo`, `revisao`, `teste`, `design`, `analise`, `deploy`, `suporte`, `contato_externo`.
- `provider`: `simulacao` (padrão), `chatgpt` ou `claude`.
- Os IDs ficam com o prefixo do pacote (`squad-mobile:nina`). Remover o pacote remove os agentes que vieram dele.
- Erros apontam o campo exato, por exemplo `spec.agents[0].permissions[1]: permissão desconhecida; use: ...`, e também cobrem
  referências quebradas (departamento, gestor ou responsável inexistente), IDs repetidos e pacote já importado.

Exemplos: [`exemplos/pacote-valido.json`](exemplos/pacote-valido.json) e [`exemplos/pacote-invalido.json`](exemplos/pacote-invalido.json).
Os dois também podem ser carregados com um clique na aba **Importar**.

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/estado` | Snapshot completo (departamentos, agentes, tarefas, aprovações, eventos, pacotes, KPIs) |
| GET | `/api/stream` | SSE: evento `mudanca` a cada alteração |
| GET | `/api/motor` | Disponibilidade de cada motor |
| POST | `/api/departamentos` | `{ nome, cor? }` |
| POST/PATCH/DELETE | `/api/agentes[/:id]` | Criar/editar/remover agente |
| POST | `/api/tarefas` | `{ titulo, descricao?, agenteId, acao, executar? }` |
| POST | `/api/tarefas/:id/executar` | Executa aplicando as regras |
| GET | `/api/tarefas/:id/eventos` | Linha do tempo da tarefa |
| DELETE | `/api/tarefas/:id` | Remove tarefa (exceto em execução) |
| POST | `/api/aprovacoes/:id/decidir` | `{ decisao: "aprovada" \| "rejeitada", nota? }` |
| POST | `/api/pacotes/validar` / `/api/pacotes/importar` | `{ conteudo: "<json>" }`; erros vêm em `{ valido, erros: [{ caminho, mensagem }] }` |
| DELETE | `/api/pacotes/:id` | Remove pacote e seus agentes |
| POST | `/api/demo/restaurar` | Apaga tudo e recria a demonstração |

## Estrutura

```
server/   index.ts (inicialização) · app.ts (rotas) · db.ts (SQLite) · motor.ts (regras + execução)
          importador.ts (agentcompanies/v1) · seed.ts (demonstração) · tests/
shared/   types.ts (tipos e constantes usados no front e no back)
src/      App.tsx · api.ts · styles.css · components/ (Escritorio, Organograma, Tarefas, Aprovacoes, Importar, ...)
exemplos/ pacotes de exemplo
data/     banco SQLite (criado automaticamente, fora do git)
```
