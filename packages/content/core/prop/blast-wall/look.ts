import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/**
 * A cracked wall block: squared grey stone, dark cracks running through it, and a yellow cross
 * painted on its top and every side to say a blast will bring it down.
 */
const look: LookModule = {
  id: 'prop.blast-wall',
  look: {
    kind: 'prop',
    part: {
      w: 19,
      h: 19,
      layers: 20,
      smooth: true,
      fn: (x, y, z) => {
        // a squared block with its corners knocked off
        const m = Math.max(Math.abs(x), Math.abs(y));
        if (m > 8.8 || Math.abs(x) + Math.abs(y) > 15.5 || z > 19) return null;
        // the painted cross: on its top, where it is seen from, and on every side
        if (z > 17.5) {
          if (Math.abs(Math.abs(x) - Math.abs(y)) < 1.7 && m < 7.2) return 'hazard';
          return m > 7.6 ? 'stone2' : 'stone';
        }
        if (m > 7.4) {
          const u = Math.abs(x) > Math.abs(y) ? y : x;
          const v = z - 9;
          if (Math.abs(Math.abs(u) - Math.abs(v)) < 1.3 && Math.abs(u) < 6) return 'hazard';
        }
        // two bold cracks through it, and courses of stone
        const n = noise3(x * 0.16 + 4, y * 0.16, z * 0.12);
        if (Math.abs(n - 0.5) < 0.022) return 'black';
        return Math.floor(z / 5) % 2 === 0 ? 'stone' : 'stone2';
      },
    },
  },
};
export default look;
