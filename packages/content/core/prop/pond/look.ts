import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/** The lily pads: x, y, radius, and whether one is in flower. */
const PADS = [
  [-30, -10, 4, 1],
  [-22, 6, 3, 0],
  [-8, -16, 3.4, 0],
  [6, 12, 4.2, 1],
  [20, -8, 3.2, 0],
  [30, 6, 3.6, 0],
  [-2, 2, 2.6, 0],
  [38, -2, 2.8, 1],
] as const;

/**
 * A park pond, flat on the ground: blue water in two bands with pale ripples, a rim of wet
 * earth and reeds, lily pads with a flower on some.
 */
const look: LookModule = {
  id: 'prop.pond',
  look: {
    kind: 'prop',
    materials: {
      pond: ['#1f5fae', '#2b78cf', '#3d8fe0'],
      pond2: ['#2a74c4', '#3a8fe0', '#58a9ee'],
      pondlit: ['#6fb6ee', '#8fcaf6', '#b9e0fb'],
      bank: ['#4a3a22', '#66502e', '#7d653c'],
      reed: ['#2f6a2a', '#3f8a34', '#57a844'],
      lily: ['#2f7f3a', '#41a04a', '#62c060'],
      lilyflower: ['#c85a9a', '#ee7fbc', '#ffc0e0'],
    },
    part: {
      w: 112,
      h: 72,
      layers: 1,
      fn: (x, y) => {
        // a rounded shape, wobbling in and out round its edge
        const wob = (noise3(x * 0.07 + 3, y * 0.07, 0.5) - 0.5) * 0.36;
        const r = Math.hypot(x / 53, y / 33) + wob;
        if (r > 1) return null;
        if (r > 0.93) return noise3(x * 0.9, y * 0.9, 2) > 0.62 ? 'reed' : 'bank';
        for (const [px, py, pr, flower] of PADS) {
          const d = Math.hypot(x - px, y - py);
          if (d < pr) {
            // a notch out of each pad, and a flower in the middle of some
            if (flower && d < 1.3) return 'lilyflower';
            return Math.abs(y - py) < 0.6 && x > px ? 'pond2' : 'lily';
          }
        }
        // short pale ripples, in rows
        const row = Math.floor(y / 5);
        if (Math.abs((y % 5) - 2.5) < 0.6 && noise3(x * 0.16 + row * 7, row, 4) > 0.66)
          return 'pondlit';
        return r < 0.6 ? 'pond2' : 'pond';
      },
    },
  },
};
export default look;
