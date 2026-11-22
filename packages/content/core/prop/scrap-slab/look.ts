import type { LookModule, ShapeFn } from '@demodogs/shared';
import { hash3, noise3, rr } from '../../../src/shapes';

/** The paint of the car a slab used to be. */
const PAINTS = ['paintr', 'crate', 'hazard', 'paintw', 'lime', 'cone', 'glow', 'maple'];

/**
 * A car crushed into a slab 14 by 9 and 4 high. From above it still reads as a car: its paint,
 * the flattened windscreen and roof glass in the middle, rust eating in from the edges. Down the
 * sides the metal is folded into dark creases, and a squashed wheel bulges out. `k` picks which
 * car it was, so stacked slabs differ.
 */
export const slab =
  (k: number): ShapeFn =>
  (x, y, z) => {
    // crumpled: the outline wobbles with height and along the slab
    const crumple = noise3(x * 0.6 + k * 7, y * 0.6, z * 0.9);
    if (!rr(x, y, 6.6 - crumple * 0.6, 4.2 - crumple * 0.4, 1.2)) return null;
    const top = 3.6 - noise3(x * 0.5, y * 0.5 + k, 3) * 0.7;
    if (z > top) return null;
    // a squashed wheel bulging out of each side, low down
    if (z < 1.5 && Math.abs(y) > 3.2 && Math.abs(Math.abs(x) - 3.6) < 1.3) return 'tire';
    const paint = PAINTS[k % PAINTS.length]!;
    const rust = noise3(x * 0.7 + k * 3, y * 0.7, z * 0.5 + 4) + Math.hypot(x / 7, y / 4.5) * 0.25;
    if (z > top - 0.7) {
      // the roof and windscreen, pressed flat into the top
      if (rr(x + 0.4, y, 2.8, 2.4, 0.8))
        return hash3(Math.floor(x * 2), Math.floor(y * 2), k) < 0.25 ? 'glasshi' : 'glass';
      return rust > 0.78 ? 'rust' : paint;
    }
    // folds down the sides
    if ((z + crumple * 1.4) % 1.25 < 0.28) return 'under';
    if (rust > 0.74) return rust > 0.86 ? 'rust2' : 'rust';
    if (hash3(Math.floor(x * 1.5), Math.floor(y * 1.5), Math.floor(z * 2) + k * 13) < 0.04)
      return 'chrome';
    return paint;
  };

const look: LookModule = {
  id: 'prop.scrap-slab',
  look: { kind: 'prop', part: { w: 15, h: 10, layers: 4, smooth: true, fn: slab(0) } },
};
export default look;
