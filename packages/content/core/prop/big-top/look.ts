import type { LookModule } from '@demodogs/shared';
import { FAIR } from '../../../src/themes';

const WALL = 7;
const PEAK = 20;

/** A circus tent: a round wall and a pointed roof in red and white stripes, a dark door, a flag. */
const look: LookModule = {
  id: 'prop.big-top',
  look: {
    kind: 'prop',
    materials: FAIR,
    part: {
      w: 34,
      h: 34,
      layers: 24,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        // the flag on the king pole
        if (z > PEAK) {
          if (r < 0.4) return 'paintw';
          return x > 0 && x < 3.4 && Math.abs(y) < 0.3 && z > 21.4 && z < 23.4 ? 'fairy' : null;
        }
        const stripe = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 16) % 2;
        if (z < WALL) {
          if (r > 14) return null;
          if (y > 0 && Math.abs(x) < 3 - z * 0.3 && r > 12.6) return 'black';
          return stripe ? 'paintr' : 'paintw';
        }
        // the roof: out past the wall at the eaves, in to the pole at the top, sagging between
        const t = (z - WALL) / (PEAK - WALL);
        const roof = 15.6 * (1 - t) ** 1.25 + 0.5;
        if (r > roof) return null;
        // a scalloped gold edge round the eaves
        if (z < WALL + 1.1) return 'fairy';
        return stripe ? 'paintr' : 'paintw';
      },
    },
  },
};
export default look;
