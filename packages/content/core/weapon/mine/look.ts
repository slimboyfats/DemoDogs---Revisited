import type { LookModule } from '@demodogs/shared';
import { disc } from '../../../src/shapes';

/** A flat disc with a light on top (the client blinks it by swapping `minelit`). */
const look: LookModule = {
  id: 'weapon.mine',
  look: {
    kind: 'prop',
    part: {
      w: 6,
      h: 6,
      layers: 2,
      fn: (x, y, z) => (!disc(x, y, 2.7) ? null : z === 1 && disc(x, y, 0.9) ? 'minelit' : 'mine'),
    },
  },
};
export default look;
