import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

const PETALS = ['petalr', 'petaly', 'petalw', 'petalv', 'petaly', 'petalw'];

/** A clump of flowers: thin stems, each with a head of red, yellow, white or violet. */
const look: LookModule = {
  id: 'prop.flowers',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 8,
      layers: 4,
      smooth: true,
      fn: (x, y, z) => {
        // a stem every art pixel or so, each a little off its square, each its own height
        const gx = Math.round(x / 1.4);
        const gy = Math.round(y / 1.4);
        const k = hash3(gx, gy, 3);
        if (k < 0.3 || Math.hypot(gx, gy) > 2.3) return null;
        const sx = gx * 1.4 + (hash3(gx, gy, 5) - 0.5) * 0.7;
        const sy = gy * 1.4 + (hash3(gx, gy, 7) - 0.5) * 0.7;
        const top = 1.6 + hash3(gx, gy, 9) * 1.8;
        const d = Math.hypot(x - sx, y - sy);
        if (z > top - 0.9 && z < top && d < 0.62)
          return PETALS[Math.floor(k * 97) % PETALS.length]!;
        return z < top - 0.6 && d < 0.26 ? 'leaf2' : null;
      },
    },
  },
};
export default look;
