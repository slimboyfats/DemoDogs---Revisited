import type { LookModule } from '@demodogs/shared';
import { GROTTO } from '../../../src/themes';

/** Spots on the cap: which way round and how far up each is. */
const SPOTS = [
  [0.4, 4.6],
  [1.7, 2.6],
  [2.9, 4.9],
  [4.2, 2.9],
  [5.3, 4.4],
  [0.9, 1.4],
  [3.5, 1.2],
] as const;

/** A giant toadstool: a pale stalk with a skirt, and a wide violet cap with glowing spots. */
const look: LookModule = {
  id: 'prop.glow-shroom',
  look: {
    kind: 'prop',
    materials: GROTTO,
    part: {
      w: 20,
      h: 20,
      layers: 19,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 11) {
          // the stalk, thicker at the foot, with a frill under the cap
          if (r < 2.1 + Math.max(0, 2.5 - z) * 0.35) return 'stalk';
          if (z > 8.2 && z < 9.2 && r < 3.6) return 'stalk';
        }
        const up = z - 10.4;
        if (up < 0) return null;
        const d = (r / 9.2) ** 2 + (up / 7.4) ** 2;
        if (d > 1) return null;
        // hollow underneath: gills seen from the side
        if (up < 1.2)
          return r > 2 ? (Math.floor(Math.atan2(y, x) * 9 + 30) % 2 ? 'stalk' : 'capv2') : 'stalk';
        if (d > 0.72) {
          const a = Math.atan2(y, x) + Math.PI;
          for (const [sa, sz] of SPOTS) {
            let da = a - sa;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            if (Math.hypot(da * r, up - sz) < 1.25) return 'spotglow';
          }
          if (r < 1.5) return 'spotglow';
        }
        return up > 4.6 ? 'capv' : 'capv2';
      },
    },
  },
};
export default look;
