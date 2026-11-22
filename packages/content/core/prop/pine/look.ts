import type { LookModule } from '@demodogs/shared';
import { disc } from '../../../src/shapes';

/** A tall pine: stepped tiers narrowing to a point. */
const look: LookModule = {
  id: 'prop.pine',
  look: {
    kind: 'prop',
    part: {
      w: 16,
      h: 16,
      layers: 22,
      fn: (x, y, z) => {
        if (z < 5 && disc(x, y, 1.6)) return 'bark';
        if (z < 3) return null;
        return disc(x, y, (22 - z) * 0.36 + (z % 4 < 2 ? 0.9 : 0)) ? 'pine' : null;
      },
    },
  },
};
export default look;
