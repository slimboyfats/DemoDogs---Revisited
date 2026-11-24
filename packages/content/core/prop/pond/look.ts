import type { LookModule } from '@demodogs/shared';
import { hash3, noise3 } from '../../../src/shapes';

/** The lily pads: x, y, radius, and whether one is in flower. */
const PADS = [
  [-15, -5, 2.2, 1],
  [-11, 3, 1.7, 0],
  [-4, -8, 1.9, 0],
  [3, 6, 2.3, 1],
  [8, -6, 1.7, 0],
  [-1, 1, 1.5, 0],
  [-18, 2, 1.6, 1],
] as const;

/**
 * A park pond: deep blue water with pale ripples and lily pads, a bank of earth with reeds and
 * bulrushes standing round it, and a little plank jetty out over one end. Built small and drawn
 * bigger.
 */
const look: LookModule = {
  id: 'prop.pond',
  look: {
    kind: 'prop',
    scale: 2,
    materials: {
      pond: ['#1d59a8', '#2a72cc', '#3a8ae0'],
      pond2: ['#2a74c4', '#3a8fe0', '#58a9ee'],
      pondlit: ['#6fb6ee', '#8fcaf6', '#c4e6fc'],
      bank: ['#4a3a22', '#66502e', '#7d653c'],
      reed: ['#2f6a2a', '#3f8a34', '#62b048'],
      rush: ['#4a2e14', '#6a4420', '#86582c'],
      lily: ['#2f7f3a', '#41a04a', '#62c060'],
      lilyflower: ['#c85a9a', '#ee7fbc', '#ffc0e0'],
      jetty: ['#7a5228', '#a8763c', '#cf9a56'],
    },
    part: {
      w: 58,
      h: 38,
      layers: 6,
      smooth: true,
      fn: (x, y, z) => {
        // the jetty: planks out over the water from the east bank, on four posts
        if (x > 13 && x < 27 && Math.abs(y - 2) < 3.2) {
          if (z > 1.4 && z < 2.3) return Math.abs(((x + 30) % 2) - 1) > 0.82 ? null : 'jetty';
          if (
            z <= 1.4 &&
            Math.abs(Math.abs(y - 2) - 2.4) < 0.6 &&
            (Math.abs(x - 15) < 0.6 || Math.abs(x - 22) < 0.6)
          )
            return 'rush';
        }
        // a rounded shape, wobbling in and out round its edge
        const wob = (noise3(x * 0.14 + 3, y * 0.14, 0.5) - 0.5) * 0.36;
        const r = Math.hypot(x / 27, y / 17) + wob;
        if (r > 1) return null;
        if (r > 0.86) {
          // the bank, and reeds standing out of it, some with a brown head
          if (z < 0.7) return 'bank';
          const k = hash3(Math.floor(x / 0.7) + 60, Math.floor(y / 0.7) + 60, 2);
          if (k < 0.62) return null;
          const top = 2 + (k - 0.62) * 9;
          if (z > top) return null;
          return k > 0.9 && z > top - 1.2 ? 'rush' : 'reed';
        }
        if (z >= 0.7) return null;
        for (const [px, py, pr, flower] of PADS) {
          const d = Math.hypot(x - px, y - py);
          if (d < pr) {
            if (flower && d < 0.7) return 'lilyflower';
            return Math.abs(y - py) < 0.35 && x > px ? 'pond2' : 'lily';
          }
        }
        // short pale ripples, in rows
        const row = Math.floor(y / 3);
        if (Math.abs((y % 3) - 1.5) < 0.4 && noise3(x * 0.3 + row * 7, row, 4) > 0.68)
          return 'pondlit';
        return r < 0.55 ? 'pond2' : 'pond';
      },
    },
  },
};
export default look;
