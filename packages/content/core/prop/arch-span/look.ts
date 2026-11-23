import type { LookModule } from '@demodogs/shared';
import { DESERT, strata } from '../../../src/desert';
import { noise3 } from '../../../src/shapes';

/**
 * A block of a natural arch: nothing below 15 px (cars drive under it), then a slab of banded
 * sandstone, sagging a little at its middle, rough underneath, its top worn smooth.
 */
const look: LookModule = {
  id: 'prop.arch-span',
  look: {
    kind: 'prop',
    materials: DESERT,
    part: {
      // x runs across the road, y along it
      w: 12,
      h: 14,
      layers: 24,
      smooth: true,
      fn: (x, y, z) => {
        const rough = noise3(x * 0.5, y * 0.5, z * 0.4) * 2;
        const under = 15.5 + rough;
        const top = 22.6 + noise3(x * 0.3, y * 0.3 + 4, 2) * 1.2;
        if (z < under || z > top) return null;
        if (Math.abs(x) > 6 || Math.abs(y) > 5.6 - Math.abs(z - 19) * 0.25 - rough * 0.3)
          return null;
        if (z > top - 0.8) return 'sand3';
        if (z < under + 0.8) return 'varnish';
        return strata(x, y, z);
      },
    },
  },
};
export default look;
