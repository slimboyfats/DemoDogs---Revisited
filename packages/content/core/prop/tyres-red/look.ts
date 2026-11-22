import type { LookModule } from '@demodogs/shared';
import { tyreRing } from '../tyres/look';

/** The tyre stack painted red and white, a tyre each. */
const look: LookModule = {
  id: 'prop.tyres-red',
  look: {
    kind: 'prop',
    part: {
      w: 10,
      h: 10,
      layers: 6,
      fn: (x, y, z) => (tyreRing(x, y) ? ((z >> 1) % 2 ? 'paintw' : 'paintr') : null),
    },
  },
};
export default look;
