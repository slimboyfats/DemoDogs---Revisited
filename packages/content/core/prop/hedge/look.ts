import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/**
 * A length of clipped hedge: a square block of leaves in big flat-coloured cubes, the top edges
 * taken off, a few twigs showing at the foot.
 */
const look: LookModule = {
  id: 'prop.hedge',
  look: {
    kind: 'prop',
    materials: {
      hedge: ['#1f6a2c', '#2f8f3a', '#4fb84c'],
      hedge2: ['#27783a', '#3da246', '#68cc58'],
      hedge3: ['#186026', '#267f33', '#3fa544'],
    },
    part: {
      w: 12,
      h: 10,
      layers: 13,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) > 6 || Math.abs(y) > 4.6 || z > 12.4) return null;
        if (z < 1) return Math.abs(y) < 1 && Math.abs((x + 6) % 4) < 1 ? 'bark2' : null;
        // the long top edges are clipped off at a slant
        if (Math.abs(y) + (z - 10) * 0.9 > 5.4) return null;
        // cubes two art px across, each one green of three
        const t = hash3(Math.floor((x + 20) / 2), Math.floor((y + 20) / 2), Math.floor(z / 2));
        return t > 0.7 ? 'hedge2' : t < 0.22 ? 'hedge3' : 'hedge';
      },
    },
  },
};
export default look;
