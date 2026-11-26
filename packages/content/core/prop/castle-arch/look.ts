import type { LookModule } from '@demodogs/shared';
import { KEEP } from '../../../src/themes';

/**
 * A length of gate arch: nothing below 17 px (cars drive under it), then the iron points of a
 * raised portcullis, a deep band of stone, and battlements along both faces.
 */
const look: LookModule = {
  id: 'prop.castle-arch',
  look: {
    kind: 'prop',
    materials: KEEP,
    part: {
      // x runs across the road, y along it
      w: 10,
      h: 8,
      layers: 32,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (z < 17 || Math.abs(x) > 5 || ay > 3.6) return null;
        // the portcullis: bars with pointed feet, drawn up into the arch
        if (z < 20) return ay < 0.5 && (((x + 40) % 2.5) + 2.5) % 2.5 < 0.8 ? 'dark' : null;
        if (z < 28) {
          const course = Math.floor(z / 2.4);
          const joint = z % 2.4 < 0.3 || (((x + (course & 1) * 2.2 + 40) % 4.4) + 4.4) % 4.4 < 0.3;
          return joint ? 'mortar' : z < 21 ? 'ashlar2' : 'ashlar';
        }
        if (z < 29) return 'ashlar2';
        if (z > 31) return null;
        return ay > 2.2 && Math.floor((x + 5) / 2.5) % 2 === 0 ? 'ashlar' : null;
      },
    },
  },
};
export default look;
