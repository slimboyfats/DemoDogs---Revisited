import type { LookModule } from '@demodogs/shared';
import { disc, hash3 } from '../../../src/shapes';

const look: LookModule = {
  id: 'prop.rock',
  look: {
    kind: 'prop',
    part: {
      w: 14,
      h: 14,
      layers: 7,
      fn: (x, y, z) =>
        disc(x, y * 1.15, 6.2 - z * 0.7 + 1.1 * (hash3(Math.round(x), Math.round(y), 3) - 0.5))
          ? 'stone'
          : null,
    },
  },
};
export default look;
