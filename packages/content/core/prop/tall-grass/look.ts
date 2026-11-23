import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/** A tuft of long grass: a dozen blades, each leaning its own way. */
const look: LookModule = {
  id: 'prop.tall-grass',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 8,
      layers: 6,
      smooth: true,
      fn: (x, y, z) => {
        for (let b = 0; b < 12; b++) {
          const bx = (hash3(b, 1, 2) - 0.5) * 5;
          const by = (hash3(b, 3, 4) - 0.5) * 5;
          const top = 2.6 + hash3(b, 5, 6) * 3;
          if (z > top) continue;
          // each blade leans further the higher it goes
          const lx = bx + (hash3(b, 7, 8) - 0.5) * 0.5 * z;
          const ly = by + (hash3(b, 9, 1) - 0.5) * 0.5 * z;
          if (Math.abs(x - lx) < 0.3 && Math.abs(y - ly) < 0.3)
            return z > top - 1 ? 'lime2' : b % 3 ? 'lime' : 'leaf2';
        }
        return null;
      },
    },
  },
};
export default look;
