import type { LookModule } from '@demodogs/shared';

/** The fire shell: a squat red canister with steel bands, a hazard lid and a short fuse. */
const look: LookModule = {
  id: 'weapon.hot-dish',
  look: {
    kind: 'prop',
    part: {
      w: 6,
      h: 6,
      layers: 6,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z > 5) return r < 0.4 ? 'light' : null;
        if (r > 2.6) return null;
        if (z > 4.4) return r > 2.1 ? 'band' : r < 0.9 ? 'black' : 'hazard';
        if (Math.abs(z - 1.2) < 0.3 || Math.abs(z - 3.4) < 0.3) return 'band';
        return 'barrel';
      },
    },
  },
};
export default look;
