import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/**
 * A pillar as tall as a 24 high flyover's underside: a squared column on a broad footing, banded
 * where it was cast in lifts, rust weeping from the bar ends, a cap that takes the girders.
 */
const look: LookModule = {
  id: 'prop.flyover-pillar',
  look: {
    kind: 'prop',
    part: {
      w: 11,
      h: 11,
      layers: 20,
      smooth: true,
      fn: (x, y, z) => {
        const m = Math.max(Math.abs(x), Math.abs(y));
        if (z < 1.2) return m < 5.2 ? 'stone2' : null;
        if (z > 18) return m < 5.2 && Math.abs(y) < 3.6 ? 'concrete' : null;
        // a column with its corners taken off
        if (m > 3 || Math.abs(x) + Math.abs(y) > 5.2) return null;
        if (z % 5.5 < 0.35) return 'stone';
        const weep = noise3(x * 4, y * 4, 0) > 0.7 && noise3(x, y, z * 0.3) > 0.45;
        if (weep && z > 8) return 'rust2';
        return noise3(x * 2.3, y * 2.3, z * 1.1) > 0.74 ? 'stone' : 'concrete';
      },
    },
  },
};
export default look;
