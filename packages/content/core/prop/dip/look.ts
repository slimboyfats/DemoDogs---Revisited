import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/**
 * A dip: the hollow drawn as shade, deepest in the middle and thinning out to the lips, with a
 * worn pale line where each lip breaks.
 */
const look: LookModule = {
  id: 'prop.dip',
  look: {
    kind: 'prop',
    part: {
      w: 34,
      h: 26,
      layers: 1,
      fn: (x, y) => {
        if (Math.abs(x) >= 17.0 || Math.abs(y) >= 13.0) return null;
        const u = Math.abs(x) / 17.0;
        const end = Math.min(1, (13.0 - Math.abs(y)) / 3);
        const deep = 0.5 * (1 + Math.cos(Math.PI * u)) * end;
        const n = hash3(Math.floor(x * 3), Math.floor(y * 3), 5);
        // the lips: a broken pale line across the road at each end
        if (u > 0.86 && u < 0.97 && end >= 1) return n < 0.7 ? 'concrete' : null;
        if (deep > 0.72) return n < 0.85 ? 'black' : 'padbase';
        if (deep > 0.4) return n < deep ? 'padbase' : n < deep + 0.25 ? 'tread' : null;
        return n < deep * 1.3 ? 'tread' : null;
      },
    },
  },
};
export default look;
