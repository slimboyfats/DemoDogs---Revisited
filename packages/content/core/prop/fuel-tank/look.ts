import type { LookModule } from '@demodogs/shared';

/** A steel tank lying on two concrete saddles, with a filler cap and a hazard band. */
const look: LookModule = {
  id: 'prop.fuel-tank',
  look: {
    kind: 'prop',
    part: {
      w: 22,
      h: 14,
      layers: 11,
      smooth: true,
      fn: (x, y, z) => {
        // the saddles
        if (z < 3) return Math.abs(Math.abs(x) - 6) < 1.2 && Math.abs(y) < 5 ? 'concrete' : null;
        // a cylinder along x with rounded ends
        const ax = Math.max(0, Math.abs(x) - 6.5);
        const r = Math.hypot(y, z - 6.5, ax * 1.1);
        if (z > 10.4) return Math.hypot(x - 3, y) < 1 ? 'chrome' : null;
        if (r > 4.6) return null;
        if (Math.abs(Math.abs(x) - 4) < 0.5) return 'band';
        if (Math.abs(x) < 1.6) return ((((x + y) * 1.5 + 40) | 0) & 1) === 0 ? 'hazard' : 'black';
        return 'paintw';
      },
    },
  },
};
export default look;
