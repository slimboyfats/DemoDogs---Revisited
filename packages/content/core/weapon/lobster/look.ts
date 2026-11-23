import type { LookModule } from '@demodogs/shared';

/** The lobbed bomb: a round black shell with a hazard band, a steel cap and a lit wick. */
const look: LookModule = {
  id: 'weapon.lobster',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 8,
      layers: 9,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z > 7.6) return r < 0.45 ? 'light' : null;
        if (z > 6.8) return r < 0.9 ? 'band' : null;
        const rs = Math.hypot(r, z - 3.6);
        if (rs > 3.6) return null;
        if (Math.abs(z - 3.6) < 0.6 && rs > 3.1)
          return ((Math.atan2(y, x) * 3) | 0) & 1 ? 'hazard' : 'black';
        return 'black';
      },
    },
  },
};
export default look;
