import { memo } from 'react';
import type { Agente } from '../../shared/types';
import { LARGURA_SPRITE, personagem } from '../iso/sprites';

/** O mesmo personagem do escritório isométrico, em SVG (para fichas e lista móvel). */
export const Sprite = memo(function Sprite({ agente, cor, pequeno }: { agente: Agente; cor: string; pequeno?: boolean }) {
  const { grade } = personagem(agente.id, agente.departamentoId, cor, 'frente');
  return (
    <svg className={`sprite ${pequeno ? 'pequeno' : ''}`} viewBox={`-1 -1 ${LARGURA_SPRITE + 2} ${grade.length + 2}`} shapeRendering="crispEdges" aria-hidden>
      {grade.flatMap((linha, y) => linha.map((c, x) => (c ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} /> : null)))}
    </svg>
  );
});
