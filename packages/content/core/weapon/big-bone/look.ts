import type { LookModule } from '@demodogs/shared';

/**
 * The bone, as big as a car: a thick shaft with two knuckles at each end, pale, with a scorched
 * underside from the fall.
 */
const look: LookModule = {
  id: 'weapon.big-bone',
  look: {
    kind: 'prop',
    part: {
      w: 22,
      h: 11,
      layers: 8,
      smooth: true,
      fn: (x, y, z) => {
        const zc = z - 4;
        const ax = Math.abs(x);
        // the shaft, waisted in the middle
        const shaft = ax < 7.5 && Math.hypot(y, zc) < 2 + ax * 0.08;
        // the knuckles: two balls side by side at each end
        const knuckle = Math.hypot(ax - 8.4, Math.abs(y) - 2.3, zc) < 3;
        if (!shaft && !knuckle) return null;
        if (zc < -2.2) return 'dead';
        return zc > 1.2 || (knuckle && Math.hypot(ax - 8.4, Math.abs(y) - 2.3, zc) > 2.5)
          ? 'paintw'
          : 'birch';
      },
    },
  },
};
export default look;
