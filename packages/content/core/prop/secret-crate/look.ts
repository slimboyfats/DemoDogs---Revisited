import type { LookModule } from '@demodogs/shared';

/**
 * The stand of a secret crate: a yellow ring on the ground with black ticks round it. The crate
 * itself floats over it, yellow, as a pickup.
 */
const look: LookModule = {
  id: 'prop.secret-crate',
  look: {
    kind: 'prop',
    part: {
      w: 24,
      h: 24,
      layers: 1,
      fn: (x, y) => {
        const r = Math.hypot(x, y);
        if (r > 11.5 || r < 8) return null;
        return Math.floor(Math.atan2(y, x) * 2.55 + 8) % 2 ? 'hazard' : 'black';
      },
    },
  },
};
export default look;
