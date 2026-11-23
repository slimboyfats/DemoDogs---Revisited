import type { LookModule } from '@demodogs/shared';
import { DESERT } from '../../../src/desert';

/**
 * A column cactus: a ribbed trunk with a rounded top, an arm on each side that bends up, pale
 * spines along the ribs and a flower on the crown.
 */
const look: LookModule = {
  id: 'prop.cactus',
  look: {
    kind: 'prop',
    materials: DESERT,
    part: {
      w: 14,
      h: 6,
      layers: 22,
      smooth: true,
      fn: (x, y, z) => {
        const rib = (r: number, dx: number, dy: number) => {
          const a = Math.atan2(dy, dx);
          const d = Math.hypot(dx, dy);
          const grooved = r - 0.35 * (0.5 + 0.5 * Math.cos(a * 8));
          if (d > grooved) return null;
          if (d > grooved - 0.4 && Math.cos(a * 8) > 0.92 && Math.sin(z * 3.1) > 0.75)
            return 'spine';
          return Math.cos(a * 8) > 0 ? 'cactus' : 'cactus2';
        };
        // the trunk, its top rounded off
        const tz = 20.5;
        if (z < tz) {
          const m = rib(2.3, x, y);
          if (m) return m;
        } else if (Math.hypot(x, y, (z - tz) * 1.2) < 2.3) {
          return z > 21.8 && Math.hypot(x, y) < 0.8 ? 'bloom' : 'cactus';
        }
        // arms: out sideways, then up
        for (const [side, at, top] of [
          [1, 8, 15.5],
          [-1, 11, 18],
        ] as const) {
          const ox = x * side;
          if (z > at - 1.4 && z < at + 1.4 && ox > 1.8 && ox < 4.8) {
            const m = rib(1.4, 0, Math.hypot(y, z - at));
            if (m) return m;
          }
          if (z > at && Math.hypot(ox - 4.6, y) < 1.5) {
            if (z < top) return rib(1.4, ox - 4.6, y);
            if (Math.hypot(ox - 4.6, y, (z - top) * 1.3) < 1.4) return 'cactus';
          }
        }
        return null;
      },
    },
  },
};
export default look;
