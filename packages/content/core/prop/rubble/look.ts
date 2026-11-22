import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/** A low heap of broken slab: concrete lumps, a bent steel rod or two, flecks of glass. */
const look: LookModule = {
  id: 'prop.rubble',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 9,
      layers: 4,
      fn: (x, y, z) => {
        const r = Math.hypot(x * 0.95, y * 1.1);
        const n = hash3(Math.floor(x + 9), Math.floor(y + 9), 3);
        if (r > 4.3 - z * 0.9 - n * 1.1) return null;
        if (z === 2 && Math.abs(x - y * 0.6) < 0.35) return 'rust2';
        const k = hash3(Math.floor(x * 1.5 + 20), Math.floor(y * 1.5 + 20), z);
        if (k < 0.06) return 'glasshi';
        return k < 0.5 ? 'concrete' : k < 0.8 ? 'stone' : 'stone2';
      },
    },
  },
};
export default look;
