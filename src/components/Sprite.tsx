import { memo } from 'react';
import type { Agente } from '../../shared/types';
import { chibi, LARGURA_SPRITE } from '../iso/sprites';

/** O mesmo chibi do escritório isométrico, em SVG (para fichas e lista móvel). */
export const Sprite = memo(function Sprite({ agente, cor, pequeno }: { agente: Agente; cor: string; pequeno?: boolean }) {
  const { mapa, cores } = chibi(agente.id, agente.departamentoId, cor, 'frente');
  return (
    <svg className={`sprite ${pequeno ? 'pequeno' : ''}`} viewBox={`-1 -1 ${LARGURA_SPRITE + 2} ${mapa.length + 2}`} shapeRendering="crispEdges" aria-hidden>
      {mapa.flatMap((linha, y) =>
        [...linha].map((ch, x) => (ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={cores[ch]} />)),
      )}
    </svg>
  );
});
