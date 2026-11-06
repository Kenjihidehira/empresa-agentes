import type { Agente, Departamento, EstadoAgente } from '../../shared/types';
import { chibi, desenharSprite, hash, type Pose } from './sprites';

// ---------------------------------------------------------------------------
// Projeção isométrica 2:1. Coordenadas do mundo em "tiles" (x, y) e z em pixels.
// ---------------------------------------------------------------------------
export const TW = 32;
export const TH = 16;
const PAD = 28;
const TOPO = 70;
const H_PAREDE = 62;
const CUB = 3; // cada baia ocupa 3×3 tiles
const CORR = 2; // largura dos corredores
const MAX_LARGURA = 27;

export interface Lote {
  dep: Departamento;
  x: number;
  y: number;
  w: number;
  d: number;
  exec: boolean;
  cols: number;
  rows: number;
}

export interface Posto {
  agenteId: string;
  lote: Lote;
  exec: boolean;
  /** origem da baia (ou da mesa da diretoria) */
  cx: number;
  cy: number;
  /** centro do assento */
  sx: number;
  sy: number;
  frente: boolean;
  monitores: number;
  idx: number;
}

export interface Layout {
  W: number;
  H: number;
  lotes: Lote[];
  postos: Posto[];
  largura: number;
  altura: number;
  ox: number;
  oy: number;
  mesaExec?: { x: number; y: number; w: number };
}

export function montarLayout(deps: Departamento[], agentes: Agente[]): Layout {
  const grupos = deps
    .map((dep) => ({ dep, ags: agentes.filter((a) => a.departamentoId === dep.id) }))
    .filter((g) => g.ags.length > 0);
  let iExec = grupos.findIndex((g) => g.dep.id === 'diretoria');
  if (iExec < 0 && grupos[0] && grupos[0].ags.length <= 3 && grupos[0].ags.every((a) => !a.gestorId)) iExec = 0;

  const lotes: Lote[] = [];
  const postos: Posto[] = [];
  let x = 2;
  let y = 2;
  let alturaLinha = 0;
  let maxX = 0;
  let mesaExec: Layout['mesaExec'];

  grupos.forEach((g, gi) => {
    const n = g.ags.length;
    const exec = gi === iExec;
    const cols = exec ? 1 : n <= 2 ? n : n <= 4 ? 2 : 3;
    const rows = exec ? 1 : Math.ceil(n / cols);
    const w = exec ? Math.max(7, n * 2 + 3) : cols * CUB;
    const d = exec ? 6 : rows * CUB;
    if (x + w > MAX_LARGURA && x > 2) {
      x = 2;
      y += alturaLinha + CORR;
      alturaLinha = 0;
    }
    const lote: Lote = { dep: g.dep, x, y, w, d, exec, cols, rows };
    lotes.push(lote);
    if (exec) {
      const mw = Math.max(3, n * 1.7 + 0.6);
      const mx = x + (w - mw) / 2;
      mesaExec = { x: mx, y: y + 2.4, w: mw };
      g.ags.forEach((a, i) => {
        const sx = mx + 0.9 + i * 1.7;
        postos.push({ agenteId: a.id, lote, exec: true, cx: mx, cy: y + 2.4, sx, sy: y + 1.75, frente: false, monitores: 1, idx: i });
      });
    } else {
      g.ags.forEach((a, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const cx = x + c * CUB;
        const cy = y + r * CUB;
        const dev = a.permissoes.includes('codigo');
        postos.push({
          agenteId: a.id,
          lote,
          exec: false,
          cx,
          cy,
          sx: cx + 1.5,
          sy: cy + 2.0,
          frente: r === rows - 1,
          monitores: dev ? (hash(a.id) % 2 ? 3 : 2) : 1,
          idx: i,
        });
      });
    }
    x += w + CORR;
    maxX = Math.max(maxX, x);
    alturaLinha = Math.max(alturaLinha, d);
  });

  const W = Math.max(maxX, 12);
  const H = Math.max(y + alturaLinha + CORR, 10);
  const ox = H * (TW / 2) + PAD;
  const oy = TOPO + H_PAREDE;
  return { W, H, lotes, postos, ox, oy, largura: (W + H) * (TW / 2) + PAD * 2, altura: oy + (W + H) * (TH / 2) + PAD, mesaExec };
}

export const projetar = (L: Layout, x: number, y: number, z = 0): [number, number] => [
  L.ox + (x - y) * (TW / 2),
  L.oy + (x + y) * (TH / 2) - z,
];

// ---------------------------------------------------------------------------
// Primitivas
// ---------------------------------------------------------------------------
type Ctx = CanvasRenderingContext2D;
type Cores = [topo: string, frente: string, lado: string];

function poly(ctx: Ctx, L: Layout, pts: [number, number, number][], fill: string, stroke?: string) {
  ctx.beginPath();
  pts.forEach(([x, y, z], i) => {
    const [sx, sy] = projetar(L, x, y, z);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Caixa isométrica: mostra topo, face +y (frente-esquerda) e face +x (frente-direita). */
function caixa(ctx: Ctx, L: Layout, x: number, y: number, z: number, w: number, d: number, h: number, [t, f, l]: Cores, contorno = 'rgba(20,24,30,0.55)') {
  poly(ctx, L, [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], f, contorno);
  poly(ctx, L, [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], l, contorno);
  poly(ctx, L, [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], t, contorno);
}

/** Retângulo desenhado sobre o plano vertical y = const (faces voltadas para o observador). */
function placaY(ctx: Ctx, L: Layout, x: number, y: number, z: number, w: number, h: number, fill: string, stroke?: string) {
  poly(ctx, L, [[x, y, z], [x + w, y, z], [x + w, y, z + h], [x, y, z + h]], fill, stroke);
}
function placaX(ctx: Ctx, L: Layout, x: number, y: number, z: number, d: number, h: number, fill: string, stroke?: string) {
  poly(ctx, L, [[x, y, z], [x, y + d, z], [x, y + d, z + h], [x, y, z + h]], fill, stroke);
}

const COR = {
  piso: ['#d8d0bf', '#cfc6b3'],
  rejunte: 'rgba(120,110,90,0.25)',
  corredor: ['#53667b', '#586b81'],
  faixa: '#93c5e4',
  carpete: ['#46468a', '#4a4a90'],
  carpeteBorda: '#7473c4',
  parede: ['#55777a', '#a7c6c1', '#8fb0ab'] as Cores,
  divisoria: ['#d3e1e0', '#93afb0', '#7d9899'] as Cores,
  divisoriaVidro: 'rgba(170,215,220,0.35)',
  mesa: ['#d98b4c', '#ad6531', '#8d5025'] as Cores,
  mesaExec: ['#8a5530', '#6b3f22', '#57331b'] as Cores,
  monitor: ['#2a3036', '#1b2025', '#15191d'] as Cores,
  cadeira: ['#3f62a0', '#2f4c7f', '#283f69'] as Cores,
  cadeiraExec: ['#2d2f36', '#1d1f24', '#17181c'] as Cores,
  cadeiraVisita: ['#b4683a', '#8e4f2b', '#7a4324'] as Cores,
  arquivo: ['#b5bec6', '#8f99a3', '#7a838c'] as Cores,
  estante: ['#7a4a2a', '#5e381f', '#4e2f1a'] as Cores,
};

// ---------------------------------------------------------------------------
// Fundo estático: paredes, piso, corredores e carpete da diretoria.
// ---------------------------------------------------------------------------
export function desenharFundo(ctx: Ctx, L: Layout) {
  ctx.fillStyle = '#0a0d12';
  ctx.fillRect(0, 0, L.largura, L.altura);

  // Paredes do fundo
  caixa(ctx, L, -0.35, -0.35, 0, L.W + 0.35, 0.35, H_PAREDE, COR.parede);
  caixa(ctx, L, -0.35, 0, 0, 0.35, L.H, H_PAREDE, COR.parede);
  // Rodapé e janelas na parede do fundo
  placaY(ctx, L, 0, 0, 0, L.W, 4, '#4f6b6c');
  placaX(ctx, L, 0, 0, 0, L.H, 4, '#4f6b6c');
  for (let x = 3; x < L.W - 2; x += 5) {
    placaY(ctx, L, x, 0, 24, 2.6, 26, '#6f97a8', '#3f5b63');
    placaY(ctx, L, x + 0.15, 0, 27, 2.3, 20, '#9fd0e3');
    placaY(ctx, L, x + 1.25, 0, 24, 0.1, 26, '#3f5b63');
  }

  const loteEm = (gx: number, gy: number) => L.lotes.find((l) => gx >= l.x && gx < l.x + l.w && gy >= l.y && gy < l.y + l.d);
  for (let gy = 0; gy < L.H; gy++) {
    for (let gx = 0; gx < L.W; gx++) {
      const lote = loteEm(gx, gy);
      const xadrez = (gx + gy) % 2;
      const cor = lote ? (lote.exec ? COR.carpete[xadrez]! : COR.piso[xadrez]!) : COR.corredor[xadrez]!;
      poly(ctx, L, [[gx, gy, 0], [gx + 1, gy, 0], [gx + 1, gy + 1, 0], [gx, gy + 1, 0]], cor, lote && !lote.exec ? COR.rejunte : undefined);
    }
  }
  // Faixas claras na borda dos corredores
  for (const l of L.lotes) {
    const m = 0.12;
    poly(ctx, L, [[l.x - m, l.y - m, 0], [l.x + l.w + m, l.y - m, 0], [l.x + l.w + m, l.y + l.d + m, 0], [l.x - m, l.y + l.d + m, 0]], 'transparent', l.exec ? COR.carpeteBorda : COR.faixa);
    if (l.exec) {
      const i = 0.45;
      poly(ctx, L, [[l.x + i, l.y + i, 0], [l.x + l.w - i, l.y + i, 0], [l.x + l.w - i, l.y + l.d - i, 0], [l.x + i, l.y + l.d - i, 0]], 'transparent', COR.carpeteBorda);
    }
  }
  // Faixa central no corredor que corre ao longo das paredes
  ctx.setLineDash([4, 4]);
  poly(ctx, L, [[1, 1, 0], [L.W - 1, 1, 0], [L.W - 1, 1, 0], [1, 1, 0]], 'transparent', 'rgba(147,197,228,0.35)');
  poly(ctx, L, [[1, 1, 0], [1, L.H - 1, 0], [1, L.H - 1, 0], [1, 1, 0]], 'transparent', 'rgba(147,197,228,0.35)');
  ctx.setLineDash([]);
}

// ---------------------------------------------------------------------------
// Objetos dinâmicos (mobília + pessoas), ordenados pelo algoritmo do pintor.
// ---------------------------------------------------------------------------
export interface EstadoVisual {
  estado: EstadoAgente;
  cor: string;
  setor: string;
  selecionado: boolean;
  hover: boolean;
}

export interface Ator {
  agenteId: string;
  x: number;
  y: number;
  sentado: boolean;
  /** cabeça em coordenadas de canvas (para posicionar rótulos) */
  cabeca: [number, number];
  caixa: [number, number, number, number];
}

type Obj = { k: number; draw: () => void };

const CICLO_PASSEIO = 42_000;
const DURACAO_PASSEIO = 12_000;

/** Posição do agente: sentado, ou passeando pelo corredor quando está ocioso. */
function posicaoAtor(L: Layout, p: Posto, estado: EstadoAgente, t: number) {
  if (estado !== 'ocioso' || !p.frente || p.exec) return { x: p.sx, y: p.sy, sentado: true, nome: 'sentadoCostas' as Pose };
  const h = hash(p.agenteId);
  const fase = (t + h * 977) % (CICLO_PASSEIO + (h % 9000));
  if (fase > DURACAO_PASSEIO) return { x: p.sx, y: p.sy, sentado: true, nome: 'sentadoCostas' as Pose };
  const saida = { x: p.sx, y: p.lote.y + p.lote.d + 0.95 };
  let dir = h % 2 ? 1 : -1;
  if (saida.x + dir * 2.6 > L.W - 0.6 || saida.x + dir * 2.6 < 0.6) dir = -dir;
  const fim = { x: saida.x + dir * 2.6, y: saida.y };
  const seg = Math.floor(fase / 3000);
  const u = (fase % 3000) / 3000;
  const passo = Math.floor(t / 180) % 2 === 0;
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  const assento = { x: p.sx, y: p.sy };
  const [pos, frente] =
    seg === 0 ? [lerp(assento, saida), true] : seg === 1 ? [lerp(saida, fim), dir > 0] : seg === 2 ? [lerp(fim, saida), dir < 0] : [lerp(saida, assento), false];
  const nome = (frente ? (passo ? 'frente' : 'frenteB') : passo ? 'costas' : 'costasB') as Pose;
  return { ...pos, sentado: false, nome };
}

function tela(ctx: Ctx, L: Layout, x: number, y: number, z: number, w: number, h: number, estado: EstadoAgente, t: number, semente: number) {
  const base = { trabalhando: '#06301a', aguardando_aprovacao: '#3a2c05', bloqueado: '#3a0b0b', erro: '#3a0b0b', ocioso: '#13283a' }[estado];
  placaY(ctx, L, x, y, z, w, h, base);
  if (estado === 'trabalhando') {
    // linhas de "código" rolando
    const linhas = Math.floor(h / 2);
    const desloc = Math.floor(t / 160 + semente) % 7;
    for (let i = 0; i < linhas; i++) {
      const largura = ((i * 7 + desloc * 3 + semente) % 6) / 8 + 0.15;
      const recuo = ((i + desloc) % 3) * 0.06;
      const cor = (i + desloc) % 4 === 0 ? '#bbf7d0' : (i + desloc) % 3 === 0 ? '#22d3ee' : '#4ade80';
      placaY(ctx, L, x + 0.04 + recuo, y, z + h - 1.6 - i * 2, Math.min(w - 0.1 - recuo, w * largura), 1, cor);
    }
  } else if (estado === 'aguardando_aprovacao') {
    if (Math.floor(t / 500) % 2) placaY(ctx, L, x + w / 2 - 0.04, y, z + 2, 0.08, h - 4, '#facc15');
  } else if (estado === 'bloqueado' || estado === 'erro') {
    placaY(ctx, L, x + 0.05, y, z + h / 2 - 1, w - 0.1, 2, '#f87171');
  } else {
    const fase = ((t / 3000 + semente) % 1) * (w - 0.15);
    placaY(ctx, L, x + 0.05 + fase, y, z + 2 + ((semente * 3) % (h - 4)), 0.1, 2, '#4b7a9a');
  }
}

export function desenharCena(ctx: Ctx, L: Layout, visuais: Map<string, EstadoVisual>, t: number): Ator[] {
  const objs: Obj[] = [];
  const atores: Ator[] = [];
  const add = (k: number, draw: () => void) => objs.push({ k, draw });

  // Decoração junto às paredes
  for (let x = 2.4; x < L.W - 1; x += 6) {
    add(x + 0.5, () => caixa(ctx, L, x, 0.1, 0, 0.55, 0.45, 20, COR.arquivo));
    add(x + 1.5, () => vaso(ctx, L, x + 1.1, 0.35, t));
  }
  for (let y = 3.5; y < L.H - 1; y += 7) add(y + 0.5, () => vaso(ctx, L, 0.35, y, t));
  // Bebedouro
  add(L.W - 1.2, () => {
    caixa(ctx, L, L.W - 1.5, 0.15, 0, 0.45, 0.45, 16, ['#e5e7eb', '#cbd5e1', '#b6c2d0']);
    caixa(ctx, L, L.W - 1.42, 0.23, 16, 0.3, 0.3, 9, ['#bfe3f5', '#8ec9e8', '#76b6d8']);
  });

  for (const p of L.postos) {
    const v = visuais.get(p.agenteId);
    if (!v) continue;
    const pose = (nome: Pose) => chibi(p.agenteId, v.setor, v.cor, nome);
    const sem = hash(p.agenteId) % 7;

    if (p.exec) {
      desenharPostoExec(ctx, L, p, v, pose, t, add, atores, sem);
      continue;
    }
    const { cx, cy } = p;
    // Divisórias (fundo e lateral esquerda)
    add(cx + cy + 1.2, () => {
      caixa(ctx, L, cx, cy, 0, CUB, 0.14, 22, COR.divisoria);
      placaY(ctx, L, cx + 0.15, cy + 0.14, 13, CUB - 0.3, 7, COR.divisoriaVidro);
    });
    add(cx + cy + 1.1, () => caixa(ctx, L, cx, cy + 0.14, 0, 0.14, 2.3, 22, COR.divisoria));
    // Mesa com gaveteiro
    add(cx + cy + 2.15, () => {
      caixa(ctx, L, cx + 0.2, cy + 0.2, 0, 2.65, 0.95, 12, COR.mesa);
      placaY(ctx, L, cx + 2.05, cy + 1.15, 1, 0.7, 10, '#9a5a2c', 'rgba(40,20,10,0.5)');
      placaY(ctx, L, cx + 2.1, cy + 1.15, 7, 0.6, 0.6, '#5a3418');
      placaY(ctx, L, cx + 2.1, cy + 1.15, 3, 0.6, 0.6, '#5a3418');
    });
    // Monitores
    const n = p.monitores;
    const larg = 0.62;
    const inicio = cx + 1.5 - (n * larg + (n - 1) * 0.06) / 2;
    for (let i = 0; i < n; i++) {
      const mx = inicio + i * (larg + 0.06);
      add(cx + cy + 2.2 + i * 0.01, () => {
        caixa(ctx, L, mx + larg / 2 - 0.06, cy + 0.42, 12, 0.12, 0.08, 3, COR.monitor);
        caixa(ctx, L, mx, cy + 0.38, 15, larg, 0.08, 11, COR.monitor);
        tela(ctx, L, mx + 0.05, cy + 0.46, 16, larg - 0.1, 9, v.estado, t, sem + i);
      });
    }
    // Teclado e objetos na mesa
    add(cx + cy + 2.3, () => {
      caixa(ctx, L, cx + 1.1, cy + 0.82, 12, 0.8, 0.22, 1, ['#3b4148', '#24282d', '#1d2125']);
      if (sem % 3 === 0) caixa(ctx, L, cx + 2.5, cy + 0.4, 12, 0.22, 0.22, 4, ['#f5f5f4', '#d6d3d1', '#a8a29e']);
      else if (sem % 3 === 1) caixa(ctx, L, cx + 0.35, cy + 0.35, 12, 0.35, 0.28, 5, [v.cor, '#e2e8f0', '#94a3b8']);
      else vaso(ctx, L, cx + 0.5, cy + 0.55, t, 12, 0.6);
    });
    // Arquivo
    if (p.idx % 2 === 0) add(cx + cy + 4.1, () => caixa(ctx, L, cx + 2.5, cy + 1.45, 0, 0.42, 0.55, 15, COR.arquivo));

    const pos = posicaoAtor(L, p, v.estado, t);
    // Cadeira (assento + encosto)
    add(p.sx + p.sy - 0.05, () => {
      if (v.selecionado || v.hover) anel(ctx, L, pos.sentado ? p.sx : pos.x, pos.sentado ? p.sy : pos.y, v.selecionado, t);
      caixa(ctx, L, p.sx - 0.06, p.sy - 0.06, 0, 0.12, 0.12, 5, ['#1f2937', '#111827', '#0b1220']);
      caixa(ctx, L, p.sx - 0.3, p.sy - 0.3, 5, 0.6, 0.6, 2.5, COR.cadeira);
    });
    if (pos.sentado) {
      const [hx, hy] = projetar(L, p.sx, p.sy, 7);
      add(p.sx + p.sy + 0.02, () => desenharSprite(ctx, pose('sentadoCostas'), hx, hy, { maosAcima: v.estado === 'trabalhando' && Math.floor(t / 140) % 2 === 0 }));
      atores.push({ agenteId: p.agenteId, x: p.sx, y: p.sy, sentado: true, cabeca: [hx, hy - 34], caixa: [hx - 12, hy - 33, 24, 36] });
    } else {
      const [px, py] = projetar(L, pos.x, pos.y, 0);
      add(pos.x + pos.y + 0.02, () => {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(Math.round(px - 8), Math.round(py - 2), 16, 4);
        desenharSprite(ctx, pose(pos.nome), px, py - (pos.nome.endsWith('B') ? 1 : 0));
      });
      atores.push({ agenteId: p.agenteId, x: pos.x, y: pos.y, sentado: false, cabeca: [px, py - 40], caixa: [px - 12, py - 39, 24, 41] });
    }
    add(p.sx + p.sy + 0.3, () => caixa(ctx, L, p.sx - 0.32, p.sy + 0.24, 7, 0.64, 0.1, 6, COR.cadeira));
  }

  objs.sort((a, b) => a.k - b.k);
  for (const o of objs) o.draw();
  return atores;
}

function desenharPostoExec(
  ctx: Ctx,
  L: Layout,
  p: Posto,
  v: EstadoVisual,
  pose: (nome: Pose) => ReturnType<typeof chibi>,
  t: number,
  add: (k: number, d: () => void) => void,
  atores: Ator[],
  sem: number,
) {
  const l = p.lote;
  const mesa = L.mesaExec!;
  // Chaves de profundidade fixas: tudo atrás da mesa < mesa < monitores < cadeiras de visita.
  const kMesa = mesa.x + mesa.w + mesa.y + 1.5;
  if (p.idx === 0) {
    // Estante na parede, mesa grande, cadeiras de visita, plantas e quadro branco
    add(l.x + l.y + 0.8, () => {
      caixa(ctx, L, l.x + 0.6, l.y + 0.2, 0, 2.2, 0.45, 30, COR.estante);
      const livros = ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#a855f7', '#f97316'];
      for (let prat = 0; prat < 3; prat++)
        for (let i = 0; i < 9; i++)
          placaY(ctx, L, l.x + 0.7 + i * 0.22, l.y + 0.65, 3 + prat * 9, 0.16, 6, livros[(i + prat * 2) % livros.length]!);
    });
    add(l.x + l.y + 0.9, () => {
      caixa(ctx, L, l.x + l.w - 2.6, l.y + 0.3, 0, 0.08, 0.08, 14, COR.monitor);
      caixa(ctx, L, l.x + l.w - 3.2, l.y + 0.25, 12, 1.6, 0.06, 16, ['#e5e7eb', '#f8fafc', '#cbd5e1']);
      placaY(ctx, L, l.x + l.w - 3.0, l.y + 0.31, 22, 0.4, 3, '#3b82f6');
      placaY(ctx, L, l.x + l.w - 2.5, l.y + 0.31, 18, 0.5, 2, '#ef4444');
      placaY(ctx, L, l.x + l.w - 2.9, l.y + 0.31, 16, 0.7, 1, '#22c55e');
    });
    add(kMesa, () => {
      caixa(ctx, L, mesa.x, mesa.y, 0, mesa.w, 1.2, 13, COR.mesaExec);
      placaY(ctx, L, mesa.x + 0.2, mesa.y + 1.2, 2, mesa.w - 0.4, 8, '#5e381f', 'rgba(20,10,5,0.4)');
    });
    for (const vx of [mesa.x + 0.5, mesa.x + mesa.w - 1.1]) {
      add(kMesa + 1 + vx * 0.001, () => {
        caixa(ctx, L, vx, mesa.y + 2.2, 0, 0.6, 0.6, 7, COR.cadeiraVisita);
        caixa(ctx, L, vx, mesa.y + 2.7, 7, 0.6, 0.12, 9, COR.cadeiraVisita);
      });
    }
    add(l.x + l.w + l.y + l.d - 1.5, () => vaso(ctx, L, l.x + l.w - 0.6, l.y + l.d - 0.7, t));
  }
  // Cadeira executiva atrás da mesa
  add(p.sx + p.sy - 0.3, () => {
    if (v.selecionado || v.hover) anel(ctx, L, p.sx, p.sy, v.selecionado, t);
    caixa(ctx, L, p.sx - 0.35, p.sy - 0.45, 5, 0.7, 0.15, 22, COR.cadeiraExec);
    caixa(ctx, L, p.sx - 0.35, p.sy - 0.3, 5, 0.7, 0.65, 3, COR.cadeiraExec);
  });
  const [hx, hy] = projetar(L, p.sx, p.sy, 8);
  add(p.sx + p.sy + 0.1, () => desenharSprite(ctx, pose('sentadoFrente'), hx, hy, { maosAcima: v.estado === 'trabalhando' && Math.floor(t / 140) % 2 === 0 }));
  atores.push({ agenteId: p.agenteId, x: p.sx, y: p.sy, sentado: true, cabeca: [hx, hy - 26], caixa: [hx - 11, hy - 26, 22, 30] });
  // Monitor de costas sobre a mesa
  add(kMesa + 0.1, () => {
    caixa(ctx, L, p.sx - 0.35, mesa.y + 0.25, 13, 0.7, 0.08, 9, COR.monitor);
    if (v.estado !== 'ocioso') {
      const brilho = { trabalhando: '#4ade80', aguardando_aprovacao: '#facc15', bloqueado: '#f87171', erro: '#f87171', ocioso: '#000' }[v.estado];
      placaY(ctx, L, p.sx - 0.3, mesa.y + 0.33, 23, 0.6, 0.6, brilho);
    }
  });
  void sem;
}

function vaso(ctx: Ctx, L: Layout, x: number, y: number, t: number, z = 0, esc = 1) {
  caixa(ctx, L, x - 0.18 * esc, y - 0.18 * esc, z, 0.36 * esc, 0.36 * esc, 6 * esc, ['#7c4a2a', '#a0603a', '#8a5030']);
  const [px, py] = projetar(L, x, y, z + 6 * esc);
  const balanço = Math.round(Math.sin(t / 900 + x) * 0.6);
  const folhas: [number, number, string][] = [
    [0, -9, '#15803d'], [-3, -7, '#16a34a'], [3, -7, '#16a34a'], [-4, -4, '#22c55e'], [4, -4, '#22c55e'],
    [-1, -5, '#22c55e'], [2, -3, '#15803d'], [-2, -2, '#16a34a'], [1, -11, '#22c55e'],
  ];
  for (const [dx, dy, c] of folhas) {
    ctx.fillStyle = c;
    const s = Math.max(2, Math.round(3 * esc));
    ctx.fillRect(Math.round(px + dx * esc + balanço) - 1, Math.round(py + dy * esc), s, s);
  }
}

function anel(ctx: Ctx, L: Layout, x: number, y: number, forte: boolean, t: number) {
  const r = 0.62 + (forte ? Math.sin(t / 250) * 0.06 : 0);
  poly(ctx, L, [[x - r, y - r, 0.5], [x + r, y - r, 0.5], [x + r, y + r, 0.5], [x - r, y + r, 0.5]], forte ? 'rgba(74,222,128,0.28)' : 'rgba(255,255,255,0.12)', forte ? '#4ade80' : 'rgba(255,255,255,0.6)');
}

/** Pontos de referência para placas HTML (nome do setor, placa da diretoria). */
export function placasSetor(L: Layout) {
  return L.lotes.map((l) => {
    const [x, y] = projetar(L, l.x, l.y + l.d, 0);
    return { dep: l.dep, exec: l.exec, x, y, parede: l.exec ? projetar(L, 0, l.y + l.d - 0.5, 46) : null };
  });
}
