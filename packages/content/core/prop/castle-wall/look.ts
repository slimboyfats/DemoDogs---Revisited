import type { LookModule } from '@demodogs/shared';
import { KEEP } from '../../../src/themes';

/** A length of curtain wall: courses of dressed stone, a walk along the top, battlements. */
const look: LookModule = {
  id: 'prop.castle-wall',
  look: {
    kind: 'prop',
    materials: KEEP,
    part: {
      w: 12,
      h: 6,
      layers: 16,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (Math.abs(x) > 6 || ay > 2.8) return null;
        if (z >= 13) {
          // merlons along both faces, a gap between each pair
          if (ay < 1.6) return null;
          return Math.floor((x + 6) / 2) % 2 === 0 ? 'ashlar' : null;
        }
        if (z >= 12) return 'ashlar2';
        const course = Math.floor(z / 2.4);
        const joint = z % 2.4 < 0.3 || (((x + (course & 1) * 2.2 + 40) % 4.4) + 4.4) % 4.4 < 0.3;
        if (joint) return 'mortar';
        return (course * 3 + Math.floor((x + (course & 1) * 2.2 + 40) / 4.4)) % 4 === 0
          ? 'ashlar2'
          : 'ashlar';
      },
    },
  },
};
export default look;
