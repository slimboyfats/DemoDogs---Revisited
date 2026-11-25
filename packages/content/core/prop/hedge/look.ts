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
      hedge: ['#2f6a22', '#42842a', '#5a9e34'],
      hedge2: ['#5f8e2a', '#7eae36', '#a2cc48'],
      hedge3: ['#1f4f1c', '#2b6422', '#3b7a2a'],
      hedge4: ['#133a16', '#1a481a', '#265a20'],
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
        const qz = Math.floor(z / 1.3);
        // clean bands: a sunlit top, plain green sides, a darker foot, a lighter leaf now and then
        const t = hash3(qx, qy, qz + 3);
        if (z > top - 1.3) return 'hedge2';
        if (z < 2.6) return 'hedge3';
        return t > 0.93 ? 'hedge2' : 'hedge';
      },
    },
  },
};
export default look;
