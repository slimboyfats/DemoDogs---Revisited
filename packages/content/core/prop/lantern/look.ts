import type { LookModule } from '@demodogs/shared';
import { GROTTO } from '../../../src/themes';

/** A lantern: a wooden post, an iron cage with the flame in it, a little roof. */
const look: LookModule = {
  id: 'prop.lantern',
  look: {
    kind: 'prop',
    materials: GROTTO,
    part: {
      w: 5,
      h: 5,
      layers: 15,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        if (z < 9)
          return ax < 0.6 && ay < 0.6 ? 'wood2' : z < 1 && ax < 1.3 && ay < 1.3 ? 'wood2' : null;
        if (z < 10) return ax < 1.9 && ay < 1.9 ? 'gunmetal' : null;
        if (z < 13) {
          if (ax > 1.7 || ay > 1.7) return null;
          // iron at the corners, the light between
          return ax > 1.2 && ay > 1.2 ? 'gunmetal' : 'lampglow';
        }
        return ax < 2.3 - (z - 13) * 1.1 && ay < 2.3 - (z - 13) * 1.1 ? 'gunmetal' : null;
      },
    },
  },
};
export default look;
