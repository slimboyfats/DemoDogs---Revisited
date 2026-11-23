import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

const CLUMPS: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 11.5, 5.2],
  [4.4, 0.6, 10.4, 4.2],
  [-4.2, 1.4, 10.2, 4.3],
  [-1.2, -4.4, 10.6, 4.0],
  [1.8, 4.4, 10.8, 3.9],
  [3.2, -3.4, 12.2, 3.4],
  [-2.8, 3.6, 13.0, 3.2],
  [0.2, -0.4, 14.6, 3.4],
];

/** A broad maple: a short forked trunk under a wide, flat crown of amber, rust and yellow. */
const look: LookModule = {
  id: 'prop.maple',
  look: {
    kind: 'prop',
    part: {
      w: 22,
      h: 22,
      layers: 18,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 12 && r < 1.4 - Math.max(0, z - 7) * 0.14 + Math.max(0, 1.4 - z) * 0.9)
          return noise3(x * 3, y * 3, z * 0.6) > 0.55 ? 'bark2' : 'bark';
        const rag = (noise3(x * 1.3 + 5, y * 1.3, z * 1.3) - 0.5) * 2.6;
        let inside = -9;
        for (const [cx, cy, cz, cr] of CLUMPS)
          inside = Math.max(inside, cr + rag - Math.hypot(x - cx, y - cy, (z - cz) * 1.35));
        if (inside < 0) return null;
        if (inside < 1.2 && noise3(x * 2.2 + 3, y * 2.2, z * 2.2) > 0.72) return null;
        const tone = noise3(x * 0.8 + 11, y * 0.8, z * 0.8 + 2) + (z - 11) * 0.03;
        return tone > 0.62 ? 'maple3' : tone > 0.42 ? 'maple' : 'maple2';
      },
    },
  },
};
export default look;
