import type { LookModule, Part, Tones } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/** The greens of a toy tree's crown, from deep in its shade to its sunlit top. */
export const TOY_LEAVES: Record<string, Tones> = {
  toyleaf: ['#2f8a2c', '#46a836', '#64c244'],
  toyleaf2: ['#48a034', '#66c040', '#94dc58'],
  toyleaf3: ['#1d6426', '#2a7f2c', '#3c9a36'],
  toyleaf4: ['#165222', '#1f6a28', '#2c8230'],
  toybark: ['#4e3018', '#6e4622', '#8a5a2c'],
  toybark2: ['#3a220c', '#523216', '#6a4420'],
};

/**
 * A tree built of big cubes: a square trunk with roots and a crown of leafy lumps (`balls`: x, y,
 * z, r), every cube `cube` across. The cubes at the top of each lump are the bright ones and the
 * ones underneath the dark ones, so the crown reads as lumps in the sun.
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
    fn: (px, py, z) => {
      // the cubes lie cornerwise to the map, so a corner and two faces of each show
      const x = (px - py) * Math.SQRT1_2;
      const y = (px + py) * Math.SQRT1_2;
      const qx = Math.floor(x / cube);
      const qy = Math.floor(y / cube);
      const qz = Math.floor(z / cube);
      const cx = (qx + 0.5) * cube;
      const cy = (qy + 0.5) * cube;
      const cz = (qz + 0.5) * cube;
      // the trunk: square, stepping out into roots at the foot, grooved bark
      const flare = trunk + Math.max(0, 2 * cube - cz) * 0.7;
      if (cz < bole + cube) {
        const ax = Math.abs(cx);
        const ay = Math.abs(cy);
        // roots run out along the four ways only
        const root =
          cz < cube && Math.min(ax, ay) < trunk * 0.6 && Math.max(ax, ay) < flare + cube * 0.6;
        if ((ax < flare && ay < flare) || root)
          return hash3(qx + 9, qy + 9, qz) > 0.6 ? 'toybark2' : 'toybark';
      }
      // the crown: whichever cube this point is in belongs to it if the cube's middle does
      let lit = -9;
      for (const [bx, by, bz, br] of balls) {
        const d = Math.hypot(cx - bx, cy - by, (cz - bz) * 1.15);
        // how near the top of its lump this cube is
        if (d < br) lit = Math.max(lit, (cz - bz) / br);
      }
      if (lit === -9) return null;
      const t = lit + (hash3(qx + 40, qy + 40, qz) - 0.5) * 0.7;
      return t > 0.55 ? 'toyleaf2' : t > 0 ? 'toyleaf' : t > -0.45 ? 'toyleaf3' : 'toyleaf4';
    },
  };
}

/** A small round tree of leafy cubes on a square trunk. */
const look: LookModule = {
  id: 'prop.toy-tree',
  look: {
    kind: 'prop',
    materials: TOY_LEAVES,
    scale: 2,
    part: toyTree(18, 20, 1.3, 6, 1.5, [
      [0, 0, 12.5, 6],
      [-3, 2.5, 10.5, 4.6],
      [3, -2, 10.5, 4.6],
      [0.5, 2.5, 15.5, 3.6],
    ]),
  },
};
export default look;
