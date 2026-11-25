import type { LookModule } from '@demodogs/shared';
import { FAIR } from '../../../src/themes';

/**
 * A fairground bumper: a steel skirt, a ring of lit bulbs, and a round red cap with white spots
 * over it, like a toadstool.
 */
const look: LookModule = {
  id: 'prop.bumper',
  look: {
    kind: 'prop',
    materials: FAIR,
    part: {
      w: 15,
      h: 15,
      layers: 11,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 2.6) return r < 5.6 ? 'bumper' : null;
        if (z < 4.2)
          return r < 6 ? (Math.floor(Math.atan2(y, x) * 2.6 + 9) % 2 ? 'bulbglow' : 'black') : null;
        // the cap: a flattened dome
        const d = (r / 7.2) ** 2 + ((z - 4.2) / 6.4) ** 2;
        if (d > 1) return null;
        const a = Math.atan2(y, x);
        const spot =
          Math.hypot(r * Math.cos(a * 3) - 3.4, (z - 7) * 1.2) < 1.5 || (r < 1.6 && z > 9);
        return spot ? 'paintw' : 'paintr';
      },
    },
  },
};
export default look;
