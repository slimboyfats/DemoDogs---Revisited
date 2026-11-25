import type { LookModule } from '@demodogs/shared';
import { carBody } from '../../../src/carshape';
import { toyTruck } from '../../../src/toytruck';
import { CAR_CELL } from '../../../src/shapes';

/** A small hatchback: a stubby bonnet and a tall glasshouse that runs right to the tail. */
const body = carBody({
  a: 10,
  b: 5.3,
  r: 2.4,
  taper: [0.5, 0.3],
  deck: [
    [-10, 4.2],
    [-9, 4.9],
    [3.6, 4.8],
    [5, 4.3],
    [10, 3.5],
  ],
  round: 1.5,
  arches: [
    { x: 6.2, r: 3.2 },
    { x: -6.2, r: 3.2 },
  ],
  cabin: {
    x0: -9.3,
    x1: 4.4,
    roof: 7.7,
    inset: 0.45,
    lean: 0.75,
    rakeF: 2.8,
    rakeR: 0.9,
    pillar: -2.2,
  },
  head: [2.2, 4.4, 2.5, 3.4],
  tail: [2.8, 4.8, 3.2, 4.2],
  grille: 1.9,
  gaps: [4.6, 0.9, -5.6],
});

const look: LookModule = {
  id: 'car.terrier',
  look: {
    kind: 'car',
    body: { ...CAR_CELL, smooth: true, fn: body },
    toy: {
      ...CAR_CELL,
      smooth: true,
      fn: toyTruck({
        a: 10,
        b: 5.3,
        well: 2.9,
        axles: [6.2, -6.2],
        hood: 4.6,
        nose: 3.8,
        cab: { x0: -9.3, x1: 4, roof: 7.4, rake: 1.6, rakeR: 1.2 },
      }),
    },
    // a roof rack: two rails and four bars
    top: {
      w: 9,
      h: 9,
      layers: 1,
      smooth: true,
      fn: (x, y, z) =>
        Math.abs(x) < 4 &&
        Math.abs(y) < 4 &&
        z < 0.7 &&
        (Math.abs(Math.abs(y) - 3.5) < 0.35 ||
          Math.abs(((((x + 4) % 2.6) + 2.6) % 2.6) - 1.3) < 0.3)
          ? 'chrome'
          : null,
    },
  },
};
export default look;
