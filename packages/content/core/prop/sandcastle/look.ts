import type { LookModule } from '@demodogs/shared';
import { BAY } from '../../../src/themes';

/** A sandcastle: a square wall, a round tower at each corner, a keep in the middle and a flag. */
const look: LookModule = {
  id: 'prop.sandcastle',
  look: {
    kind: 'prop',
    materials: BAY,
    part: {
      w: 16,
      h: 16,
      layers: 13,
      smooth: true,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        // the flag on the keep
        if (z > 9) {
          if (Math.hypot(x, y) < 0.35 && z < 12.6) return 'trunk2';
          return x > 0 && x < 2.6 && Math.abs(y) < 0.3 && z > 10.6 && z < 12.4 ? 'paintr' : null;
        }
        const tower = Math.hypot(ax - 5, ay - 5);
        if (tower < 2.3) {
          if (z < 6.2) return 'sandy';
          // battlements: every other bit of the rim is cut away
          return z < 7.4 && tower > 1.2 && Math.floor(Math.atan2(ay - 5, ax - 5) * 2 + 8) % 2
            ? 'sandy2'
            : null;
        }
        const keep = Math.hypot(x, y);
        if (keep < 3) return z < 8 ? (z > 7 && keep > 2 ? 'sandy2' : 'sandy') : null;
        // the wall, with a gate on the side that faces the sea
        if (ax < 5.6 && ay < 5.6 && (ax > 4.2 || ay > 4.2) && z < 4)
          return y > 4 && ax < 1.2 && z < 2.6 ? 'sandy2' : 'sandy';
        return ax < 4.4 && ay < 4.4 && z < 1 ? 'sandy2' : null;
      },
    },
  },
};
export default look;
