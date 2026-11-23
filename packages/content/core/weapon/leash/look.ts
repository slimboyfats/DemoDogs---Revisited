import type { LookModule } from '@demodogs/shared';

/**
 * The hook: a steel shank with a ring at the tail for the line and three claws that sweep back
 * from the point.
 */
const look: LookModule = {
  id: 'weapon.leash',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 6,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        const zc = z - 1.5;
        const ay = Math.abs(y);
        // the ring the line is tied to
        if (x < -2.4) {
          const rr = Math.hypot(x + 3.1, y);
          return Math.abs(zc) < 0.5 && rr < 0.95 && rr > 0.4 ? 'band' : null;
        }
        // the shank, with a point on it
        if (ay < 0.5 && Math.abs(zc) < 0.5 && x < 3.6) return x > 2.8 ? 'chrome' : 'band';
        // two claws out to the sides and one over the top, each sweeping back from the point
        const back = 2.9 - x;
        if (back < 0 || back > 2.6) return null;
        const out = 0.5 + back * 0.85;
        if (Math.abs(zc) < 0.5 && Math.abs(ay - out) < 0.45) return 'chrome';
        if (ay < 0.45 && Math.abs(zc - out * 0.55) < 0.4) return 'chrome';
        return null;
      },
    },
  },
};
export default look;
