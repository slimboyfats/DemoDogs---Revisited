import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/**
 * A dip. The hollow itself is light and shade the client paints on the ground (render/ground.ts
 * `paintHollow`); all that stands here is the grit lying along its two lips.
 */
const look: LookModule = {
  id: 'prop.dip',
  look: {
    kind: 'prop',
    part: {
      w: 34,
      h: 64,
      layers: 1,
      fn: (x, y) => {
        if (Math.abs(x) >= 17.0 || Math.abs(y) >= 32.0) return null;
        const u = Math.abs(x) / 17.0;
        if (u < 0.9 || u > 0.98) return null;
        const n = hash3(Math.floor(x * 2), Math.floor(y * 2), 5);
        return n < 0.1 ? 'stone2' : null;
      },
    },
  },
};
export default look;
