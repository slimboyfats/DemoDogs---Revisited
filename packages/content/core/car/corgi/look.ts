import { type LookModule, type ShapeFn } from '@demodogs/shared';
import { carBody } from '../../../src/carshape';
import { CAR_CELL } from '../../../src/shapes';

/** A bubble car: barely longer than it is wide, all glass on top, with a cream roof and a chrome belt. */
export const corgiBody: ShapeFn = carBody({
  a: 8.6,
  b: 5.3,
  r: 3.1,
  taper: [0.5, 0.4],
  deck: [
    [-8.6, 3.9],
    [-7.2, 4.8],
    [3.4, 4.8],
    [5, 4.5],
    [8.6, 3.5],
  ],
  round: 1.6,
  crown: 0.5,
  arches: [
    { x: 5.1, r: 3.1 },
    { x: -5.1, r: 3.1 },
  ],
  cabin: { x0: -6.6, x1: 4.3, roof: 8.0, inset: 0.6, lean: 1.1, rakeF: 2.9, rakeR: 2.3 },
  head: [1.5, 3.9, 2.3, 3.5],
  tail: [2.2, 4.2, 2.6, 3.5],
  gaps: [-1.4],
  exhausts: [0],
  engine: [-8, -6.8],
  extra: (x, y, z) => {
    // a smile of a grille under the lamps, and a chrome bumperette at each corner
    const ay = Math.abs(y);
    if (x > 7.9 && x < 8.7 && ay < 1.9 && z > 1.5 && z < 2.1 - (1.9 - ay) * 0.12)
      return ay > 1.5 ? 'chrome' : 'grille';
    return undefined;
  },
  paint: (x, _y, z, skin) => {
    // the roof in cream, and a bright strip round the waist
    if (z > 7.3) return 'paintw';
    if (skin < 0.4 && Math.abs(z - 3.55) < 0.17 && Math.abs(x) < 7.4) return 'chrome';
    return undefined;
  },
});

const look: LookModule = {
  id: 'car.corgi',
  look: {
    kind: 'car',
    body: { ...CAR_CELL, smooth: true, fn: corgiBody },
    // a wind-up key standing on the roof: a post and two chrome loops
    top: {
      w: 3,
      h: 7,
      layers: 5,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) > 0.8) return null;
        if (z < 1.9) return Math.abs(y) < 0.6 ? 'chrome' : null;
        const ring = Math.hypot(Math.abs(y) - 1.45, z - 3.2);
        return ring < 1.45 && ring > 0.6 ? 'chrome' : null;
      },
    },
  },
};
export default look;
