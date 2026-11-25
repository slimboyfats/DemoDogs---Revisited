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
        // a clipped hedge of clean blocks: flat on top, a block here and there a step lower, and
        // the outer edge a step down all the way along
        const C = 2 / 3;
        const qx = Math.floor((x + 20) / 2);
        const qy = Math.floor((y + 20) / 2);
        const edge = Math.abs(y) > 3.2 ? C : 0;
        const top = 12.4 - edge - (hash3(qx, qy, 1) < 0.28 ? C : 0);
        if (z > top) return null;
        // clean bands: a sunlit top, plain green sides, a darker foot
        if (z > top - C) return 'hedge2';
        return z < 2.6 ? 'hedge3' : 'hedge';
      },
    },
  },
};
export default look;
