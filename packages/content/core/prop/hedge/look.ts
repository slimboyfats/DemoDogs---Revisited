import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/**
 * A length of hedge: a thick block of leafy cubes, its top lumpy and sunlit, its sides deep green
 * with a bright leaf here and there. Built small and drawn bigger, so the cubes are chunky.
 */
const look: LookModule = {
  id: 'prop.hedge',
  look: {
    kind: 'prop',
    scale: 1.5,
    materials: {
      hedge: ['#23803a', '#2c9a46', '#44b85a'],
      hedge2: ['#2c9446', '#38ac52', '#58c868'],
      hedge3: ['#1c6c32', '#24843c', '#38a04e'],
    },
    part: {
      w: 12,
      h: 9,
      layers: 14,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) > 6 || Math.abs(y) > 3.9) return null;
        const qx = Math.floor((x + 20) / 1.5);
        const qy = Math.floor((y + 20) / 1.3);
        // every column of cubes its own height, the outer ones a cube lower
        const edge = Math.abs(y) > 2.6 ? 1.3 : 0;
        // (and the hedge swells and dips along its length, in lumps)
        const lump = Math.floor(hash3(Math.floor((x + 20) / 3), 5, 2) * 2) * 1.3;
        const top = 11.7 + lump - edge - Math.floor(hash3(qx, qy, 1) * 2.4) * 1.3;
        if (z > top) return null;
        // clean bands: a sunlit top, plain green sides, a darker foot
        if (z > top - 1.3) return 'hedge2';
        return z < 2.6 ? 'hedge3' : 'hedge';
      },
    },
  },
};
export default look;
