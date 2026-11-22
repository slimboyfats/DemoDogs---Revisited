import type { LookModule } from '@demodogs/shared';
import { disc } from '../../../src/shapes';

const look: LookModule = {
  id: 'prop.barrel',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 9,
      layers: 8,
      fn: (x, y, z) => {
        if (!disc(x, y, 3.8)) return null;
        if (z === 7) return disc(x, y, 1.4) ? 'hazard' : 'barrel';
        return z === 2 || z === 5 ? 'band' : 'barrel';
      },
    },
  },
};
export default look;
