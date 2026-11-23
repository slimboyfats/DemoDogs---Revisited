import type { LookModule, ShapeFn } from '@demodogs/shared';
import { slab } from '../scrap-slab/look';

/**
 * Slabs stacked `n` high, each 5 layers, every one turned and shoved a little off the one below,
 * as a crane drops them.
 */
export const tower = (n: number, seed: number): ShapeFn => {
  const parts = Array.from({ length: n }, (_, k) => {
    const a = Math.sin(k * 2.7 + seed) * 0.45;
    return {
      fn: slab(k + seed),
      cs: Math.cos(a),
      sn: Math.sin(a),
      ox: Math.sin(k * 1.9 + seed * 3) * 1.4,
      oy: Math.cos(k * 2.3 + seed) * 1.1,
    };
  });
  return (x, y, z) => {
    const k = Math.floor(z / 5);
    const P = parts[k];
    if (!P) return null;
    const lx = x - P.ox;
    const ly = y - P.oy;
    return P.fn(lx * P.cs + ly * P.sn, -lx * P.sn + ly * P.cs, (z - k * 5) * 0.8);
  };
};

const look: LookModule = {
  id: 'prop.scrap-tower',
  look: { kind: 'prop', part: { w: 18, h: 16, layers: 15, smooth: true, fn: tower(3, 6) } },
};
export default look;
