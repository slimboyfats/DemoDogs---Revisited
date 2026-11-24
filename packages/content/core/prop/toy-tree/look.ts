import type { LookModule, Part, Tones } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/** The greens of a toy tree's crown: deep inside and below, bright on top. */
export const TOY_LEAVES: Record<string, Tones> = {
  toyleaf: ['#2c7a2e', '#3f9c38', '#5cba48'],
  toyleaf2: ['#3a8f34', '#53b044', '#7acb58'],
  toyleaf3: ['#236a2a', '#318a32', '#479f3e'],
  toybark: ['#5a3a1e', '#7a5028', '#9a6a38'],
};

/**
 * A tree built of big cubes: a square trunk and a crown of leafy lumps (`balls`: x, y, z, r),
 * every cube `cube` art px across and one flat green of three.
 */
export function toyTree(
  size: number,
  layers: number,
  trunk: number,
  bole: number,
  cube: number,
  balls: readonly (readonly [number, number, number, number])[],
): Part {
  return {
    w: size,
    h: size,
    layers,
    smooth: true,
    fn: (x, y, z) => {
      // the trunk, wider at the foot
      const flare = trunk + Math.max(0, 3 - z) * 0.35 * trunk;
      if (z < bole + cube && Math.abs(x) < flare && Math.abs(y) < flare)
        return (Math.floor(z / cube) & 1) === 0 && Math.abs(x) > flare * 0.5 ? 'bark' : 'toybark';
      // the crown: whichever cube this point is in belongs to it if the cube's middle does
      const cx = (Math.floor(x / cube) + 0.5) * cube;
      const cy = (Math.floor(y / cube) + 0.5) * cube;
      const cz = (Math.floor(z / cube) + 0.5) * cube;
      let inside = false;
      for (const [bx, by, bz, br] of balls)
        if (Math.hypot(cx - bx, cy - by, (cz - bz) * 1.15) < br) {
          inside = true;
          break;
        }
      if (!inside) return null;
      const t = hash3(Math.floor(x / cube) + 40, Math.floor(y / cube) + 40, Math.floor(z / cube));
      return t > 0.68 ? 'toyleaf2' : t < 0.24 ? 'toyleaf3' : 'toyleaf';
    },
  };
}

/** A small round tree of leafy cubes on a square trunk. */
const look: LookModule = {
  id: 'prop.toy-tree',
  look: {
    kind: 'prop',
    materials: TOY_LEAVES,
    part: toyTree(22, 24, 1.5, 9, 2, [
      [0, 0, 15, 7.5],
      [-3.5, 2.5, 12.5, 5.5],
      [3.5, -2, 12.5, 5.5],
      [1, 3, 18, 4.5],
    ]),
  },
};
export default look;
