import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/** Clumps of leaves that make up the crown: x, y, z of the middle, and the radius. */
const CLUMPS: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 12.2, 5.6],
  [3.6, 1.2, 10.2, 4.3],
  [-3.4, 2.2, 10.6, 4.2],
  [-1.6, -3.8, 10.0, 4.1],
  [2.6, -3.2, 11.4, 3.6],
  [0.4, 3.9, 12.0, 3.4],
  [-0.6, 0.4, 15.0, 3.3],
];

/** A broadleaf tree: a flared trunk and a crown of leafy clumps, light on top, dark beneath. */
const look: LookModule = {
  id: 'prop.tree',
  look: {
    kind: 'prop',
    part: {
      w: 20,
      h: 20,
      layers: 18,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 8.5 && r < 1.3 + Math.max(0, 1.6 - z) * 0.8 + 0.25 * Math.sin(Math.atan2(y, x) * 5))
          return noise3(x * 3, y * 3, z * 0.6) > 0.55 ? 'bark2' : 'bark';
        // ragged edges: the leaves stick out and fall back, a few to the art pixel
        const rag = (noise3(x * 1.3, y * 1.3, z * 1.3) - 0.5) * 2.4;
        let inside = -9;
        for (const [cx, cy, cz, cr] of CLUMPS)
          inside = Math.max(inside, cr + rag - Math.hypot(x - cx, y - cy, (z - cz) * 1.25));
        if (inside < 0) return null;
        // holes where the sky shows through
        if (inside < 1.2 && noise3(x * 2.2 + 9, y * 2.2, z * 2.2) > 0.74) return null;
        const tone = noise3(x * 0.9 + 4, y * 0.9, z * 0.9 + 7) + (z - 11) * 0.035;
        return tone > 0.62 ? 'leaf3' : tone > 0.44 ? 'leaf2' : 'leaf';
      },
    },
  },
};
export default look;
