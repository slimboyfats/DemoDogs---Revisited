import type { LookModule, Part } from '@demodogs/shared';
import { rigLook } from '../../../src/rigs';
import { FAIR } from '../../../src/themes';

/** The weight on the ground and the string up from it. */
const peg: Part = {
  w: 4,
  h: 4,
  layers: 8,
  smooth: true,
  fn: (x, y, z) => {
    if (z < 1.6) return Math.abs(x) < 1.4 && Math.abs(y) < 1.4 ? 'crate' : null;
    return Math.hypot(x, y) < 0.3 ? 'paintw' : null;
  },
};

/** The balloons: where each floats (out along the wind, up) and its colour. */
const BUNCH = [
  [1.4, -1.2, 5.4, 'paintr'],
  [3.2, 0.9, 6.8, 'fairy'],
  [1.8, 1.4, 9.2, 'fairb'],
  [4.4, -0.8, 9.8, 'fairg'],
  [3, 0.2, 12.2, 'fairp'],
] as const;

/** Five balloons on strings, leaning out along +x. */
const bunch: Part = {
  w: 16,
  h: 8,
  layers: 16,
  smooth: true,
  fn: (x, y, z) => {
    for (const [bx, by, bz, m] of BUNCH) {
      if (Math.hypot(x - bx, y - by, (z - bz) * 0.82) < 2.3) return m;
      // its string, from the knot at the foot
      const t = z / (bz - 2);
      if (t > 0 && t < 1 && Math.hypot(x - bx * t, y - by * t) < 0.24) return 'paintw';
    }
    return null;
  },
};

/** A bunch of balloons on a weight: they lean with the wind and bob. */
const look: LookModule = {
  id: 'prop.balloons',
  look: rigLook(peg, [{ part: bunch, at: [0, 0, 7], move: { kind: 'wind', flutter: 0.3 } }], FAIR),
};
export default look;
