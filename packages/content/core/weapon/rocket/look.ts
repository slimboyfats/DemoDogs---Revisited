import type { LookModule } from '@demodogs/shared';

/** The rocket in flight: a white tube, a red nose cone, a band and four red fins. */
const look: LookModule = {
  id: 'weapon.rocket',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 4,
      layers: 2,
      smooth: true,
      fn: (x, y, z) => {
        const zc = z - 1;
        const r = Math.hypot(y, zc);
        // fins: flat plates across and upright at the tail
        if (x < -1.6 && x > -3.8) {
          const span = 1.9 * Math.min(1, (x + 3.9) / 1.2 + 0.35);
          if (
            (Math.abs(zc) < 0.2 && Math.abs(y) < span) ||
            (Math.abs(y) < 0.2 && Math.abs(zc) < 0.95)
          )
            return 'tail';
        }
        if (x < -3.4) return r < 0.5 ? 'black' : null;
        const rad = x > 1.8 ? Math.max(0, 0.85 * (1 - (x - 1.8) / 2)) : 0.85;
        if (r > rad) return null;
        return x > 1.8 ? 'tail' : Math.abs(x + 0.4) < 0.3 ? 'band' : 'rocket';
      },
    },
  },
};
export default look;
