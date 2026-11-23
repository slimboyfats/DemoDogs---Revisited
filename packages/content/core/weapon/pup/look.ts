import type { LookModule } from '@demodogs/shared';

/** A pup: a little hazard-yellow ball with a black waist band. */
const look: LookModule = {
  id: 'weapon.pup',
  look: {
    kind: 'prop',
    part: {
      w: 3,
      h: 3,
      layers: 2,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y, z - 1);
        if (r > 1.1) return null;
        return Math.abs(x) < 0.3 ? 'black' : 'hazard';
      },
    },
  },
};
export default look;
