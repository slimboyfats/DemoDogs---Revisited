import type { LookModule } from '@demodogs/shared';
import { DESERT, strata } from '../../../src/desert';
import { noise3 } from '../../../src/shapes';

/** A heap of tumbled sandstone: a broad slab with two broken blocks fallen against it, chipped at every edge. */
const BLOCKS: readonly (readonly [number, number, number, number, number, number])[] = [
  // x, y, z, half sizes x, y, z
  [-1, 0.5, 2.2, 5.6, 4.4, 2.4],
  [3.2, -2.2, 3.6, 3, 2.8, 3.4],
  [-3.6, -2.6, 4.2, 2.6, 2.4, 2.8],
];

const look: LookModule = {
  id: 'prop.rockfall',
  look: {
    kind: 'prop',
    materials: DESERT,
    part: {
      w: 15,
      h: 13,
      layers: 8,
      smooth: true,
      fn: (x, y, z) => {
        const chip = noise3(x * 0.7 + 3, y * 0.7, z * 0.7) * 0.5;
        for (let i = 0; i < BLOCKS.length; i++) {
          const [bx, by, bz, sx, sy, sz] = BLOCKS[i]!;
          // a rounded box: flat faces, worn corners
          const q = Math.hypot(
            Math.max(0, Math.abs(x - bx) - sx + 1.2),
            Math.max(0, Math.abs(y - by) - sy + 1.2),
            Math.max(0, Math.abs(z - bz) - sz + 1.2),
          );
          if (q > 1.2 - chip) continue;
          // each block lies at its own tilt, so its bands run at a slant
          const t = z - bz + (x - bx) * (0.25 - i * 0.2) + (y - by) * 0.15 * i;
          if (z > bz + sz - 0.9 && q < 0.4) return 'sand3';
          return strata(x * 0.5 + i * 3, y * 0.5, t * 1.7 + i * 4);
        }
        return null;
      },
    },
  },
};
export default look;
