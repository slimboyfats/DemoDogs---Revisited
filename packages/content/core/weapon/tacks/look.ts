import type { LookModule } from '@demodogs/shared';

/** One tack: three points splayed on the ground and the fourth standing straight up. */
const look: LookModule = {
  id: 'weapon.tacks',
  look: {
    kind: 'prop',
    part: {
      w: 5,
      h: 5,
      layers: 3,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        // the upright point
        if (r < 0.6) return z < 2.6 ? 'chrome' : null;
        if (z > 0.9) return null;
        // three legs, 120 degrees apart
        const a = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
        const leg = Math.abs(((a * 3 + 0.5) % 1) - 0.5);
        return r < 2.4 && leg < 0.12 ? 'band' : null;
      },
    },
  },
};
export default look;
