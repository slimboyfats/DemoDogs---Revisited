import type { LookModule } from '@demodogs/shared';
import { GROTTO } from '../../../src/themes';

/** A lantern: a wooden post, an iron cage with the flame in it, bright from above. */
const look: LookModule = {
  id: 'prop.lantern',
  look: {
    kind: 'prop',
    materials: GROTTO,
    part: {
      w: 7,
      h: 7,
      layers: 17,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        if (z < 9)
          return ax < 0.6 && ay < 0.6 ? 'wood2' : z < 1 && ax < 1.3 && ay < 1.3 ? 'wood2' : null;
        if (z < 10) return ax < 2.6 && ay < 2.6 ? 'gunmetal' : null;
        if (z < 16) {
          if (ax > 2.6 || ay > 2.6) return null;
          // iron at the corners, the light between and open to the sky
          return ax > 1.9 && ay > 1.9 ? 'gunmetal' : 'lampglow';
        }
        return ax < 1 && ay < 1 ? 'gunmetal' : null;
      },
    },
  },
};
export default look;
