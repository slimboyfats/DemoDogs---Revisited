import type { LookModule } from '@demodogs/shared';

/** The Litter canister: short and fat, hazard yellow with black bands and a blunt black cap. */
const look: LookModule = {
  id: 'weapon.litter',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 5,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        const zc = z - 1.5;
        const r = Math.hypot(y, zc);
        // four stubby fins
        if (x < -2 && x > -3.9 && (Math.abs(zc) < 0.2 || Math.abs(y) < 0.2) && r < 2.2)
          return 'black';
        if (x < -3.5) return null;
        const rad = x > 2.2 ? Math.max(0, 1.3 * (1 - (x - 2.2) / 1.9)) : 1.3;
        if (r > rad) return null;
        if (x > 2.6) return 'black';
        // bands, and the seams the pups burst out of
        return Math.abs(x - 1.4) < 0.3 || Math.abs(x + 1.4) < 0.3 ? 'black' : 'hazard';
      },
    },
  },
};
export default look;
