import type { LookModule } from '@demodogs/shared';
import { DESERT } from '../../../src/desert';

/**
 * A pale mining crate with rope handles and a red danger band, its lid off on one side to show the
 * red sticks inside, a fuse curling out of the bundle.
 */
const look: LookModule = {
  id: 'prop.dynamite-crate',
  look: {
    kind: 'prop',
    materials: DESERT,
    part: {
      w: 10,
      h: 8,
      layers: 8,
      smooth: true,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        if (ax > 4.6 || ay > 3.6) return null;
        // the sticks inside, where the lid is off (x < 0)
        const open = x < 0.2 && ax < 4 && ay < 3;
        if (open && z > 5.2) {
          if (z < 7.2) {
            const sx = ((x + 20) % 1.3) - 0.65;
            return Math.hypot(sx, 0) < 0.55 ? 'dynamite' : 'black';
          }
          // a fuse rising out of the middle stick
          return Math.hypot(x + 2, y) < 0.35 && z < 8 ? 'spine' : null;
        }
        if (z > 7.2) return x < 0.2 ? null : 'sand3';
        if (z > 2.6 && z < 3.6) return 'dynamite';
        if (ay > 3.2 && Math.abs(z - 5) < 0.4 && ax < 1.6) return 'rust2';
        return Math.abs(((x + 20) % 2.3) - 1.15) < 0.12 ? 'wood2' : 'sand3';
      },
    },
  },
};
export default look;
