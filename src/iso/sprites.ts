// Personagens com proporção adulta em pixel art (14 × 36 px), gerados por código.
// Luz vinda da esquerda: cada parte tem tom claro na borda esquerda e sombra na direita.
// Cabelo, rosto, acessórios e calça vêm do id do agente; a roupa vem do setor.

export const LARGURA_SPRITE = 14;
const ALTURA_EM_PE = 36;
const ALTURA_SENTADO = 22;

export type Pose = 'frente' | 'frenteB' | 'costas' | 'costasB' | 'sentadoFrente' | 'sentadoCostas';
export type Grade = (string | null)[][];
export interface SpritePronto {
  grade: Grade;
}

export const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = <T,>(lista: T[], n: number) => lista[n % lista.length]!;

// ---------------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------------
function rgb(hex: string): [number, number, number] {
  if (hex.startsWith('rgb')) return hex.match(/\d+/g)!.map(Number) as [number, number, number];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const css = ([r, g, b]: number[]) => `rgb(${r!.toFixed(0)},${g!.toFixed(0)},${b!.toFixed(0)})`;
const escurecer = (c: string, f: number) => css(rgb(c).map((v) => v * f));
const clarear = (c: string, f: number) => css(rgb(c).map((v) => v + (255 - v) * f));
const misturar = (a: string, b: string, f: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return css(x.map((v, i) => v + (y[i]! - v) * f));
};
interface Tom {
  b: string;
  l: string;
  d: string;
  dd: string;
}
const tom = (c: string): Tom => ({ b: c, l: clarear(c, 0.22), d: escurecer(c, 0.78), dd: escurecer(c, 0.58) });

const CABELOS = ['#1f1a16', '#3b2a1e', '#5a3a22', '#7a5230', '#a57a45', '#c9a46a', '#8a3b1e', '#7b7f88', '#d9d5cd'];
const PELES = ['#f3d2b6', '#e6b892', '#cf9a6c', '#ad7449', '#7d4f2f', '#5e3a22'];
const CALCAS = ['#3b5a86', '#25272d', '#8c7b57', '#4a505b', '#2e3f5c'];
const ESTILOS = ['curto', 'social', 'cacheado', 'longo', 'coque', 'rabo', 'careca'] as const;
type Estilo = (typeof ESTILOS)[number];
type Roupa = 'terno' | 'camisa' | 'polo' | 'moletom' | 'colete' | 'jaqueta';

const ROUPA_POR_SETOR: Record<string, Roupa> = {
  diretoria: 'terno',
  produto: 'camisa',
  design: 'polo',
  frontend: 'moletom',
  backend: 'moletom',
  dados: 'camisa',
  mobile: 'moletom',
  qa: 'colete',
  devops: 'jaqueta',
  suporte: 'polo',
};

// ---------------------------------------------------------------------------
// Grade de pixels
// ---------------------------------------------------------------------------
const nova = (h: number): Grade => Array.from({ length: h }, () => Array<string | null>(LARGURA_SPRITE).fill(null));
function px(g: Grade, x: number, y: number, c: string | null) {
  if (y >= 0 && y < g.length && x >= 0 && x < LARGURA_SPRITE) g[y]![x] = c;
}
function ret(g: Grade, x0: number, y0: number, x1: number, y1: number, c: string) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(g, x, y, c);
}
/** Preenche um retângulo com luz à esquerda e sombra à direita. */
function volume(g: Grade, x0: number, y0: number, x1: number, y1: number, t: Tom) {
  ret(g, x0, y0, x1, y1, t.b);
  for (let y = y0; y <= y1; y++) {
    px(g, x0, y, t.l);
    px(g, x1, y, t.d);
  }
}

// ---------------------------------------------------------------------------
// Aparência derivada do id
// ---------------------------------------------------------------------------
interface Aparencia {
  pele: Tom;
  cabelo: Tom;
  calca: Tom;
  estilo: Estilo;
  roupa: Roupa;
  setor: Tom;
  oculos: boolean;
  barba: 'nenhuma' | 'barba' | 'bigode';
  headset: boolean;
}

function aparencia(id: string, setor: string, corSetor: string): Aparencia {
  const h = hash(id);
  const base = setor.split(':').pop()!;
  const estilo = pick([...ESTILOS], h >>> 2);
  const podeBarba = ['curto', 'social', 'careca'].includes(estilo);
  return {
    pele: tom(pick(PELES, h >>> 6)),
    cabelo: tom(pick(CABELOS, h >>> 9)),
    calca: tom(pick(CALCAS, h >>> 13)),
    estilo,
    roupa: ROUPA_POR_SETOR[base] ?? pick<Roupa>(['moletom', 'camisa', 'polo'], h >>> 16),
    setor: tom(corSetor),
    oculos: (h >>> 18) % 10 < 3,
    barba: podeBarba && (h >>> 21) % 3 === 0 ? ((h >>> 23) % 2 ? 'barba' : 'bigode') : 'nenhuma',
    headset: base === 'suporte',
  };
}

// ---------------------------------------------------------------------------
// Cabeça e cabelo
// ---------------------------------------------------------------------------
function cabeca(g: Grade, a: Aparencia, costas: boolean) {
  const s = a.pele;
  ret(g, 5, 2, 8, 2, s.b);
  volume(g, 4, 3, 9, 7, s);
  ret(g, 5, 8, 8, 8, costas ? s.d : s.b);
  px(g, 8, 8, s.d);
  px(g, 3, 5, s.d); // orelhas
  px(g, 3, 6, s.d);
  px(g, 10, 5, s.dd);
  px(g, 10, 6, s.dd);
  ret(g, 6, 9, 7, 9, s.d); // pescoço
  if (costas) return;
  px(g, 5, 4, a.cabelo.dd); // sobrancelhas
  px(g, 8, 4, a.cabelo.dd);
  px(g, 5, 5, '#1c1c24'); // olhos
  px(g, 8, 5, '#1c1c24');
  px(g, 7, 6, s.d); // sombra do nariz
  px(g, 6, 7, escurecer(s.b, 0.68)); // boca
  px(g, 7, 7, escurecer(s.b, 0.68));
}

function cabeloFrente(g: Grade, a: Aparencia) {
  const c = a.cabelo;
  switch (a.estilo) {
    case 'curto':
      ret(g, 5, 1, 8, 1, c.b);
      ret(g, 4, 2, 9, 2, c.b);
      px(g, 5, 1, c.l);
      px(g, 4, 3, c.b);
      px(g, 9, 3, c.d);
      px(g, 4, 4, c.d);
      px(g, 9, 4, c.dd);
      break;
    case 'social':
      ret(g, 4, 1, 8, 1, c.b);
      ret(g, 4, 2, 9, 2, c.b);
      ret(g, 5, 1, 6, 1, c.l);
      ret(g, 4, 3, 6, 3, c.b);
      px(g, 9, 3, c.d);
      px(g, 4, 4, c.d);
      px(g, 9, 4, c.dd);
      break;
    case 'cacheado':
      ret(g, 5, 0, 8, 0, c.b);
      ret(g, 4, 1, 9, 1, c.b);
      ret(g, 3, 2, 10, 2, c.b);
      ret(g, 3, 3, 4, 3, c.b);
      ret(g, 9, 3, 10, 3, c.d);
      px(g, 3, 4, c.d);
      px(g, 10, 4, c.dd);
      for (let y = 0; y <= 3; y++) for (let x = 3; x <= 10; x++) if (g[y]![x] === c.b && (x + y) % 2 === 0) px(g, x, y, x < 7 ? c.l : c.d);
      break;
    case 'longo':
      ret(g, 5, 1, 8, 1, c.b);
      ret(g, 4, 2, 9, 2, c.b);
      ret(g, 5, 2, 6, 2, c.l);
      ret(g, 4, 3, 4, 4, c.b);
      ret(g, 9, 3, 9, 4, c.d);
      ret(g, 3, 3, 3, 12, c.b);
      ret(g, 10, 3, 10, 12, c.d);
      ret(g, 4, 9, 4, 13, c.b);
      ret(g, 9, 9, 9, 13, c.d);
      break;
    case 'coque':
      ret(g, 6, 0, 7, 0, c.d);
      ret(g, 5, 1, 8, 1, c.b);
      ret(g, 4, 2, 9, 2, c.b);
      px(g, 5, 2, c.l);
      px(g, 4, 3, c.b);
      px(g, 9, 3, c.d);
      break;
    case 'rabo':
      ret(g, 5, 1, 8, 1, c.b);
      ret(g, 4, 2, 9, 2, c.b);
      ret(g, 5, 1, 6, 1, c.l);
      ret(g, 4, 3, 5, 3, c.b);
      px(g, 9, 3, c.d);
      ret(g, 10, 3, 10, 7, c.dd);
      break;
    case 'careca':
      ret(g, 5, 1, 8, 1, a.pele.b);
      px(g, 5, 1, a.pele.l);
      ret(g, 4, 2, 9, 2, a.pele.b);
      px(g, 4, 4, c.d);
      px(g, 4, 5, c.d);
      px(g, 9, 4, c.dd);
      px(g, 9, 5, c.dd);
      break;
  }
}

function cabeloCostas(g: Grade, a: Aparencia) {
  const c = a.cabelo;
  if (a.estilo === 'careca') {
    ret(g, 5, 1, 8, 1, a.pele.b);
    ret(g, 4, 2, 9, 4, a.pele.b);
    px(g, 5, 2, a.pele.l);
    ret(g, 4, 5, 9, 7, c.d);
    return;
  }
  const topo = a.estilo === 'cacheado' ? 0 : 1;
  ret(g, 5, topo, 8, topo, c.b);
  for (let y = topo + 1; y <= 7; y++) {
    const largo = a.estilo === 'cacheado' && y <= 4;
    ret(g, largo ? 3 : 4, y, largo ? 10 : 9, y, c.b);
    px(g, largo ? 10 : 9, y, c.d);
  }
  ret(g, 5, 2, 6, 2, c.l);
  px(g, 5, 3, c.l);
  if (a.estilo === 'cacheado') for (let y = 0; y <= 7; y++) for (let x = 3; x <= 10; x++) if (g[y]![x] === c.b && (x + y) % 2 === 0) px(g, x, y, c.d);
  if (a.estilo === 'longo') {
    ret(g, 4, 8, 9, 13, c.b);
    ret(g, 9, 8, 9, 13, c.d);
    ret(g, 5, 14, 8, 14, c.d);
  }
  if (a.estilo === 'rabo') {
    ret(g, 6, 8, 7, 12, c.b);
    px(g, 7, 9, c.d);
    px(g, 6, 13, c.d);
  }
  if (a.estilo === 'coque') {
    ret(g, 5, 0, 8, 0, c.d);
    ret(g, 6, 1, 7, 1, c.dd);
  }
}

function acessorios(g: Grade, a: Aparencia, costas: boolean) {
  const k = '#1a1b20';
  if (a.headset) {
    ret(g, 4, 1, 9, 1, k);
    px(g, 3, 2, k);
    px(g, 10, 2, k);
    ret(g, 3, 4, 3, 6, k);
    ret(g, 10, 4, 10, 6, k);
    if (!costas) {
      px(g, 4, 7, k);
      px(g, 5, 7, '#ef4444');
    }
  }
  if (costas) return;
  if (a.barba === 'barba') {
    const c = a.cabelo.d;
    px(g, 4, 6, c);
    px(g, 9, 6, c);
    ret(g, 4, 7, 5, 7, c);
    ret(g, 8, 7, 9, 7, c);
    ret(g, 5, 8, 8, 8, c);
  } else if (a.barba === 'bigode') {
    ret(g, 5, 6, 8, 6, a.cabelo.d);
    px(g, 7, 6, a.cabelo.dd);
  }
  if (a.oculos) {
    // Armação metálica fina: os olhos continuam visíveis entre as hastes.
    const o = '#8a93a3';
    px(g, 4, 5, o);
    px(g, 6, 5, o);
    px(g, 7, 5, '#6b7280');
    px(g, 9, 5, o);
    px(g, 3, 5, '#6b7280');
    px(g, 10, 5, '#6b7280');
  }
}

// ---------------------------------------------------------------------------
// Corpo
// ---------------------------------------------------------------------------
/** Tronco e braços (linhas 9–21). */
function tronco(g: Grade, a: Aparencia, costas: boolean) {
  const s = a.setor;
  const pele = a.pele;
  const branco = tom('#eef2f6');
  const corpo = (t: Tom) => volume(g, 3, 10, 10, 21, t);
  const bracos = (t: Tom, ate = 19) => {
    ret(g, 1, 11, 2, ate, t.b);
    ret(g, 11, 11, 12, ate, t.d);
    for (let y = 11; y <= ate; y++) {
      px(g, 1, y, t.l);
      px(g, 12, y, t.dd);
    }
  };
  const antebracos = (de: number) => {
    ret(g, 1, de, 2, 19, pele.b);
    ret(g, 11, de, 12, 19, pele.d);
  };
  const maos = () => {
    ret(g, 1, 20, 2, 21, pele.b);
    ret(g, 11, 20, 12, 21, pele.d);
  };

  switch (a.roupa) {
    case 'terno': {
      const j = tom('#2c3242');
      corpo(j);
      bracos(j);
      maos();
      if (!costas) {
        ret(g, 6, 10, 7, 14, branco.b);
        ret(g, 6, 11, 7, 16, s.b);
        px(g, 7, 12, s.d);
        px(g, 7, 15, s.d);
        ret(g, 6, 17, 7, 17, s.dd);
        ret(g, 5, 10, 5, 13, j.l);
        ret(g, 8, 10, 8, 13, j.l);
        px(g, 7, 18, j.dd);
        px(g, 7, 20, j.dd);
        ret(g, 4, 15, 5, 15, j.dd); // bolso
      } else ret(g, 6, 10, 7, 10, branco.d);
      ret(g, 1, 19, 2, 19, branco.b); // punhos
      ret(g, 11, 19, 12, 19, branco.d);
      break;
    }
    case 'camisa': {
      const c = tom(misturar(s.b, '#ffffff', 0.55));
      corpo(c);
      bracos(c, 15);
      ret(g, 1, 15, 2, 15, c.d);
      ret(g, 11, 15, 12, 15, c.dd);
      antebracos(16);
      maos();
      ret(g, 3, 21, 10, 21, '#3a2a1c'); // cinto
      px(g, 6, 21, '#c9a227');
      if (!costas) {
        ret(g, 5, 10, 8, 10, branco.b);
        px(g, 8, 10, branco.d);
        for (let y = 11; y <= 20; y++) px(g, 6, y, c.d);
        ret(g, 4, 13, 5, 13, c.d); // bolso
      } else for (let y = 12; y <= 19; y += 3) px(g, 6, y, c.d);
      break;
    }
    case 'polo': {
      corpo(s);
      bracos(s, 13);
      antebracos(14);
      maos();
      ret(g, 5, 10, 8, 10, s.l);
      if (!costas) {
        px(g, 4, 10, s.l);
        px(g, 9, 10, s.l);
        ret(g, 6, 11, 7, 13, s.d);
        px(g, 6, 12, '#f1f5f9');
        if (!a.headset) px(g, 4, 13, s.l); // logo
      }
      ret(g, 3, 21, 10, 21, s.d);
      break;
    }
    case 'moletom': {
      corpo(s);
      bracos(s);
      maos();
      ret(g, 1, 19, 2, 19, s.d);
      ret(g, 11, 19, 12, 19, s.dd);
      ret(g, 3, 20, 10, 21, s.d);
      if (!costas) {
        ret(g, 4, 9, 5, 10, s.d); // capuz em volta do pescoço
        ret(g, 8, 9, 9, 10, s.dd);
        ret(g, 5, 11, 5, 12, '#f1f5f9'); // cordões
        ret(g, 8, 11, 8, 12, '#e2e8f0');
        ret(g, 4, 16, 9, 18, s.d); // bolso canguru
        ret(g, 5, 16, 8, 16, s.dd);
      } else {
        ret(g, 4, 9, 9, 13, s.d); // capuz caído nas costas
        ret(g, 5, 10, 8, 12, s.dd);
      }
      break;
    }
    case 'colete': {
      bracos(branco);
      maos();
      corpo(s);
      if (!costas) {
        ret(g, 6, 10, 7, 13, branco.b);
        px(g, 6, 10, branco.l);
        for (let y = 14; y <= 20; y += 2) px(g, 6, y, s.dd);
        ret(g, 5, 10, 5, 12, s.l);
        ret(g, 8, 10, 8, 12, s.d);
      } else ret(g, 4, 11, 9, 11, s.d);
      ret(g, 3, 21, 10, 21, s.dd);
      break;
    }
    case 'jaqueta': {
      const j = tom('#3d4450');
      corpo(j);
      bracos(j);
      maos();
      ret(g, 1, 19, 2, 19, j.dd);
      ret(g, 11, 19, 12, 19, j.dd);
      if (!costas) {
        ret(g, 5, 10, 8, 20, s.b);
        ret(g, 5, 10, 8, 10, s.d);
        ret(g, 5, 11, 5, 20, j.dd);
        ret(g, 8, 11, 8, 20, j.dd);
        ret(g, 3, 10, 4, 11, j.l); // gola
        ret(g, 9, 10, 10, 11, j.l);
      } else {
        ret(g, 3, 10, 10, 11, j.l);
        ret(g, 5, 14, 8, 14, j.d);
      }
      ret(g, 3, 21, 10, 21, j.dd);
      break;
    }
  }
}

function pernas(g: Grade, a: Aparencia, passo: boolean) {
  const p = a.calca;
  ret(g, 3, 22, 10, 22, p.b);
  px(g, 3, 22, p.l);
  px(g, 10, 22, p.d);
  const sapato = tom('#1d1e23');
  if (!passo) {
    volume(g, 4, 23, 6, 33, p);
    volume(g, 7, 23, 9, 33, p);
    ret(g, 6, 23, 7, 33, p.d);
    ret(g, 3, 34, 6, 35, sapato.b);
    ret(g, 7, 34, 10, 35, sapato.d);
    ret(g, 3, 34, 6, 34, sapato.l);
  } else {
    volume(g, 4, 23, 6, 27, p);
    volume(g, 7, 23, 9, 27, p);
    volume(g, 3, 28, 5, 33, p);
    volume(g, 8, 28, 10, 33, p);
    ret(g, 2, 34, 5, 35, sapato.b);
    ret(g, 8, 34, 11, 35, sapato.d);
    ret(g, 2, 34, 5, 34, sapato.l);
  }
}

// ---------------------------------------------------------------------------
const cache = new Map<string, SpritePronto>();

/** Monta (com cache) o personagem de um agente numa pose. `setor` é o id do departamento. */
export function personagem(id: string, setor: string, corSetor: string, pose: Pose): SpritePronto {
  const chave = `${id}|${setor}|${corSetor}|${pose}`;
  const pronto = cache.get(chave);
  if (pronto) return pronto;
  const a = aparencia(id, setor, corSetor);
  const costas = pose.startsWith('costas') || pose === 'sentadoCostas';
  const g = nova(ALTURA_EM_PE);
  pernas(g, a, pose.endsWith('B'));
  tronco(g, a, costas);
  cabeca(g, a, costas);
  if (costas) cabeloCostas(g, a);
  else cabeloFrente(g, a);
  acessorios(g, a, costas);
  const sprite = { grade: pose.startsWith('sentado') ? g.slice(0, ALTURA_SENTADO) : g };
  cache.set(chave, sprite);
  return sprite;
}

/** Desenha o sprite ancorado pelo centro da base (x, y), com contorno escuro de 1 px. */
export function desenharSprite(ctx: CanvasRenderingContext2D, { grade }: SpritePronto, x: number, y: number, opts: { maosAcima?: boolean } = {}) {
  const x0 = Math.round(x - LARGURA_SPRITE / 2);
  const y0 = Math.round(y - grade.length);
  const cheio = (gx: number, gy: number) => !!grade[gy]?.[gx];
  ctx.fillStyle = 'rgba(14,16,22,0.8)';
  for (let gy = -1; gy <= grade.length; gy++)
    for (let gx = -1; gx <= LARGURA_SPRITE; gx++)
      if (!cheio(gx, gy) && (cheio(gx - 1, gy) || cheio(gx + 1, gy) || cheio(gx, gy - 1) || cheio(gx, gy + 1))) ctx.fillRect(x0 + gx, y0 + gy, 1, 1);
  for (let gy = 0; gy < grade.length; gy++) {
    const linha = grade[gy]!;
    for (let gx = 0; gx < LARGURA_SPRITE; gx++) {
      const c = linha[gx];
      if (!c) continue;
      // Digitando: antebraços e mãos sobem 1 px alternadamente.
      const dy = opts.maosAcima && gy >= 16 && (gx <= 2 || gx >= 11) ? -1 : 0;
      ctx.fillStyle = c;
      ctx.fillRect(x0 + gx, y0 + gy + dy, 1, 1);
    }
  }
}
