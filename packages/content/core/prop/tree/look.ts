import type { LookModule } from '@demodogs/shared';
import { disc, hash3 } from '../../../src/shapes';

/** A trunk and a lumpy round canopy in two greens. */
const look: LookModule = {
  id: 'prop.tree',
  look: {
    kind: 'prop',
    part: {
      w: 20,
      h: 20,
      layers: 18,
      fn: (x, y, z) => {
        if (z < 7 && disc(x, y, z < 2 ? 2.4 : 1.7)) return 'bark';
        if (z < 5) return null;
        const t = (z - 4) / 14;
        const r =
          8.6 * Math.sin(Math.PI * Math.min(1, t * 1.05)) +
          1.4 * (hash3(Math.round(x), Math.round(y), z) - 0.5);
        if (!disc(x, y, Math.max(0, r))) return null;
        return hash3(Math.round(x * 0.5), Math.round(y * 0.5), z >> 1) > 0.55 ? 'leaf2' : 'leaf';
      },
    },
  },
};
export default look;
