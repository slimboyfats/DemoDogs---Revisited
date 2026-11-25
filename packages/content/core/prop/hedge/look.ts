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
        // a clipped hedge of fine cubes: every column its own height by a cube or two, the outer
        // ones a step lower, and the whole of it swelling and dipping a little along its length
        const C = 2 / 3;
        const qx = Math.floor((x + 20) / C);
        const qy = Math.floor((y + 20) / C);
        const edge = Math.abs(y) > 3.2 ? C : 0;
        const lump = Math.floor(hash3(Math.floor((x + 20) / 3), 5, 2) * 2) * C;
        const top = 12.4 + lump - edge - Math.floor(hash3(qx, qy, 1) * 2.4) * C;
        if (z > top) return null;
        // clean bands: a sunlit top, plain green sides, a darker foot
        if (z > top - C) return 'hedge2';
        return z < 2.6 ? 'hedge3' : 'hedge';
      },
    },
  },
};
export default look;
