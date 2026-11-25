import type { LookModule, ShapeFn } from '@demodogs/shared';
import { carBody } from '../../../src/carshape';
import { toyTruck } from '../../../src/toytruck';
import { CAR_CELL } from '../../../src/shapes';

/** A van: a short sloping bonnet and a tall box, glass up front and panels behind. */
export const bruiserBody: ShapeFn = carBody({
  a: 11.5,
  b: 5.9,
  r: 1.6,
  taper: [0.4, 0],
  deck: [
    [-11.5, 4.6],
    [7.2, 4.6],
    [8.2, 4.3],
    [11.5, 3.9],
  ],
  round: 1.1,
  arches: [
    { x: 7.0, r: 3.3 },
    { x: -7.4, r: 3.3 },
  ],
  cabin: {
    x0: -11.2,
    x1: 7.9,
    roof: 8.7,
    inset: 0.25,
    lean: 0.35,
    rakeF: 2.6,
    rakeR: 0.2,
    solidBehind: 2.4,
  },
  head: [2.6, 5.0, 2.6, 3.6],
  tail: [3.6, 5.4, 3.0, 4.6],
  grille: 2.3,
  gaps: [8.3, 2.4, -3.4],
  // a stripe down the roof and a band along the box
  paint: (x, y, z) =>
    z > 8 && Math.abs(y) < 1.1
      ? 'trim'
      : x < 2 && z > 5.6 && z < 6.5 && Math.abs(y) > 4.6
        ? 'paint2'
        : undefined,
});

const look: LookModule = {
  id: 'car.bruiser',
  look: {
    kind: 'car',
    body: { ...CAR_CELL, smooth: true, fn: bruiserBody },
    toy: {
      ...CAR_CELL,
      smooth: true,
      fn: toyTruck({
        a: 11.5,
        b: 5.9,
        well: 3.5,
        axles: [7, -7.4],
        hood: 4.6,
        nose: 4.2,
        cab: { x0: -11, x1: 6.6, roof: 8.6, rake: 1.4 },
        box: 2.5,
      }),
    },
    // a roof rack
    top: {
      w: 10,
      h: 12,
      layers: 1,
      smooth: true,
      fn: (x, y, z) =>
        z < 0.7 &&
        Math.abs(x) < 4.6 &&
        Math.abs(y) < 5.2 &&
        (Math.abs(x) > 4.1 ||
          Math.abs(y) > 4.7 ||
          Math.abs(x) < 0.3 ||
          Math.abs(Math.abs(x) - 2.2) < 0.25)
          ? 'chrome'
          : null,
    },
  },
};
export default look;
