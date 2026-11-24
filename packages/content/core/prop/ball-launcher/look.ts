import type { LookModule } from '@demodogs/shared';
import { rr } from '../../../src/shapes';

/** The barrel's axis: from its breech low at the back to its mouth high at the front. */
const A = [-7, 0, 7] as const;
const B = [9, 0, 14] as const;
const BIG = 1.3;
const LEN = Math.hypot(B[0] - A[0], B[2] - A[2]);
const UX = (B[0] - A[0]) / LEN;
const UZ = (B[2] - A[2]) / LEN;

/**
 * A ball launcher: a fat yellow barrel tipped up on a dark steel cradle, a tennis ball in its
 * mouth, on a concrete slab with a hazard edge.
 */
const look: LookModule = {
  id: 'prop.ball-launcher',
  look: {
    kind: 'prop',
    materials: {
      launch: ['#b98a08', '#f0b90e', '#ffd94a'],
      launch2: ['#8a6406', '#c28f0a', '#e6b62a'],
      tennis: ['#8fae12', '#c4e02a', '#e6f65a'],
    },
    part: {
      w: 31,
      h: 24,
      layers: 26,
      smooth: true,
      fn: (bx, by, bz) => {
        // drawn a third bigger than it was first built
        const x = bx / BIG;
        const y = by / BIG;
        const z = bz / BIG;
        // the slab
        if (z < 2) {
          if (!rr(x, y, 11.5, 8.5, 1.5)) return null;
          const edge = Math.abs(x) > 10 || Math.abs(y) > 7;
          return edge && z > 1
            ? Math.floor((x + y + 40) / 2.5) % 2
              ? 'hazard'
              : 'black'
            : 'concrete';
        }
        // along the barrel and out from its axis
        const t = (x - A[0]) * UX + (z - A[2]) * UZ;
        const off = Math.hypot(y, -(x - A[0]) * UZ + (z - A[2]) * UX);
        if (t > -1.5 && t < LEN) {
          // the ball sitting in the mouth
          if (Math.hypot(t - (LEN - 0.5), off) < 3.6) return 'tennis';
          if (off < 5 && t < LEN - 1.2) {
            if (t < 0) return 'engine';
            // two dark bands round it, and a darker yellow underneath
            if (Math.abs(t - 4) < 0.9 || Math.abs(t - 11) < 0.9) return 'botdark';
            return -(x - A[0]) * UZ + (z - A[2]) * UX < -2.4 ? 'launch2' : 'launch';
          }
          if (off < 5 && off > 3.9) return 'launch2';
        }
        // the cradle: an A-frame each side, a cross beam, and a strut up to the barrel
        const side = Math.abs(Math.abs(y) - 6.2) < 0.9;
        if (side && z < 12) {
          const lean = Math.abs(Math.abs(x - 1) - (12 - z) * 0.62);
          if (lean < 0.9) return 'botdark';
          if (Math.abs(z - 5) < 0.6 && Math.abs(x - 1) < (12 - z) * 0.62) return 'engine';
        }
        if (Math.abs(z - 11.4) < 0.8 && Math.abs(x - 1) < 0.9 && Math.abs(y) < 6.6) return 'engine';
        // a wheel each side at the back
        if (Math.abs(Math.abs(y) - 7.6) < 0.9 && Math.hypot(x + 7, z - 4.2) < 2.3) return 'tire';
        return null;
      },
    },
  },
};
export default look;
