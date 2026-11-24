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
      hedge: ['#236f2a', '#34913a', '#58b848'],
      hedge2: ['#3a8f34', '#55b044', '#86d458'],
      hedge3: ['#195a24', '#236f2c', '#3a9238'],
      hedge4: ['#124a1e', '#1a5c26', '#2a7a30'],
    },
    part: {
      w: 9,
      h: 9,
      layers: 11,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) > 4.5 || Math.abs(y) > 3.9) return null;
        const qx = Math.floor((x + 20) / 1.5);
        const qy = Math.floor((y + 20) / 1.3);
        // every column of cubes its own height, the outer ones a cube lower
        const edge = Math.abs(y) > 2.6 ? 1.3 : 0;
        const top = 10.4 - edge - Math.floor(hash3(qx, qy, 1) * 2.4) * 1.3;
        if (z > top) return null;
        const qz = Math.floor(z / 1.3);
        const t = hash3(qx, qy, qz + 3);
        if (z > top - 1.3) return t > 0.45 ? 'hedge2' : 'hedge';
        if (z < 2.6) return t > 0.5 ? 'hedge4' : 'hedge3';
        return t > 0.86 ? 'hedge2' : t > 0.5 ? 'hedge' : 'hedge3';
      },
    },
  },
};
export default look;
