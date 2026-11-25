import type { LookModule, Part, Tones } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/** The greens of a toy tree's crown, from deep in its shade to its sunlit top. */
export const TOY_LEAVES: Record<string, Tones> = {
  toyleaf: ['#356f22', '#4a8a2a', '#62a434'],
  toyleaf2: ['#648f28', '#82ae34', '#a6cc46'],
  toyleaf3: ['#22521c', '#2f6822', '#3f7e2a'],
  toyleaf4: ['#143a16', '#1c4a1a', '#285c20'],
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
      const flare = trunk + Math.max(0, 3.5 * cube - cz) * 0.55;
      if (cz < bole + cube) {
        const ax = Math.abs(cx);
        const ay = Math.abs(cy);
        // roots run out along the four ways only
        const root =
          cz < cube * 2 &&
          Math.min(ax, ay) < trunk * 0.6 &&
          Math.max(ax, ay) < flare + cube * (cz < cube ? 2.6 : 1.2);
        if ((ax < flare && ay < flare) || root)
          // (grooves run up the bark)
          return hash3(qx + 9, qy + 9, 1) > 0.55 || hash3(qx + 9, qy + 9, qz) > 0.8
            ? 'toybark2'
            : 'toybark';
      }
      // the crown: a cube belongs to the lump it is deepest inside, if its middle is in one
      let deep = 1;
      let lit = 0;
      for (const [bx, by, bz, br] of balls) {
        const d = Math.hypot(cx - bx, cy - by, (cz - bz) * 1.15) / br;
        if (d < deep) {
          deep = d;
          // how near the top of its lump this cube is
          lit = (cz - bz) / br;
        }
      }
      if (deep === 1) return null;
      // (each lump sunlit on top and dark underneath, so the crown reads as many of them)
      const t = lit + (hash3(qx + 40, qy + 40, qz) - 0.5) * 0.5;
      return t > 0.55 ? 'toyleaf2' : t > 0.15 ? 'toyleaf' : t > -0.3 ? 'toyleaf3' : 'toyleaf4';
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
