import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

const CLUMPS: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 5, 7.4],
  [5.6, 1.2, 4.2, 5.4],
  [-5.4, 2, 4.4, 5.6],
  [-1.6, -6, 4.6, 5.2],
  [2.4, 6.2, 4.4, 5],
  [4.4, -4.6, 5.6, 4.4],
  [-4.2, -3.4, 6.2, 4.2],
  [0.6, 0.4, 8.2, 4.6],
];

/**
 * A crown of oak leaves to hang in a giant oak: a lumpy dome of clustered leaves, dark in its
 * hollows, catching the light on top, with gaps you can see the ground through.
 */
const look: LookModule = {
  id: 'prop.oak-crown',
  look: {
    kind: 'prop',
    part: {
      w: 26,
      h: 26,
      layers: 12,
      smooth: true,
      fn: (x, y, z) => {
        const rag = (noise3(x * 1.1 + 7, y * 1.1, z * 1.1) - 0.5) * 2.8;
        let inside = -9;
        for (const [cx, cy, cz, cr] of CLUMPS)
          inside = Math.max(inside, cr + rag - Math.hypot(x - cx, y - cy, (z - cz) * 1.5));
        if (inside < 0) return null;
        if (inside < 1.4 && noise3(x * 2.4 + 1, y * 2.4, z * 2.4) > 0.68) return null;
        const tone =
          noise3(x * 0.7 + 3, y * 0.7, z * 0.7) + (z - 5) * 0.05 - (inside > 3 ? 0.2 : 0);
        return tone > 0.66 ? 'leaf3' : tone > 0.42 ? 'leaf2' : 'leaf';
      },
    },
  },
};
export default look;
