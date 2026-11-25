import type { LookModule, ShapeFn } from '@demodogs/shared';
import { carBody } from '../../../src/carshape';
import { CAR_CELL } from '../../../src/shapes';

/** A pickup: a square bonnet, a two-door cab and an open bed with a tailgate. */
export const muttBody: ShapeFn = carBody({
  a: 11.5,
  b: 5.6,
  r: 1.8,
  taper: [0.3, 0.1],
  deck: [
    [-11.5, 4.6],
    [3.9, 4.6],
    [5, 4.4],
    [11.5, 4.0],
  ],
  round: 1.2,
  arches: [
    { x: 7.2, r: 3.3 },
    { x: -7.2, r: 3.3 },
  ],
  cabin: { x0: -2.6, x1: 4.6, roof: 7.6, inset: 0.4, lean: 0.6, rakeF: 2.2, rakeR: 0.5 },
  head: [2.6, 4.8, 2.6, 3.6],
  tail: [3.6, 5.2, 2.8, 4.2],
  grille: 2.3,
  gaps: [4.7, -2.9],
  // the bed: a box cut out of the back, with a ribbed floor
  extra: (x, y, z) => {
    if (x > -3.3 || x < -10.6 || Math.abs(y) > 4.5) return undefined;
    if (z > 2.5) return null;
    return z > 2.1 ? ((((x * 2) | 0) & 1) === 0 ? 'under' : 'grille') : undefined;
  },
  paint: (x, y, z) => (z > 4.2 && x > 5.4 && Math.abs(y) < 1.1 ? 'trim' : undefined),
});

const look: LookModule = {
  id: 'car.mutt',
  look: {
    kind: 'car',
    body: { ...CAR_CELL, smooth: true, fn: muttBody },
    // a light bar: amber ends, white middle
    top: {
      w: 3,
      h: 10,
      layers: 1,
      fn: (x, y) =>
        Math.abs(y) < 3.6 && Math.abs(x) < 0.7 ? (Math.abs(y) > 2.6 ? 'cone' : 'light') : null,
    },
  },
};
export default look;
