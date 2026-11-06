// Personagens em pixel art (10 px de largura). Cada letra é uma cor:
// H cabelo · S pele · E olhos · J paletó · W camisa · T gravata (cor do setor) · P calça · K sapato
export const LARGURA_SPRITE = 10;

const CABECA_FRENTE = ['...HHHH...', '..HHHHHH..', '..HSSSSH..', '..SESSES..', '..SSSSSS..', '...SSSS...'];
const CABECA_COSTAS = ['...HHHH...', '..HHHHHH..', '..HHHHHH..', '..HHHHHH..', '..HHHHHH..', '...SSSS...'];
const TRONCO_FRENTE = ['..JWTTWJ..', '.JJWTTWJJ.', '.JJJTTJJJ.', '.JJJTTJJJ.', '.SJJJJJJS.', '..JJJJJJ..'];
const TRONCO_COSTAS = ['..JJJJJJ..', '.JJJJJJJJ.', '.JJJJJJJJ.', '.JJJJJJJJ.', '.SJJJJJJS.', '..JJJJJJ..'];
const PERNAS_A = ['..PP..PP..', '..PP..PP..', '..PP..PP..', '..KK..KK..'];
const PERNAS_B = ['...PPPP...', '..PP..PP..', '.PP....PP.', '.KK....KK.'];

export const SPRITES = {
  frente: [...CABECA_FRENTE, ...TRONCO_FRENTE, ...PERNAS_A],
  frenteB: [...CABECA_FRENTE, ...TRONCO_FRENTE, ...PERNAS_B],
  costas: [...CABECA_COSTAS, ...TRONCO_COSTAS, ...PERNAS_A],
  costasB: [...CABECA_COSTAS, ...TRONCO_COSTAS, ...PERNAS_B],
  sentadoCostas: [...CABECA_COSTAS, ...TRONCO_COSTAS],
  sentadoFrente: [...CABECA_FRENTE, ...TRONCO_FRENTE],
};
export type NomeSprite = keyof typeof SPRITES;

const CABELOS = ['#1f1b16', '#3b2a1e', '#6b4226', '#a16207', '#d6b07a', '#7c2d12', '#4b5563', '#111827', '#9a3412'];
const PELES = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffdbac'];
const TERNOS = ['#2b3038', '#1f2a3a', '#33363d', '#3a3f4a', '#2a2f2a', '#3b3030'];

export const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function paleta(id: string, corSetor: string): Record<string, string> {
  const h = hash(id);
  return {
    H: CABELOS[h % CABELOS.length]!,
    S: PELES[(h >> 4) % PELES.length]!,
    E: '#1b1b1b',
    J: TERNOS[(h >> 8) % TERNOS.length]!,
    W: '#e8eef2',
    T: corSetor,
    P: '#22252b',
    K: '#111111',
  };
}

/** Desenha o sprite ancorado pelo centro da base (px, py), com contorno escuro de 1 px. */
export function desenharSprite(
  ctx: CanvasRenderingContext2D,
  nome: NomeSprite,
  cores: Record<string, string>,
  px: number,
  py: number,
  opts: { maosAcima?: boolean; escala?: number } = {},
) {
  const mapa = SPRITES[nome];
  const e = opts.escala ?? 2;
  const x0 = Math.round(px - (LARGURA_SPRITE * e) / 2);
  const y0 = Math.round(py - mapa.length * e);
  const cheio = (x: number, y: number) => {
    const ch = mapa[y]?.[x];
    return ch !== undefined && ch !== '.';
  };
  ctx.fillStyle = 'rgba(10,12,16,0.85)';
  for (let y = 0; y < mapa.length; y++)
    for (let x = 0; x < LARGURA_SPRITE; x++)
      if (!cheio(x, y) && (cheio(x - 1, y) || cheio(x + 1, y) || cheio(x, y - 1) || cheio(x, y + 1)))
        ctx.fillRect(x0 + x * e, y0 + y * e, e, e);
  for (let y = 0; y < mapa.length; y++) {
    const linha = mapa[y]!;
    for (let x = 0; x < LARGURA_SPRITE; x++) {
      const ch = linha[x]!;
      if (ch === '.') continue;
      // Mãos "digitando": sobem 1 px alternadamente.
      const dy = opts.maosAcima && ch === 'S' && y >= 10 ? -1 : 0;
      ctx.fillStyle = cores[ch]!;
      ctx.fillRect(x0 + x * e, y0 + (y + dy) * e, e, e);
    }
  }
}
