import type { LookModule } from '@demodogs/shared';
import { disc } from '../../../src/shapes';

const look: LookModule = {
  id: 'prop.cone',
  look: {
    kind: 'prop',
    part: {
      w: 6,
      h: 6,
      layers: 7,
      fn: (x, y, z) => {
        if (z === 0) return Math.abs(x) < 2.8 && Math.abs(y) < 2.8 ? 'black' : null;
        return disc(x, y, 2.6 - z * 0.33) ? (z === 3 || z === 4 ? 'paintw' : 'cone') : null;
      },
    },
  },
};
export default look;
