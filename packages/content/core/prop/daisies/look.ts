import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/** A few daisies: white heads with a yellow eye on short stems, and a leaf or two. */
const look: LookModule = {
  id: 'prop.daisies',
  look: {
    kind: 'prop',
    scale: 1.5,
    materials: {
      daisy: ['#d9d9cf', '#f4f4ea', '#ffffff'],
      daisyeye: ['#c99a10', '#f0c020', '#ffe060'],
      daisyleaf: ['#2c7a2e', '#3f9c38', '#5cba48'],
    },
    part: {
      w: 6,
      h: 6,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        const gx = Math.round(x / 1.6);
        const gy = Math.round(y / 1.6);
        const k = hash3(gx + 9, gy + 9, 3);
        if (k < 0.45 || Math.hypot(gx, gy) > 1.5) return null;
        const d = Math.hypot(x - gx * 1.6, y - gy * 1.6);
        const top = 1.4 + k;
        if (z > top - 0.7 && z < top) return d < 0.3 ? 'daisyeye' : d < 0.75 ? 'daisy' : null;
        return z < top - 0.7 && d < 0.3 ? 'daisyleaf' : null;
      },
    },
  },
};
export default look;
