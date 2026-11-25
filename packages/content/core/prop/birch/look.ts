import type { LookModule } from '@demodogs/shared';
import { band } from '../../../src/shapes';

/** A slim birch, plain and bold: a white trunk with black rings and a tall egg of bright leaves. */
const look: LookModule = {
  id: 'prop.birch',
  look: {
    kind: 'prop',
    part: {
      w: 14,
      h: 14,
      layers: 24,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        // a tall egg of leaves
        const k = (z - 9) / 14.5;
        if (k >= 0 && k <= 1 && r < 5.6 * Math.sin(Math.PI * k ** 0.8) ** 0.7)
          return band(x, y, z, 9, 22) > 0 ? 'lime2' : 'lime';
        if (z < 12 && r < 1.15) return Math.floor(z) % 4 === 2 && x > -0.4 ? 'black' : 'birch';
        return null;
      },
    },
  },
};
export default look;
