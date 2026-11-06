import { memo } from 'react';
import type { Agente } from '../../shared/types';

// Personagem em pixel art visto de costas, sentado de frente para o monitor.
const MAPA = [
  '...HHHHHH...',
  '..HHHHHHHH..',
  '..HHHHHHHH..',
  '..HHHHHHHH..',
  '...HHHHHH...',
  '....SSSS....',
  '.BBBBBBBBBB.',
  'BBBBBBBBBBBB',
  'BBBDBBBBDBBB',
  'BBBBBBBBBBBB',
  '..BBBBBBBB..',
  '..BBBBBBBB..',
];
const MAOS = [
  [0, 9],
  [11, 9],
];

const CABELOS = ['#1f1b16', '#3b2a1e', '#6b4226', '#a16207', '#d6b07a', '#7c2d12', '#4b5563', '#111827'];
const PELES = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffdbac'];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function escurecer(hex: string, f = 0.7) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * f);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

export const Sprite = memo(function Sprite({ agente, cor, pequeno }: { agente: Agente; cor: string; pequeno?: boolean }) {
  const h = hash(agente.id);
  const cabelo = CABELOS[h % CABELOS.length]!;
  const pele = PELES[(h >> 3) % PELES.length]!;
  const sombra = escurecer(cor);
  const fill: Record<string, string> = { H: cabelo, S: pele, B: cor, D: sombra };
  return (
    <svg
      className={`sprite ${pequeno ? 'pequeno' : ''}`}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {MAPA.flatMap((linha, y) =>
        [...linha].map((ch, x) => (ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill[ch]} />)),
      )}
      <g className="maos">
        {MAOS.map(([x, y]) => (
          <rect key={x} x={x} y={y} width={1} height={2} fill={pele} />
        ))}
      </g>
    </svg>
  );
});
