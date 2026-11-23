import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/** A round hay bale on its side: wound straw, a darker swirl at each end, two bands of twine. */
const look: LookModule = {
  id: 'prop.hay-bale',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 8,
      layers: 8,
      smooth: true,
      fn: (x, y, z) => {
        // a drum lying along y
        const r = Math.hypot(x, z - 3.7);
        if (r > 3.6 || Math.abs(y) > 3.4) return null;
        if (Math.abs(y) > 2.9) return Math.floor(r * 1.6) % 2 ? 'straw2' : 'straw';
        if (r > 3.2 && Math.abs(Math.abs(y) - 1.4) < 0.3) return 'rust2';
        return hash3(Math.round(x * 2), Math.round(y * 0.7), Math.round(z * 2)) > 0.6
          ? 'straw2'
          : 'straw';
      },
    },
  },
};
export default look;
