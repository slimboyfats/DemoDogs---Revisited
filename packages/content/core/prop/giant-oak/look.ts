import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/** Limbs: the angle they leave the trunk at, the height they leave it, and how far they reach. */
const LIMBS: readonly (readonly [number, number, number])[] = [
  [0.3, 17, 8.5],
  [2.0, 19, 8],
  [3.4, 16, 9],
  [4.6, 21, 7.5],
  [5.6, 18.5, 8],
];

/**
 * The trunk of a great oak: buttress roots spreading over the ground, deep furrowed bark, and
 * thick limbs that leave it high up and climb outwards to carry the crown.
 */
const look: LookModule = {
  id: 'prop.giant-oak',
  look: {
    kind: 'prop',
    part: {
      w: 22,
      h: 22,
      layers: 32,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        const a = Math.atan2(y, x);
        // furrows run up the bark
        const furrow = Math.sin(a * 11 + noise3(0, 0, z * 0.2) * 3) * 0.18;
        // the roots: five ridges flaring out at the foot
        const root = Math.max(0, Math.cos(a * 5 + 0.7)) * Math.max(0, 3.2 - z) * 1.6;
        const trunk = 3.1 - z * 0.03 + Math.max(0, 2.4 - z) * 0.9 + root + furrow;
        if (z < 26 && r < trunk) {
          if (r < trunk - 0.9) return 'bark2';
          return noise3(x * 2.2, y * 2.2, z * 0.5) > 0.6 ? 'bark2' : 'bark';
        }
        for (const [la, lz, len] of LIMBS) {
          const ux = Math.cos(la);
          const uy = Math.sin(la);
          const t = x * ux + y * uy;
          if (t < 0 || t > len) continue;
          // the limb rises as it goes, and thins
          const cz = lz + t * 0.55 + t * t * 0.03;
          const side = Math.hypot(x - ux * t, y - uy * t);
          const th = 1.5 - t * 0.09;
          if (Math.hypot(side, (z - cz) * 1.2) < th)
            return noise3(x * 2, y * 2, z) > 0.62 ? 'bark2' : 'bark';
        }
        // moss on the shady side of the foot
        if (z < 6 && r < trunk + 0.4 && y > 0.6 && noise3(x * 3, y * 3, z * 2) > 0.62)
          return 'moss';
        return null;
      },
    },
  },
};
export default look;
