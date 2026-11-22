import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/** A low round bush of three leafy mounds on a few twigs. */
const look: LookModule = {
  id: 'prop.bush',
  look: {
    kind: 'prop',
    part: {
      w: 12,
      h: 12,
      layers: 7,
      smooth: true,
      fn: (x, y, z) => {
        if (z < 1.6) return Math.hypot(x, y) < 0.8 ? 'bark2' : null;
        const rag = (noise3(x * 1.7, y * 1.7, z * 1.7) - 0.5) * 2;
        let inside = -9;
        for (const [cx, cy, cz, cr] of [
          [0.6, 0.4, 3.4, 3.4],
          [-2.2, 1.2, 2.9, 2.6],
          [1.4, -2.2, 2.8, 2.5],
        ] as const)
          inside = Math.max(inside, cr + rag - Math.hypot(x - cx, y - cy, (z - cz) * 1.3));
        if (inside < 0) return null;
        if (inside < 1 && noise3(x * 2.4 + 2, y * 2.4, z * 2.4) > 0.72) return null;
        const tone = noise3(x * 1.0, y * 1.0 + 5, z * 1.0) + (z - 3) * 0.06;
        return tone > 0.62 ? 'leaf3' : tone > 0.42 ? 'leaf2' : 'leaf';
      },
    },
  },
};
export default look;
